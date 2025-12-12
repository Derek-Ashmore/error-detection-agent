## ADDED Requirements

### Requirement: Pattern-Based Detection
The system SHALL detect failures by matching log entries against configurable patterns including error codes, keywords, and regular expressions.

#### Scenario: Detect failure by error code
- **WHEN** a log entry contains a configured error code
- **THEN** the system SHALL classify it as a failure
- **AND** the system SHALL assign the configured severity level
- **AND** the system SHALL create a structured Failure object

#### Scenario: Detect failure by keyword match
- **WHEN** a log entry message contains a configured keyword
- **THEN** the system SHALL classify it as a failure
- **AND** the system SHALL perform case-insensitive matching
- **AND** the system SHALL handle partial word boundaries correctly

#### Scenario: Detect failure by regex pattern
- **WHEN** a log entry matches a configured regex pattern
- **THEN** the system SHALL classify it as a failure
- **AND** the system SHALL extract capture groups as metadata
- **AND** the system SHALL handle invalid regex patterns gracefully

#### Scenario: No pattern match
- **WHEN** a log entry does not match any configured pattern
- **THEN** the system SHALL not classify it as a failure
- **AND** the system SHALL continue processing other entries

### Requirement: Severity Classification
The system SHALL assign severity levels (critical, high, medium, low) to detected failures based on pattern configuration.

#### Scenario: Critical severity assignment
- **WHEN** a pattern with critical severity matches
- **THEN** the failure SHALL be marked as critical
- **AND** the failure SHALL include severity in metadata
- **AND** the severity SHALL influence issue creation priority

#### Scenario: Multiple pattern matches
- **WHEN** a log entry matches multiple patterns with different severities
- **THEN** the system SHALL assign the highest severity level
- **AND** the system SHALL record all matched patterns
- **AND** the system SHALL log the severity escalation

### Requirement: Failure Object Creation
The system SHALL create structured Failure objects containing all relevant information for issue creation.

#### Scenario: Create failure with all fields
- **WHEN** a failure is detected
- **THEN** the system SHALL generate a unique failure ID (hash)
- **AND** the system SHALL include timestamp, severity, error type, and message
- **AND** the system SHALL include source location if available
- **AND** the system SHALL include stack trace if available
- **AND** the system SHALL attach original log entries

#### Scenario: Create failure with minimal information
- **WHEN** a failure is detected from incomplete log entry
- **THEN** the system SHALL create a valid Failure with available fields
- **AND** the system SHALL mark missing fields as null
- **AND** the system SHALL include at least message and timestamp

### Requirement: Error Type Extraction
The system SHALL extract and normalize error types from log entries for classification.

#### Scenario: Extract error type from error code
- **WHEN** a log entry contains an error code
- **THEN** the system SHALL use the error code as error type
- **AND** the system SHALL normalize the format (uppercase, trimmed)

#### Scenario: Extract error type from exception name
- **WHEN** a log entry contains an exception stack trace
- **THEN** the system SHALL extract the exception class name
- **AND** the system SHALL use the class name as error type

#### Scenario: Derive error type from pattern
- **WHEN** no explicit error type is found
- **THEN** the system SHALL use the matched pattern name as error type
- **AND** the system SHALL ensure error type is not empty

### Requirement: Message Normalization
The system SHALL normalize error messages by removing variable data for better duplicate detection.

#### Scenario: Remove timestamps from message
- **WHEN** a message contains timestamps
- **THEN** the system SHALL replace timestamps with placeholder
- **AND** the system SHALL preserve message structure

#### Scenario: Remove IDs from message
- **WHEN** a message contains UUIDs, numbers, or unique identifiers
- **THEN** the system SHALL replace identifiers with placeholders
- **AND** the system SHALL maintain message readability

#### Scenario: Preserve important context
- **WHEN** normalizing messages
- **THEN** the system SHALL preserve error codes and types
- **AND** the system SHALL preserve stack trace structure
- **AND** the system SHALL not remove meaningful variable names

### Requirement: Batch Processing
The system SHALL process multiple log entries efficiently in batches.

#### Scenario: Process batch of log entries
- **WHEN** the detector receives a batch of log entries
- **THEN** the system SHALL evaluate all entries against all patterns
- **AND** the system SHALL collect all detected failures
- **AND** the system SHALL return results as a collection

#### Scenario: Handle large batches
- **WHEN** processing more than 100 log entries
- **THEN** the system SHALL maintain performance under 1 second
- **AND** the system SHALL not exhaust memory
- **AND** the system SHALL track processing metrics

### Requirement: Pattern Configuration Validation
The system SHALL validate pattern configuration at startup and reject invalid patterns.

#### Scenario: Validate regex patterns
- **WHEN** loading pattern configuration
- **THEN** the system SHALL compile all regex patterns
- **AND** the system SHALL fail startup if regex is invalid
- **AND** the system SHALL provide clear error messages

#### Scenario: Validate severity values
- **WHEN** loading pattern configuration
- **THEN** the system SHALL verify severity is one of (critical, high, medium, low)
- **AND** the system SHALL fail startup if severity is invalid

#### Scenario: Warn on empty patterns
- **WHEN** pattern list is empty
- **THEN** the system SHALL log a warning
- **AND** the system SHALL continue operation
- **AND** the system SHALL detect no failures until patterns are added
