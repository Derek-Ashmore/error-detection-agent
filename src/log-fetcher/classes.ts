/**
 * Log Fetcher Component - Class Definitions and Signatures
 *
 * This module defines the class structures for the log-fetcher component.
 * Implementations should be in separate files following single-responsibility principle.
 *
 * Architecture Pattern: Each class has a single, well-defined responsibility
 * and uses dependency injection for testability.
 */

import type { TokenCredential } from '@azure/identity';
import type { LogsQueryClient, LogsQueryResult } from '@azure/monitor-query-logs';

import type {
  AuthenticationResult,
  AzureAuthConfig,
  CircuitBreakerConfig,
  CircuitBreakerStatus,
  InitializationResult,
  KQLQueryConfig,
  LogEntry,
  LogFetcherConfig,
  LogFetcherError,
  LogFetcherInitOptions,
  LogFetcherMetrics,
  QueryExecutionOptions,
  QueryResult,
  RateLimitConfig,
  RateLimitEvent,
  RateLimitState,
} from './interfaces';
import { CircuitBreakerState } from './interfaces';

// ============================================================================
// Azure Authenticator
// ============================================================================

/**
 * Manages Azure authentication using DefaultAzureCredential
 *
 * RESPONSIBILITY: Handle all authentication logic including managed identity,
 * service principal, and credential validation
 *
 * DECISION: Encapsulate credential management to simplify testing and
 * support multiple authentication methods
 */
export abstract class AzureAuthenticator {
  protected config: AzureAuthConfig;
  protected credential: TokenCredential | null = null;
  protected lastAuthAttempt: Date | null = null;

  constructor(config: AzureAuthConfig) {
    this.config = config;
  }

  /**
   * Authenticate with Azure and obtain credentials
   *
   * @returns Authentication result with credential or error
   * @throws Never throws - returns error information in result
   */
  abstract authenticate(): Promise<AuthenticationResult>;

  /**
   * Validate that credentials are still valid
   *
   * @returns True if credentials are valid, false otherwise
   */
  abstract validateCredentials(): Promise<boolean>;

  /**
   * Get the current credential (may be null if not authenticated)
   */
  abstract getCredential(): TokenCredential | null;

  /**
   * Refresh credentials (useful for long-running processes)
   */
  abstract refreshCredentials(): Promise<AuthenticationResult>;

  /**
   * Clear cached credentials (for security or re-authentication)
   */
  abstract clearCredentials(): void;

  /**
   * Get authentication method being used
   */
  abstract getAuthMethod(): string;
}

// ============================================================================
// KQL Query Builder
// ============================================================================

/**
 * Constructs KQL queries for Azure Application Insights
 *
 * RESPONSIBILITY: Generate valid, optimized KQL queries based on configuration
 *
 * DECISION: Separate query construction from execution for reusability,
 * testability, and to enable query preview/logging
 */
export abstract class KQLQueryBuilder {
  protected config: KQLQueryConfig;

  constructor(config: KQLQueryConfig) {
    this.config = config;
  }

  /**
   * Build a KQL query for fetching logs within time range
   *
   * @param startTime - Query start time (defaults to now - lookbackMinutes)
   * @param endTime - Query end time (defaults to now)
   * @returns KQL query string
   */
  abstract buildQuery(startTime?: Date, endTime?: Date): string;

  /**
   * Build a paginated query with continuation token
   *
   * @param startTime - Query start time
   * @param endTime - Query end time
   * @param continuationToken - Token for next page
   * @returns KQL query string
   */
  abstract buildPaginatedQuery(startTime: Date, endTime: Date, _continuationToken?: string): string;

  /**
   * Validate that a KQL query is well-formed
   *
   * @param query - KQL query to validate
   * @returns True if valid, false otherwise
   */
  abstract validateQuery(query: string): boolean;

  /**
   * Get the default table name for queries
   */
  abstract getDefaultTable(): string;

  /**
   * Build filter clause for severity levels
   */
  abstract buildSeverityFilter(): string;

  /**
   * Build time range filter
   *
   * @param startTime - Start time
   * @param endTime - End time
   */
  abstract buildTimeRangeFilter(startTime: Date, endTime: Date): string;

  /**
   * Optimize query for performance (add hints, projections, etc.)
   *
   * @param query - Base query
   * @returns Optimized query
   */
  abstract optimizeQuery(query: string): string;
}

