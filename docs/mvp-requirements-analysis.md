# MVP Requirements Analysis - Error Detection Agent

**Document Version:** 1.0
**Date:** 2025-12-12
**Analysis Status:** Complete
**Target Development Time:** < 3 days
**Target Code Size:** < 500 lines

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Core Requirements Analysis](#core-requirements-analysis)
3. [Architecture Component Breakdown](#architecture-component-breakdown)
4. [Configuration Requirements](#configuration-requirements)
5. [API Integration Specifications](#api-integration-specifications)
6. [TypeScript Type System Design](#typescript-type-system-design)
7. [Dependency Analysis](#dependency-analysis)
8. [Security & Authentication](#security--authentication)
9. [Data Flow Analysis](#data-flow-analysis)
10. [Success Criteria Breakdown](#success-criteria-breakdown)
11. [Implementation Recommendations](#implementation-recommendations)

---

## Executive Summary

### Objective
Prove the core concept: automatically detect failures in Azure logs and create GitHub issues within 5 minutes of error occurrence.

### Key Constraints
- **Development Time:** < 3 days
- **Code Size:** < 500 lines of application code
- **Processing Volume:** 1-2 applications, < 100 log entries per hour
- **Polling Interval:** 5 minutes
- **Cost Target:** ~$10/month

### Critical Success Factors
1. Detect 1 error within 5 minutes
2. Create correctly formatted GitHub issue
3. Prevent duplicate issue creation
4. Pass all automated tests
5. Minimize operational complexity

---

## Core Requirements Analysis

### 1. Single Log Source (Azure Log Analytics)

**Requirement:** Query Azure Log Analytics workspace for application errors

**Analysis:**
- **Data Format:** JSON responses from Azure Monitor Query API
- **Query Window:** 5-minute intervals to match polling schedule
- **Query Scope:** Single workspace, 1-2 tables maximum
- **Authentication:** Service Principal with Log Analytics Reader role

**Key Considerations:**
- Need to handle API rate limits (though unlikely at low volume)
- Must track last query timestamp to avoid duplicate processing
- Query should be optimized for minimal data transfer
- Handle workspace connection failures gracefully

**Dependencies:**
- `@azure/monitor-query` SDK
- `@azure/identity` for DefaultAzureCredential
- Azure subscription with Log Analytics workspace
- Service Principal credentials

---

### 2. Simple Failure Detection

**Requirement:** Pattern matching on predefined error patterns

**Analysis:**
- **Detection Method:** Regex and string matching
- **Pattern Storage:** JSON configuration file
- **Pattern Types:**
  - Error level matching (ERROR, FATAL, CRITICAL)
  - Exception type matching (NullPointerException, TimeoutException, etc.)
  - Message content matching (specific error messages)
  - Custom field matching (application-specific error codes)

**Pattern Examples:**
```json
{
  "patterns": [
    {
      "id": "sql-timeout",
      "name": "SQL Query Timeout",
      "field": "message",
      "regex": "(?i)sql.*timeout|query.*timeout",
      "severity": "high"
    },
    {
      "id": "null-pointer",
      "name": "Null Pointer Exception",
      "field": "exceptionType",
      "value": "NullPointerException",
      "severity": "medium"
    },
    {
      "id": "error-level",
      "name": "Error Level Logs",
      "field": "level",
      "value": "ERROR",
      "severity": "medium"
    }
  ]
}
```

**Key Considerations:**
- Patterns should be case-insensitive by default
- Support both exact match and regex patterns
- Each pattern should have a unique identifier
- Allow severity classification for future prioritization
- Keep pattern count minimal (5-10 patterns max for MVP)

---

### 3. Basic GitHub Integration

**Requirement:** Create issues with error details using Octokit REST API

**Analysis:**
- **API Library:** Octokit/rest.js v20+
- **Authentication:** Personal Access Token (PAT) or GitHub App
- **Permissions Required:**
  - `repo` scope (for private repos)
  - Or `public_repo` scope (for public repos only)
  - `issues: write` permission

**Issue Format Specification:**
```typescript
{
  title: "[AUTO] {ErrorType}: {Short Description}",
  body: `
## Error Details

**Timestamp:** {ISO 8601 timestamp}
**Application:** {application name}
**Environment:** {environment}
**Severity:** {severity level}

## Error Message
\`\`\`
{error message}
\`\`\`

## Stack Trace
\`\`\`
{stack trace if available}
\`\`\`

## Log Context
\`\`\`json
{full log entry}
\`\`\`

## Detection Info
- **Pattern Matched:** {pattern name}
- **Detection Time:** {detection timestamp}
- **Log Source:** {Azure workspace}

---
*This issue was automatically created by error-detection-agent*
  `,
  labels: ["automated", "error", "{severity}"],
  assignees: [] // Optional: configure assignees in config
}
```

**Key Considerations:**
- Use consistent title format for easier filtering
- Include enough context for debugging
- Add labels for automated filtering and routing
- Consider adding assignees based on error pattern
- Format timestamps in human-readable format
- Include link back to Azure Log Analytics if possible

---

### 4. Simple Duplicate Detection

**Requirement:** Hash-based matching to prevent duplicate issues

**Analysis:**
- **Hash Algorithm:** SHA256 (built-in Node.js crypto)
- **Hash Input Components:**
  1. Error pattern ID
  2. Error message (normalized)
  3. Application name
  4. Time window (optional - to allow re-reporting after X hours)

**Hash Generation Strategy:**
```typescript
// Normalize error message (remove timestamps, IDs, etc.)
const normalizedMessage = message
  .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/g, 'TIMESTAMP')
  .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, 'UUID')
  .replace(/\d+/g, 'NUM')
  .toLowerCase()
  .trim();

const hashInput = `${patternId}:${normalizedMessage}:${applicationName}`;
const hash = crypto.createHash('sha256').update(hashInput).digest('hex');
```

**Storage Strategy:**
- **MVP Approach:** In-memory Map/Set (simple, no external dependencies)
- **Trade-off:** Lost on restart (acceptable for MVP)
- **Alternative:** SQLite file (if persistence needed)

**Cache Management:**
- **Retention:** Keep hashes for 24 hours
- **Cleanup:** Periodic cleanup of old hashes (hourly)
- **Size Limit:** Max 10,000 hashes (more than enough for low volume)

**Key Considerations:**
- Message normalization is critical for effective deduplication
- Consider time-based re-opening (e.g., same error after 24 hours creates new issue)
- Handle edge cases where multiple errors occur simultaneously
- Log duplicate detections for monitoring

---

### 5. Manual Configuration

**Requirement:** JSON configuration file for all settings

**Configuration Schema:**
```json
{
  "azure": {
    "workspaceId": "12345678-1234-1234-1234-123456789012",
    "tenantId": "87654321-4321-4321-4321-210987654321",
    "clientId": "11111111-1111-1111-1111-111111111111",
    "clientSecret": "${AZURE_CLIENT_SECRET}",
    "queryTable": "AppTraces",
    "queryInterval": 5
  },
  "github": {
    "owner": "myorg",
    "repo": "myrepo",
    "token": "${GITHUB_TOKEN}",
    "defaultLabels": ["automated", "error"],
    "assignees": []
  },
  "detection": {
    "patternsFile": "./patterns.json",
    "duplicateWindowHours": 24,
    "maxCacheSize": 10000
  },
  "scheduler": {
    "intervalMinutes": 5,
    "enabled": true
  },
  "logging": {
    "level": "info",
    "format": "json"
  }
}
```

**Environment Variable Support:**
- Use `${VAR_NAME}` syntax in config
- Replace at runtime with environment variables
- Fail fast if required variables are missing

**Key Considerations:**
- Validate configuration on startup
- Provide clear error messages for invalid config
- Support both file path and environment variable for secrets
- Consider schema validation using JSON Schema or Zod

---

### 6. Single Repository Target

**Requirement:** All issues go to one GitHub repository

**Analysis:**
- **Simple Implementation:** Hard-coded repository in configuration
- **No Routing Logic:** Reduces complexity significantly
- **Future Extension:** Can add routing later based on error patterns

**Key Considerations:**
- Validate repository access on startup
- Ensure repository exists and is accessible
- Check that token has correct permissions
- Log all issue creations for audit trail

---

### 7. Low Volume Processing

**Requirement:** Handle 1-2 applications with < 100 log entries per hour

**Analysis:**
- **Processing Capacity:** ~100 logs / 60 minutes = 1.67 logs/minute
- **Per Interval:** ~8 logs per 5-minute interval
- **Error Rate:** Assuming 5% error rate = ~5 errors per hour
- **GitHub API:** Well within rate limits (5000/hour authenticated)

**Performance Requirements:**
- Query execution: < 5 seconds
- Pattern matching: < 1 second for 100 logs
- Hash checking: < 100ms for 10,000 hashes
- GitHub API call: < 2 seconds per issue
- **Total cycle time:** < 10 seconds per interval

**Key Considerations:**
- No need for queuing or batch processing
- No need for worker threads
- Simple sequential processing is sufficient
- Memory footprint should stay < 100MB

---

## Architecture Component Breakdown

### 1. Log Fetcher Component

**Responsibility:** Query Azure Log Analytics and return log entries

**Interface:**
```typescript
interface LogFetcher {
  /**
   * Fetch log entries from Azure Log Analytics
   * @param since - ISO timestamp of last query
   * @param until - ISO timestamp for query end (usually now)
   * @returns Array of log entries
   */
  fetchLogs(since: string, until: string): Promise<LogEntry[]>;

  /**
   * Test connection to Azure Log Analytics
   * @returns true if connection is successful
   */
  testConnection(): Promise<boolean>;
}
```

**Implementation Details:**
- Use `@azure/monitor-query` LogsQueryClient
- Construct KQL query dynamically based on time window
- Handle pagination if results > 100 (unlikely for MVP)
- Retry on transient failures (with exponential backoff)
- Log query execution time

**Sample KQL Query:**
```kusto
AppTraces
| where TimeGenerated >= datetime({since}) and TimeGenerated < datetime({until})
| where Level in ("Error", "Critical", "Fatal")
| project TimeGenerated, Level, Message, Properties
| order by TimeGenerated desc
```

**Error Handling:**
- Network failures: Retry up to 3 times
- Authentication failures: Fail fast and exit
- Invalid query: Log and skip interval
- Empty results: Normal, continue

---

### 2. Failure Detector Component

**Responsibility:** Match log entries against error patterns

**Interface:**
```typescript
interface FailureDetector {
  /**
   * Check if a log entry matches any error patterns
   * @param logEntry - The log entry to check
   * @returns Matched pattern or null
   */
  detectFailure(logEntry: LogEntry): ErrorPattern | null;

  /**
   * Load error patterns from configuration
   * @param patternsFile - Path to patterns JSON file
   */
  loadPatterns(patternsFile: string): Promise<void>;

  /**
   * Get all loaded patterns
   */
  getPatterns(): ErrorPattern[];
}
```

**Pattern Matching Algorithm:**
```typescript
1. For each error pattern:
   a. Extract the target field from log entry
   b. If pattern has regex, test against regex
   c. If pattern has exact value, compare (case-insensitive)
   d. If match found, return pattern immediately
2. If no match found, return null
```

**Optimization:**
- Compile regexes once at startup
- Order patterns by frequency (most common first)
- Short-circuit on first match
- Cache compiled regex objects

**Key Considerations:**
- Log when patterns are loaded/reloaded
- Validate pattern syntax on load
- Handle malformed patterns gracefully
- Support pattern reload without restart (nice-to-have)

---

### 3. Duplicate Checker Component

**Responsibility:** Track and identify duplicate errors

**Interface:**
```typescript
interface DuplicateChecker {
  /**
   * Check if an error has been seen before
   * @param error - The detected error
   * @returns true if duplicate, false if new
   */
  isDuplicate(error: DetectedError): boolean;

  /**
   * Mark an error as seen
   * @param error - The detected error
   */
  markAsSeen(error: DetectedError): void;

  /**
   * Clean up old entries from cache
   */
  cleanup(): void;

  /**
   * Get cache statistics
   */
  getStats(): CacheStats;
}
```

**Implementation Strategy:**
```typescript
class InMemoryDuplicateChecker implements DuplicateChecker {
  private cache: Map<string, CacheEntry> = new Map();
  private readonly maxAge: number; // milliseconds
  private readonly maxSize: number;

  isDuplicate(error: DetectedError): boolean {
    const hash = this.computeHash(error);
    const entry = this.cache.get(hash);

    if (!entry) return false;

    // Check if entry is still valid
    if (Date.now() - entry.timestamp > this.maxAge) {
      this.cache.delete(hash);
      return false;
    }

    return true;
  }

  markAsSeen(error: DetectedError): void {
    const hash = this.computeHash(error);
    this.cache.set(hash, {
      hash,
      timestamp: Date.now(),
      pattern: error.patternId,
      application: error.application
    });

    // Enforce size limit
    if (this.cache.size > this.maxSize) {
      this.evictOldest();
    }
  }

  private computeHash(error: DetectedError): string {
    // Normalize message
    const normalized = this.normalizeMessage(error.message);
    const input = `${error.patternId}:${normalized}:${error.application}`;
    return createHash('sha256').update(input).digest('hex');
  }

  private normalizeMessage(message: string): string {
    return message
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?/g, 'TIMESTAMP')
      .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, 'UUID')
      .replace(/\b\d+\b/g, 'NUM')
      .toLowerCase()
      .trim();
  }
}
```

**Key Considerations:**
- Use LRU eviction when cache is full
- Log cache hit/miss ratio for monitoring
- Consider memory usage (each entry ~200 bytes)
- Periodic cleanup every 1 hour

---

### 4. GitHub Issue Creator Component

**Responsibility:** Create GitHub issues with error details

**Interface:**
```typescript
interface GitHubIssueCreator {
  /**
   * Create a GitHub issue for a detected error
   * @param error - The detected error
   * @returns The created issue URL
   */
  createIssue(error: DetectedError): Promise<string>;

  /**
   * Test connection to GitHub API
   * @returns true if connection is successful
   */
  testConnection(): Promise<boolean>;

  /**
   * Format error details into issue body
   * @param error - The detected error
   * @returns Formatted markdown content
   */
  formatIssueBody(error: DetectedError): string;
}
```

**Issue Creation Flow:**
```typescript
async createIssue(error: DetectedError): Promise<string> {
  // 1. Format title
  const title = `[AUTO] ${error.patternName}: ${this.truncate(error.message, 80)}`;

  // 2. Format body
  const body = this.formatIssueBody(error);

  // 3. Prepare labels
  const labels = [
    ...this.config.defaultLabels,
    error.severity,
    `app:${error.application}`
  ];

  // 4. Create issue via Octokit
  const response = await this.octokit.rest.issues.create({
    owner: this.config.owner,
    repo: this.config.repo,
    title,
    body,
    labels,
    assignees: this.config.assignees
  });

  // 5. Log and return
  logger.info('Created issue', {
    number: response.data.number,
    url: response.data.html_url
  });

  return response.data.html_url;
}
```

**Error Handling:**
- Rate limit exceeded: Wait and retry
- Authentication failure: Fail fast
- Network error: Retry up to 3 times
- Validation error: Log and skip

**Key Considerations:**
- Include all relevant context in issue body
- Use markdown formatting for readability
- Add labels for filtering and automation
- Include timestamp in UTC
- Link to Azure portal if possible

---

### 5. Scheduler Component

**Responsibility:** Run detection cycle every 5 minutes

**Interface:**
```typescript
interface Scheduler {
  /**
   * Start the scheduler
   */
  start(): void;

  /**
   * Stop the scheduler
   */
  stop(): void;

  /**
   * Run one detection cycle manually
   */
  runOnce(): Promise<void>;

  /**
   * Get scheduler status
   */
  getStatus(): SchedulerStatus;
}
```

**Implementation:**
```typescript
class SimpleScheduler implements Scheduler {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private lastRun: Date | null = null;

  constructor(
    private readonly intervalMs: number,
    private readonly detectionCycle: DetectionCycle
  ) {}

  start(): void {
    if (this.isRunning) {
      logger.warn('Scheduler already running');
      return;
    }

    logger.info('Starting scheduler', {
      intervalMinutes: this.intervalMs / 60000
    });

    // Run immediately on start
    this.runOnce();

    // Schedule recurring runs
    this.intervalId = setInterval(() => {
      this.runOnce();
    }, this.intervalMs);

    this.isRunning = true;
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    logger.info('Scheduler stopped');
  }

  async runOnce(): Promise<void> {
    const startTime = Date.now();
    logger.info('Starting detection cycle');

    try {
      await this.detectionCycle.run();
      this.lastRun = new Date();
      logger.info('Detection cycle completed', {
        durationMs: Date.now() - startTime
      });
    } catch (error) {
      logger.error('Detection cycle failed', { error });
      // Don't throw - let scheduler continue
    }
  }
}
```

**Key Considerations:**
- Use `setInterval` for simplicity (no drift concerns at 5-minute intervals)
- Handle overlapping executions (shouldn't happen at low volume)
- Graceful shutdown on SIGTERM/SIGINT
- Log each cycle execution for monitoring
- Track last successful run time

---

## Configuration Requirements

### Configuration Files

#### 1. Main Configuration (`config.json`)

**Location:** `/config/config.json` or `./config.json`

**Schema:**
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["azure", "github", "detection", "scheduler"],
  "properties": {
    "azure": {
      "type": "object",
      "required": ["workspaceId", "tenantId", "clientId", "queryTable"],
      "properties": {
        "workspaceId": { "type": "string", "pattern": "^[0-9a-f-]{36}$" },
        "tenantId": { "type": "string", "pattern": "^[0-9a-f-]{36}$" },
        "clientId": { "type": "string", "pattern": "^[0-9a-f-]{36}$" },
        "clientSecret": { "type": "string" },
        "queryTable": { "type": "string" },
        "queryInterval": { "type": "number", "minimum": 1, "maximum": 60 }
      }
    },
    "github": {
      "type": "object",
      "required": ["owner", "repo", "token"],
      "properties": {
        "owner": { "type": "string" },
        "repo": { "type": "string" },
        "token": { "type": "string" },
        "defaultLabels": {
          "type": "array",
          "items": { "type": "string" }
        },
        "assignees": {
          "type": "array",
          "items": { "type": "string" }
        }
      }
    },
    "detection": {
      "type": "object",
      "required": ["patternsFile"],
      "properties": {
        "patternsFile": { "type": "string" },
        "duplicateWindowHours": { "type": "number", "minimum": 1 },
        "maxCacheSize": { "type": "number", "minimum": 100 }
      }
    },
    "scheduler": {
      "type": "object",
      "required": ["intervalMinutes", "enabled"],
      "properties": {
        "intervalMinutes": { "type": "number", "minimum": 1 },
        "enabled": { "type": "boolean" }
      }
    },
    "logging": {
      "type": "object",
      "properties": {
        "level": {
          "type": "string",
          "enum": ["debug", "info", "warn", "error"]
        },
        "format": {
          "type": "string",
          "enum": ["json", "text"]
        }
      }
    }
  }
}
```

#### 2. Error Patterns Configuration (`patterns.json`)

**Location:** Specified in main config `detection.patternsFile`

**Schema:**
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["patterns"],
  "properties": {
    "patterns": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "name", "field"],
        "properties": {
          "id": {
            "type": "string",
            "pattern": "^[a-z0-9-]+$"
          },
          "name": { "type": "string" },
          "description": { "type": "string" },
          "field": { "type": "string" },
          "regex": { "type": "string" },
          "value": { "type": "string" },
          "severity": {
            "type": "string",
            "enum": ["low", "medium", "high", "critical"]
          },
          "enabled": {
            "type": "boolean",
            "default": true
          }
        },
        "oneOf": [
          { "required": ["regex"] },
          { "required": ["value"] }
        ]
      }
    }
  }
}
```

**Example:**
```json
{
  "patterns": [
    {
      "id": "sql-timeout",
      "name": "SQL Query Timeout",
      "description": "Detects SQL query timeout errors",
      "field": "message",
      "regex": "(?i)sql.*(timeout|timed out)|query.*timeout",
      "severity": "high",
      "enabled": true
    },
    {
      "id": "null-reference",
      "name": "Null Reference Exception",
      "description": "Detects null reference errors",
      "field": "exceptionType",
      "value": "NullReferenceException",
      "severity": "medium",
      "enabled": true
    },
    {
      "id": "out-of-memory",
      "name": "Out of Memory",
      "description": "Detects OOM errors",
      "field": "message",
      "regex": "(?i)out of memory|oom|memory.*exhausted",
      "severity": "critical",
      "enabled": true
    }
  ]
}
```

### Environment Variables

**Required:**
- `AZURE_CLIENT_SECRET` - Azure Service Principal secret
- `GITHUB_TOKEN` - GitHub Personal Access Token

**Optional:**
- `CONFIG_PATH` - Path to config.json (default: `./config.json`)
- `PATTERNS_PATH` - Override patterns file path
- `LOG_LEVEL` - Override log level (debug, info, warn, error)
- `NODE_ENV` - Environment (development, production)

### Configuration Loading Strategy

```typescript
class ConfigLoader {
  static async load(): Promise<AppConfig> {
    // 1. Load config file
    const configPath = process.env.CONFIG_PATH || './config.json';
    const rawConfig = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(rawConfig);

    // 2. Replace environment variables
    const resolved = this.resolveEnvVars(config);

    // 3. Validate schema
    const validated = await this.validate(resolved);

    // 4. Load patterns
    const patterns = await this.loadPatterns(validated.detection.patternsFile);

    return { ...validated, patterns };
  }

  private static resolveEnvVars(obj: any): any {
    // Recursively replace ${VAR_NAME} with process.env.VAR_NAME
    const json = JSON.stringify(obj);
    const replaced = json.replace(/"\$\{([^}]+)\}"/g, (_, name) => {
      const value = process.env[name];
      if (!value) {
        throw new Error(`Missing environment variable: ${name}`);
      }
      return JSON.stringify(value);
    });
    return JSON.parse(replaced);
  }
}
```

---

## API Integration Specifications

### 1. Azure Monitor Query API

**SDK:** `@azure/monitor-query`
**Version:** ^1.0.0

**Authentication:**
```typescript
import { DefaultAzureCredential } from '@azure/identity';
import { LogsQueryClient } from '@azure/monitor-query';

const credential = new DefaultAzureCredential();
const client = new LogsQueryClient(credential);
```

**Query Execution:**
```typescript
const result = await client.queryWorkspace(
  workspaceId,
  query,
  {
    duration: { minutes: 5 },
    serverTimeoutInSeconds: 30
  }
);

// Access results
const tables = result.tables;
const rows = tables[0].rows;
```

**KQL Query Template:**
```kusto
{tableName}
| where TimeGenerated >= datetime({startTime})
| where TimeGenerated < datetime({endTime})
| where Level in ("Error", "Critical", "Fatal") or isnotempty(Exception)
| project
    TimeGenerated,
    Level,
    Message,
    Exception,
    ExceptionType = tostring(Properties.ExceptionType),
    Application = tostring(Properties.Application),
    Environment = tostring(Properties.Environment),
    Properties
| order by TimeGenerated desc
| limit 1000
```

**Error Handling:**
```typescript
try {
  const result = await client.queryWorkspace(workspaceId, query, options);
} catch (error) {
  if (error.code === 'AuthenticationFailed') {
    // Exit - cannot continue without auth
    throw new FatalError('Azure authentication failed');
  } else if (error.code === 'WorkspaceNotFound') {
    throw new FatalError('Azure workspace not found');
  } else if (error.statusCode === 429) {
    // Rate limited - wait and retry
    await sleep(60000);
    return this.queryWorkspace(workspaceId, query, options);
  } else {
    // Transient error - retry
    logger.warn('Query failed, retrying', { error });
    return this.retryQuery(workspaceId, query, options);
  }
}
```

**Rate Limits:**
- 200 requests per 30 seconds per workspace
- Not a concern at 5-minute intervals (12 requests per hour)

---

### 2. GitHub REST API (via Octokit)

**SDK:** `@octokit/rest`
**Version:** ^20.0.0

**Authentication:**
```typescript
import { Octokit } from '@octokit/rest';

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
  userAgent: 'error-detection-agent/1.0.0'
});
```

**Create Issue:**
```typescript
const response = await octokit.rest.issues.create({
  owner: 'myorg',
  repo: 'myrepo',
  title: '[AUTO] SQL Timeout: Query execution exceeded timeout',
  body: issueBody,
  labels: ['automated', 'error', 'high'],
  assignees: ['user1']
});

