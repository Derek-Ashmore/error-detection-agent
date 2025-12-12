# Minimum Viable Product Implementation Notes
## Error Detection Agent - OpenSpec Proposal Analysis

**Document Purpose**: This document captures the step-by-step analytical thinking process behind creating the OpenSpec change proposal for the error-detection-agent MVP.

**Date**: December 12, 2025
**Project**: error-detection-agent
**Objective**: Create OpenSpec proposal based on MVP design from error-detection-planning repository

---

## 1. ANALYSIS PHASE

### 1.1 Information Gathering from MVP Design Document

**Source Document**: https://github.com/Derek-Ashmore/error-detection-planning/blob/main/plans/minimum-viable-product-design.md

#### Core Requirements Extracted:

1. **Primary Goal**:
   - Automatically detect failures in Azure logs and create GitHub issues
   - Minimize development effort while proving core value proposition
   - Estimated 3-day development timeline

2. **Functional Scope**:
   - **IN SCOPE**:
     - Single Azure Log Analytics workspace as data source
     - Simple failure detection using pattern matching (regex/string matching)
     - Basic GitHub issue creation with labels
     - Hash-based duplicate detection (SHA256)
     - Manual JSON configuration
     - Single GitHub repository target
     - Low volume: 1-2 applications, <100 log entries/hour

   - **OUT OF SCOPE**:
     - Multiple cloud providers (AWS, GCP)
     - Complex failure evaluation (ML/AI)
     - AI-powered duplicate detection
     - Multi-repository routing
     - Admin dashboard/UI
     - High-volume processing (>1000 entries/hour)
     - Real-time streaming

3. **Non-Functional Requirements**:
   - Low complexity for rapid development
   - Cost-effective: ~$10/month
   - Scheduled execution (5-minute intervals)
   - Service Principal authentication for Azure
   - Docker containerization for Azure Container Instances

### 1.2 Key Requirements Identified

#### Component Architecture:

1. **Log Fetcher Component**
   - Technology: Node.js with @azure/monitor-query SDK
   - Responsibility: Query Azure Log Analytics workspace
   - Behavior: Fetch single table, 5-minute time window
   - Authentication: Service Principal credentials

2. **Failure Detector Component**
   - Technology: Regex pattern matching
   - Responsibility: Identify error patterns in log entries
   - Extraction: Timestamp, error message, stack trace
   - Patterns: Configurable error indicators

3. **Duplicate Checker Component**
   - Technology: In-memory cache
   - Responsibility: Prevent duplicate GitHub issue creation
   - Method: SHA256 hash of (error message + stack trace)
   - Storage: Simple key-value store

4. **GitHub Issue Creator Component**
   - Technology: Octokit REST API (@octokit/rest)
   - Responsibility: Create issues in target repository
   - Template: Standardized issue format with labels
   - Target: Single repository (configurable)

5. **Scheduler Component**
   - Technology: Simple interval timer or cron
   - Responsibility: Coordinate periodic execution
   - Frequency: Every 5 minutes
   - Processing: Sequential (non-parallel)

#### Configuration Requirements:

1. **Azure Configuration**:
   - Log Analytics workspace ID
   - Table name to query
   - Service Principal credentials (tenant ID, client ID, client secret)
   - Query time window (default: 5 minutes)

2. **GitHub Configuration**:
   - Repository owner and name
   - Personal Access Token (PAT) or GitHub App credentials
   - Issue labels to apply
   - Issue template/format

3. **Detection Configuration**:
   - Error patterns (regex or string matches)
   - Fields to extract from log entries
   - Severity mapping

### 1.3 Constraints and Limitations

#### Technical Constraints:

1. **Volume Limitations**:
   - Design assumes <100 log entries/hour
   - In-memory duplicate detection sufficient
   - No database required for MVP
   - Sequential processing acceptable

2. **Single Source/Target**:
   - One Azure workspace only
   - One GitHub repository only
   - No routing logic needed
   - Simplified configuration

3. **Detection Simplicity**:
   - Pattern matching only (no ML/AI)
   - No context analysis
   - No log correlation
   - Basic deduplication

#### Development Constraints:

1. **Rapid Development**:
   - 3-day timeline target
   - Minimal dependencies
   - Standard Node.js libraries
   - No custom frameworks

2. **Deployment Constraints**:
   - Azure Container Instances only
   - Single container deployment
   - File-based configuration
   - No orchestration needed

#### Cost Constraints:

1. **Budget Target**: ~$10/month
   - Azure Container Instances pricing
   - Log Analytics query costs
   - GitHub API (free tier)

### 1.4 Success Criteria Interpretation

#### MVP Success Indicators:

1. **Functional Success**:
   - Detects errors in Azure logs within 5 minutes
   - Creates GitHub issues for new errors
   - Prevents duplicate issues for same error
   - Runs continuously without manual intervention

