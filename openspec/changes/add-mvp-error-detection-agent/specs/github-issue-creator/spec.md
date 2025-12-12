## ADDED Requirements

### Requirement: GitHub API Authentication
The system SHALL authenticate with GitHub API using a Personal Access Token or GitHub App credentials.

#### Scenario: Authenticate with Personal Access Token
- **WHEN** the system starts with a GitHub token configured
- **THEN** authentication SHALL succeed using the token
- **AND** the token SHALL be retrieved from environment variable
- **AND** the system SHALL validate token has required permissions

#### Scenario: Failed authentication
- **WHEN** authentication credentials are invalid or missing
- **THEN** the system SHALL log an error with details
- **AND** the system SHALL fail startup with clear error message
- **AND** the system SHALL not proceed with issue creation

#### Scenario: Verify repository access
- **WHEN** authenticating successfully
- **THEN** the system SHALL verify it has write access to the configured repository
- **AND** the system SHALL log repository details (owner, name)
- **AND** the system SHALL fail startup if repository doesn't exist

### Requirement: Issue Creation for New Failures
The system SHALL create GitHub issues for new failures with structured metadata and formatting.

#### Scenario: Create issue with all metadata
- **WHEN** a new failure is detected
- **THEN** the system SHALL create an issue with title containing error type and severity
- **AND** the issue body SHALL include error message, stack trace, source location, and timestamps
- **AND** the issue SHALL be tagged with configured labels
- **AND** the issue SHALL be assigned to configured assignees

#### Scenario: Create issue with minimal metadata
- **WHEN** a new failure has incomplete information
- **THEN** the system SHALL create an issue with available fields
- **AND** the issue SHALL clearly indicate missing information
- **AND** the issue SHALL include link to Azure logs

#### Scenario: Handle issue creation failure
- **WHEN** issue creation fails
- **THEN** the system SHALL log the failure details
- **AND** the system SHALL retry up to 3 times with exponential backoff
- **AND** the system SHALL mark failure for manual handling after max retries

### Requirement: Issue Template Formatting
The system SHALL format issue content using a structured template for consistency and readability.

#### Scenario: Format issue title
- **WHEN** creating an issue
- **THEN** the title SHALL follow format: "[SEVERITY] ErrorType: Brief message"
- **AND** the title SHALL be truncated to 256 characters if necessary
- **AND** the title SHALL be unique and descriptive

#### Scenario: Format issue body
- **WHEN** creating an issue
- **THEN** the body SHALL include sections: Summary, Error Details, Stack Trace, Occurrence Info, and Links
- **AND** the body SHALL use markdown formatting
- **AND** the body SHALL include collapsible sections for stack traces
- **AND** the body SHALL sanitize PII and sensitive data

#### Scenario: Include metadata in issue
- **WHEN** creating an issue
- **THEN** the system SHALL add failure ID as hidden comment for tracking
- **AND** the system SHALL include first-seen and last-seen timestamps
- **AND** the system SHALL include occurrence count
- **AND** the system SHALL include severity level

### Requirement: Label and Assignee Management
The system SHALL apply configured labels and assignees to created issues.

#### Scenario: Apply severity label
- **WHEN** creating an issue
- **THEN** the system SHALL add label matching severity level (critical, high, medium, low)
- **AND** the system SHALL create label if it doesn't exist
- **AND** the system SHALL use consistent label colors

#### Scenario: Apply custom labels
- **WHEN** custom labels are configured
- **THEN** the system SHALL apply all configured labels
- **AND** the system SHALL skip labels that don't exist without failing
- **AND** the system SHALL log warning for non-existent labels

#### Scenario: Assign to users
- **WHEN** assignees are configured
- **THEN** the system SHALL assign issue to configured users
- **AND** the system SHALL verify users have repository access
- **AND** the system SHALL skip invalid assignees with warning

### Requirement: Duplicate Issue Handling
The system SHALL update existing issues when duplicate failures are detected instead of creating new ones.

#### Scenario: Add comment to existing issue
- **WHEN** a duplicate failure is detected
- **THEN** the system SHALL find the existing issue using failure ID
- **AND** the system SHALL add a comment with new occurrence details
- **AND** the comment SHALL include updated timestamp and occurrence count
- **AND** the system SHALL not create a new issue

