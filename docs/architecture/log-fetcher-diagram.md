# Log Fetcher Component - Architecture Diagrams

## C4 Model: System Context

```
┌──────────────────────────────────────────────────────────────────┐
│                     Error Detection Agent                        │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │                  Log Fetcher Service                    │    │
│  │                                                         │    │
│  │  - Authenticate with Azure                              │    │
│  │  - Execute KQL queries                                  │    │
│  │  - Handle rate limits & failures                        │    │
│  │  - Parse and return log entries                         │    │
│  └────────────────────────────────────────────────────────┘    │
│                          │                                       │
└──────────────────────────┼───────────────────────────────────────┘
                           │
                           │ HTTPS (Azure SDK)
                           │
                           ▼
    ┌──────────────────────────────────────────────┐
    │    Azure Application Insights                │
    │                                               │
    │  - Stores application logs and telemetry     │
    │  - Exposes Logs Query API                    │
    │  - Handles authentication via Azure AD       │
    └──────────────────────────────────────────────┘
```

## C4 Model: Container Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Log Fetcher Service                         │
│                                                                     │
│  ┌──────────────────────┐      ┌──────────────────────┐           │
│  │   Public API         │      │   Configuration      │           │
│  │                      │      │                      │           │
│  │ • fetchLogs()        │      │ • Authentication     │           │
│  │ • fetchPaginated()   │      │ • Query Settings     │           │
│  │ • fetchStreaming()   │      │ • Rate Limits        │           │
│  │ • healthCheck()      │      │ • Circuit Breaker    │           │
│  │ • getMetrics()       │      │                      │           │
│  └──────────┬───────────┘      └──────────┬───────────┘           │
│             │                              │                       │
│             ▼                              ▼                       │
│  ┌────────────────────────────────────────────────────┐           │
│  │         LogFetcherService (Orchestrator)           │           │
│  │                                                     │           │
│  │  Coordinates all components to fetch logs          │           │
│  └────────────────────────────────────────────────────┘           │
│             │                                                      │
│             ├───────────────────────────────────────┐             │
│             │                                       │             │
│             ▼                                       ▼             │
│  ┌─────────────────────┐              ┌─────────────────────┐    │
│  │  Azure Authenticator │              │  KQL Query Builder  │    │
│  │                      │              │                     │    │
│  │ • authenticate()     │              │ • buildQuery()      │    │
│  │ • validateCreds()    │              │ • buildPaginated()  │    │
│  │ • refreshCreds()     │              │ • optimizeQuery()   │    │
│  └──────────┬───────────┘              └──────────┬──────────┘    │
│             │                                      │               │
│             │                                      │               │
│             ▼                                      ▼               │
│  ┌────────────────────────────────────────────────────┐           │
│  │           LogsQueryClient (Azure SDK)              │           │
│  │                                                     │           │
│  │  Low-level Azure API interaction                   │           │
│  └────────────────────────────────────────────────────┘           │
│             │                                                      │
│             ├───────────────────────────────────────┐             │
│             │                                       │             │
│             ▼                                       ▼             │
│  ┌─────────────────────┐              ┌─────────────────────┐    │
│  │  Rate Limit Handler │              │   Circuit Breaker   │    │
│  │                      │              │                     │    │
│  │ • recordEvent()      │              │ • execute()         │    │
│  │ • shouldWait()       │              │ • recordFailure()   │    │
│  │ • waitForRetry()     │              │ • recordSuccess()   │    │
│  └──────────────────────┘              └─────────────────────┘    │
│                                                                    │
│             ┌─────────────────────────────────────┐               │
│             │        Log Entry Parser             │               │
│             │                                      │               │
│             │ • parse()                            │               │
│             │ • parseBatch()                       │               │
│             │ • extractFields()                    │               │
│             └──────────────────────────────────────┘               │
│                                                                    │
│  ┌──────────────────────────────────────────────────────┐         │
│  │              Metrics & Observability                 │         │
│  │                                                       │         │
│  │  • Query counts & durations                          │         │
│  │  • Error rates & types                               │         │
│  │  • Rate limit events                                 │         │
│  │  • Circuit breaker state                             │         │
│  └──────────────────────────────────────────────────────┘         │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