// Returns: { data: { number, html_url, ... } }
```

**Test Connection:**
```typescript
async testConnection(): Promise<boolean> {
  try {
    // Get repository info to verify access
    await this.octokit.rest.repos.get({
      owner: this.config.owner,
      repo: this.config.repo
    });

    // Verify we can create issues
    const { data: permissions } = await this.octokit.rest.repos.get({
      owner: this.config.owner,
      repo: this.config.repo
    });

    return permissions.permissions?.push === true;
  } catch (error) {
    logger.error('GitHub connection test failed', { error });
    return false;
  }
}
```

**Rate Limits:**
- 5,000 requests per hour (authenticated)
- At low volume (5 errors/hour max), well within limits
- Check rate limit: `octokit.rest.rateLimit.get()`

**Error Handling:**
```typescript
try {
  await octokit.rest.issues.create(params);
} catch (error) {
  if (error.status === 401) {
    throw new FatalError('GitHub authentication failed');
  } else if (error.status === 403) {
    // Check if rate limited
    if (error.response.headers['x-ratelimit-remaining'] === '0') {
      const resetTime = error.response.headers['x-ratelimit-reset'];
      logger.warn('Rate limited', { resetTime });
      await this.waitForRateLimit(resetTime);
      return this.createIssue(params);
    }
    throw new FatalError('GitHub permission denied');
  } else if (error.status === 404) {
    throw new FatalError('GitHub repository not found');
  } else {
    // Retry transient errors
    logger.warn('Issue creation failed, retrying', { error });
    return this.retryCreateIssue(params);
  }
}
```

---

## TypeScript Type System Design

### Core Domain Types

```typescript
/**
 * Raw log entry from Azure Log Analytics
 */
