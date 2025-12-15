/**
 * KQL (Kusto Query Language) query builder for Azure Application Insights
 *
 * This module constructs KQL queries with time filters, severity filters,
 * and result limits for safe log retrieval.
 */

import type { TimeRange } from './types';

/**
 * Builds KQL queries for Azure Application Insights
 */
export class KqlQueryBuilder {
  private readonly batchSize: number;
  private readonly severityLevels: string[];

  /**
   * Creates a new KQL query builder
   * @param batchSize - Maximum number of results to return (default: 1000)
   * @param severityLevels - Severity levels to filter (default: Error, Warning)
   */
  constructor(batchSize = 1000, severityLevels: string[] = ['Error', 'Warning']) {
    if (batchSize < 1 || batchSize > 10000) {
      throw new Error('Batch size must be between 1 and 10000');
    }
    this.batchSize = batchSize;
    this.severityLevels = severityLevels;
  }

  /**
   * Build a KQL query to retrieve error and warning logs
   *
   * @param timeRange - Time range for the query
   * @param continuationToken - Optional continuation token for pagination
   * @returns KQL query string
   */
  buildLogQuery(timeRange: TimeRange, _continuationToken?: string): string {
    const { startTime, endTime } = this.validateTimeRange(timeRange);

    // Format dates for KQL (ISO 8601)
    const startTimeKql = this.formatDateForKql(startTime);
    const endTimeKql = this.formatDateForKql(endTime);

    // Build severity filter
    const severityFilter = this.buildSeverityFilter();

    // Build the KQL query
    const query = `
      union
        traces,
        exceptions,
        requests
      | where timestamp >= datetime(${startTimeKql})
      | where timestamp <= datetime(${endTimeKql})
      | where ${severityFilter}
      | project
          timestamp,
          severityLevel,
          message,
          itemType,
          operation_Name,
          operation_Id,
          customDimensions,
          customMeasurements,
          errorCode = tostring(customDimensions.errorCode),
          stackTrace = tostring(customDimensions.stackTrace),
          sourceLocation = tostring(customDimensions.sourceLocation)
      | order by timestamp desc
      | take ${this.batchSize}
    `.trim();

    return this.normalizeQuery(query);
  }

  /**
   * Build a query to count logs in a time range
   *
   * @param timeRange - Time range for the query
   * @returns KQL count query string
   */
  buildCountQuery(timeRange: TimeRange): string {
    const { startTime, endTime } = this.validateTimeRange(timeRange);

    const startTimeKql = this.formatDateForKql(startTime);
    const endTimeKql = this.formatDateForKql(endTime);
    const severityFilter = this.buildSeverityFilter();

    const query = `
      union
        traces,
        exceptions,
        requests
      | where timestamp >= datetime(${startTimeKql})
      | where timestamp <= datetime(${endTimeKql})
      | where ${severityFilter}
      | summarize count()
    `.trim();

    return this.normalizeQuery(query);
  }

  /**
   * Build a query with a smaller time window (for timeout recovery)
   *
   * @param timeRange - Original time range
   * @param reductionFactor - Factor to reduce time window by (default: 2)
   * @returns New query with reduced time range
   */
  buildReducedTimeRangeQuery(timeRange: TimeRange, reductionFactor = 2): string {
    const { startTime, endTime } = timeRange;
    const duration = endTime.getTime() - startTime.getTime();
    const reducedDuration = duration / reductionFactor;

    const newEndTime = new Date(startTime.getTime() + reducedDuration);
    const reducedTimeRange: TimeRange = {
      startTime,
      endTime: newEndTime,
    };

    return this.buildLogQuery(reducedTimeRange);
  }

  /**
   * Validate and sanitize time range
   * @param timeRange - Time range to validate
   * @returns Validated time range
   */
  private validateTimeRange(timeRange: TimeRange): TimeRange {
    const { startTime, endTime } = timeRange;

    if (!(startTime instanceof Date) || isNaN(startTime.getTime())) {
      throw new Error('Invalid start time');
    }

    if (!(endTime instanceof Date) || isNaN(endTime.getTime())) {
      throw new Error('Invalid end time');
    }

    if (startTime >= endTime) {
      throw new Error('Start time must be before end time');
    }

    // Prevent queries spanning more than 30 days
    const maxRangeMs = 30 * 24 * 60 * 60 * 1000; // 30 days
    if (endTime.getTime() - startTime.getTime() > maxRangeMs) {
      throw new Error('Time range cannot exceed 30 days');
    }

    return { startTime, endTime };
  }

  /**
   * Format date for KQL query
   * @param date - Date to format
   * @returns Formatted date string
   */
  private formatDateForKql(date: Date): string {
    return date.toISOString();
  }

  /**
   * Build severity level filter clause
   * @returns KQL filter expression
   */
  private buildSeverityFilter(): string {
    if (this.severityLevels.length === 0) {
      return 'severityLevel >= 0'; // All levels
    }

    // Map severity names to numeric levels
    const severityMap: Record<string, number> = {
      Verbose: 0,
      Information: 1,
      Warning: 2,
      Error: 3,
      Critical: 4,
    };

    const levels = this.severityLevels
      .map((level) => {
        const numericLevel = severityMap[level];
        if (numericLevel === undefined) {
          throw new Error(`Invalid severity level: ${level}`);
        }
        return numericLevel;
      })
      .sort((a, b) => a - b);

    // Use minimum severity level for efficiency
    const minLevel = Math.min(...levels);
    return `severityLevel >= ${minLevel}`;
  }

  /**
   * Normalize query by removing extra whitespace
   * @param query - Query to normalize
   * @returns Normalized query string
   */
  private normalizeQuery(query: string): string {
    return query
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join('\n');
  }

  /**
   * Get the current batch size
   * @returns Batch size
   */
  getBatchSize(): number {
    return this.batchSize;
  }

  /**
   * Get the current severity levels
   * @returns Severity levels
   */
  getSeverityLevels(): string[] {
    return [...this.severityLevels];
  }
}