## C4 Model: Component Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           LogFetcherService                              │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                        Initialization Phase                        │ │
│  │                                                                    │ │
│  │  initialize()                                                      │ │
│  │      ↓                                                             │ │
│  │  1. Validate configuration                                         │ │
│  │  2. Authenticate with Azure (AzureAuthenticator)                   │ │
│  │  3. Create LogsQueryClient                                         │ │
│  │  4. Initialize components                                          │ │
│  │  5. Perform health check                                           │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                        Query Execution Phase                       │ │
│  │                                                                    │ │
│  │  fetchLogs(startTime?, endTime?, options?)                         │ │
│  │      ↓                                                             │ │
│  │  1. Generate request ID                                            │ │
│  │  2. Build KQL query (KQLQueryBuilder)                              │ │
│  │  3. Check circuit breaker state (CircuitBreaker)                   │ │
│  │      ↓                                                             │ │
│  │      If OPEN → Throw error                                         │ │
│  │      If CLOSED or HALF_OPEN → Proceed                              │ │
│  │      ↓                                                             │ │
│  │  4. Execute query with retry loop                                  │ │
│  │      ↓                                                             │ │
│  │      Loop (max retries):                                           │ │
│  │        a. Check rate limit (RateLimitHandler.shouldWait())         │ │
│  │        b. If rate limited → Wait (RateLimitHandler.waitForRetry()) │ │
│  │        c. Execute query via LogsQueryClient                        │ │
│  │        d. Handle response:                                         │ │
│  │           - Success → Record success, break loop                   │ │
│  │           - 429 Rate Limit → Record event, continue loop           │ │
│  │           - 503 Service Unavailable → Record failure, continue     │ │
│  │           - Other error → Determine if retryable                   │ │
│  │      ↓                                                             │ │
│  │  5. Update circuit breaker (success or failure)                    │ │
│  │  6. Parse results (LogEntryParser)                                 │ │
│  │  7. Update metrics                                                 │ │
│  │  8. Return QueryResult                                             │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                      Pagination Support Phase                      │ │
│  │                                                                    │ │
│  │  fetchLogsWithPagination(startTime, endTime, onPage)               │ │
│  │      ↓                                                             │ │
│  │  1. Initialize pagination state                                    │ │
│  │  2. Loop while hasMore:                                            │ │
│  │      a. Build paginated query (with continuationToken)             │ │
│  │      b. Execute query (same as fetchLogs)                          │ │
│  │      c. Parse results                                              │ │
│  │      d. Invoke onPage callback                                     │ │
│  │      e. Update pagination state                                    │ │
│  │  3. Return total entry count                                       │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                       Streaming Support Phase                      │ │
│  │                                                                    │ │
│  │  fetchLogsStreaming(startTime, endTime, onEntry)                   │ │
│  │      ↓                                                             │ │
│  │  1. Build streaming query                                          │ │
│  │  2. Execute query with streaming options                           │ │
│  │  3. For each raw entry:                                            │ │
│  │      a. Parse entry (LogEntryParser)                               │ │
│  │      b. Invoke onEntry callback                                    │ │
│  │      c. Update progress metrics                                    │ │
│  │  4. Return total processed count                                   │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

## Component Interaction Sequence Diagram