2. **Operational Success**:
   - Deployable to Azure Container Instances
   - Configurable without code changes
   - Logs execution status and errors
   - Costs <$15/month in practice

3. **Development Success**:
   - Implementable in 3 days
   - Understandable by junior developers
   - Minimal external dependencies
   - Easy to test locally

---

## 2. DESIGN DECISIONS

### 2.1 Why Specific Components Were Chosen

#### Decision: Node.js + TypeScript

**Rationale**:
- **Rapid Development**: Rich ecosystem, excellent Azure SDK support
- **Type Safety**: TypeScript provides compile-time checks without runtime overhead
- **Developer Familiarity**: Common language for cloud integrations
- **Azure SDK Quality**: @azure/monitor-query is well-maintained, documented
- **GitHub Integration**: Octokit is the standard, officially supported library
- **Async Support**: Native async/await for I/O-bound operations
- **Small Footprint**: Can run in minimal container (Alpine Linux)

**Alternatives Considered**:
- Python: Good Azure SDK, but slower cold starts in containers
- Go: Fast but longer development time, less library maturity for Azure
- C#: Natural Azure fit but heavier runtime, longer compilation

#### Decision: In-Memory Duplicate Cache

**Rationale**:
- **Simplicity**: No database infrastructure needed
- **Sufficient for MVP**: <100 entries/hour means <1000 cache entries/day
- **Fast Lookups**: O(1) hash lookup performance
- **Stateless Option**: Can persist to file for container restarts
- **Cost**: Zero additional infrastructure cost

**Alternatives Considered**:
- Redis: Overkill for MVP, adds $20+/month cost
- SQLite: Unnecessary complexity, file I/O overhead
- Azure Table Storage: Network latency, costs, complexity

#### Decision: SHA256 Hash for Deduplication

**Rationale**:
- **Collision Resistance**: Virtually zero chance of false duplicates
- **Deterministic**: Same error always produces same hash
- **Fast**: Millisecond computation time
- **Standard**: Built into Node.js crypto library
- **Compact**: 64-character string for storage

**Alternatives Considered**:
- Simple string comparison: Memory intensive for full message storage
- MD5: Deprecated, potential collision issues
- Content-based fingerprinting: Over-engineered for MVP

#### Decision: 5-Minute Polling Interval

**Rationale**:
- **Balance**: Fast enough for actionable alerts, slow enough to avoid API limits
- **Azure Log Analytics**: Logs typically available within 2-3 minutes
- **Cost**: 288 queries/day stays within free tier limits
- **Simplicity**: Easier than event-driven architecture
- **Resource**: Minimal compute usage between polls

**Alternatives Considered**:
- Real-time streaming: Complex, requires Event Hubs ($)
- 1-minute polling: Unnecessary speed, higher costs
- 15-minute polling: Too slow for production errors

### 2.2 How Components Interact

#### Execution Flow:

```
┌─────────────────────────────────────────────────────────────┐
│                         Scheduler                            │
│                    (Every 5 minutes)                         │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                      Log Fetcher                             │
│  - Query Azure Log Analytics (last 5 minutes)               │
│  - Return array of log entries                              │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    Failure Detector                          │
│  - Filter logs matching error patterns                       │
│  - Extract: timestamp, message, stack trace                  │
│  - Return array of detected failures                         │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
                    For each failure:
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   Duplicate Checker                          │
│  - Compute SHA256(message + stack)                          │
│  - Check if hash exists in cache                            │
│  - If new: add to cache, continue                           │
│  - If duplicate: skip                                        │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼ (if not duplicate)
┌─────────────────────────────────────────────────────────────┐
│                 GitHub Issue Creator                         │
│  - Format issue title and body                              │
│  - Add labels (error, automated)                            │
│  - Create issue via Octokit                                 │
│  - Log result                                                │
└─────────────────────────────────────────────────────────────┘
```

#### Component Interfaces:

1. **Log Fetcher → Failure Detector**:
   - Input: Time range (start, end)
   - Output: Array of raw log entries
   - Error handling: Retry on transient failures, log and skip on errors

2. **Failure Detector → Duplicate Checker**:
   - Input: Raw log entry
   - Output: Structured failure object {timestamp, message, stack, severity}
   - Error handling: Log parse errors, skip malformed entries

3. **Duplicate Checker → GitHub Issue Creator**:
   - Input: Failure object
   - Output: Boolean (is_new)
   - Error handling: Assume new on check failure (fail open)

4. **GitHub Issue Creator → Logging**:
   - Input: Failure object
   - Output: Created issue URL
   - Error handling: Retry with exponential backoff, alert on failure

### 2.3 Configuration Approach Reasoning

#### Decision: JSON Configuration File