// ============================================================================
// Rate Limit Handler
// ============================================================================

/**
 * Handles Azure API rate limiting with exponential backoff
 *
 * RESPONSIBILITY: Track rate limit state, calculate backoff delays,
 * and determine when to retry
 *
 * DECISION: Implement exponential backoff with jitter to prevent
 * thundering herd problem and respect Retry-After headers
 */
export abstract class RateLimitHandler {
  protected config: RateLimitConfig;
  protected state: RateLimitState;

  constructor(config: RateLimitConfig) {
    this.config = config;
    this.state = this.initializeState();
  }

  /**
   * Initialize rate limit state
   */
  protected abstract initializeState(): RateLimitState;

  /**
   * Record a rate limit event (429 response)
   *
   * @param retryAfterSeconds - Retry-After header value if provided
   */
  abstract recordRateLimitEvent(retryAfterSeconds?: number): RateLimitEvent;

  /**
   * Record a successful request (resets backoff)
   */
  abstract recordSuccess(): void;

  /**
   * Check if we should wait before next request
   *
   * @returns True if should wait, false if can proceed
   */
  abstract shouldWait(): boolean;

  /**
   * Get the current delay before next retry
   *
   * @returns Delay in milliseconds
   */
  abstract getRetryDelay(): number;

  /**
   * Wait for the appropriate retry delay
   *
   * @returns Promise that resolves when delay is complete
   */
  abstract waitForRetry(): Promise<void>;

  /**
   * Get current rate limit state
   */
  abstract getState(): RateLimitState;

  /**
   * Reset rate limit state (for testing or manual recovery)
   */
  abstract reset(): void;

  /**
   * Check if max retries exceeded
   */
  abstract isMaxRetriesExceeded(): boolean;

  /**
   * Calculate backoff delay with jitter
   *
   * @param attempt - Current attempt number
   * @returns Delay in milliseconds
   */
  protected abstract calculateBackoffDelay(attempt: number): number;
}

// ============================================================================
// Circuit Breaker
// ============================================================================

/**
 * Implements circuit breaker pattern for resilience
 *
 * RESPONSIBILITY: Prevent cascading failures by opening circuit after
 * consecutive failures, and periodically test for recovery
 *
 * DECISION: Use three-state circuit breaker (Closed, Open, Half-Open)
 * to handle Azure service unavailability gracefully
 */
export abstract class CircuitBreaker {
  protected config: CircuitBreakerConfig;
  protected state: CircuitBreakerState = CircuitBreakerState.Closed;
  protected failureCount = 0;
  protected successCount = 0;
  protected lastStateChange: Date = new Date();
  protected nextRecoveryAttempt: Date | null = null;

  constructor(config: CircuitBreakerConfig) {
    this.config = config;
  }

  /**
   * Execute an operation with circuit breaker protection
   *
   * @param operation - Async operation to execute
   * @returns Result of operation
   * @throws Error if circuit is open
   */
  abstract execute<T>(operation: () => Promise<T>): Promise<T>;

  /**
   * Record a successful operation
   */
  abstract recordSuccess(): void;

  /**
   * Record a failed operation
   *
   * @param error - Error that occurred
   */
  abstract recordFailure(error: Error): void;

  /**
   * Get current circuit breaker status
   */
  abstract getStatus(): CircuitBreakerStatus;

  /**
   * Check if circuit is open
   */
  abstract isOpen(): boolean;

  /**
   * Check if circuit is half-open (testing recovery)
   */
  abstract isHalfOpen(): boolean;

  /**
   * Check if circuit is closed (normal operation)
   */
  abstract isClosed(): boolean;

  /**
   * Manually reset circuit breaker (for testing or admin override)
   */
  abstract reset(): void;

  /**
   * Transition to open state
   */
  protected abstract transitionToOpen(): void;

  /**
   * Transition to half-open state
   */
  protected abstract transitionToHalfOpen(): void;

  /**
   * Transition to closed state
   */
  protected abstract transitionToClosed(): void;

  /**
   * Check if recovery should be attempted
   */
  protected abstract shouldAttemptRecovery(): boolean;
}

// ============================================================================
// Log Entry Parser
// ============================================================================

/**
 * Parses raw Azure log entries into structured LogEntry objects
 *
 * RESPONSIBILITY: Extract and transform log data from Azure schema
 * to application schema, handle missing fields gracefully
 *
 * DECISION: Separate parsing logic to enable schema evolution and
 * support multiple log sources in the future
 */
