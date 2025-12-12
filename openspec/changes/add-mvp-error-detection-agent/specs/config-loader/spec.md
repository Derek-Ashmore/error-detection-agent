## ADDED Requirements

### Requirement: YAML Configuration Loading
The system SHALL load configuration from YAML files with support for environment variable substitution.

#### Scenario: Load configuration from default path
- **WHEN** the system starts without explicit config path
- **THEN** the system SHALL load config from ./config/default.yaml
- **AND** the system SHALL fall back to ./config.yaml if default not found
- **AND** the system SHALL fail startup with clear error if no config found

#### Scenario: Load configuration from custom path
- **WHEN** config path is provided via command line or environment variable
- **THEN** the system SHALL load config from specified path
- **AND** the system SHALL validate file exists and is readable
- **AND** the system SHALL fail startup with clear error if file not found

#### Scenario: Parse YAML syntax
- **WHEN** loading configuration file
- **THEN** the system SHALL parse valid YAML syntax
- **AND** the system SHALL fail with line number for syntax errors
- **AND** the system SHALL provide helpful error messages for common mistakes

### Requirement: Environment Variable Substitution
The system SHALL support environment variable references in configuration values for secrets management.

#### Scenario: Substitute environment variable
- **WHEN** config value uses env: prefix (e.g., env:GITHUB_TOKEN)
- **THEN** the system SHALL read value from environment variable
- **AND** the system SHALL fail if referenced variable is not set
- **AND** the system SHALL log which variables were substituted (not values)

#### Scenario: Use default for missing variable
- **WHEN** config value uses env:VAR_NAME:default_value syntax
- **THEN** the system SHALL use environment variable if set
- **AND** the system SHALL use default value if variable not set
- **AND** the system SHALL log when default is used

#### Scenario: Literal values
- **WHEN** config value does not use env: prefix
- **THEN** the system SHALL use literal value as-is
- **AND** the system SHALL support all YAML data types (string, number, boolean, array, object)

### Requirement: Configuration Schema Validation
The system SHALL validate configuration against a schema and fail startup if invalid.

#### Scenario: Validate required fields
- **WHEN** loading configuration
- **THEN** the system SHALL verify all required fields are present
- **AND** the system SHALL list all missing fields in error message
- **AND** the system SHALL fail startup if required fields missing

#### Scenario: Validate field types
- **WHEN** validating configuration
- **THEN** the system SHALL verify fields match expected types
- **AND** the system SHALL fail if type mismatch (e.g., string instead of number)
- **AND** the system SHALL provide clear error with field path and expected type

#### Scenario: Validate field values
- **WHEN** validating configuration
- **THEN** the system SHALL verify values are within acceptable ranges
- **AND** the system SHALL validate enum values (e.g., severity must be critical|high|medium|low)
- **AND** the system SHALL validate format (e.g., duration strings, URLs)

#### Scenario: Validate pattern configuration
- **WHEN** validating failure detection patterns
- **THEN** the system SHALL verify regex patterns compile
- **AND** the system SHALL verify severity levels are valid
- **AND** the system SHALL warn if pattern list is empty

### Requirement: Configuration Structure
The system SHALL support a hierarchical configuration structure with logical sections.

#### Scenario: Azure configuration section
- **WHEN** loading configuration
- **THEN** the system SHALL parse azure section with workspaceId, clientId, and query settings
- **AND** the system SHALL validate Azure workspace ID format
- **AND** the system SHALL validate duration strings (queryInterval, queryLookback)

#### Scenario: Detection configuration section
- **WHEN** loading configuration
- **THEN** the system SHALL parse detection section with pattern list
- **AND** the system SHALL support multiple pattern types (error_code, keyword, regex)
- **AND** the system SHALL validate each pattern has type, pattern, and severity

#### Scenario: GitHub configuration section
- **WHEN** loading configuration
- **THEN** the system SHALL parse github section with owner, repo, token, labels, and assignees
- **AND** the system SHALL validate owner and repo are non-empty strings
- **AND** the system SHALL validate labels and assignees are arrays

