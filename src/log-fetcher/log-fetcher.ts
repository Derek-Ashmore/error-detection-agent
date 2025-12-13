/**
 * Main log fetcher service for Azure Application Insights
 *
 * This module coordinates all components to fetch, parse, and return log entries
 * from Azure Application Insights with comprehensive error handling and resilience.
 */

import { LogsQueryClient, LogsQueryResultStatus } from '@azure/monitor-query';
import type {
  LogsQueryOptions,
  LogsQueryResult,
  LogsQuerySuccessfulResult,
  QueryTimeInterval,
} from '@azure/monitor-query';

import { AzureAuthenticator } from './azure-authenticator';
import { CircuitBreaker } from './circuit-breaker';
import { KqlQueryBuilder } from './kql-query-builder';
import { LogEntryParser } from './log-entry-parser';
import { RateLimitHandler } from './rate-limit-handler';
import type { LogEntry, LogFetcherConfig, QueryResult, TimeRange } from './types';

/**
 * Main service for fetching logs from Azure Application Insights
 */
export class LogFetcher {
  private readonly config: LogFetcherConfig;
  private readonly authenticator: AzureAuthenticator;
  private readonly queryBuilder: KqlQueryBuilder;
  private readonly rateLimitHandler: RateLimitHandler;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly parser: LogEntryParser;
  private logsClient: LogsQueryClient | null = null;

  /**
   * Creates a new log fetcher
   * @param config - Log fetcher configuration
   */
  constructor(config: LogFetcherConfig) {
    this.validateConfig(config);
    this.config = config;

    // Initialize components
    this.authenticator = new AzureAuthenticator(config.workspaceId);
    this.queryBuilder = new KqlQueryBuilder(config.batchSize, ['Error', 'Warning']);
    this.rateLimitHandler = new RateLimitHandler(config.retry);
    this.circuitBreaker = new CircuitBreaker(
      config.circuitBreakerThreshold,
      config.circuitBreakerResetTimeoutMs
    );
    this.parser = new LogEntryParser();
  }

