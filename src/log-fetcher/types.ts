/**
 * Type definitions for the log-fetcher module
 */

/**
 * Represents a structured log entry from Azure Application Insights
 */
export interface LogEntry {
  /** Timestamp of the log entry */
  timestamp: Date;

  /** Severity level (Error, Warning, Info, etc.) */
  severity: string;

  /** Log message text */
  message: string;

  /** Error code if present */
  errorCode?: string;

  /** Stack trace if present */
  stackTrace?: string;

  /** Source location (file:line:column) */
  sourceLocation?: string;

  /** Additional metadata */
  metadata?: Record<string, unknown>;

  /** Raw log data for debugging */
  raw?: Record<string, unknown>;
}

/**
 * Query time range for log fetching
 */
export interface TimeRange {
  /** Start time for query */
  startTime: Date;

  /** End time for query */
  endTime: Date;
}

/**
 * Result of a log query operation
 */
export interface QueryResult {
  /** Retrieved log entries */
  entries: LogEntry[];

  /** Total count of matching entries */
  totalCount: number;

  /** Whether more results are available */
  hasMore: boolean;

  /** Continuation token for pagination */
  continuationToken?: string;

  /** Query execution duration in milliseconds */
  durationMs: number;

  /** Request ID for tracing */
  requestId?: string;
}

/**
 * Circuit breaker states
 */
export enum CircuitBreakerState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open',
}

/**
 * Circuit breaker statistics
 */
export interface CircuitBreakerStats {
  /** Current state */
  state: CircuitBreakerState;

  /** Consecutive failure count */
  failureCount: number;

  /** Last failure timestamp */
  lastFailureTime?: Date;

  /** Next retry time when open */
  nextRetryTime?: Date;

  /** Total requests */
  totalRequests: number;

  /** Total failures */
  totalFailures: number;
}

/**
 * Rate limit information
 */
export interface RateLimitInfo {
  /** Whether rate limit is active */
  isLimited: boolean;

  /** Time to wait before retry */
  retryAfterMs?: number;

  /** Rate limit reset time */
  resetTime?: Date;
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxRetries: number;

  /** Initial delay in milliseconds */
  initialDelayMs: number;

  /** Maximum delay in milliseconds */
  maxDelayMs: number;

  /** Backoff multiplier */
  backoffMultiplier: number;
}

/**
 * Log fetcher configuration
 */
export interface LogFetcherConfig {
  /** Azure workspace ID */
  workspaceId: string;

  /** Query timeout in milliseconds */
  queryTimeoutMs: number;

  /** Lookback period in minutes */
  lookbackMinutes: number;

  /** Batch size for pagination */
  batchSize: number;

  /** Retry configuration */
  retry: RetryConfig;

  /** Circuit breaker threshold */
  circuitBreakerThreshold: number;

  /** Circuit breaker reset timeout in milliseconds */
  circuitBreakerResetTimeoutMs: number;
}