#### Scenario: Duplicate checker configuration section
- **WHEN** loading configuration
- **THEN** the system SHALL parse duplicate section with cacheSize, ttlDays, and persistPath
- **AND** the system SHALL validate cacheSize is positive integer
- **AND** the system SHALL validate ttlDays is positive number

#### Scenario: Scheduler configuration section
- **WHEN** loading configuration
- **THEN** the system SHALL parse scheduler section with pollInterval and healthCheckPort
- **AND** the system SHALL validate pollInterval is positive duration
- **AND** the system SHALL validate healthCheckPort is valid port number (1-65535)

### Requirement: Default Values
The system SHALL provide sensible defaults for optional configuration fields.

#### Scenario: Apply defaults for missing optional fields
- **WHEN** optional fields are not specified
- **THEN** the system SHALL use default values
- **AND** the system SHALL log which defaults were applied
- **AND** defaults SHALL be: queryInterval=5m, queryLookback=10m, cacheSize=10000, ttlDays=7, pollInterval=5m, healthCheckPort=8080

#### Scenario: User-provided values override defaults
- **WHEN** optional fields are specified in config
- **THEN** the system SHALL use provided values
- **AND** the system SHALL not apply defaults

### Requirement: Configuration Reloading
The system SHALL support configuration reloading without restart for specific fields.

#### Scenario: Detect configuration file change
- **WHEN** configuration file is modified
- **THEN** the system SHALL detect the change within 30 seconds
- **AND** the system SHALL log configuration reload attempt

#### Scenario: Reload pattern configuration
- **WHEN** detection patterns are modified
- **THEN** the system SHALL reload pattern list
- **AND** the system SHALL validate new patterns before applying
- **AND** the system SHALL continue using old patterns if validation fails

#### Scenario: Reject reload for immutable fields
- **WHEN** attempting to reload immutable fields (Azure workspace, GitHub repo)
- **THEN** the system SHALL log warning that restart is required
- **AND** the system SHALL not apply changes to immutable fields

### Requirement: Configuration Validation Report
The system SHALL provide detailed validation report for configuration issues.

#### Scenario: Generate validation report
- **WHEN** configuration validation fails
- **THEN** the system SHALL generate report listing all errors
- **AND** the report SHALL include field paths, error types, and expected values
- **AND** the report SHALL be human-readable

#### Scenario: Validation success confirmation
- **WHEN** configuration validation succeeds
- **THEN** the system SHALL log confirmation with config summary
- **AND** the summary SHALL include key settings (without secrets)
- **AND** the summary SHALL include pattern count, interval, and cache settings

### Requirement: Multiple Environment Support
The system SHALL support environment-specific configuration files.

#### Scenario: Load environment-specific config
- **WHEN** ENVIRONMENT variable is set (e.g., production, staging, development)
- **THEN** the system SHALL load config from ./config/{ENVIRONMENT}.yaml
- **AND** the system SHALL fall back to default.yaml if environment file not found
- **AND** the system SHALL log which config file was loaded

#### Scenario: Merge base and environment configs
- **WHEN** both base.yaml and {ENVIRONMENT}.yaml exist
- **THEN** the system SHALL load base.yaml first
- **AND** the system SHALL merge environment-specific config
- **AND** environment values SHALL override base values

### Requirement: Secrets Protection
The system SHALL protect sensitive configuration values in logs and error messages.

#### Scenario: Redact secrets in logs
- **WHEN** logging configuration
- **THEN** the system SHALL redact values for fields containing "token", "secret", "password", "key"
- **AND** redacted values SHALL be shown as "***"
- **AND** field names SHALL be visible for debugging

#### Scenario: Redact secrets in error messages
- **WHEN** reporting configuration errors
- **THEN** the system SHALL not include secret values in error messages
- **AND** the system SHALL indicate field name but not value
- **AND** the system SHALL maintain enough context for debugging

### Requirement: Configuration Export
The system SHALL support exporting active configuration for verification and documentation.

#### Scenario: Export configuration with secrets redacted
- **WHEN** exporting configuration
- **THEN** the system SHALL output complete configuration as YAML
- **AND** the system SHALL redact all secret values
- **AND** the system SHALL include applied defaults
- **AND** the output SHALL be valid YAML that can be used as config file
