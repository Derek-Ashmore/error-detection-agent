## ADDED Requirements

### Requirement: Hash-Based Duplicate Detection
The system SHALL generate deterministic hashes from failure signatures and use them to prevent duplicate issue creation.

#### Scenario: Generate hash from failure signature
- **WHEN** a failure is detected
- **THEN** the system SHALL generate a hash from error type, normalized message, source location, and severity
- **AND** the hash SHALL be deterministic (same input produces same hash)
- **AND** the hash SHALL be collision-resistant (SHA-256 or equivalent)

#### Scenario: Detect duplicate failure
- **WHEN** a failure hash matches an existing cache entry
- **THEN** the system SHALL mark the failure as duplicate
- **AND** the system SHALL return the original failure ID
- **AND** the system SHALL update last-seen timestamp
- **AND** the system SHALL increment occurrence counter

#### Scenario: Detect new unique failure
- **WHEN** a failure hash is not in cache
- **THEN** the system SHALL mark the failure as new
- **AND** the system SHALL add the hash to cache
- **AND** the system SHALL initialize occurrence counter to 1

### Requirement: In-Memory LRU Cache
The system SHALL maintain an in-memory LRU cache of failure hashes with configurable size limits.

#### Scenario: Cache within size limit
- **WHEN** cache contains fewer entries than the configured limit
- **THEN** the system SHALL add new entries without eviction
- **AND** the system SHALL maintain insertion order

#### Scenario: Cache at size limit
- **WHEN** cache is at maximum size and new entry is added
- **THEN** the system SHALL evict the least recently used entry
- **AND** the system SHALL add the new entry
- **AND** the system SHALL log the eviction

#### Scenario: Update LRU on access
- **WHEN** an existing cache entry is accessed (duplicate detected)
- **THEN** the system SHALL move the entry to most recently used position
- **AND** the system SHALL update access timestamp

### Requirement: TTL-Based Expiration
The system SHALL expire cache entries after a configurable time-to-live period.

#### Scenario: Entry within TTL
- **WHEN** checking a cache entry within TTL period
- **THEN** the entry SHALL be considered valid
- **AND** the system SHALL return duplicate status

#### Scenario: Entry beyond TTL
- **WHEN** checking a cache entry beyond TTL period
- **THEN** the entry SHALL be considered expired
- **AND** the system SHALL remove the entry from cache
- **AND** the system SHALL treat the failure as new

#### Scenario: Background TTL cleanup
- **WHEN** running periodic cache maintenance
- **THEN** the system SHALL remove all expired entries
- **AND** the system SHALL log the number of entries removed
- **AND** the system SHALL run cleanup every 15 minutes

### Requirement: Optional Persistent Storage
The system SHALL optionally persist cache to disk for survival across restarts.

#### Scenario: Save cache to disk on shutdown
- **WHEN** the system receives shutdown signal
- **THEN** the system SHALL serialize cache to SQLite database or JSON file
- **AND** the system SHALL include all entry metadata (hash, timestamps, counters)
- **AND** the system SHALL complete within 5 seconds

#### Scenario: Load cache from disk on startup
- **WHEN** the system starts and persistence is enabled
- **THEN** the system SHALL load cache from disk
- **AND** the system SHALL validate entry integrity
- **AND** the system SHALL expire entries beyond TTL
- **AND** the system SHALL log load statistics

#### Scenario: Handle corrupted persistence file
- **WHEN** persistence file is corrupted or invalid
- **THEN** the system SHALL log the error
- **AND** the system SHALL start with empty cache
- **AND** the system SHALL backup corrupted file for investigation

### Requirement: Cache Statistics and Monitoring
The system SHALL provide cache statistics for observability and tuning.

#### Scenario: Track hit rate
- **WHEN** checking for duplicates
- **THEN** the system SHALL track cache hits and misses
- **AND** the system SHALL calculate hit rate percentage
- **AND** the system SHALL expose hit rate as metric

#### Scenario: Track cache size
- **WHEN** monitoring cache health
- **THEN** the system SHALL report current entry count
- **AND** the system SHALL report cache memory usage
- **AND** the system SHALL warn when approaching size limit

#### Scenario: Track eviction rate
- **WHEN** entries are evicted
- **THEN** the system SHALL count evictions
- **AND** the system SHALL expose eviction rate as metric
- **AND** the system SHALL alert when eviction rate is high

### Requirement: Failure Metadata Management
The system SHALL maintain metadata for each cached failure including occurrence count and timestamps.

#### Scenario: Initialize metadata for new failure
- **WHEN** a new failure is cached
- **THEN** the system SHALL set first-seen timestamp
- **AND** the system SHALL set last-seen timestamp to same value
- **AND** the system SHALL set occurrence count to 1

#### Scenario: Update metadata for duplicate
- **WHEN** a duplicate failure is detected
- **THEN** the system SHALL update last-seen timestamp
- **AND** the system SHALL increment occurrence count
- **AND** the system SHALL preserve first-seen timestamp

#### Scenario: Retrieve metadata for issue update
- **WHEN** creating or updating a GitHub issue
- **THEN** the system SHALL provide first-seen, last-seen, and occurrence count
- **AND** the metadata SHALL be accurate and consistent

### Requirement: Hash Collision Handling
The system SHALL detect and handle hash collisions to prevent false duplicates.

#### Scenario: Detect hash collision
- **WHEN** a hash matches but failure details differ
- **THEN** the system SHALL compare full failure signatures
- **AND** the system SHALL treat as different failures if signatures differ
- **AND** the system SHALL log the collision

#### Scenario: No hash collision
- **WHEN** a hash matches and failure details match
- **THEN** the system SHALL treat as duplicate
- **AND** the system SHALL not perform additional comparison

### Requirement: Configuration and Tuning
The system SHALL support configuration of cache parameters for different deployment scenarios.

#### Scenario: Configure cache size
- **WHEN** loading configuration
- **THEN** the system SHALL validate cache size is positive integer
- **AND** the system SHALL default to 10,000 entries if not specified
- **AND** the system SHALL warn if size is too small (<100)

#### Scenario: Configure TTL period
- **WHEN** loading configuration
- **THEN** the system SHALL validate TTL is positive duration
- **AND** the system SHALL default to 7 days if not specified
- **AND** the system SHALL support units (hours, days, weeks)

#### Scenario: Enable/disable persistence
- **WHEN** persistence is configured
- **THEN** the system SHALL validate persistence path is writable
- **AND** the system SHALL create directory if it doesn't exist
- **AND** the system SHALL default to disabled if not specified