```
Client          LogFetcherService    CircuitBreaker    RateLimitHandler    AzureAuth    QueryBuilder    LogsQueryClient    Parser
  │                     │                   │                   │              │              │                │             │
  │  fetchLogs()        │                   │                   │              │              │                │             │
  ├────────────────────►│                   │                   │              │              │                │             │
  │                     │                   │                   │              │              │                │             │
  │                     │ execute()         │                   │              │              │                │             │
  │                     ├──────────────────►│                   │              │              │                │             │
  │                     │                   │                   │              │              │                │             │
  │                     │                   │ Check state       │              │              │                │             │
  │                     │                   │ (Closed/Open?)    │              │              │                │             │
  │                     │                   │                   │              │              │                │             │
  │                     │                   │ State: Closed     │              │              │                │             │
  │                     │◄──────────────────┤                   │              │              │                │             │
  │                     │                   │                   │              │              │                │             │
  │                     │ shouldWait()      │                   │              │              │                │             │
  │                     ├───────────────────┴──────────────────►│              │              │                │             │
  │                     │                                       │              │              │                │             │
  │                     │                   No rate limit       │              │              │                │             │
  │                     │◄──────────────────────────────────────┤              │              │                │             │
  │                     │                                       │              │              │                │             │
  │                     │ getCredential()                       │              │              │                │             │
  │                     ├───────────────────────────────────────┴─────────────►│              │                │             │
  │                     │                                                      │              │                │             │
  │                     │                                      TokenCredential │              │                │             │
  │                     │◄─────────────────────────────────────────────────────┤              │                │             │
  │                     │                                                      │              │                │             │
  │                     │ buildQuery(startTime, endTime)                       │              │                │             │
  │                     ├──────────────────────────────────────────────────────┴─────────────►│                │             │
  │                     │                                                                     │                │             │
  │                     │                                                      KQL Query Text │                │             │
  │                     │◄────────────────────────────────────────────────────────────────────┤                │             │
  │                     │                                                                     │                │             │
  │                     │ queryWorkspace(workspaceId, query, credential)                      │                │             │
  │                     ├─────────────────────────────────────────────────────────────────────┴───────────────►│             │
  │                     │                                                                                      │             │
  │                     │                                                                       [API Call]     │             │
  │                     │                                                                            ▼         │             │
  │                     │                                                                       Azure API      │             │
  │                     │                                                                            │         │             │
  │                     │                                                                  LogsQueryResult     │             │
  │                     │◄─────────────────────────────────────────────────────────────────────────────────────┤             │
  │                     │                                                                                      │             │
  │                     │ parseBatch(rawEntries)                                                               │             │
  │                     ├──────────────────────────────────────────────────────────────────────────────────────┴────────────►│
  │                     │                                                                                                    │
  │                     │                                                                          {entries[], errorCount}  │
  │                     │◄───────────────────────────────────────────────────────────────────────────────────────────────────┤
  │                     │                                                                                                    │
  │                     │ recordSuccess()                                                                                    │
  │                     ├───────────────────────────────────────►│                                                           │
  │                     │                                        │                                                           │
  │                     │ recordSuccess()                        │                                                           │
  │                     ├──────────────────┬─────────────────────┘                                                           │
  │                     │                  │                                                                                 │
  │                     │ updateMetrics()  │                                                                                 │
  │                     │                  │                                                                                 │
  │  QueryResult        │                  │                                                                                 │
  │◄────────────────────┤                  │                                                                                 │
  │                     │                  │                                                                                 │
```

## Error Handling Flow Diagram