#### Scenario: Update issue metadata
- **WHEN** adding a comment for duplicate
- **THEN** the system SHALL update the issue body with latest occurrence count
- **AND** the system SHALL update last-seen timestamp
- **AND** the system SHALL preserve original issue content

#### Scenario: Reopen closed issue
- **WHEN** a duplicate failure occurs for a closed issue
- **THEN** the system SHALL reopen the issue
- **AND** the system SHALL add comment explaining recurrence
- **AND** the system SHALL add "reopened" label

### Requirement: Rate Limit Handling
The system SHALL respect GitHub API rate limits and implement circuit breaker pattern.

#### Scenario: Rate limit exceeded
- **WHEN** GitHub API returns rate limit error (403)
- **THEN** the system SHALL wait for the rate limit reset time
- **AND** the system SHALL log the rate limit event
- **AND** the system SHALL retry the request after reset

#### Scenario: Circuit breaker activation
- **WHEN** 5 consecutive API failures occur
- **THEN** the system SHALL open circuit breaker
- **AND** the system SHALL stop making API calls for 60 seconds
- **AND** the system SHALL log circuit breaker state change
- **AND** the system SHALL attempt recovery after timeout

#### Scenario: Circuit breaker recovery
- **WHEN** circuit breaker is in half-open state
- **THEN** the system SHALL allow one test request
- **AND** the system SHALL close circuit if request succeeds
- **AND** the system SHALL reopen circuit if request fails

### Requirement: Error Handling and Resilience
The system SHALL handle GitHub API errors gracefully and maintain operation continuity.

#### Scenario: Handle network errors
- **WHEN** a network error occurs
- **THEN** the system SHALL retry with exponential backoff
- **AND** the system SHALL limit retries to 3 attempts
- **AND** the system SHALL log each retry attempt

#### Scenario: Handle API errors
- **WHEN** GitHub API returns an error response
- **THEN** the system SHALL log the error details
- **AND** the system SHALL determine if error is retryable
- **AND** the system SHALL skip non-retryable errors with logging

#### Scenario: Handle validation errors
- **WHEN** issue creation fails due to validation (title too long, invalid characters)
- **THEN** the system SHALL sanitize input and retry
- **AND** the system SHALL truncate fields if necessary
- **AND** the system SHALL log the sanitization

### Requirement: Observability
The system SHALL provide comprehensive logging and metrics for issue creation operations.

#### Scenario: Log successful issue creation
- **WHEN** an issue is created successfully
- **THEN** the system SHALL log issue number, URL, and failure ID
- **AND** the system SHALL emit metric for issues created
- **AND** the system SHALL include request ID for tracing

#### Scenario: Log issue update
- **WHEN** an existing issue is updated
- **THEN** the system SHALL log issue number, comment URL, and occurrence count
- **AND** the system SHALL emit metric for duplicates prevented

#### Scenario: Log failures
- **WHEN** issue creation or update fails
- **THEN** the system SHALL log error details, failure ID, and context
- **AND** the system SHALL increment failure counter metric
- **AND** the system SHALL preserve stack trace for debugging

### Requirement: Issue Lookup and Tracking
The system SHALL maintain mapping between failure IDs and GitHub issue numbers for duplicate detection.

#### Scenario: Store failure-to-issue mapping
- **WHEN** an issue is created
- **THEN** the system SHALL store mapping of failure ID to issue number
- **AND** the mapping SHALL be persisted to cache
- **AND** the mapping SHALL survive restarts if persistence is enabled

#### Scenario: Lookup issue by failure ID
- **WHEN** checking if failure has existing issue
- **THEN** the system SHALL query cache for failure ID
- **AND** the lookup SHALL be fast (< 10ms)
- **AND** the system SHALL handle missing mappings gracefully

#### Scenario: Verify issue still exists
- **WHEN** finding an existing mapping
- **THEN** the system SHALL optionally verify issue still exists in GitHub
- **AND** the system SHALL remove stale mappings
- **AND** the system SHALL create new issue if original was deleted
