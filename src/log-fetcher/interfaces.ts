/**
 * Log Fetcher Component - TypeScript Interfaces and Type Definitions
 *
 * This module defines the core interfaces and types for the log-fetcher component
 * that integrates with Azure Application Insights using the Logs Query API.
 *
 * Architecture decisions are documented inline and stored in swarm memory.
 */

import type { TokenCredential } from '@azure/identity';

// ============================================================================
// Azure Log Entry Schema
// ============================================================================

/**
 * Represents a parsed log entry from Azure Application Insights
 *
 * DECISION: Use strict typing for required fields (timestamp, severity, message)
 * and optional types for fields that may not be present in all log entries.
 * This aligns with the requirement to handle incomplete log entries gracefully.
 */
export interface LogEntry {
  /** Unique identifier for the log entry */
  id: string;

  /** Timestamp when the log event occurred (ISO 8601 format) */
  timestamp: Date;

  /** Severity level of the log entry */
  severity: LogSeverity;

  /** Primary log message */
  message: string;

  /** Error code if present (e.g., HTTP status codes, custom error codes) */
  errorCode?: string;

  /** Stack trace for exceptions */
  stackTrace?: string;

  /** Source location (file, line, function) */
  source?: SourceLocation;

  /** Additional structured metadata */
  metadata?: Record<string, unknown>;

  /** Operation/trace ID for distributed tracing */
  operationId?: string;

  /** Cloud role name (service/component name) */
  cloudRoleName?: string;

  /** Custom dimensions from Application Insights */
  customDimensions?: Record<string, string>;

  /** Raw log entry for debugging/audit purposes */
  rawEntry?: unknown;
}

/**
 * Log severity levels matching Azure Application Insights schema
 */
export enum LogSeverity {
  Verbose = 0,
  Information = 1,
  Warning = 2,
  Error = 3,
  Critical = 4,
}

/**
 * Source location information for log entries
 */
export interface SourceLocation {
  /** Source file path */
  file?: string;

  /** Line number */
  line?: number;

  /** Function or method name */
  function?: string;

  /** Column number */
  column?: number;
}

// ============================================================================
// Query Configuration and Execution
// ============================================================================

/**
 * Configuration for KQL query execution
 *
 * DECISION: Separate query configuration from execution to enable
 * reusable query patterns and testability
 */
export interface KQLQueryConfig {
  /** Lookback period in minutes */
  lookbackMinutes: number;

  /** Maximum number of results to return */
  maxResults: number;

  /** Severity levels to include in query */
  severityLevels: LogSeverity[];

  /** Custom KQL filter clauses (applied with AND logic) */
  customFilters?: string[];

  /** Table name to query (defaults to 'traces' or 'exceptions') */
  tableName?: string;

  /** Enable pagination for large result sets */
  enablePagination?: boolean;

  /** Timeout for query execution in seconds */
  timeoutSeconds?: number;
}

/**
 * Result of a KQL query execution
 *
 * DECISION: Include metadata about query execution for observability
 * and debugging purposes
 */
export interface QueryResult {
  /** Parsed log entries */
  entries: LogEntry[];

  /** Total number of entries (may be higher if paginated) */
  totalCount: number;

  /** Query execution duration in milliseconds */
  executionTimeMs: number;

  /** Time range of query (start) */
  queryStartTime: Date;

  /** Time range of query (end) */
  queryEndTime: Date;

  /** Request ID for tracing */
  requestId: string;

  /** Whether more results are available (pagination) */
  hasMore: boolean;

  /** Continuation token for pagination */
  continuationToken?: string;

  /** Number of entries that failed parsing */
  parseErrorCount?: number;
}

/**
 * Options for query execution
 */
export interface QueryExecutionOptions {
  /** Continuation token for pagination */
  continuationToken?: string;

  /** Override default timeout */
  timeoutSeconds?: number;

  /** Enable streaming mode for large result sets */
  enableStreaming?: boolean;

  /** Callback for processing entries as they arrive (streaming mode) */
  onEntry?: (entry: LogEntry) => void | Promise<void>;

  /** Callback for progress updates */
  onProgress?: (current: number, total: number) => void;
}

// ============================================================================
// Authentication and Credentials
// ============================================================================