export interface LogEntry {
  TimeGenerated: string; // ISO 8601
  Level: string; // Error, Critical, Fatal, etc.
  Message: string;
  Exception?: string;
  ExceptionType?: string;
  Application?: string;
  Environment?: string;
  Properties?: Record<string, any>;
}

/**
 * Error pattern for matching log entries
 */
export interface ErrorPattern {
  id: string; // Unique identifier (kebab-case)
  name: string; // Human-readable name
  description?: string;
  field: string; // Log field to match against
  regex?: string; // Regex pattern (exclusive with value)
  value?: string; // Exact value (exclusive with regex)
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
}

/**
 * Compiled error pattern with regex object
 */
export interface CompiledPattern extends ErrorPattern {
  compiledRegex?: RegExp;
}

/**
 * Detected error with pattern match info
 */
export interface DetectedError {
  id: string; // Unique ID for this detection
  patternId: string;
  patternName: string;
  severity: string;
  timestamp: string; // ISO 8601
  application: string;
  environment: string;
  message: string;
  exception?: string;
  exceptionType?: string;
  logEntry: LogEntry; // Full log entry for context
  detectedAt: string; // When we detected it
}

/**
 * Duplicate cache entry
 */
export interface CacheEntry {
  hash: string;
  timestamp: number; // Unix timestamp (ms)
  pattern: string;
  application: string;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  evictions: number;
  oldestEntry: number; // Unix timestamp
  newestEntry: number; // Unix timestamp
}