**Structure**:
```json
{
  "azure": {
    "workspaceId": "...",
    "tableName": "...",
    "tenantId": "...",
    "clientId": "...",
    "clientSecret": "...",
    "queryWindowMinutes": 5
  },
  "github": {
    "owner": "...",
    "repo": "...",
    "token": "...",
    "labels": ["error", "automated"]
  },
  "detection": {
    "patterns": [
      "ERROR",
      "FATAL",
      "Exception",
      "failed"
    ],
    "severityKeywords": {
      "critical": ["FATAL", "CRITICAL"],
      "high": ["ERROR", "Exception"],
      "medium": ["WARNING", "WARN"]
    }
  },
  "scheduler": {
    "intervalMinutes": 5
  }
}
```

**Rationale**:
- **Simplicity**: JSON is universally understood, no custom parsers needed
- **Validation**: JSON Schema can validate structure
- **Version Control**: Can be tracked in git (minus secrets)
- **Environment Separation**: Different files for dev/staging/prod
- **No Compilation**: Changes don't require rebuild
- **Docker Mount**: Easy to mount as volume in container

**Security Considerations**:
- Secrets should be in environment variables or Azure Key Vault
- Config file should reference env vars: `"clientSecret": "${AZURE_CLIENT_SECRET}"`
- Never commit secrets to git

**Alternatives Considered**:
- Environment variables only: Hard to manage complex nested config
- YAML: More readable but requires parser library
- Database: Massive overkill for MVP

### 2.4 Technology Stack Justification

#### Core Stack:

1. **Runtime: Node.js 20 LTS**
   - Long-term support through 2026
   - Native ESM support
   - Performance improvements
   - Security updates

2. **Language: TypeScript 5.x**
   - Type safety for Azure/GitHub API responses
   - Better IDE support (autocomplete, refactoring)
   - Catches errors at compile time
   - Minimal runtime overhead (compiles to JS)

3. **Azure SDK: @azure/monitor-query**
   - Official Microsoft SDK
   - Azure Identity integration for auth
   - Async/await API
   - Well-documented
   - Type definitions included

4. **GitHub SDK: @octokit/rest**
   - Official GitHub library
   - Comprehensive API coverage
   - Type definitions included
   - Automatic rate limit handling
   - Retry logic built-in

5. **Deployment: Docker + Azure Container Instances**
   - Consistent environment (dev = prod)
   - Easy local testing
   - Azure Container Instances is serverless-like
   - Low cost (~$10/month for always-on)
   - Auto-restart on failure

#### Development Dependencies:

1. **Testing: Jest**
   - Standard Node.js test framework
   - Built-in TypeScript support
   - Mock capabilities for Azure/GitHub APIs
   - Coverage reporting

2. **Linting: ESLint + Prettier**
   - Code quality enforcement
   - Consistent formatting
   - TypeScript-aware rules

3. **Build: tsc (TypeScript Compiler)**
   - No bundler needed for Node.js
   - Simple compilation
   - Source maps for debugging

---

## 3. OPENSPEC STRUCTURE

### 3.1 How the Proposal is Organized

#### Directory Structure Rationale:

```
error-detection-agent/
├── src/
│   ├── core/                    # Core business logic
│   │   ├── log-fetcher.ts       # Azure Log Analytics integration
│   │   ├── failure-detector.ts  # Pattern matching logic
│   │   ├── duplicate-checker.ts # Hash-based deduplication
│   │   └── github-creator.ts    # GitHub issue creation
│   ├── scheduler/               # Execution coordination
│   │   └── scheduler.ts         # Polling loop implementation
│   ├── config/                  # Configuration management
│   │   ├── config.ts            # Config loader and validator
│   │   └── config.schema.json   # JSON Schema for validation
│   ├── types/                   # TypeScript type definitions
│   │   ├── azure.types.ts       # Azure API response types
│   │   ├── github.types.ts      # GitHub API types
│   │   └── failure.types.ts     # Domain types
│   └── index.ts                 # Application entry point
├── tests/
│   ├── unit/                    # Unit tests for each component
│   ├── integration/             # Integration tests
│   └── fixtures/                # Test data
├── config/
│   ├── config.example.json      # Example configuration
│   └── config.schema.json       # JSON Schema (symlink)
├── Dockerfile                    # Container definition
├── .dockerignore                 # Docker build exclusions
├── package.json                  # Dependencies and scripts
├── tsconfig.json                 # TypeScript configuration
└── README.md                     # Project documentation
```

**Organization Principles**:

1. **Separation of Concerns**: Each directory has single responsibility
2. **Discoverability**: Logical grouping makes code easy to find
3. **Testability**: Clear separation enables isolated unit testing
4. **Scalability**: Structure supports future growth (e.g., multiple detectors)

### 3.2 What Files/Directories are Defined

#### Core Implementation Files:

1. **src/core/log-fetcher.ts**
   - Purpose: Encapsulate Azure Log Analytics queries
   - Exports: `LogFetcher` class
   - Dependencies: @azure/monitor-query, @azure/identity
   - Key Methods:
     - `fetchLogs(startTime, endTime)`: Query logs for time window
     - `authenticate()`: Setup Service Principal auth
   - Error Handling: Retry transient errors, throw on auth failures

