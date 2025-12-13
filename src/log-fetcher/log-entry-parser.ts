/**
 * Log entry parser for Azure Application Insights logs
 *
 * This module parses raw Azure log data into structured LogEntry objects
 * with comprehensive error handling for malformed entries.
 */

import type { LogEntry } from './types';

/**
 * Raw log row structure from Azure
 */
interface RawLogRow {
  timestamp?: string | Date;
  severityLevel?: number | string;
  message?: string;
  itemType?: string;
  operation_Name?: string;
  operation_Id?: string;
  customDimensions?: Record<string, unknown> | string;
  customMeasurements?: Record<string, unknown> | string;
  errorCode?: string;
  stackTrace?: string;
  sourceLocation?: string;
  [key: string]: unknown;
}

/**
 * Parsing result with success/failure status
 */
export interface ParseResult {
  /** Successfully parsed entries */
  entries: LogEntry[];

  /** Number of entries that failed to parse */
  failedCount: number;

  /** Total number of rows processed */
  totalCount: number;

  /** Error details for failed entries */
  errors: Array<{ row: unknown; error: string }>;
}

/**
 * Parses Azure Application Insights logs into structured LogEntry objects
 */
export class LogEntryParser {
  private readonly severityMap: Record<number, string> = {
    0: 'Verbose',
    1: 'Information',
    2: 'Warning',
    3: 'Error',
    4: 'Critical',
  };

  /**
   * Parse multiple log rows
   *
   * @param rows - Raw log rows from Azure
   * @returns Parse result with entries and error information
   */
  parseLogRows(rows: unknown[]): ParseResult {
    const result: ParseResult = {
      entries: [],
      failedCount: 0,
      totalCount: rows.length,
      errors: [],
    };

    for (const row of rows) {
      try {
        const entry = this.parseLogRow(row as RawLogRow);
        if (entry !== null) {
          result.entries.push(entry);
        }
      } catch (error) {
        result.failedCount++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push({ row, error: errorMessage });
      }
    }

    return result;
  }

  /**
   * Parse a single log row into a LogEntry
   *
   * @param row - Raw log row from Azure
   * @returns Parsed LogEntry or null if row is invalid
   */
  parseLogRow(row: RawLogRow): LogEntry | null {
    if (row === null || row === undefined || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error('Invalid log row: not an object');
    }

    // Parse timestamp (required field)
    const timestamp = this.parseTimestamp(row.timestamp);
    if (timestamp === null) {
      throw new Error('Invalid or missing timestamp');
    }

    // Parse severity (required field)
    const severity = this.parseSeverity(row.severityLevel);

    // Parse message (required field)
    const message = this.parseMessage(row.message);
    if (message === null) {
      throw new Error('Invalid or missing message');
    }

    // Parse optional fields
    const customDimensions = this.parseCustomDimensions(row.customDimensions);
    const errorCode =
      this.parseStringField(row.errorCode) ??
      this.extractFromCustomDimensions(customDimensions, 'errorCode');
    const stackTrace =
      this.parseStringField(row.stackTrace) ??
      this.extractFromCustomDimensions(customDimensions, 'stackTrace');
    const sourceLocation =
      this.parseStringField(row.sourceLocation) ??
      this.extractFromCustomDimensions(customDimensions, 'sourceLocation');

    // Build metadata
    const metadata: Record<string, unknown> = {
      itemType: row.itemType,
      operationName: row.operation_Name,
      operationId: row.operation_Id,
    };

    // Add custom dimensions to metadata
    if (customDimensions !== null && customDimensions !== undefined) {
      metadata['customDimensions'] = customDimensions;
    }

    // Add custom measurements if present
    if (row['customMeasurements'] !== null && row['customMeasurements'] !== undefined) {
      const measurements = this.parseCustomDimensions(row['customMeasurements']);
      if (measurements !== null && measurements !== undefined) {
        metadata['customMeasurements'] = measurements;
      }
    }

    // Create LogEntry
    const entry: LogEntry = {
      timestamp,
      severity,
      message,
      errorCode,
      stackTrace,
      sourceLocation,
      metadata,
      raw: row,
    };

    return entry;
  }

  /**
   * Parse timestamp field
   * @param value - Timestamp value
   * @returns Parsed Date or null
   */
  private parseTimestamp(value: unknown): Date | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (value instanceof Date) {
      return isNaN(value.getTime()) ? null : value;
    }

    if (typeof value === 'string') {
      const date = new Date(value);
      return isNaN(date.getTime()) ? null : date;
    }

    if (typeof value === 'number') {
      const date = new Date(value);
      return isNaN(date.getTime()) ? null : date;
    }

    return null;
  }

  /**
   * Parse severity level
   * @param value - Severity value (number or string)
   * @returns Severity string
   */
  private parseSeverity(value: unknown): string {
    if (typeof value === 'number') {
      return this.severityMap[value] ?? `Level${value}`;
    }

    if (typeof value === 'string') {
      return value;
    }

    return 'Unknown';
  }

  /**
   * Parse message field
   * @param value - Message value
   * @returns Message string or null
   */
  private parseMessage(value: unknown): string | null {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }

    if (value === null || value === undefined) {
      return null;
    }

    // Convert to string for non-string values
    return String(value);
  }

  /**
   * Parse custom dimensions (JSON object or string)
   * @param value - Custom dimensions value
   * @returns Parsed object or null
   */
  private parseCustomDimensions(value: unknown): Record<string, unknown> | null {
    if (value === null || value === undefined) {
      return null;
    }

    // Already an object
    if (typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }

    // Try to parse JSON string
    if (typeof value === 'string') {
      try {
        const parsed: unknown = JSON.parse(value);
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        // Invalid JSON, return null
        return null;
      }
    }

    return null;
  }

  /**
   * Extract a field from custom dimensions
   * @param customDimensions - Custom dimensions object
   * @param fieldName - Field name to extract
   * @returns Field value as string or undefined
   */
  private extractFromCustomDimensions(
    customDimensions: Record<string, unknown> | null,
    fieldName: string
  ): string | undefined {
    if (customDimensions === null || customDimensions === undefined) {
      return undefined;
    }

    const value = customDimensions[fieldName];
    return this.parseStringField(value);
  }

  /**
   * Parse a field as string
   * @param value - Field value
   * @returns String value or undefined
   */
  private parseStringField(value: unknown): string | undefined {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }

    if (value === null || value === undefined) {
      return undefined;
    }

    // Convert to string for non-string values
    const stringValue = String(value);
    return stringValue.length > 0 ? stringValue : undefined;
  }

  /**
   * Get severity level as number
   * @param severity - Severity string
   * @returns Severity number
   */
  getSeverityLevel(severity: string): number {
    const entries = Object.entries(this.severityMap);
    const entry = entries.find(([, value]) => value === severity);
    return entry !== undefined ? parseInt(entry[0], 10) : -1;
  }

  /**
   * Check if log entry is an error or critical
   * @param entry - Log entry to check
   * @returns True if error or critical
   */
  isErrorOrCritical(entry: LogEntry): boolean {
    const level = this.getSeverityLevel(entry.severity);
    return level >= 3; // Error (3) or Critical (4)
  }

  /**
   * Check if log entry is a warning or higher
   * @param entry - Log entry to check
   * @returns True if warning or higher
   */
  isWarningOrHigher(entry: LogEntry): boolean {
    const level = this.getSeverityLevel(entry.severity);
    return level >= 2; // Warning (2), Error (3), or Critical (4)
  }
}
