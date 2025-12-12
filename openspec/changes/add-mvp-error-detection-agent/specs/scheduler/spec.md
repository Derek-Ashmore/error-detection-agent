## ADDED Requirements

### Requirement: Configurable Polling Mechanism
The system SHALL implement a polling scheduler that executes the monitoring workflow at configurable intervals.

#### Scenario: Start scheduler with default interval
- **WHEN** the system starts without custom interval configured
- **THEN** the scheduler SHALL use default 5-minute interval
- **AND** the scheduler SHALL begin polling immediately
- **AND** the scheduler SHALL log startup confirmation

#### Scenario: Start scheduler with custom interval
- **WHEN** the system starts with custom interval configured
- **THEN** the scheduler SHALL use the configured interval
- **AND** the interval SHALL be validated as positive duration
- **AND** the scheduler SHALL support units (seconds, minutes, hours)

#### Scenario: Execute monitoring workflow
- **WHEN** the polling interval elapses
- **THEN** the scheduler SHALL execute the complete workflow (fetch, detect, check, create)
- **AND** the scheduler SHALL wait for workflow completion before next poll
- **AND** the scheduler SHALL log workflow start and completion

### Requirement: Graceful Shutdown
The system SHALL handle shutdown signals and complete in-flight operations before terminating.

#### Scenario: Receive SIGTERM signal
- **WHEN** the process receives SIGTERM
- **THEN** the scheduler SHALL stop accepting new polling cycles
- **AND** the scheduler SHALL wait for current workflow to complete
- **AND** the scheduler SHALL complete shutdown within 30 seconds
- **AND** the scheduler SHALL log shutdown progress

#### Scenario: Receive SIGINT signal (Ctrl+C)
- **WHEN** the process receives SIGINT
- **THEN** the scheduler SHALL perform same graceful shutdown as SIGTERM
- **AND** the scheduler SHALL log clean shutdown confirmation

#### Scenario: Force shutdown after timeout
- **WHEN** graceful shutdown exceeds 30 seconds
- **THEN** the scheduler SHALL forcefully terminate
- **AND** the scheduler SHALL log forced shutdown warning
- **AND** the scheduler SHALL exit with non-zero status

### Requirement: Error Recovery and Retry
The system SHALL handle workflow failures and implement retry logic with backoff.

#### Scenario: Workflow fails with transient error
- **WHEN** a workflow execution fails with retryable error
- **THEN** the scheduler SHALL retry immediately up to 3 times
- **AND** the scheduler SHALL use exponential backoff between retries
- **AND** the scheduler SHALL log each retry attempt

#### Scenario: Workflow fails persistently
- **WHEN** workflow fails after max retries
- **THEN** the scheduler SHALL log the failure
- **AND** the scheduler SHALL continue to next scheduled poll
- **AND** the scheduler SHALL increment failure metric
- **AND** the scheduler SHALL not crash

#### Scenario: Workflow takes too long
- **WHEN** workflow execution exceeds 2 minutes
- **THEN** the scheduler SHALL log a warning
- **AND** the scheduler SHALL continue waiting for completion
- **AND** the scheduler SHALL alert if timeout exceeds 5 minutes

### Requirement: Health Check Endpoint
The system SHALL provide an HTTP health check endpoint for monitoring and orchestration.

#### Scenario: Health check success
- **WHEN** health check endpoint is queried
- **THEN** the system SHALL return 200 OK if scheduler is running
- **AND** the response SHALL include last successful poll timestamp
- **AND** the response SHALL include scheduler status (running, stopped)

#### Scenario: Health check degraded
- **WHEN** last workflow failed or is too old
- **THEN** the system SHALL return 503 Service Unavailable
- **AND** the response SHALL include error details
- **AND** the response SHALL include time since last success

#### Scenario: Configure health check port
- **WHEN** health check port is configured
- **THEN** the system SHALL bind to configured port
- **AND** the system SHALL default to port 8080 if not specified
- **AND** the system SHALL fail startup if port is in use

### Requirement: Metrics Collection
The system SHALL collect and expose metrics for monitoring and alerting.