2. **src/core/failure-detector.ts**
   - Purpose: Identify errors in log entries
   - Exports: `FailureDetector` class
   - Dependencies: Config patterns
   - Key Methods:
     - `detectFailures(logEntries)`: Filter and parse error logs
     - `extractErrorDetails(entry)`: Parse message, stack, severity
   - Pattern Matching: Regex-based, configurable patterns

3. **src/core/duplicate-checker.ts**
   - Purpose: Prevent duplicate issue creation
   - Exports: `DuplicateChecker` class
   - Dependencies: Node.js crypto
   - Key Methods:
     - `isDuplicate(failure)`: Check if error seen before
     - `markAsSeen(failure)`: Add to cache
     - `getHash(failure)`: Compute SHA256 hash
   - Storage: In-memory Map<string, timestamp>
   - Persistence: Optional file write on shutdown

4. **src/core/github-creator.ts**
   - Purpose: Create GitHub issues
   - Exports: `GitHubIssueCreator` class
   - Dependencies: @octokit/rest
   - Key Methods:
     - `createIssue(failure)`: Format and create issue
     - `formatIssueBody(failure)`: Template rendering
   - Retry Logic: Exponential backoff on failures

5. **src/scheduler/scheduler.ts**
   - Purpose: Coordinate periodic execution
   - Exports: `Scheduler` class
   - Dependencies: All core components
   - Key Methods:
     - `start()`: Begin polling loop
     - `stop()`: Graceful shutdown
     - `executeOnce()`: Single iteration
   - Error Handling: Log errors, continue loop

6. **src/config/config.ts**
   - Purpose: Load and validate configuration
   - Exports: `loadConfig()`, `validateConfig()`
   - Dependencies: JSON Schema validator
   - Environment Variable Substitution: Replace ${VAR} with process.env.VAR
   - Validation: Throw on missing required fields

7. **src/types/failure.types.ts**
   - Purpose: Domain type definitions
   - Exports: `Failure`, `Severity`, `LogEntry` interfaces
   - Example:
     ```typescript
     export interface Failure {
       timestamp: Date;
       message: string;
       stackTrace?: string;
       severity: Severity;
       source: string;
     }

     export enum Severity {
       CRITICAL = 'critical',
       HIGH = 'high',
       MEDIUM = 'medium',
       LOW = 'low'
     }
     ```

8. **src/index.ts**
   - Purpose: Application entry point
   - Responsibilities:
     - Load configuration
     - Initialize components
     - Start scheduler
     - Handle SIGTERM/SIGINT for graceful shutdown
   - Error Handling: Log startup errors, exit with code 1

#### Configuration Files:

1. **config/config.example.json**
   - Purpose: Template for users to create config.json
   - Contains: Placeholder values, comments (via description fields)
   - Security: No real credentials

2. **config/config.schema.json**
   - Purpose: JSON Schema for validation
   - Defines: Required fields, types, formats
   - Enables: IDE autocomplete, runtime validation

#### Build & Deployment Files:

1. **Dockerfile**
   - Base: node:20-alpine (minimal size)
   - Stages: Multi-stage build (build → runtime)
   - Security: Non-root user, minimal layers
   - Configuration: COPY config.json or use env vars

2. **package.json**
   - Scripts:
     - `build`: Compile TypeScript
     - `start`: Run compiled code
     - `dev`: Run with ts-node for development
     - `test`: Run Jest tests
     - `lint`: Run ESLint
   - Dependencies: Azure SDK, Octokit, minimal runtime deps
   - DevDependencies: TypeScript, Jest, ESLint, types

3. **tsconfig.json**
   - Target: ES2022 (Node.js 20 support)
   - Module: ESNext with Node16 resolution
   - Strict: Enable all strict type checks
   - Output: dist/ directory

### 3.3 Interface Design Rationale

#### Component Interface Philosophy:

**Principle**: Each component should have a clean, testable interface with clear input/output contracts.

#### 1. LogFetcher Interface:

```typescript
export class LogFetcher {
  constructor(config: AzureConfig);

  async fetchLogs(
    startTime: Date,
    endTime: Date
  ): Promise<LogEntry[]>;
}
```

**Rationale**:
- Simple constructor dependency injection
- Single method responsibility
- Date-based time range (clear semantics)
- Returns typed array for type safety
- Async for I/O operation

**Testability**: Mock Azure SDK, inject fake credentials

#### 2. FailureDetector Interface:

```typescript
export class FailureDetector {
  constructor(patterns: DetectionPatterns);

  detectFailures(entries: LogEntry[]): Failure[];

  private extractErrorDetails(entry: LogEntry): Failure | null;
}
```

**Rationale**:
- Pattern injection for configurability
- Pure function (no side effects)
- Array processing (functional style)
- Private extraction method (encapsulation)

**Testability**: No external dependencies, pure logic

#### 3. DuplicateChecker Interface:

```typescript
export class DuplicateChecker {
  constructor(cachePath?: string);

  isDuplicate(failure: Failure): boolean;
  markAsSeen(failure: Failure): void;

  async persist(): Promise<void>;
  async restore(): Promise<void>;

  private computeHash(failure: Failure): string;
}
```

**Rationale**:
- Optional persistence path
- Boolean return (clear semantics)
- Explicit mutation method
- Async persistence for file I/O
- Private hash computation (implementation detail)

**Testability**: Mock file system, test hash function independently

#### 4. GitHubIssueCreator Interface:

```typescript
export class GitHubIssueCreator {
  constructor(config: GitHubConfig);

  async createIssue(failure: Failure): Promise<IssueResult>;

  private formatTitle(failure: Failure): string;
  private formatBody(failure: Failure): string;
}
```

**Rationale**:
- Config dependency injection
- Single public method (SRP)
- Returns result object (issue URL, number)
- Private formatting methods (encapsulation)

**Testability**: Mock Octokit, verify formatting logic

#### 5. Scheduler Interface:

```typescript
export class Scheduler {
  constructor(
    logFetcher: LogFetcher,
    detector: FailureDetector,
    checker: DuplicateChecker,
    creator: GitHubIssueCreator,
    intervalMinutes: number
  );

  start(): void;
  stop(): Promise<void>;

  private async executeOnce(): Promise<void>;
}
```

**Rationale**:
- Explicit dependencies (dependency injection)
- Simple start/stop lifecycle
- Private execution method
- Async stop for graceful shutdown

**Testability**: Inject mock components, control timing

### 3.4 Type System Approach

#### Strategy: Strict TypeScript with Domain Types

**Core Domain Types**:

1. **Failure Type** (Central domain object):
```typescript
export interface Failure {
  timestamp: Date;
  message: string;
  stackTrace?: string;
  severity: Severity;
  source: string;
  rawLog?: Record<string, unknown>;
}

export enum Severity {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low'
}
```

2. **Azure Types** (External API contracts):
```typescript
export interface LogEntry {
  TimeGenerated: string;
  Message: string;
  Level: string;
  [key: string]: unknown;
}

export interface AzureConfig {
  workspaceId: string;
  tableName: string;
  tenantId: string;
  clientId: string;
  clientSecret: string;
  queryWindowMinutes: number;
}
```

3. **GitHub Types** (External API contracts):
```typescript
export interface GitHubConfig {
  owner: string;
  repo: string;
  token: string;
  labels: string[];
}

export interface IssueResult {
  number: number;
  url: string;
  createdAt: Date;
}
```

4. **Detection Types** (Configuration):
```typescript
export interface DetectionPatterns {
  patterns: string[];
  severityKeywords: Record<Severity, string[]>;
  extractionFields?: string[];
}
```

**Type Safety Benefits**:
- Compile-time validation of API usage
- IDE autocomplete for config structure
- Refactoring safety (rename, move)
- Self-documenting code

---

## 4. IMPLEMENTATION CONSIDERATIONS

### 4.1 Development Complexity Analysis

#### Complexity Assessment by Component:

1. **Log Fetcher: LOW Complexity**
   - Estimated: 2-3 hours
   - Why: SDK handles heavy lifting
   - Challenges: Authentication setup, query syntax
   - Testing: Mock SDK responses

2. **Failure Detector: MEDIUM Complexity**
   - Estimated: 3-4 hours
   - Why: Pattern matching logic, parsing
   - Challenges: Regex correctness, edge cases
   - Testing: Comprehensive test cases for patterns

3. **Duplicate Checker: LOW Complexity**
   - Estimated: 2 hours
   - Why: Simple hash + cache
   - Challenges: Hash collision handling (theoretical)
   - Testing: Verify hash consistency

4. **GitHub Issue Creator: LOW Complexity**
   - Estimated: 2-3 hours
   - Why: SDK handles API calls
   - Challenges: Issue template formatting, retry logic
   - Testing: Mock Octokit, verify formatting

5. **Scheduler: LOW Complexity**
   - Estimated: 2 hours
   - Why: Simple interval loop
   - Challenges: Graceful shutdown, error recovery
   - Testing: Verify timing, error handling

6. **Configuration: MEDIUM Complexity**
   - Estimated: 3 hours
   - Why: JSON Schema, validation, env substitution
   - Challenges: Error messages, validation rules
   - Testing: Invalid config scenarios

**Total Estimated Development Time**: 14-17 hours (within 3-day target)

#### Risk Areas:

1. **Azure Authentication**:
   - Risk: Service Principal setup issues
   - Mitigation: Clear documentation, test in dev subscription
   - Fallback: Use Azure CLI authentication locally

2. **Log Query Performance**:
   - Risk: Slow queries for large tables
   - Mitigation: Add timeout, limit result size
   - Fallback: Reduce query window to 1 minute