/**
 * Detection cycle result
 */
export interface DetectionResult {
  cycleId: string;
  startTime: string;
  endTime: string;
  duration: number; // milliseconds
  logsProcessed: number;
  errorsDetected: number;
  duplicatesSkipped: number;
  issuesCreated: number;
  errors: DetectedError[];
}

/**
 * Scheduler status
 */
export interface SchedulerStatus {
  isRunning: boolean;
  intervalMs: number;
  lastRun: Date | null;
  nextRun: Date | null;
  cycleCount: number;
  errorCount: number;
}
```

### Configuration Types

```typescript
/**
 * Azure configuration
 */
export interface AzureConfig {
  workspaceId: string;
  tenantId: string;
  clientId: string;
  clientSecret: string;
  queryTable: string;
  queryInterval: number; // minutes
}

/**
 * GitHub configuration
 */
export interface GitHubConfig {
  owner: string;
  repo: string;
  token: string;
  defaultLabels: string[];
  assignees: string[];
}

/**
 * Detection configuration
 */
export interface DetectionConfig {
  patternsFile: string;
  duplicateWindowHours: number;
  maxCacheSize: number;
}

/**
 * Scheduler configuration
 */
export interface SchedulerConfig {
  intervalMinutes: number;
  enabled: boolean;
}

