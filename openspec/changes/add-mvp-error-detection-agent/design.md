# Design: MVP Error Detection Agent

## Context

We need an automated system to monitor Azure Application Insights logs, detect failures, and create GitHub issues without manual intervention. The system must be reliable, prevent duplicate issues, and handle Azure/GitHub API rate limits and failures gracefully.

### Constraints
- Must use Azure Application Insights (existing logging infrastructure)
- Must create issues in GitHub (existing issue tracking system)
- Must run continuously with minimal resource usage
- Must handle API rate limits and transient failures
- Must prevent duplicate issue creation
- Should be easy to configure and maintain

### Stakeholders
- DevOps team (operations)
- Development team (issue consumers)
- Platform team (Azure infrastructure)

## Goals / Non-Goals

### Goals
- Automated failure detection from Azure logs
- Zero duplicate GitHub issues for same failure
- Configurable failure patterns and severity levels
- Reliable operation with proper error handling
- Observable and debuggable system
- Easy deployment and configuration
- Test-driven development with high coverage

### Non-Goals
- Real-time streaming (polling is acceptable for MVP)
- Multi-cloud support (Azure-only for MVP)
- Advanced ML-based anomaly detection
- Custom notification channels beyond GitHub
- Historical analysis or trending
- User interface or dashboard

## Architectural Decisions

### 1. Language & Runtime: TypeScript + Node.js

**Decision**: Use TypeScript with Node.js runtime

**Rationale**:
- Strong typing reduces runtime errors
- Excellent Azure SDK and GitHub API support
- Rich ecosystem for testing and tooling
- Easy deployment and operations
- Team familiarity

**Alternatives Considered**:
- Python: Good SDK support but weaker typing
- Go: Better performance but steeper learning curve
- C#: Native Azure support but heavier runtime

**Trade-offs**:
- TypeScript requires compilation step
- Node.js single-threaded (acceptable for I/O-bound work)

### 2. Architecture Pattern: Modular Pipeline

**Decision**: Use modular pipeline architecture with dependency injection

**Components**:
```
Scheduler → LogFetcher → FailureDetector → DuplicateChecker → GitHubIssueCreator
                                                    ↓
                                            DuplicateCache
```

**Rationale**:
- Clear separation of concerns
- Easy to test each component independently
- Simple to understand and maintain
- Supports future extensibility

**Alternatives Considered**:
- Event-driven (Pub/Sub): Adds complexity for MVP
- Microservices: Overkill for single-purpose agent

### 3. Duplicate Detection: Hash-Based with In-Memory Cache

**Decision**: Generate hash from error signature (error code + message pattern + source) and store in LRU cache with optional disk persistence

**Hash Components**:
- Error type/code
- Normalized message (removing timestamps, IDs)
- Source location (file, function)
- Severity level

**Cache Strategy**:
- In-memory LRU cache (default 10,000 entries)
- Optional SQLite persistence for restarts
- TTL-based expiration (default 7 days)
- Size-based eviction (LRU)

**Rationale**:
- Simple and fast
- No external database dependency for MVP
- Handles cache eviction automatically
- Survives restarts with persistence option

**Alternatives Considered**:
- Database (PostgreSQL/Redis): Adds operational complexity
- GitHub issue search: Too slow, rate-limited
- Bloom filter: Can't handle updates/comments

**Trade-offs**:
- Memory usage grows with unique errors
- Hash collisions possible (use good hash function)
- Cache warmup needed after restart

### 4. Configuration: YAML with Schema Validation

**Decision**: Use YAML configuration files with runtime validation

**Configuration Structure**:
```yaml
azure:
  workspaceId: string
  clientId: string
  queryInterval: duration
  queryLookback: duration

detection:
  patterns:
    - type: error_code | keyword | regex
      pattern: string
      severity: critical | high | medium | low

github:
  owner: string
  repo: string
  token: env:GITHUB_TOKEN
  labels: string[]
  assignees: string[]

duplicate:
  cacheSize: number
  ttlDays: number
  persistPath: string (optional)

scheduler:
  pollInterval: duration
  healthCheckPort: number
```

**Rationale**:
- Human-readable and git-friendly
- Supports comments for documentation
- Easy to template for different environments
- Schema validation catches errors early

**Alternatives Considered**:
- JSON: Less readable, no comments
- Environment variables: Too many, hard to manage
- Database: Adds dependency

### 5. Error Handling: Circuit Breaker + Exponential Backoff

**Decision**: Implement circuit breaker for external APIs with exponential backoff

**Strategy**:
- Azure API failures: Retry with exponential backoff (max 5 retries)
- GitHub API failures: Circuit breaker (open after 5 failures, half-open after 60s)
- Unrecoverable errors: Log and continue to next polling cycle
- Critical failures: Alert and graceful shutdown

**Rationale**:
- Prevents cascading failures
- Respects rate limits
- Recovers from transient issues
- Maintains system stability

### 6. Testing Strategy: Test Pyramid

**Levels**:
1. **Unit Tests** (70%): All business logic, pure functions
2. **Integration Tests** (20%): Azure SDK, GitHub API with test credentials
3. **E2E Tests** (10%): Full workflow with test environment

**Tools**:
- Jest: Test framework
- Mock libraries: Unit test isolation
- Test containers: Integration tests (if needed)

**Coverage Target**: >90% line coverage, 100% critical path coverage

### 7. Deployment: Docker Container

**Decision**: Package as Docker container with docker-compose for local development

**Container Strategy**:
- Multi-stage build (build + runtime)
- Non-root user for security
- Health check endpoint
- Graceful shutdown handling
- Volume mount for configuration