3. **GitHub Rate Limits**:
   - Risk: Hit 5000 requests/hour limit
   - Mitigation: Should never happen at <100 logs/hour
   - Fallback: Implement exponential backoff

### 4.2 Testing Strategy Thoughts

#### Test Pyramid:

1. **Unit Tests (70%)**:
   - Each component tested in isolation
   - Mock external dependencies (Azure SDK, Octokit)
   - Test edge cases (empty logs, malformed data)
   - Coverage target: >80%

2. **Integration Tests (20%)**:
   - Components working together
   - Real Azure/GitHub SDK calls (test environment)
   - Test error handling across boundaries
   - Verify configuration loading

3. **End-to-End Tests (10%)**:
   - Full system test in dev environment
   - Inject test log entry in Azure
   - Verify GitHub issue created
   - Verify deduplication works

#### Test Data Strategy:

1. **Fixtures**:
   - Sample Azure log entries (various formats)
   - Error patterns (different severity levels)
   - Expected GitHub issue formats

2. **Mocking Strategy**:
   - Azure SDK: Return predefined log entries
   - Octokit: Return fake issue numbers
   - File system: In-memory for cache persistence

3. **Test Scenarios**:
   - Happy path: Error detected → Issue created
   - No errors: No issues created
   - Duplicate error: Only one issue
   - Azure unavailable: Retry logic
   - GitHub unavailable: Retry logic
   - Invalid configuration: Clear error message

#### Continuous Integration:

1. **Pre-commit**:
   - Run linter (ESLint)
   - Run type checking (tsc --noEmit)
   - Run unit tests

2. **PR Checks**:
   - Full test suite
   - Coverage report
   - Build Docker image

3. **Deployment**:
   - Integration tests in staging
   - Manual approval for production

### 4.3 Deployment Considerations

#### Azure Container Instances Setup:

1. **Container Image**:
   - Build: Multi-stage Dockerfile (build + runtime)
   - Registry: Azure Container Registry (ACR)
   - Tag: Semantic versioning (v1.0.0)
   - Size target: <100MB (Alpine base)

2. **ACI Configuration**:
   - CPU: 0.5 cores (sufficient for polling)
   - Memory: 512MB (Node.js + small cache)
   - Restart policy: Always (auto-recovery)
   - Networking: Public IP not needed

3. **Configuration Management**:
   - Option 1: Mount config.json from Azure File Share
   - Option 2: Environment variables only
   - Recommended: Environment variables for secrets, file for structure

4. **Secrets Management**:
   - Azure Key Vault for sensitive values
   - Azure Identity for managed identity
   - No secrets in container image

5. **Logging**:
   - stdout/stderr → Azure Container Instances logs
   - Retention: 7 days (adjustable)
   - Monitoring: Azure Monitor alerts on crashes

#### Deployment Process:

1. **Build**:
   ```bash
   docker build -t error-detection-agent:v1.0.0 .
   docker tag error-detection-agent:v1.0.0 myacr.azurecr.io/error-detection-agent:v1.0.0
   docker push myacr.azurecr.io/error-detection-agent:v1.0.0
   ```

2. **Deploy**:
   ```bash
   az container create \
     --resource-group my-rg \
     --name error-detection-agent \
     --image myacr.azurecr.io/error-detection-agent:v1.0.0 \
     --cpu 0.5 \
     --memory 0.5 \
     --restart-policy Always \
     --environment-variables \
       AZURE_TENANT_ID=$TENANT_ID \
       AZURE_CLIENT_ID=$CLIENT_ID \
       ...
   ```

3. **Verify**:
   ```bash
   az container logs --resource-group my-rg --name error-detection-agent
   ```

#### Rollback Strategy:

- Keep previous 3 image versions
- Redeploy previous version if issues found
- Monitor GitHub issues for duplicates (indicates rollback needed)

### 4.4 Cost Optimization Notes

#### Cost Breakdown:

1. **Azure Container Instances**:
   - 0.5 vCPU × 730 hours/month × $0.0000125/second ≈ $32.85/month
   - Wait, this exceeds budget! Need to reconsider.

2. **Revised Cost Analysis**:
   - Option A: Azure Functions (Consumption Plan)
     - Free tier: 1M executions/month
     - ~8,640 executions/month (every 5 min)
     - Cost: $0/month (within free tier)
   - Option B: Reduce ACI resources
     - 0.1 vCPU × 0.1 GB memory × 730 hours ≈ $2-3/month
   - Option C: Azure Container Apps (Consumption)
     - Pay per execution
     - ~$1-2/month for this volume

3. **Azure Log Analytics**:
   - First 5GB/month: Free
   - Query costs: Negligible for 5-minute queries
   - Estimated: $0/month

4. **GitHub API**:
   - Free tier: 5,000 requests/hour
   - Usage: <100 issues/month
   - Cost: $0/month

**Recommended Deployment**: Azure Functions (Consumption Plan)