export abstract class LogEntryParser {
  /**
   * Parse a raw Azure log entry into structured LogEntry
   *
   * @param rawEntry - Raw log entry from Azure
   * @returns Parsed LogEntry or null if parsing fails
   */
  abstract parse(rawEntry: unknown): LogEntry | null;

  /**
   * Parse multiple entries in batch
   *
   * @param rawEntries - Array of raw log entries
   * @returns Array of parsed entries and count of parse errors
   */
  abstract parseBatch(rawEntries: unknown[]): {
    entries: LogEntry[];
    errorCount: number;
  };

  /**
   * Extract timestamp from raw entry
   *
   * @param rawEntry - Raw log entry
   */
  protected abstract extractTimestamp(rawEntry: unknown): Date | null;

  /**
   * Extract severity level from raw entry
   *
   * @param rawEntry - Raw log entry
   */
  protected abstract extractSeverity(rawEntry: unknown): number;

  /**
   * Extract message from raw entry
   *
   * @param rawEntry - Raw log entry
   */
  protected abstract extractMessage(rawEntry: unknown): string;

  /**
   * Extract error code if present
   *
   * @param rawEntry - Raw log entry
   */
  protected abstract extractErrorCode(rawEntry: unknown): string | undefined;

  /**
   * Extract stack trace if present
   *
   * @param rawEntry - Raw log entry
   */
  protected abstract extractStackTrace(rawEntry: unknown): string | undefined;

  /**
   * Extract source location if present
   *
   * @param rawEntry - Raw log entry
   */
  protected abstract extractSourceLocation(rawEntry: unknown):
    | {
        file?: string;
        line?: number;
        function?: string;
      }
    | undefined;

  /**
   * Validate that parsed entry has all required fields
   *
   * @param entry - Parsed log entry
   */
  protected abstract validateEntry(entry: Partial<LogEntry>): boolean;

  /**
   * Handle parsing error (log warning, track metrics)
   *
   * @param rawEntry - Raw entry that failed to parse
   * @param error - Error that occurred
   */
  protected abstract handleParseError(rawEntry: unknown, error: Error): void;
}

// ============================================================================
// Log Fetcher Service
// ============================================================================

/**
 * Main service class for fetching logs from Azure Application Insights
 *
 * RESPONSIBILITY: Orchestrate all components to fetch, parse, and return logs
 * Handle errors, retries, rate limiting, and circuit breaking
 *
 * DECISION: Use composition pattern to combine authenticator, query builder,
 * rate limiter, circuit breaker, and parser for flexibility and testability
 */
export abstract class LogFetcherService {
  protected config: LogFetcherConfig;
  protected authenticator: AzureAuthenticator;
  protected queryBuilder: KQLQueryBuilder;
  protected rateLimitHandler: RateLimitHandler;
  protected circuitBreaker: CircuitBreaker;
  protected parser: LogEntryParser;
  protected client: LogsQueryClient | null = null;
  protected metrics: LogFetcherMetrics;
  protected isInitialized = false;

  constructor(
    config: LogFetcherConfig,
    authenticator: AzureAuthenticator,
    queryBuilder: KQLQueryBuilder,
    rateLimitHandler: RateLimitHandler,
    circuitBreaker: CircuitBreaker,
    parser: LogEntryParser
  ) {
    this.config = config;
    this.authenticator = authenticator;
    this.queryBuilder = queryBuilder;
    this.rateLimitHandler = rateLimitHandler;
    this.circuitBreaker = circuitBreaker;
    this.parser = parser;
    this.metrics = this.initializeMetrics();
  }

  /**
   * Initialize the log fetcher service
   *
   * Performs authentication, validates configuration, and prepares client
   *
   * @param options - Initialization options
   * @returns Initialization result
   */
  abstract initialize(options?: LogFetcherInitOptions): Promise<InitializationResult>;

  /**
   * Fetch logs within the configured time window
   *
   * @param startTime - Optional start time (defaults to now - lookbackMinutes)
   * @param endTime - Optional end time (defaults to now)
   * @param options - Query execution options
   * @returns Query result with parsed log entries
   * @throws LogFetcherError on unrecoverable errors
   */
  abstract fetchLogs(
    startTime?: Date,
    endTime?: Date,
    options?: QueryExecutionOptions
  ): Promise<QueryResult>;