/**
 * Azure authentication configuration
 *
 * DECISION: Support both managed identity and service principal
 * authentication methods as specified in requirements
 */
export interface AzureAuthConfig {
  /** Azure workspace ID */
  workspaceId: string;

  /** Tenant ID (required for service principal) */
  tenantId?: string;

  /** Client ID (required for service principal) */
  clientId?: string;

  /** Client secret (required for service principal) */
  clientSecret?: string;

  /** Authentication method preference */
  authMethod?: 'managedIdentity' | 'servicePrincipal' | 'default';

  /** Azure cloud environment */
  cloudEnvironment?: 'AzurePublic' | 'AzureGovernment' | 'AzureChina';
}

/**
 * Result of authentication attempt
 */
export interface AuthenticationResult {
  /** Whether authentication was successful */
  success: boolean;

  /** Token credential if successful */
  credential?: TokenCredential;

  /** Error message if failed */
  error?: string;

  /** Authentication method used */
  method: string;

  /** Timestamp of authentication */
  timestamp: Date;
}

// ============================================================================
// Rate Limiting and Retry Logic
// ============================================================================

/**
 * Rate limit configuration
 *
 * DECISION: Implement exponential backoff with jitter to handle
 * Azure API rate limits (429 responses) gracefully
 */
export interface RateLimitConfig {
  /** Initial retry delay in milliseconds */
  initialRetryDelayMs: number;

  /** Maximum retry delay in milliseconds */
  maxRetryDelayMs: number;

  /** Maximum number of retry attempts */
  maxRetries: number;

  /** Backoff multiplier (e.g., 2.0 for exponential backoff) */
  backoffMultiplier: number;

  /** Enable jitter to prevent thundering herd */
  enableJitter: boolean;

  /** Maximum jitter percentage (0-1) */
  jitterFactor?: number;
}

/**
 * Rate limit state tracking
 */
export interface RateLimitState {
  /** Current retry attempt number */
  currentAttempt: number;

  /** Next retry time (timestamp) */
  nextRetryTime?: Date;

  /** Current backoff delay in milliseconds */
  currentDelayMs: number;

  /** Whether rate limit is currently active */
  isRateLimited: boolean;

  /** Number of consecutive rate limit errors */
  consecutiveErrors: number;

  /** Last rate limit error time */
  lastErrorTime?: Date;
}

/**
 * Rate limit event information
 */
export interface RateLimitEvent {
  /** Event type */
  type: 'rate_limit_hit' | 'rate_limit_retry' | 'rate_limit_recovered';

  /** Timestamp of event */
  timestamp: Date;

  /** Retry-After header value (seconds) */
  retryAfterSeconds?: number;

  /** HTTP status code */
  statusCode?: number;

  /** Event metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Circuit Breaker for Resilience
// ============================================================================

/**
 * Circuit breaker configuration
 *
 * DECISION: Implement circuit breaker pattern to prevent cascading failures
 * when Azure service is unavailable (503 errors)
 */
export interface CircuitBreakerConfig {
  /** Number of consecutive failures before opening circuit */
  failureThreshold: number;

  /** Time in milliseconds to wait before attempting recovery (half-open state) */
  recoveryTimeoutMs: number;

  /** Number of successful calls required to close circuit */
  successThreshold: number;

  /** Timeout for operations in milliseconds */
  operationTimeoutMs: number;
}

/**
 * Circuit breaker states
 */
export enum CircuitBreakerState {
  /** Circuit is closed, requests flow normally */
  Closed = 'closed',

  /** Circuit is open, requests are rejected */
  Open = 'open',

  /** Circuit is half-open, testing if service recovered */
  HalfOpen = 'half-open',
}

/**
 * Circuit breaker status information
 */
export interface CircuitBreakerStatus {
  /** Current state */
  state: CircuitBreakerState;

  /** Number of consecutive failures */
  failureCount: number;

  /** Number of consecutive successes (in half-open state) */
  successCount: number;

  /** Last state transition time */
  lastStateChange: Date;

  /** Next recovery attempt time (when in open state) */
  nextRecoveryAttempt?: Date;