**Cost Target Achievement**: $0-2/month (well under $10/month target)

#### Cost Optimization Strategies:

1. **Reduce Polling Frequency**: 10 minutes instead of 5 (if acceptable)
2. **Optimize Log Queries**: Fetch only necessary columns
3. **Cache Configuration**: Load once at startup
4. **Efficient Deduplication**: Use bloom filter for large volumes

---

## 5. GAPS AND QUESTIONS

### 5.1 Additional Information Needed

#### Configuration Questions:

1. **Azure Log Analytics**:
   - Q: What is the exact table name in the workspace?
   - Q: What are the column names for error messages and stack traces?
   - Q: Are there existing KQL queries we should replicate?
   - Impact: Affects log-fetcher.ts implementation

2. **GitHub Repository**:
   - Q: What is the target repository (owner/repo)?
   - Q: Are there existing issue labels to use?
   - Q: Should issues be assigned to anyone automatically?
   - Q: Any issue template already defined?
   - Impact: Affects github-creator.ts template

3. **Error Patterns**:
   - Q: What specific error patterns should be detected?
   - Q: Are there severity levels defined in logs?
   - Q: Should we detect warnings, or only errors?
   - Impact: Affects failure-detector.ts patterns

4. **Authentication**:
   - Q: Is there an existing Service Principal to use?
   - Q: What permissions does it have on the workspace?
   - Q: Is there a GitHub PAT or should we create GitHub App?
   - Impact: Affects deployment configuration

### 5.2 Ambiguities in Requirements

#### Behavior Ambiguities:

1. **Duplicate Detection Scope**:
   - Ambiguity: How long should duplicates be remembered?
   - Options:
     - A: Forever (cache grows unbounded)
     - B: 24 hours (sliding window)
     - C: 7 days (common error recurrence period)
   - Recommendation: 24-hour sliding window (balance memory/usefulness)

2. **Failure Severity Mapping**:
   - Ambiguity: How to determine severity from log entries?
   - Options:
     - A: Use log level field (INFO/WARN/ERROR/FATAL)
     - B: Pattern-based keywords (Exception=HIGH, Warning=MEDIUM)
     - C: Always set to HIGH (simplest)
   - Recommendation: Map log level field if available, else pattern-based

3. **Issue Creation Timing**:
   - Ambiguity: Create issues immediately or batch?
   - Options:
     - A: Create immediately on detection (real-time)
     - B: Batch at end of polling interval (reduce API calls)
   - Recommendation: Create immediately (simpler, faster feedback)

4. **Error Recovery**:
   - Ambiguity: What happens if GitHub is unreachable?
   - Options:
     - A: Retry indefinitely (may lose other errors)
     - B: Skip and continue (lose error notification)
     - C: Queue for later (add complexity)
   - Recommendation: Retry 3 times, log failure, continue (fail gracefully)

### 5.3 Potential Risks or Challenges

#### Technical Risks:

1. **Azure SDK Versioning**:
   - Risk: SDK breaking changes
   - Likelihood: Medium
   - Impact: High (system breaks)
   - Mitigation: Pin exact SDK versions, test upgrades in dev

2. **Log Schema Changes**:
   - Risk: Azure log format changes
   - Likelihood: Low (stable schemas)
   - Impact: High (detection breaks)
   - Mitigation: Defensive parsing, log schema mismatches

3. **Memory Growth**:
   - Risk: Duplicate cache grows too large
   - Likelihood: Medium (if no TTL)
   - Impact: Medium (container OOM)
   - Mitigation: Implement TTL, monitor memory usage

4. **GitHub API Changes**:
   - Risk: API deprecation
   - Likelihood: Low (stable API)
   - Impact: Medium (issue creation breaks)
   - Mitigation: Use latest Octokit, monitor GitHub changelog

#### Operational Risks:

1. **False Positives**:
   - Risk: Creating issues for non-errors
   - Likelihood: High (pattern tuning needed)
   - Impact: Medium (noise in issue tracker)
   - Mitigation: Start with conservative patterns, refine based on feedback

2. **Missed Errors**:
   - Risk: Not detecting actual errors
   - Likelihood: Medium (incomplete patterns)
   - Impact: High (defeats purpose)
   - Mitigation: Comprehensive pattern testing, gradual rollout

3. **Authentication Expiry**:
   - Risk: Service Principal credentials expire
   - Likelihood: Low (long-lived)
   - Impact: High (system stops)
   - Mitigation: Monitor auth failures, alert on expiration

4. **Cost Overruns**:
   - Risk: Unexpected Azure costs
   - Likelihood: Low (predictable usage)
   - Impact: Low ($10 budget)
   - Mitigation: Azure cost alerts, monitor resource usage

#### Process Risks:

1. **Insufficient Testing**:
   - Risk: Production bugs
   - Likelihood: Medium (3-day timeline)
   - Impact: High (production errors)
   - Mitigation: Comprehensive test suite, dev environment testing