/**
 * Logging configuration
 */
export interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  format: 'json' | 'text';
}

/**
 * Complete application configuration
 */
export interface AppConfig {
  azure: AzureConfig;
  github: GitHubConfig;
  detection: DetectionConfig;
  scheduler: SchedulerConfig;
  logging: LoggingConfig;
  patterns: ErrorPattern[]; // Loaded from patternsFile
}
```

### Component Interfaces

```typescript
/**
 * Log fetcher interface
 */
export interface ILogFetcher {
  fetchLogs(since: string, until: string): Promise<LogEntry[]>;
  testConnection(): Promise<boolean>;
}

/**
 * Failure detector interface
 */
export interface IFailureDetector {
  detectFailure(logEntry: LogEntry): ErrorPattern | null;
  loadPatterns(patternsFile: string): Promise<void>;
  getPatterns(): CompiledPattern[];
}

/**
 * Duplicate checker interface
 */
export interface IDuplicateChecker {
  isDuplicate(error: DetectedError): boolean;
  markAsSeen(error: DetectedError): void;
  cleanup(): void;
  getStats(): CacheStats;
}

/**
 * GitHub issue creator interface
 */
export interface IGitHubIssueCreator {
  createIssue(error: DetectedError): Promise<string>;
  testConnection(): Promise<boolean>;
  formatIssueBody(error: DetectedError): string;
}

/**
 * Scheduler interface
 */
export interface IScheduler {
  start(): void;
  stop(): void;
  runOnce(): Promise<void>;
  getStatus(): SchedulerStatus;
}

/**
 * Detection cycle interface (orchestrator)
 */
export interface IDetectionCycle {
  run(): Promise<DetectionResult>;
}
```

### Utility Types

```typescript
/**
 * Result type for operations that can fail
 */
export type Result<T, E = Error> =
  | { success: true; value: T }
  | { success: false; error: E };

/**
 * Fatal error that should stop the application
 */
export class FatalError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'FatalError';
  }
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

/**
 * Time window for queries
 */
export interface TimeWindow {
  start: string; // ISO 8601
  end: string; // ISO 8601
}
```

---

## Dependency Analysis

### NPM Dependencies

#### Production Dependencies

```json
{
  "dependencies": {
    "@azure/identity": "^4.0.0",
    "@azure/monitor-query": "^1.2.0",
    "@octokit/rest": "^20.0.2",
    "winston": "^3.11.0"
  }
}
```

**Dependency Breakdown:**

1. **@azure/identity** (^4.0.0)
   - Purpose: Azure authentication (DefaultAzureCredential)
   - Size: ~500 KB
   - Transitive deps: @azure/core-auth, @azure/msal-node

2. **@azure/monitor-query** (^1.2.0)
   - Purpose: Query Azure Log Analytics
   - Size: ~200 KB
   - Transitive deps: @azure/core-client, @azure/core-rest-pipeline

3. **@octokit/rest** (^20.0.2)
   - Purpose: GitHub REST API client
   - Size: ~300 KB
   - Transitive deps: @octokit/core, @octokit/plugin-*

4. **winston** (^3.11.0)
   - Purpose: Structured logging
   - Size: ~150 KB
   - Transitive deps: logform, winston-transport

**Total Production Bundle:** ~1.5 MB (reasonable for container)

#### Development Dependencies

```json
{
  "devDependencies": {
    "@types/node": "^20.10.0",
    "typescript": "^5.3.3",
    "tsx": "^4.7.0",
    "vitest": "^1.0.4",
    "@vitest/coverage-v8": "^1.0.4",
    "eslint": "^8.56.0",
    "@typescript-eslint/eslint-plugin": "^6.15.0",
    "@typescript-eslint/parser": "^6.15.0"
  }
}
```

### System Dependencies

**Node.js:**
- Version: >= 18.0.0 (LTS)
- Reason: Native fetch, modern crypto APIs

**Container Base Image:**
- Recommendation: `node:18-alpine`
- Size: ~170 MB
- Security: Regular updates, minimal attack surface

### Azure Dependencies

**Required Azure Resources:**
1. **Log Analytics Workspace**
   - SKU: Per GB (pay-as-you-go)
   - Cost: ~$2.50/GB ingestion + $0.12/GB retention
   - Estimated: ~$5/month for low volume

2. **Service Principal**
   - Role: Log Analytics Reader
   - Scope: Workspace resource
   - Cost: Free

3. **Container Instance** (for deployment)
   - SKU: 1 vCPU, 1 GB memory
   - Cost: ~$0.013/hour = ~$10/month
   - Region: Same as workspace (minimize latency)

**Total Estimated Azure Cost:** ~$15/month

### GitHub Dependencies

**Required:**
- GitHub repository (free for public, included in paid plans)
- Personal Access Token with `repo` or `public_repo` scope
- No API costs (within free tier limits)

---

## Security & Authentication

### Azure Authentication

**Method:** Service Principal with Client Secret

**Setup Steps:**
```bash
# 1. Create Service Principal
az ad sp create-for-rbac --name "error-detection-agent" \
  --role "Log Analytics Reader" \
  --scopes /subscriptions/{subscription-id}/resourceGroups/{rg}/providers/Microsoft.OperationalInsights/workspaces/{workspace}

# Output:
{
  "appId": "CLIENT_ID",
  "password": "CLIENT_SECRET",
  "tenant": "TENANT_ID"
}

# 2. Store credentials as environment variables
export AZURE_CLIENT_ID="{appId}"
export AZURE_CLIENT_SECRET="{password}"
export AZURE_TENANT_ID="{tenant}"
```

**Authentication Code:**
```typescript
import { DefaultAzureCredential } from '@azure/identity';

// DefaultAzureCredential tries multiple methods in order:
// 1. Environment variables (AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID)
// 2. Managed Identity (in Azure Container Instance)
// 3. Azure CLI (for local development)

const credential = new DefaultAzureCredential();
const client = new LogsQueryClient(credential);
```

**Security Best Practices:**
- Never commit credentials to git
- Use environment variables or Azure Key Vault
- Rotate secrets every 90 days
- Use Managed Identity in production (when available)
- Minimum required permissions (Log Analytics Reader only)

---

### GitHub Authentication

**Method:** Personal Access Token (PAT)

**Required Scopes:**
- `repo` (for private repositories)
- OR `public_repo` (for public repositories only)

**Token Generation:**
```
GitHub → Settings → Developer settings → Personal access tokens →
Generate new token (classic)
→ Select 'repo' scope
→ Set expiration (recommend 90 days)
→ Generate and copy token
```

**Storage:**
```bash
export GITHUB_TOKEN="ghp_xxxxxxxxxxxxxxxxxxxx"
```

**Authentication Code:**
```typescript
import { Octokit } from '@octokit/rest';

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
  userAgent: 'error-detection-agent/1.0.0'
});