**Rationale**:
- Consistent environment
- Easy deployment to any container platform
- Simplified dependencies
- Resource isolation

## Data Models

### Log Entry
```typescript
interface LogEntry {
  timestamp: Date;
  severity: 'error' | 'warning' | 'info';
  message: string;
  errorCode?: string;
  stackTrace?: string;
  source: {
    file?: string;
    function?: string;
    line?: number;
  };
  metadata: Record<string, any>;
}
```

### Failure
```typescript
interface Failure {
  id: string; // hash
  detectedAt: Date;
  severity: 'critical' | 'high' | 'medium' | 'low';
  errorType: string;
  message: string;
  source: string;
  stackTrace?: string;
  logs: LogEntry[];
  metadata: Record<string, any>;
}
```

### GitHub Issue Metadata
```typescript
interface IssueMetadata {
  failureId: string;
  firstSeen: Date;
  lastSeen: Date;
  occurrences: number;
  severity: string;
  errorType: string;
  source: string;
}
```

## Integration Points

### Azure Application Insights
- **API**: Logs Query API
- **Authentication**: DefaultAzureCredential (managed identity or service principal)
- **Query Language**: KQL (Kusto Query Language)
- **Rate Limits**: 200 requests/minute per workspace
- **Error Handling**: Retry with backoff

### GitHub API
- **API**: REST API v3 (via Octokit)
- **Authentication**: Personal Access Token or GitHub App
- **Rate Limits**: 5000 requests/hour (authenticated)
- **Error Handling**: Circuit breaker pattern

## Security Considerations

### Secrets Management
- GitHub token: Environment variable or secret manager
- Azure credentials: Managed identity (preferred) or service principal
- Never commit secrets to repository
- Use .env.example for documentation

### API Security
- Validate all external data
- Sanitize log data before creating issues
- Rate limit enforcement
- Use least-privilege credentials

### Operational Security
- Run as non-root user in container
- Read-only file system (except cache)
- Network policies for egress only
- Security scanning in CI/CD

## Performance Considerations

### Query Optimization
- Limit log query time range (default 5 minutes)
- Use KQL filters to reduce data transfer
- Batch processing when possible
- Cache Azure workspace metadata

### Memory Management
- LRU cache with size limits
- Stream large result sets
- Avoid loading all logs in memory
- Monitor memory usage

### Scalability (Future)
- Single instance sufficient for MVP
- Horizontal scaling: Partition by workspace
- Vertical scaling: Increase cache size

## Monitoring & Observability

### Metrics
- Logs processed per interval
- Failures detected
- Issues created
- Duplicate prevention hits
- API call latencies
- Error rates

### Logging
- Structured JSON logging
- Log levels: ERROR, WARN, INFO, DEBUG
- Request IDs for tracing
- Performance metrics

### Alerting
- Critical failures (unable to process logs)
- High error rates
- API rate limit exceeded
- Cache eviction rate high

## Migration Plan

N/A - This is a new system with no migration.

## Rollback Plan

1. Stop the agent container
2. Verify no in-flight operations
3. Optionally: Close any auto-created issues
4. Optionally: Restore previous monitoring approach

## Risks / Trade-offs

### Risk: GitHub API Rate Limiting
- **Impact**: Cannot create issues during rate limit
- **Mitigation**: Circuit breaker, exponential backoff, monitoring
- **Fallback**: Queue issues for later creation

### Risk: Azure Query Performance
- **Impact**: Slow log retrieval affects detection latency
- **Mitigation**: Optimize KQL queries, limit time range, pagination
- **Monitoring**: Track query duration

### Risk: False Positives
- **Impact**: Too many unnecessary issues
- **Mitigation**: Careful pattern configuration, severity levels, testing
- **Evolution**: Add pattern refinement based on feedback

### Risk: Memory Leaks
- **Impact**: Agent crashes or slows down
- **Mitigation**: LRU cache with limits, memory monitoring, load testing
- **Monitoring**: Memory usage metrics

### Trade-off: Polling vs Streaming
- **Decision**: Polling (simpler)
- **Consequence**: Detection latency (default 5 minutes)
- **Benefit**: Simpler architecture, easier error handling
- **Future**: Can add streaming if latency becomes critical

## Open Questions

1. **Q**: Should we support multiple Azure workspaces?
   **A**: Not in MVP. Single workspace is sufficient. Can extend later.

2. **Q**: What happens if GitHub repository is unavailable?
   **A**: Circuit breaker will prevent repeated failures. Issues are logged for manual creation.

3. **Q**: How do we handle configuration changes?
   **A**: Require restart for MVP. Future: hot reload with file watcher.

4. **Q**: Should we add a REST API for management?
   **A**: Not in MVP. Use Docker/systemd for control. Future enhancement if needed.

5. **Q**: What level of log data should be included in issues?
   **A**: Include sanitized stack trace, error message, and metadata. Exclude PII.

## Success Metrics

- **Reliability**: 99.9% uptime over 30 days
- **Accuracy**: Zero false negatives, <5% false positives
- **Duplicate Prevention**: 100% accuracy
- **Performance**: <1 minute detection latency (P95)
- **Test Coverage**: >90% line coverage
- **Operational**: <15 minutes deployment time

## Future Enhancements

- Multi-workspace support
- Custom notification channels (Slack, email)
- ML-based anomaly detection
- Historical trending and dashboards
- Issue lifecycle management (auto-close)
- Pattern learning from manual issue creation
- Real-time streaming instead of polling
- Multi-cloud support (AWS, GCP)
