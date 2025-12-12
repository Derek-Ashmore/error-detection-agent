## ADDED Requirements

### Requirement: Azure Application Insights Integration
The system SHALL authenticate with Azure Application Insights using DefaultAzureCredential and retrieve log entries using the Logs Query API.

#### Scenario: Successful authentication with managed identity
- **WHEN** the system starts with managed identity configured
- **THEN** authentication SHALL succeed using DefaultAzureCredential
- **AND** the workspace ID SHALL be validated

#### Scenario: Successful authentication with service principal
- **WHEN** the system starts with service principal credentials configured
- **THEN** authentication SHALL succeed using client ID and secret
- **AND** the credentials SHALL be retrieved from environment variables

#### Scenario: Failed authentication
- **WHEN** authentication credentials are invalid or missing
- **THEN** the system SHALL log an error with details
- **AND** the system SHALL retry with exponential backoff
- **AND** the system SHALL alert after 3 failed attempts

### Requirement: KQL Query Execution
The system SHALL execute KQL queries against Azure Application Insights to retrieve log entries within a configurable time window.

#### Scenario: Query logs with time range filter
- **WHEN** the log fetcher executes a query
- **THEN** the query SHALL include a time range filter based on configured lookback period
- **AND** the query SHALL filter for error and warning severity levels
- **AND** the results SHALL be limited to prevent memory exhaustion

#### Scenario: Handle large result sets
- **WHEN** a query returns more than 1000 log entries
- **THEN** the system SHALL use pagination to retrieve all results
- **AND** the system SHALL stream results to avoid loading all in memory
- **AND** the system SHALL track progress for observability

#### Scenario: Query timeout
- **WHEN** a query exceeds 30 seconds
- **THEN** the query SHALL be cancelled
- **AND** the system SHALL log the timeout
- **AND** the system SHALL retry with a smaller time window

### Requirement: Rate Limit Handling
The system SHALL respect Azure API rate limits and implement retry logic with exponential backoff.

#### Scenario: Rate limit exceeded
- **WHEN** Azure API returns a rate limit error (429)
- **THEN** the system SHALL wait for the retry-after duration
- **AND** the system SHALL retry the request
- **AND** the system SHALL log the rate limit event

#### Scenario: Consecutive rate limit errors
- **WHEN** rate limit errors occur 3 times consecutively
- **THEN** the system SHALL increase the polling interval temporarily
- **AND** the system SHALL alert the operations team
- **AND** the system SHALL restore normal interval after successful queries

### Requirement: Log Entry Parsing
The system SHALL parse Azure log entries into structured LogEntry objects with all required fields.

#### Scenario: Parse complete log entry
- **WHEN** a log entry contains all standard fields
- **THEN** the system SHALL extract timestamp, severity, message, and metadata
- **AND** the system SHALL parse error codes if present
- **AND** the system SHALL extract stack traces if present
- **AND** the system SHALL extract source location if present

#### Scenario: Parse incomplete log entry
- **WHEN** a log entry is missing optional fields
- **THEN** the system SHALL create a valid LogEntry with available fields
- **AND** the system SHALL not fail parsing
- **AND** the system SHALL log a warning for malformed entries

#### Scenario: Handle parsing errors
- **WHEN** a log entry cannot be parsed
- **THEN** the system SHALL log the raw entry for investigation
- **AND** the system SHALL continue processing other entries
- **AND** the system SHALL track parsing error metrics

### Requirement: Error Handling and Resilience
The system SHALL handle transient failures gracefully and maintain operation continuity.

#### Scenario: Transient network error
- **WHEN** a network error occurs during query execution
- **THEN** the system SHALL retry with exponential backoff
- **AND** the system SHALL limit retries to 5 attempts
- **AND** the system SHALL log each retry attempt
- **AND** the system SHALL continue to next polling cycle after max retries

#### Scenario: Azure service unavailability
- **WHEN** Azure API returns 503 Service Unavailable
- **THEN** the system SHALL wait 60 seconds before retry
- **AND** the system SHALL implement circuit breaker after 5 consecutive failures
- **AND** the system SHALL attempt recovery every 5 minutes in circuit open state

### Requirement: Observability
The system SHALL provide comprehensive logging and metrics for log fetching operations.

#### Scenario: Log query execution metrics
- **WHEN** a query completes successfully
- **THEN** the system SHALL log query duration, entry count, and time range
- **AND** the system SHALL emit metrics for monitoring
- **AND** the system SHALL include request ID for tracing

#### Scenario: Log query failures
- **WHEN** a query fails
- **THEN** the system SHALL log error details, query text, and context
- **AND** the system SHALL increment failure counter metric
- **AND** the system SHALL preserve stack trace for debugging