// Verify token on startup
const { data: user } = await octokit.rest.users.getAuthenticated();
logger.info('Authenticated to GitHub', { user: user.login });
```

**Security Best Practices:**
- Never commit tokens to git
- Use environment variables
- Set token expiration
- Use fine-grained tokens (when available for repos)
- Rotate tokens regularly
- Minimum required permissions

---

### Secrets Management

**Development:**
```bash
# .env file (git-ignored)
AZURE_CLIENT_ID=xxx
AZURE_CLIENT_SECRET=xxx
AZURE_TENANT_ID=xxx
GITHUB_TOKEN=ghp_xxx
```

**Production (Azure Container Instance):**
```bash
# Pass as environment variables
az container create \
  --resource-group myRG \
  --name error-detection-agent \
  --image myregistry.azurecr.io/error-detection-agent:latest \
  --environment-variables \
    AZURE_CLIENT_ID=$AZURE_CLIENT_ID \
    AZURE_TENANT_ID=$AZURE_TENANT_ID \
    GITHUB_TOKEN=$GITHUB_TOKEN \
  --secure-environment-variables \
    AZURE_CLIENT_SECRET=$AZURE_CLIENT_SECRET
```

**Alternative: Azure Key Vault (Nice-to-Have)**
```typescript
import { SecretClient } from '@azure/keyvault-secrets';
import { DefaultAzureCredential } from '@azure/identity';

const vaultUrl = 'https://my-vault.vault.azure.net';
const credential = new DefaultAzureCredential();
const secretClient = new SecretClient(vaultUrl, credential);

const githubToken = await secretClient.getSecret('github-token');
```

---

## Data Flow Analysis

### Complete Detection Cycle Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                          SCHEDULER                               │
│                    (Every 5 minutes)                             │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             v
┌─────────────────────────────────────────────────────────────────┐
│                    DETECTION CYCLE START                         │
│  1. Calculate time window: [lastRun, now]                        │
│  2. Generate cycle ID                                            │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             v
┌─────────────────────────────────────────────────────────────────┐
│                        LOG FETCHER                               │
│  1. Construct KQL query with time window                         │
│  2. Execute query against Azure Log Analytics                    │
│  3. Parse response into LogEntry[]                               │
│  4. Return 0-100 log entries                                     │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             v
┌─────────────────────────────────────────────────────────────────┐
│                    FAILURE DETECTOR                              │
│  For each LogEntry:                                              │
│    1. Try each error pattern                                     │
│    2. Extract target field                                       │
│    3. Test regex or exact match                                  │
│    4. If match: create DetectedError                             │
│    5. If no match: skip                                          │
│  Return DetectedError[]                                          │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             v
┌─────────────────────────────────────────────────────────────────┐
│                    DUPLICATE CHECKER                             │
│  For each DetectedError:                                         │
│    1. Normalize error message                                    │
│    2. Compute SHA256 hash                                        │
│    3. Check if hash exists in cache                              │
│    4. If exists AND not expired: mark as duplicate               │
│    5. If new: mark as seen, add to cache                         │
│  Return new DetectedError[]                                      │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             v
┌─────────────────────────────────────────────────────────────────┐
│                  GITHUB ISSUE CREATOR                            │
│  For each new DetectedError:                                     │
│    1. Format issue title                                         │
│    2. Format issue body (markdown)                               │
│    3. Prepare labels                                             │
│    4. Call GitHub API to create issue                            │
│    5. Log issue URL                                              │
│  Return created issue URLs                                       │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             v
┌─────────────────────────────────────────────────────────────────┐
│                   DETECTION CYCLE END                            │
│  1. Calculate cycle duration                                     │
│  2. Log cycle statistics                                         │
│  3. Update last run timestamp                                    │
│  4. Return DetectionResult                                       │
└─────────────────────────────────────────────────────────────────┘
```

### Data Transformations

**Step 1: Azure Query Response → LogEntry[]**
```typescript
// Azure response
{
  tables: [{
    name: "PrimaryResult",
    columns: [
      { name: "TimeGenerated", type: "datetime" },
      { name: "Level", type: "string" },
      { name: "Message", type: "string" },
      // ...
    ],
    rows: [
      ["2025-12-12T10:15:23Z", "Error", "SQL timeout", ...],
      // ...
    ]
  }]
}

// Transform to LogEntry
const logEntries: LogEntry[] = result.tables[0].rows.map(row => ({
  TimeGenerated: row[0],
  Level: row[1],
  Message: row[2],
  Exception: row[3],
  ExceptionType: row[4],
  Application: row[5],
  Environment: row[6],
  Properties: row[7]
}));
```

**Step 2: LogEntry + ErrorPattern → DetectedError**
```typescript
// Input
const logEntry: LogEntry = {
  TimeGenerated: "2025-12-12T10:15:23Z",
  Level: "Error",
  Message: "SQL query timeout after 30 seconds",
  Application: "OrderService",
  Environment: "Production"
};

const pattern: ErrorPattern = {
  id: "sql-timeout",
  name: "SQL Query Timeout",
  field: "message",
  regex: "(?i)sql.*timeout",
  severity: "high"
};

// Transform to DetectedError
const detected: DetectedError = {
  id: crypto.randomUUID(),
  patternId: pattern.id,
  patternName: pattern.name,
  severity: pattern.severity,
  timestamp: logEntry.TimeGenerated,
  application: logEntry.Application,
  environment: logEntry.Environment,
  message: logEntry.Message,
  logEntry: logEntry,
  detectedAt: new Date().toISOString()
};
```

**Step 3: DetectedError → Normalized Hash**
```typescript
// Input
const error: DetectedError = {
  message: "SQL query timeout after 30 seconds at 2025-12-12T10:15:23Z",
  patternId: "sql-timeout",
  application: "OrderService"
};

// Normalize
const normalized = "sql query timeout after NUM seconds at TIMESTAMP";

// Hash
const hashInput = "sql-timeout:sql query timeout after num seconds at timestamp:orderservice";
const hash = "a3f5d8c2e1b4..."; // SHA256
```

**Step 4: DetectedError → GitHub Issue**
```typescript
// Input
const error: DetectedError = { /* ... */ };

// Transform to GitHub issue
const issue = {
  title: "[AUTO] SQL Query Timeout: SQL query timeout after 30 seconds",
  body: `
## Error Details

**Timestamp:** 2025-12-12T10:15:23Z
**Application:** OrderService
**Environment:** Production
**Severity:** high