```
                            Execute Query
                                  │
                                  ▼
                        ┌─────────────────┐
                        │ Circuit Breaker │
                        │   Check State   │
                        └────────┬─────────┘
                                 │
                    ┌────────────┼────────────┐
                    ▼            ▼            ▼
                 CLOSED      HALF-OPEN      OPEN
                    │            │            │
                    │            │            └──► Reject Request
                    │            │                (CircuitBreakerOpen)
                    │            │
                    └────────────┴──► Proceed with Query
                                 │
                                 ▼
                        ┌─────────────────┐
                        │  Rate Limiter   │
                        │   shouldWait()  │
                        └────────┬─────────┘
                                 │
                    ┌────────────┼────────────┐
                    ▼                         ▼
              Rate Limited               Not Rate Limited
                    │                         │
                    │                         │
              waitForRetry()                  │
                    │                         │
                    └────────────┬────────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │   Azure SDK     │
                        │  Query Execute  │
                        └────────┬─────────┘
                                 │
           ┌─────────────────────┼─────────────────────┐
           │                     │                     │
           ▼                     ▼                     ▼
       Success              429 Rate Limit         503 Service
                                 │                 Unavailable
           │                     │                     │
           │                     ▼                     ▼
           │            recordRateLimitEvent()  recordFailure()
           │                     │              (Circuit Breaker)
           │                     │                     │
           │                     ▼                     │
           │            Update backoff delay           │
           │                     │                     │
           │                     ▼                     │
           │            Retry with delay               │
           │                                          │
           │            ┌──────────────────────────────┘
           │            │
           │            ▼
           │    Check retry count
           │            │
           │   ┌────────┼────────┐
           │   ▼                 ▼
           │ < Max           >= Max
           │  Retries          Retries
           │   │                 │
           │   │                 ▼
           │   │         Throw Error
           │   │      (Max Retries Exceeded)
           │   │
           │   └──► Retry Loop
           │
           ▼
    recordSuccess()
    (Circuit Breaker
     & Rate Limiter)
           │
           ▼
    Parse Results
           │
           ▼
   Return QueryResult
```

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Configuration Sources                        │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │  Config File │  │  Environment │  │   AppConfig  │             │
│  │  (YAML/JSON) │  │  Variables   │  │   Object     │             │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘             │
│         │                 │                 │                      │
│         └─────────────────┴─────────────────┘                      │
│                           │                                        │
└───────────────────────────┼─────────────────────────────────────────┘
                            │
                            ▼
                 ┌─────────────────────┐
                 │ LogFetcherFactory   │
                 │   .create(config)   │
                 └──────────┬───────────┘
                            │
                            ▼
                 ┌─────────────────────┐
                 │  LogFetcherService  │
                 │    (initialized)    │
                 └──────────┬───────────┘
                            │
                            │ fetchLogs()
                            │
                            ▼
            ┌────────────────────────────────┐
            │  Query Execution Pipeline      │
            │                                │
            │  1. Time Range                 │
            │     startTime: Date            │
            │     endTime: Date              │
            │     ↓                          │
            │  2. KQL Query String           │
            │     "traces | where..."        │
            │     ↓                          │
            │  3. Azure API Request          │
            │     workspace: ID              │
            │     query: string              │
            │     credential: Token          │
            │     ↓                          │
            │  4. Raw Azure Response         │
            │     LogsQueryResult            │
            │     tables: []                 │
            │     rows: [][]                 │
            └────────────────┬───────────────┘
                             │
                             ▼
            ┌────────────────────────────────┐
            │    Log Entry Parsing           │
            │                                │
            │  For each row in result:       │
            │    ↓                           │
            │  Extract fields:               │
            │    - timestamp: Date           │
            │    - severity: LogSeverity     │
            │    - message: string           │
            │    - errorCode?: string        │
            │    - stackTrace?: string       │
            │    - source?: SourceLocation   │
            │    - metadata?: Record         │
            │    ↓                           │
            │  Create LogEntry object        │
            │    ↓                           │
            │  Validate required fields      │
            │    ↓                           │
            │  Handle parse errors           │
            └────────────────┬───────────────┘
                             │
                             ▼
                 ┌─────────────────────┐
                 │    QueryResult      │
                 │                     │
                 │  entries: LogEntry[]│
                 │  totalCount: number │
                 │  executionTimeMs    │
                 │  queryStartTime     │
                 │  queryEndTime       │
                 │  requestId          │
                 │  hasMore: boolean   │
                 └──────────┬───────────┘
                            │
                            ▼
              ┌─────────────────────────────┐
              │  Return to Client           │
              │                             │
              │  + Update Metrics           │
              │  + Log Query Details        │
              │  + Record Circuit Breaker   │
              │  + Record Rate Limit State  │
              └─────────────────────────────┘