2. **Configuration Errors**:
   - Risk: Wrong repository, workspace, etc.
   - Likelihood: Medium (manual config)
   - Impact: Medium (wrong issues created)
   - Mitigation: Configuration validation, dry-run mode

3. **Deployment Complexity**:
   - Risk: Failed deployments
   - Likelihood: Low (simple container)
   - Impact: Medium (delayed value)
   - Mitigation: Deployment scripts, documentation

### 5.4 Items Needing Clarification

#### Before Implementation:

1. **Workspace Details**:
   - [ ] Workspace ID
   - [ ] Table name
   - [ ] Column names (message, level, timestamp, stack trace)
   - [ ] Sample query to replicate

2. **Repository Details**:
   - [ ] GitHub owner
   - [ ] GitHub repository name
   - [ ] Issue labels to use
   - [ ] Issue template format (if any)

3. **Authentication Credentials**:
   - [ ] Azure Service Principal (tenant ID, client ID, client secret)
   - [ ] GitHub Personal Access Token or App credentials
   - [ ] Verify permissions (read logs, create issues)

4. **Error Patterns**:
   - [ ] List of error patterns to detect
   - [ ] Severity level mapping
   - [ ] Sample error logs for testing

5. **Operational Details**:
   - [ ] Deployment target (Azure subscription, resource group)
   - [ ] Monitoring/alerting preferences
   - [ ] On-call process if system fails

#### Design Decisions to Confirm:

1. **Duplicate Detection TTL**:
   - Recommendation: 24 hours
   - Confirm: Is this acceptable?

2. **Deployment Platform**:
   - Recommendation: Azure Functions (Consumption) for cost
   - Alternative: Azure Container Instances if Functions not suitable
   - Confirm: Any preference or constraints?

3. **Issue Format**:
   - Recommendation: Standard template (timestamp, message, stack, link to logs)
   - Confirm: Any specific format required?

4. **Polling Interval**:
   - Recommendation: 5 minutes
   - Confirm: Is this acceptable, or should it be configurable?

5. **Error Handling Strategy**:
   - Recommendation: Log and continue (fail gracefully)
   - Confirm: Any specific SLA requirements?

---

## 6. OPENSPEC PROPOSAL SUMMARY

### 6.1 Proposal Structure

The OpenSpec change proposal is organized as follows:

1. **Metadata**:
   - Change ID: mvp-error-detection-agent
   - Type: feature
   - Status: proposed
   - Created: 2025-12-12

2. **Files to Create**:
   - 20+ source files (TypeScript)
   - Configuration files (JSON, Dockerfile)
   - Test files (Jest)
   - Documentation (README)

3. **Dependencies**:
   - @azure/monitor-query
   - @azure/identity
   - @octokit/rest
   - TypeScript, Jest, ESLint

4. **Directory Structure**:
   - src/ (source code)
   - tests/ (test files)
   - config/ (configuration)
   - Root files (package.json, Dockerfile, etc.)

### 6.2 Implementation Phases

**Phase 1: Core Components** (Day 1)
- Implement LogFetcher
- Implement FailureDetector
- Implement DuplicateChecker
- Implement GitHubIssueCreator
- Unit tests for each

**Phase 2: Integration** (Day 2)
- Implement Scheduler
- Configuration management
- Integration tests
- Dockerfile

**Phase 3: Testing & Deployment** (Day 3)
- End-to-end tests
- Documentation
- Deploy to dev environment
- Verify with real logs

### 6.3 Success Metrics

**Functional**:
- ✓ Detects errors in Azure logs
- ✓ Creates GitHub issues
- ✓ Prevents duplicates
- ✓ Runs continuously

**Technical**:
- ✓ >80% test coverage
- ✓ <3 day development time
- ✓ TypeScript strict mode passes
- ✓ Docker image <100MB

**Operational**:
- ✓ <$10/month cost
- ✓ <5 minute detection latency
- ✓ Zero manual intervention needed
- ✓ Clear logs for debugging

---

## 7. CONCLUSION

This implementation plan provides a comprehensive, step-by-step approach to building the error-detection-agent MVP. The design prioritizes:

1. **Simplicity**: Minimal dependencies, clear architecture
2. **Testability**: Isolated components, comprehensive tests
3. **Maintainability**: TypeScript types, modular structure
4. **Cost-Effectiveness**: Azure Functions or minimal ACI
5. **Rapid Development**: 3-day timeline achievable

The OpenSpec proposal captures all necessary files, dependencies, and configurations to implement this system. Additional clarifications are needed around specific Azure workspace details, GitHub repository configuration, and authentication credentials before implementation can begin.

**Next Steps**:
1. Gather configuration details (workspace ID, repository, credentials)
2. Review and approve OpenSpec proposal
3. Begin Phase 1 implementation
4. Iterative testing and refinement

**Total Estimated Effort**: 16-20 hours development + 4-8 hours testing/deployment = 3 days