## Error Message
\`\`\`
SQL query timeout after 30 seconds
\`\`\`

## Log Context
\`\`\`json
${JSON.stringify(error.logEntry, null, 2)}
\`\`\`

## Detection Info
- **Pattern Matched:** SQL Query Timeout
- **Detection Time:** 2025-12-12T10:20:15Z
- **Log Source:** Azure Log Analytics

---
*This issue was automatically created by error-detection-agent*
  `,
  labels: ["automated", "error", "high", "app:OrderService"],
  assignees: []
};
```

---

## Success Criteria Breakdown

### 1. Detect 1 error within 5 minutes

**Measurement:**
- Time from log entry creation to error detection
- Target: < 5 minutes (preferably < 6 minutes including one polling cycle)

**Testing Approach:**
```typescript
test('detects error within 5 minutes', async () => {
  // 1. Insert error into Azure Log Analytics
  const errorTime = new Date();
  await insertTestLog({
    level: 'Error',
    message: 'SQL timeout',
    timestamp: errorTime
  });

  // 2. Wait for next polling cycle (max 5 minutes)
  await waitForNextCycle();

  // 3. Check if issue was created
  const issues = await github.getIssues();
  const detectedIssue = issues.find(i =>
    i.title.includes('SQL timeout') &&
    new Date(i.created_at) > errorTime
  );

  // 4. Verify detection time
  expect(detectedIssue).toBeDefined();
  const detectionDelay =
    new Date(detectedIssue.created_at).getTime() - errorTime.getTime();
  expect(detectionDelay).toBeLessThan(6 * 60 * 1000); // 6 minutes
});
```

**Success Indicators:**
- ✅ Error logged at 10:00:00
- ✅ Polling cycle runs at 10:05:00
- ✅ Error detected and issue created by 10:05:30
- ✅ Total delay: 5 minutes 30 seconds

---

### 2. Create GitHub issue with correct error details

**Measurement:**
- Issue contains all required fields
- Formatting is correct
- Data is accurate

**Required Fields:**
- Title with error type and message
- Timestamp (UTC)
- Application name
- Environment
- Severity
- Full error message
- Stack trace (if available)
- Full log entry (JSON)
- Pattern matched
- Detection timestamp

**Testing Approach:**
```typescript
test('creates issue with correct details', async () => {
  const testError: DetectedError = {
    id: '123',
    patternId: 'sql-timeout',
    patternName: 'SQL Query Timeout',
    severity: 'high',
    timestamp: '2025-12-12T10:15:23Z',
    application: 'OrderService',
    environment: 'Production',
    message: 'SQL query timeout after 30 seconds',
    logEntry: { /* full log */ },
    detectedAt: '2025-12-12T10:20:15Z'
  };

  const issueUrl = await issueCreator.createIssue(testError);
  const issue = await github.getIssue(issueUrl);

  // Verify title
  expect(issue.title).toContain('[AUTO]');
  expect(issue.title).toContain('SQL Query Timeout');

  // Verify body contains all required fields
  expect(issue.body).toContain('2025-12-12T10:15:23Z');
  expect(issue.body).toContain('OrderService');
  expect(issue.body).toContain('Production');
  expect(issue.body).toContain('high');
  expect(issue.body).toContain('SQL query timeout');

  // Verify labels
  expect(issue.labels).toContain('automated');
  expect(issue.labels).toContain('error');
  expect(issue.labels).toContain('high');
});
```

**Success Indicators:**
- ✅ Title follows format: `[AUTO] {PatternName}: {ShortMessage}`
- ✅ Body includes all error details
- ✅ Markdown formatting is correct
- ✅ Labels are applied correctly
- ✅ Timestamps are in UTC
- ✅ Full log context is included

---

### 3. Prevent duplicate issues

**Measurement:**
- Same error occurring multiple times creates only one issue
- Different errors create separate issues

**Testing Approach:**
```typescript
test('prevents duplicate issues', async () => {
  const error1: DetectedError = {
    message: 'SQL query timeout after 30 seconds',
    patternId: 'sql-timeout',
    application: 'OrderService',
    // ... other fields
  };

  const error2: DetectedError = {
    message: 'SQL query timeout after 45 seconds', // Different duration
    patternId: 'sql-timeout',
    application: 'OrderService',
    // ... other fields
  };

  // Create first issue
  const url1 = await issueCreator.createIssue(error1);
  expect(url1).toBeDefined();

  // Try to create duplicate (should be prevented)
  const isDuplicate = duplicateChecker.isDuplicate(error1);
  expect(isDuplicate).toBe(true);

  // Create second issue (different error, should succeed)
  const url2 = await issueCreator.createIssue(error2);
  expect(url2).toBeDefined();
  expect(url2).not.toBe(url1);

  // Verify only 2 issues created (not 3)
  const issues = await github.getIssues();
  expect(issues.length).toBe(2);
});
```

**Success Indicators:**
- ✅ Same error within 24 hours: 1 issue created
- ✅ Different errors: separate issues created
- ✅ Same error after 24 hours: new issue created
- ✅ Duplicate detection rate: > 99%

---

### 4. All automated tests pass

**Test Coverage Requirements:**
- Unit tests: > 80% code coverage
- Integration tests: All components tested
- End-to-end test: Full detection cycle

**Test Categories:**

**Unit Tests:**
```typescript
// Log Fetcher
- test('fetches logs for time window')
- test('handles empty results')
- test('retries on network error')
- test('throws on auth failure')

// Failure Detector
- test('matches regex pattern')
- test('matches exact value')
- test('returns null for non-match')
- test('loads patterns from file')

// Duplicate Checker
- test('detects duplicate by hash')
- test('allows new error')
- test('expires old entries')
- test('normalizes messages correctly')

// GitHub Issue Creator
- test('creates issue with correct format')
- test('includes all required fields')
- test('handles rate limiting')
- test('retries on network error')

// Scheduler
- test('runs cycle on interval')
- test('handles cycle errors gracefully')
- test('stops cleanly')
```

**Integration Tests:**
```typescript
- test('full detection cycle with mock APIs')
- test('configuration loading and validation')
- test('error handling and retries')
```

**End-to-End Test:**
```typescript
- test('detects error and creates issue in real environment')
```

**Success Indicators:**
- ✅ All unit tests pass
- ✅ All integration tests pass
- ✅ E2E test passes
- ✅ Code coverage > 80%
- ✅ No flaky tests

---

### 5. Development time < 3 days

**Time Budget:**
- Day 1: Core components (6-8 hours)
  - Configuration loading
  - Log fetcher
  - Failure detector
  - Duplicate checker
- Day 2: Integration (6-8 hours)
  - GitHub issue creator
  - Detection cycle orchestrator
  - Scheduler
  - Error handling
- Day 3: Testing & deployment (4-6 hours)
  - Unit tests
  - Integration tests
  - Deployment configuration
  - Documentation

**Success Indicators:**
- ✅ MVP completed within 3 calendar days
- ✅ All features implemented
- ✅ Tests passing
- ✅ Ready for deployment

---

### 6. Code size < 500 lines

**Line Count Budget:**

```typescript
// Core components (~300 lines)
config-loader.ts         // ~40 lines
log-fetcher.ts          // ~60 lines
failure-detector.ts     // ~50 lines
duplicate-checker.ts    // ~70 lines
github-issue-creator.ts // ~80 lines

// Orchestration (~100 lines)
detection-cycle.ts      // ~60 lines
scheduler.ts            // ~40 lines

// Entry point (~30 lines)
index.ts               // ~30 lines

// Types (~70 lines)
types.ts               // ~70 lines