```

## State Machine: Circuit Breaker

```
                ┌───────────────────────────────────┐
                │         CLOSED                    │
                │  (Normal Operation)               │
                │                                   │
                │  - Allow all requests             │
                │  - Track failure count            │
                │  - Reset success count            │
                └───────────┬───────────────────────┘
                            │
                            │ Failure count >= threshold
                            │ (e.g., 5 consecutive failures)
                            │
                            ▼
                ┌───────────────────────────────────┐
                │           OPEN                    │
                │   (Failure State)                 │
                │                                   │
                │  - Reject all requests            │
                │  - Wait for recovery timeout      │
                │  - Return CircuitBreakerOpen error│
                └───────────┬───────────────────────┘
                            │
                            │ Recovery timeout elapsed
                            │ (e.g., 60 seconds)
                            │
                            ▼
                ┌───────────────────────────────────┐
                │        HALF-OPEN                  │
                │  (Testing Recovery)               │
                │                                   │
                │  - Allow limited requests         │
                │  - Track success/failure          │
                │  - Reset counters on transition   │
                └───────────┬───────────┬───────────┘
                            │           │
                Success ────┘           └──── Failure
                count >=                     (any)
                threshold
                (e.g., 2)
                            │           │
                            ▼           ▼
                        CLOSED       OPEN
                    (Recovered)  (Still Failing)
```

## State Machine: Rate Limit Handler

```
                ┌───────────────────────────────────┐
                │         NORMAL                    │
                │   (No Rate Limiting)              │
                │                                   │
                │  - currentAttempt: 0              │
                │  - currentDelayMs: 0              │
                │  - isRateLimited: false           │
                └───────────┬───────────────────────┘
                            │
                            │ Receive 429 Rate Limit
                            │
                            ▼
                ┌───────────────────────────────────┐
                │      RATE_LIMITED                 │
                │  (Backoff Active)                 │
                │                                   │
                │  - Increment currentAttempt       │
                │  - Calculate backoff delay        │
                │  - isRateLimited: true            │
                │  - Wait for delay period          │
                └───────────┬───────────┬───────────┘
                            │           │
                Successful  │           │  Max retries
                request     │           │  exceeded
                            │           │
                            ▼           ▼
                        NORMAL      ERROR
                     (Reset State)  (Throw)
                            │
                            │ Multiple consecutive
                            │ rate limit errors
                            │
                            ▼
                ┌───────────────────────────────────┐
                │    ADAPTIVE_BACKOFF               │
                │ (Extended Backoff)                │
                │                                   │
                │  - Increase polling interval      │
                │  - Alert operations team          │
                │  - Wait longer between retries    │
                └───────────┬───────────────────────┘
                            │
                            │ Successful requests
                            │ resume
                            │
                            ▼
                        NORMAL
```

## Deployment Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                    Azure Environment                             │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │         Error Detection Agent (Container/VM)               │ │
│  │                                                            │ │
│  │  ┌──────────────────────────────────────────────────────┐ │ │
│  │  │           Log Fetcher Service                        │ │ │
│  │  │                                                      │ │ │
│  │  │  - Runs as singleton or scaled instances            │ │ │
│  │  │  - Uses managed identity for authentication         │ │ │
│  │  │  - Polls Azure Application Insights periodically    │ │ │
│  │  └──────────────────────────────────────────────────────┘ │ │
│  │                          │                                 │ │
│  │                          │ HTTPS                           │ │
│  │                          │ (Azure SDK)                     │ │
│  │                          │                                 │ │
│  │                          ▼                                 │ │
│  │  ┌──────────────────────────────────────────────────────┐ │ │
│  │  │    Azure Application Insights                        │ │ │
│  │  │                                                      │ │ │
│  │  │  - Workspace ID: [configured]                       │ │ │
│  │  │  - RBAC: Log Analytics Reader                       │ │ │
│  │  │  - Rate Limits: Azure defaults                      │ │ │
│  │  └──────────────────────────────────────────────────────┘ │ │
│  │                                                            │ │
│  │  ┌──────────────────────────────────────────────────────┐ │ │
│  │  │         Azure Monitor / Metrics                      │ │ │
│  │  │                                                      │ │ │
│  │  │  - Service health metrics                           │ │ │
│  │  │  - Query performance metrics                        │ │ │
│  │  │  - Error rate alerts                                │ │ │
│  │  └──────────────────────────────────────────────────────┘ │ │
│  │                                                            │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```