  /** Total number of state transitions */
  totalTransitions: number;
}

// ============================================================================
// Error Handling and Metrics
// ============================================================================

/**
 * Types of errors that can occur during log fetching
 */
export enum LogFetcherErrorType {
  AuthenticationError = 'authentication_error',
  QueryExecutionError = 'query_execution_error',
  RateLimitError = 'rate_limit_error',
  NetworkError = 'network_error',
  ParseError = 'parse_error',
  TimeoutError = 'timeout_error',
  CircuitBreakerOpen = 'circuit_breaker_open',
  ServiceUnavailable = 'service_unavailable',
  InvalidConfiguration = 'invalid_configuration',
}

/**
 * Structured error information
 *
 * DECISION: Use structured error objects for better observability
 * and error tracking
 */
export interface LogFetcherError {
  /** Error type */
  type: LogFetcherErrorType;

  /** Error message */
  message: string;

  /** Original error object */
  originalError?: Error;

  /** Request ID for tracing */
  requestId?: string;

  /** Additional context */
  context?: Record<string, unknown>;

  /** Stack trace */
  stackTrace?: string;

  /** Timestamp */
  timestamp: Date;

  /** Whether error is retryable */
  retryable: boolean;
}

/**
 * Metrics for log fetching operations
 *
 * DECISION: Track comprehensive metrics for observability as required
 */
export interface LogFetcherMetrics {
  /** Total number of queries executed */
  totalQueries: number;

  /** Number of successful queries */
  successfulQueries: number;

  /** Number of failed queries */
  failedQueries: number;

  /** Total log entries fetched */
  totalEntriesFetched: number;

  /** Total parse errors */
  totalParseErrors: number;

  /** Average query duration in milliseconds */
  averageQueryDurationMs: number;

  /** Rate limit events count */
  rateLimitEvents: number;

  /** Circuit breaker open events */
  circuitBreakerOpenEvents: number;

  /** Authentication failures */
  authenticationFailures: number;

  /** Last successful query time */
  lastSuccessfulQuery?: Date;

  /** Last error time */
  lastError?: Date;

  /** Current health status */
  healthStatus: 'healthy' | 'degraded' | 'unhealthy';
}

// ============================================================================
// Streaming and Pagination
// ============================================================================

/**
 * Streaming configuration for handling large result sets
 *
 * DECISION: Support streaming to prevent loading all results in memory
 * as specified for large result sets (>1000 entries)
 */
export interface StreamingConfig {
  /** Enable streaming mode */
  enabled: boolean;

  /** Chunk size for processing */
  chunkSize: number;

  /** High water mark for backpressure (bytes) */
  highWaterMark?: number;

  /** Enable progress tracking */
  trackProgress: boolean;
}

/**
 * Pagination state for multi-page queries
 */
export interface PaginationState {
  /** Current page number (0-indexed) */
  currentPage: number;

  /** Total pages (if known) */
  totalPages?: number;

  /** Continuation token for next page */
  continuationToken?: string;

  /** Number of entries fetched so far */
  entriesFetched: number;

  /** Whether more pages are available */
  hasMore: boolean;
}

// ============================================================================
// Service Class Structure
// ============================================================================

/**
 * Log fetcher service configuration
 *
 * DECISION: Consolidate all configuration into a single interface
 * for easier dependency injection and testing
 */
export interface LogFetcherConfig {
  /** Azure authentication configuration */
  authentication: AzureAuthConfig;

  /** KQL query configuration */
  query: KQLQueryConfig;

  /** Rate limit configuration */
  rateLimit: RateLimitConfig;

  /** Circuit breaker configuration */
  circuitBreaker: CircuitBreakerConfig;

  /** Streaming configuration */
  streaming?: StreamingConfig;

  /** Enable metrics collection */
  enableMetrics?: boolean;

  /** Enable detailed logging */
  enableDetailedLogging?: boolean;
}

/**
 * Options for log fetcher initialization
 */
export interface LogFetcherInitOptions {
  /** Validate configuration on initialization */
  validateConfig?: boolean;

  /** Perform authentication check on initialization */
  checkAuthentication?: boolean;

  /** Warm up connection pool */
  warmupConnections?: boolean;
}

/**
 * Result of log fetcher initialization
 */
export interface InitializationResult {
  /** Whether initialization was successful */
  success: boolean;

  /** Error message if initialization failed */
  error?: string;

  /** Configuration validation results */
  validationResults?: Record<string, boolean>;

  /** Authentication check result */
  authenticationCheck?: AuthenticationResult;
}