// Total: ~430 lines (70 line buffer)
```

**Success Indicators:**
- ✅ Total application code < 500 lines
- ✅ Each file focused and single-purpose
- ✅ No bloated components
- ✅ Clean, readable code

---

## Implementation Recommendations

### Project Structure

```
error-detection-agent/
├── src/
│   ├── index.ts                 # Entry point
│   ├── types.ts                 # TypeScript types
│   ├── config/
│   │   └── config-loader.ts     # Configuration loading
│   ├── components/
│   │   ├── log-fetcher.ts       # Azure log fetcher
│   │   ├── failure-detector.ts  # Pattern matcher
│   │   ├── duplicate-checker.ts # Hash-based dedup
│   │   └── github-creator.ts    # Issue creator
│   └── orchestration/
│       ├── detection-cycle.ts   # Main orchestrator
│       └── scheduler.ts         # Polling scheduler
├── tests/
│   ├── unit/
│   │   ├── log-fetcher.test.ts
│   │   ├── failure-detector.test.ts
│   │   ├── duplicate-checker.test.ts
│   │   └── github-creator.test.ts
│   ├── integration/
│   │   └── detection-cycle.test.ts
│   └── e2e/
│       └── full-flow.test.ts
├── config/
│   ├── config.json              # Main configuration
│   └── patterns.json            # Error patterns
├── Dockerfile
├── package.json
├── tsconfig.json
└── README.md
```

### Development Workflow

**Phase 1: Setup (30 minutes)**
1. Initialize Node.js project
2. Install dependencies
3. Configure TypeScript
4. Set up test framework

**Phase 2: Core Components (Day 1)**
1. Implement types.ts
2. Implement config-loader.ts
3. Implement log-fetcher.ts
4. Implement failure-detector.ts
5. Implement duplicate-checker.ts
6. Write unit tests for each

**Phase 3: Integration (Day 2)**
1. Implement github-creator.ts
2. Implement detection-cycle.ts
3. Implement scheduler.ts
4. Implement index.ts
5. Write integration tests

**Phase 4: Testing & Deployment (Day 3)**
1. E2E testing with real Azure/GitHub
2. Fix bugs
3. Create Dockerfile
4. Deploy to Azure Container Instance
5. Verify in production

### Best Practices

**Code Quality:**
- Use TypeScript strict mode
- Prefer immutability
- Handle all errors explicitly
- Log at appropriate levels
- Use meaningful variable names

**Testing:**
- Test happy path and error paths
- Use mocks for external APIs
- Test edge cases (empty results, rate limits, etc.)
- Maintain high code coverage

**Security:**
- Never log secrets
- Use environment variables for credentials
- Validate all inputs
- Use least privilege for service accounts

**Performance:**
- Minimize API calls
- Cache compiled regexes
- Use efficient data structures
- Profile if needed (shouldn't be at low volume)

### Deployment Checklist

**Pre-deployment:**
- [ ] All tests passing
- [ ] Configuration validated
- [ ] Secrets configured in Azure
- [ ] Service Principal created and tested
- [ ] GitHub token created and tested
- [ ] Repository access verified

**Deployment:**
- [ ] Build Docker image
- [ ] Push to Azure Container Registry
- [ ] Create Container Instance
- [ ] Configure environment variables
- [ ] Verify logs appear
- [ ] Test error detection

**Post-deployment:**
- [ ] Monitor for first successful detection
- [ ] Verify issue creation
- [ ] Check duplicate prevention
- [ ] Monitor performance metrics
- [ ] Set up alerts for failures

---

## Appendix: Sample Files

### Sample config.json

```json
{
  "azure": {
    "workspaceId": "12345678-1234-1234-1234-123456789012",
    "tenantId": "${AZURE_TENANT_ID}",
    "clientId": "${AZURE_CLIENT_ID}",
    "clientSecret": "${AZURE_CLIENT_SECRET}",
    "queryTable": "AppTraces",
    "queryInterval": 5
  },
  "github": {
    "owner": "myorg",
    "repo": "errors",
    "token": "${GITHUB_TOKEN}",
    "defaultLabels": ["automated", "error"],
    "assignees": []
  },
  "detection": {
    "patternsFile": "./config/patterns.json",
    "duplicateWindowHours": 24,
    "maxCacheSize": 10000
  },
  "scheduler": {
    "intervalMinutes": 5,
    "enabled": true
  },
  "logging": {
    "level": "info",
    "format": "json"
  }
}
```

### Sample patterns.json

```json
{
  "patterns": [
    {
      "id": "sql-timeout",
      "name": "SQL Query Timeout",
      "description": "Detects SQL query timeout errors",
      "field": "message",
      "regex": "(?i)sql.*(timeout|timed out)|query.*timeout",
      "severity": "high",
      "enabled": true
    },
    {
      "id": "null-reference",
      "name": "Null Reference Exception",
      "description": "Detects null reference errors in .NET applications",
      "field": "exceptionType",
      "value": "NullReferenceException",
      "severity": "medium",
      "enabled": true
    },
    {
      "id": "out-of-memory",
      "name": "Out of Memory Error",
      "description": "Detects OOM errors",
      "field": "message",
      "regex": "(?i)out of memory|oom|memory.*exhausted|cannot allocate memory",
      "severity": "critical",
      "enabled": true
    },
    {
      "id": "connection-refused",
      "name": "Connection Refused",
      "description": "Detects connection refused errors",
      "field": "message",
      "regex": "(?i)connection refused|econnrefused|could not connect",
      "severity": "high",
      "enabled": true
    },
    {
      "id": "http-500",
      "name": "HTTP 500 Internal Server Error",
      "description": "Detects HTTP 500 errors",
      "field": "message",
      "regex": "(?i)http.*500|internal server error|status.*500",
      "severity": "high",
      "enabled": true
    }
  ]
}
```

### Sample Dockerfile

```dockerfile
FROM node:18-alpine

# Install dependencies for @azure packages
RUN apk add --no-cache \
    ca-certificates \
    && update-ca-certificates

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy built JavaScript files
COPY dist/ ./dist/
COPY config/ ./config/

# Set environment
ENV NODE_ENV=production

# Run as non-root user
USER node

# Start application
CMD ["node", "dist/index.js"]
```

### Sample package.json

```json
{
  "name": "error-detection-agent",
  "version": "1.0.0",
  "description": "Automatically detect failures in Azure logs and create GitHub issues",
  "main": "dist/index.js",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint src/**/*.ts",
    "typecheck": "tsc --noEmit"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "dependencies": {
    "@azure/identity": "^4.0.0",
    "@azure/monitor-query": "^1.2.0",
    "@octokit/rest": "^20.0.2",
    "winston": "^3.11.0"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "@typescript-eslint/eslint-plugin": "^6.15.0",
    "@typescript-eslint/parser": "^6.15.0",
    "@vitest/coverage-v8": "^1.0.4",
    "eslint": "^8.56.0",
    "tsx": "^4.7.0",
    "typescript": "^5.3.3",
    "vitest": "^1.0.4"
  }
}
```

---

## Summary

This comprehensive analysis provides:

1. **Detailed component specifications** for each architecture component
2. **Complete configuration schemas** with validation rules
3. **API integration specifications** for Azure and GitHub
4. **Full TypeScript type system** covering all domain models
5. **Dependency analysis** with cost estimates
6. **Security and authentication** guidelines
7. **Data flow analysis** with transformation examples
8. **Success criteria breakdown** with testing approaches
9. **Implementation recommendations** with project structure
10. **Sample files** for immediate use

**Next Steps:**
1. Review this analysis for completeness
2. Create OpenSpec change proposal based on this analysis
3. Implement MVP following the specifications
4. Test against success criteria
5. Deploy to Azure Container Instance

**Estimated Effort:** 2-3 days for a single developer following this specification.