  /**
   * Initialize the log fetcher (authenticate and create client)
   */
  async initialize(): Promise<void> {
    try {
      // Authenticate with Azure
      const credential = await this.authenticator.authenticate();

      // Create logs query client
      this.logsClient = new LogsQueryClient(credential);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to initialize log fetcher: ${errorMessage}`);
    }
  }

  /**
   * Fetch logs for a given time range
   *
   * @param timeRange - Time range to query
   * @returns Query result with log entries
   */
  async fetchLogs(timeRange?: TimeRange): Promise<QueryResult> {
    if (this.logsClient === null) {
      throw new Error('Log fetcher not initialized. Call initialize() first.');
    }

    // Use default time range if not provided
    const queryTimeRange = timeRange ?? this.getDefaultTimeRange();

    const startTime = Date.now();
    let allEntries: LogEntry[] = [];
    let totalCount = 0;
    let hasMore = false;
    let requestId: string | undefined;

    try {
      // Execute query with circuit breaker and retry logic
      const result = await this.circuitBreaker.execute(() =>
        this.rateLimitHandler.executeWithRetry(() => this.executeQuery(queryTimeRange))
      );

      allEntries = result.entries;
      totalCount = result.totalCount;
      hasMore = result.hasMore;
      requestId = result.requestId;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // If query timeout, try with reduced time range
      if (this.isTimeoutError(error)) {
        console.warn('Query timeout detected, retrying with reduced time range');
        return this.fetchLogsWithReducedTimeRange(queryTimeRange);
      }

      throw new Error(`Failed to fetch logs: ${errorMessage}`);
    }

    const durationMs = Date.now() - startTime;

    return {
      entries: allEntries,
      totalCount,
      hasMore,
      durationMs,
      requestId,
    };
  }

  /**
   * Execute a KQL query against Azure
   * @param timeRange - Time range for query
   * @returns Query result
   */
  private async executeQuery(timeRange: TimeRange): Promise<QueryResult> {
    if (this.logsClient === null) {
      throw new Error('Logs client not initialized');
    }

    // Build KQL query
    const kqlQuery = this.queryBuilder.buildLogQuery(timeRange);

    // Build timespan parameter (required)
    // Azure SDK v1.3.3 requires duration in ISO 8601 format or object with start/end
    const durationMinutes = Math.ceil(
      (timeRange.endTime.getTime() - timeRange.startTime.getTime()) / (1000 * 60)
    );
    const queryTimespan = `P${durationMinutes}M` as unknown as QueryTimeInterval;

    // Query options
    const options: LogsQueryOptions = {
      serverTimeoutInSeconds: Math.floor(this.config.queryTimeoutMs / 1000),
    };

    // Execute query
    const response = await this.logsClient.queryWorkspace(
      this.config.workspaceId,
      kqlQuery,
      queryTimespan,
      options
    );

    // Extract request ID for tracing
    const requestId = this.extractRequestId(response);

    // Check for errors in response
    if (this.hasQueryError(response)) {
      throw new Error(`Query execution failed: ${this.getQueryError(response)}`);
    }

    // Parse results
    const rows = this.extractRows(response);
    const parseResult = this.parser.parseLogRows(rows);

    // Log parsing warnings
    if (parseResult.failedCount > 0) {
      console.warn(
        `Failed to parse ${parseResult.failedCount} of ${parseResult.totalCount} log entries`
      );
    }

    // Determine if there are more results (simplified - would need proper pagination in production)
    const hasMore = parseResult.entries.length >= this.config.batchSize;

    return {
      entries: parseResult.entries,
      totalCount: parseResult.entries.length,
      hasMore,
      durationMs: 0, // Will be calculated by caller
      requestId,
    };
  }

  /**
   * Fetch logs with reduced time range (for timeout recovery)
   * @param originalTimeRange - Original time range
   * @returns Query result
   */
  private async fetchLogsWithReducedTimeRange(originalTimeRange: TimeRange): Promise<QueryResult> {
    const reducedTimeRange = this.reduceTimeRange(originalTimeRange);

    // eslint-disable-next-line no-console
    console.log(
      `Retrying with reduced time range: ${reducedTimeRange.startTime.toISOString()} to ${reducedTimeRange.endTime.toISOString()}`
    );

    return this.fetchLogs(reducedTimeRange);
  }

  /**
   * Reduce time range by half
   * @param timeRange - Original time range
   * @returns Reduced time range
   */
  private reduceTimeRange(timeRange: TimeRange): TimeRange {
    const duration = timeRange.endTime.getTime() - timeRange.startTime.getTime();
    const reducedDuration = duration / 2;

    return {
      startTime: timeRange.startTime,
      endTime: new Date(timeRange.startTime.getTime() + reducedDuration),
    };
  }

  /**
   * Get default time range based on lookback configuration
   * @returns Default time range
   */
  private getDefaultTimeRange(): TimeRange {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - this.config.lookbackMinutes * 60 * 1000);

    return { startTime, endTime };
  }

  /**
   * Check if error is a timeout error
   * @param error - Error to check
   * @returns True if timeout error
   */
  private isTimeoutError(error: unknown): boolean {
    if (error === null || error === undefined || typeof error !== 'object') {
      return false;
    }

    const azureError = error as { code?: string; message?: string };

    return (
      azureError.code === 'ETIMEDOUT' ||
      azureError.code === 'TIMEOUT' ||
      (azureError.message !== null &&
        azureError.message !== undefined &&
        azureError.message.toLowerCase().includes('timeout')) ||
      (azureError.message !== null &&
        azureError.message !== undefined &&
        azureError.message.toLowerCase().includes('timed out'))
    );
  }

  /**
   * Extract request ID from query response
   * @param response - Query response
   * @returns Request ID or undefined
   */
  private extractRequestId(response: LogsQueryResult): string | undefined {
    // Azure SDK may provide request ID in different ways
    const anyResponse = response as unknown as {
      _response?: { requestId?: string };
      requestId?: string;
    };

    return anyResponse._response?.requestId ?? anyResponse.requestId;
  }

  /**
   * Check if query response contains errors
   * @param response - Query response
   * @returns True if error present
   */
  private hasQueryError(response: LogsQueryResult): boolean {
    return response.status !== LogsQueryResultStatus.Success;
  }

  /**
   * Get error message from query response
   * @param response - Query response
   * @returns Error message
   */
  private getQueryError(response: LogsQueryResult): string {
    if (response.status === LogsQueryResultStatus.PartialFailure) {
      const partialResult = response;
      return partialResult.partialError.message;
    }

    return 'Query failed';
  }

  /**
   * Extract rows from query response
   * @param response - Query response
   * @returns Array of log rows
   */
  private extractRows(response: LogsQueryResult): unknown[] {
    // Get tables from successful or partial result
    let tables: LogsQuerySuccessfulResult['tables'];

    if (response.status === LogsQueryResultStatus.Success) {
      tables = (response as LogsQuerySuccessfulResult).tables;
    } else if (response.status === LogsQueryResultStatus.PartialFailure) {
      // For partial failures, use partialTables
      const partialResult = response as unknown as {
        partialTables?: LogsQuerySuccessfulResult['tables'];
      };
      tables = partialResult.partialTables ?? [];
    } else {
      return [];
    }

    if (tables.length === 0) {
      return [];
    }

    // Get first table (Azure typically returns one table)
    const table = tables[0];
    if (table === undefined) {
      return [];
    }

    if (table.rows.length === 0) {
      return [];
    }

    // Convert rows to objects with column names
    const columnNames =
      table.columnDescriptors?.map(
        (col: { name?: string; type?: string }) => col.name ?? 'unknown'
      ) ?? [];

    return table.rows.map(
      (row: (Date | string | number | Record<string, unknown> | boolean)[]) => {
        const obj: Record<string, unknown> = {};
        row.forEach((value: Date | string | number | Record<string, unknown> | boolean, index: number) => {
          const columnName = columnNames[index] ?? `column${index}`;
          obj[columnName] = value;
        });
        return obj;
      }
    );
  }

  /**
   * Get circuit breaker statistics
   * @returns Circuit breaker stats
   */
  getCircuitBreakerStats(): ReturnType<CircuitBreaker['getStats']> {
    return this.circuitBreaker.getStats();
  }

  /**
   * Get consecutive rate limit count
   * @returns Number of consecutive rate limits
   */
  getConsecutiveRateLimits(): number {
    return this.rateLimitHandler.getConsecutiveRateLimits();
  }

  /**
   * Check if authenticated
   * @returns True if authenticated
   */
  isAuthenticated(): boolean {
    return this.authenticator.isAuthenticated();
  }

  /**
   * Validate configuration
   * @param config - Configuration to validate
   */
  private validateConfig(config: LogFetcherConfig): void {
    if (
      config.workspaceId === null ||
      config.workspaceId === undefined ||
      config.workspaceId.trim().length === 0
    ) {
      throw new Error('Workspace ID is required');
    }

    if (config.queryTimeoutMs < 1000 || config.queryTimeoutMs > 300000) {
      throw new Error('Query timeout must be between 1000ms and 300000ms');
    }

    if (config.lookbackMinutes < 1) {
      throw new Error('Lookback minutes must be at least 1');
    }

    if (config.batchSize < 1 || config.batchSize > 10000) {
      throw new Error('Batch size must be between 1 and 10000');
    }
  }
}