#### Scenario: Track workflow execution time
- **WHEN** workflow executes
- **THEN** the system SHALL measure total execution time
- **AND** the system SHALL track P50, P95, P99 percentiles
- **AND** the system SHALL expose metrics via health endpoint

#### Scenario: Track success and failure rates
- **WHEN** workflows complete
- **THEN** the system SHALL count successes and failures
- **AND** the system SHALL calculate success rate percentage
- **AND** the system SHALL expose counters for each failure type

#### Scenario: Track issues created
- **WHEN** issues are created or updated
- **THEN** the system SHALL count issues created
- **AND** the system SHALL count duplicates prevented
- **AND** the system SHALL expose these counts as metrics

#### Scenario: Track resource usage
- **WHEN** monitoring system health
- **THEN** the system SHALL track memory usage
- **AND** the system SHALL track CPU usage if available
- **AND** the system SHALL warn if usage exceeds thresholds

### Requirement: Logging and Observability
The system SHALL provide structured logging for all scheduler operations.

#### Scenario: Log polling cycle start
- **WHEN** a polling cycle starts
- **THEN** the system SHALL log start time and cycle number
- **AND** the log SHALL include request ID for tracing
- **AND** the log SHALL be at INFO level

#### Scenario: Log polling cycle completion
- **WHEN** a polling cycle completes successfully
- **THEN** the system SHALL log completion time and duration
- **AND** the log SHALL include counts (logs processed, failures detected, issues created)
- **AND** the log SHALL be at INFO level

#### Scenario: Log errors and failures
- **WHEN** errors occur during polling
- **THEN** the system SHALL log error details and stack trace
- **AND** the log SHALL include context (cycle number, workflow stage)
- **AND** the log SHALL be at ERROR level

### Requirement: Dynamic Interval Adjustment
The system SHALL support dynamic adjustment of polling interval based on system load or configuration changes.

#### Scenario: Increase interval during high load
- **WHEN** consecutive rate limit errors occur
- **THEN** the scheduler SHALL temporarily double the polling interval
- **AND** the scheduler SHALL log interval adjustment
- **AND** the scheduler SHALL restore normal interval after successful polls

#### Scenario: Decrease interval during low activity
- **WHEN** no failures detected for extended period
- **THEN** the scheduler MAY increase interval to reduce resource usage
- **AND** the scheduler SHALL not exceed maximum configured interval
- **AND** the scheduler SHALL log interval adjustment

#### Scenario: Manual interval override
- **WHEN** configuration is updated with new interval
- **THEN** the scheduler SHALL apply new interval on next cycle
- **AND** the scheduler SHALL validate interval is within acceptable range
- **AND** the scheduler SHALL log configuration change

### Requirement: Startup and Initialization
The system SHALL perform health checks and validation before starting the scheduler.

#### Scenario: Validate dependencies on startup
- **WHEN** the system starts
- **THEN** the scheduler SHALL verify Azure connection
- **AND** the scheduler SHALL verify GitHub connection
- **AND** the scheduler SHALL verify configuration is valid
- **AND** the scheduler SHALL fail startup if dependencies unavailable

#### Scenario: Warm up cache on startup
- **WHEN** persistence is enabled and cache file exists
- **THEN** the scheduler SHALL load cache before first poll
- **AND** the scheduler SHALL log cache load statistics
- **AND** the scheduler SHALL handle corrupted cache gracefully

#### Scenario: Skip first poll delay
- **WHEN** system starts
- **THEN** the scheduler SHALL execute first poll immediately
- **AND** the scheduler SHALL use normal interval for subsequent polls
- **AND** the scheduler SHALL allow configuration to delay first poll

### Requirement: Concurrency and Thread Safety
The system SHALL ensure thread-safe operation and prevent concurrent workflow executions.

#### Scenario: Prevent overlapping polls
- **WHEN** a workflow is still running when next interval arrives
- **THEN** the scheduler SHALL skip the next poll
- **AND** the scheduler SHALL log the skip with reason
- **AND** the scheduler SHALL resume normal polling after workflow completes

#### Scenario: Thread-safe state management
- **WHEN** multiple components access scheduler state
- **THEN** the system SHALL use appropriate locking mechanisms
- **AND** the system SHALL prevent race conditions
- **AND** the system SHALL avoid deadlocks