  /**
   * Fetch logs with pagination support for large result sets
   *
   * @param startTime - Query start time
   * @param endTime - Query end time
   * @param onPage - Callback invoked for each page of results
   * @returns Total number of entries fetched
   */
  abstract fetchLogsWithPagination(
    startTime: Date,
    endTime: Date,
    onPage: (result: QueryResult) => Promise<void>
  ): Promise<number>;

  /**
   * Fetch logs in streaming mode for very large result sets
   *
   * @param startTime - Query start time
   * @param endTime - Query end time
   * @param onEntry - Callback invoked for each log entry
   * @returns Total number of entries processed
   */
  abstract fetchLogsStreaming(
    startTime: Date,
    endTime: Date,
    onEntry: (entry: LogEntry) => Promise<void>
  ): Promise<number>;

  /**
   * Get current metrics
   */
  abstract getMetrics(): LogFetcherMetrics;

  /**
   * Reset metrics (for testing or admin purposes)
   */
  abstract resetMetrics(): void;

  /**
   * Health check - verify service is operational
   *
   * @returns True if healthy, false otherwise
   */
  abstract healthCheck(): Promise<boolean>;

  /**
   * Shutdown service gracefully
   */
  abstract shutdown(): Promise<void>;

  /**
   * Execute KQL query with retry and circuit breaker logic
   *
   * @param query - KQL query to execute
   * @param timeRange - Time range for query
   * @returns Raw query result from Azure
   */
  protected abstract executeQueryWithRetry(
    query: string,
    timeRange: { startTime: Date; endTime: Date }
  ): Promise<LogsQueryResult>;

  /**
   * Process raw query results into structured format
   *
   * @param rawResult - Raw result from Azure
   * @param requestId - Request ID for tracing
   * @param executionStartTime - When query started
   * @returns Processed query result
   */
  protected abstract processQueryResult(
    rawResult: LogsQueryResult,
    requestId: string,
    executionStartTime: Date
  ): QueryResult;

  /**
   * Handle query execution error
   *
   * @param error - Error that occurred
   * @param query - Query that was being executed
   * @returns LogFetcherError with context
   */
  protected abstract handleQueryError(error: Error, query: string): LogFetcherError;

  /**
   * Update metrics after query execution
   *
   * @param success - Whether query was successful
   * @param duration - Query duration in milliseconds
   * @param entryCount - Number of entries fetched
   */
  protected abstract updateMetrics(success: boolean, duration: number, entryCount: number): void;

  /**
   * Initialize metrics object
   */
  protected abstract initializeMetrics(): LogFetcherMetrics;

  /**
   * Generate unique request ID for tracing
   */
  protected abstract generateRequestId(): string;

  /**
   * Validate configuration
   *
   * @returns Validation results by field
   */
  protected abstract validateConfiguration(): Record<string, boolean>;
}

// ============================================================================
// Factory for Creating Log Fetcher Service
// ============================================================================

/**
 * Factory class for creating fully configured LogFetcherService instances
 *
 * RESPONSIBILITY: Encapsulate service creation logic and dependency wiring
 *
 * DECISION: Use factory pattern to simplify service instantiation and
 * provide sensible defaults
 */
export abstract class LogFetcherFactory {
  /**
   * Create a LogFetcherService with default implementations
   *
   * @param config - Service configuration
   * @returns Configured LogFetcherService instance
   */
  abstract create(config: LogFetcherConfig): LogFetcherService;

  /**
   * Create a LogFetcherService with custom component implementations
   *
   * @param config - Service configuration
   * @param components - Custom component implementations
   * @returns Configured LogFetcherService instance
   */
  abstract createWithComponents(
    config: LogFetcherConfig,
    components: {
      authenticator?: AzureAuthenticator;
      queryBuilder?: KQLQueryBuilder;
      rateLimitHandler?: RateLimitHandler;
      circuitBreaker?: CircuitBreaker;
      parser?: LogEntryParser;
    }
  ): LogFetcherService;

  /**
   * Create a LogFetcherService from application configuration
   *
   * Extracts relevant configuration from AppConfig and creates service
   *
   * @param appConfig - Application configuration object
   * @returns Configured LogFetcherService instance
   */
  abstract createFromAppConfig(appConfig: unknown): LogFetcherService;
}
