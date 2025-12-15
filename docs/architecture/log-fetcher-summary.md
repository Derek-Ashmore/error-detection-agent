# Log Fetcher Architecture - Executive Summary

## Overview

The log-fetcher component is a critical service within the error-detection-agent system, responsible for reliably fetching log entries from Azure Application Insights. This document summarizes the architecture design, key decisions, and implementation approach.

## Design Artifacts Created

1. **TypeScript Interfaces** (`/src/log-fetcher/interfaces.ts`)
   - 25+ comprehensive interfaces covering all aspects of log fetching
   - Strongly-typed for compile-time safety
   - Detailed documentation for each interface

2. **Class Structures** (`/src/log-fetcher/classes.ts`)
   - 7 core classes with abstract method signatures
   - Component-based architecture for modularity
   - Factory pattern for easy instantiation

3. **Architecture Decision Record** (`/docs/architecture/log-fetcher-adr.md`)
   - 10 key architecture decisions documented
   - Rationale, alternatives, and trade-offs for each
   - Clear justification for technology choices

4. **Architecture Diagrams** (`/docs/architecture/log-fetcher-diagram.md`)
   - C4 model diagrams (Context, Container, Component)
   - Sequence diagrams for query execution flow
   - State machines for circuit breaker and rate limiter
   - Data flow and deployment architecture

5. **Technology Evaluation Matrix** (`/docs/architecture/log-fetcher-tech-evaluation.md`)
   - Comparative analysis of technology options
   - Recommendations with justification
   - Implementation phases and risk assessment

## Core Components

### 1. LogFetcherService (Orchestrator)
**Responsibility**: Coordinate all components to fetch logs

**Key Methods**:
- `initialize()` - Set up service with authentication and validation
- `fetchLogs()` - Fetch logs with retry and resilience
- `fetchLogsWithPagination()` - Handle large result sets
- `fetchLogsStreaming()` - Stream logs for very large queries
- `healthCheck()` - Verify service operational status
- `getMetrics()` - Retrieve performance metrics

### 2. AzureAuthenticator
**Responsibility**: Manage Azure authentication and credentials

**Key Methods**:
- `authenticate()` - Authenticate using DefaultAzureCredential
- `validateCredentials()` - Check credential validity
- `refreshCredentials()` - Refresh for long-running processes

**Authentication Strategy**:
- Primary: Managed Identity (production)
- Fallback: Service Principal (development)
- Uses DefaultAzureCredential for automatic fallback chain

### 3. KQLQueryBuilder
**Responsibility**: Construct optimized KQL queries

**Key Methods**:
- `buildQuery()` - Create time-ranged query
- `buildPaginatedQuery()` - Add pagination support
- `optimizeQuery()` - Apply performance optimizations
- `validateQuery()` - Ensure query is well-formed

**Query Strategy**:
- Parameterized to prevent injection
- Optimized with projections and filters
- Supports custom filters for flexibility

### 4. RateLimitHandler
**Responsibility**: Handle Azure API rate limits

**Key Methods**:
- `recordRateLimitEvent()` - Track 429 responses
- `shouldWait()` - Check if should delay request
- `waitForRetry()` - Wait with exponential backoff
- `getRetryDelay()` - Calculate next retry delay

**Algorithm**:
```
delay = min(initialDelay * (2 ^ attempt), maxDelay) * (1 + random(0, 0.3))
```

**Configuration**:
- Initial delay: 1000ms
- Max delay: 32000ms
- Max retries: 5
- Jitter: 30%

### 5. CircuitBreaker
**Responsibility**: Prevent cascading failures

**States**:
- **Closed**: Normal operation, track failures
- **Open**: Reject requests, wait for recovery
- **Half-Open**: Test if service recovered

**Thresholds**:
- Failure threshold: 5 consecutive failures
- Recovery timeout: 60 seconds
- Success threshold (half-open): 2 successes

### 6. LogEntryParser
**Responsibility**: Parse Azure logs to structured format

**Key Methods**:
- `parse()` - Parse single raw entry
- `parseBatch()` - Parse multiple entries efficiently
- `extractTimestamp()`, `extractSeverity()`, etc. - Field extraction

**Error Handling**:
- Never fail on malformed entries
- Log warnings for parse errors
- Track metrics for parse failures
- Preserve raw entry for debugging

### 7. LogFetcherFactory
**Responsibility**: Create configured service instances

**Key Methods**:
- `create()` - Create with defaults
- `createWithComponents()` - Create with custom components
- `createFromAppConfig()` - Create from application config

## Key Architecture Decisions

### 1. Component Composition Pattern
**Decision**: Use composition over inheritance

**Benefits**:
- Each component has single responsibility
- Easy to test with mocks
- Flexible to swap implementations
- Clear separation of concerns

### 2. Exponential Backoff with Jitter
**Decision**: Implement exponential backoff for rate limiting

**Benefits**:
- Compliant with Azure API guidelines
- Prevents thundering herd problem
- Adaptive to load conditions
- Bounded retry time with max delay

### 3. Circuit Breaker Pattern
**Decision**: Three-state circuit breaker for resilience

**Benefits**:
- Fail fast when service is down
- Automatic recovery testing
- Prevents resource exhaustion
- Enables graceful degradation

### 4. Streaming and Pagination
**Decision**: Support both modes for large result sets

**Benefits**:
- Memory efficient (>1000 entries)
- Progress tracking for observability
- Backpressure support in streaming
- Flexible for different use cases

### 5. Structured Error Handling
**Decision**: Use typed error objects with context

**Benefits**:
- Better debugging with request IDs
- Intelligent retry logic (retryable flag)
- Error metrics by type
- Distributed tracing support

## Technology Stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Azure SDK | @azure/monitor-query v1.2+ | Current, maintained, TypeScript support |
| Authentication | @azure/identity v4.0+ | DefaultAzureCredential best practice |
| Logging | pino v8.16+ | Fast, structured, Azure-compatible |
| Testing | jest v29.7+ | Comprehensive, Azure SDK examples |
| Circuit Breaker | Custom | Lightweight, tailored to needs |
| Rate Limiting | Custom | Azure API specific behavior |

## Data Flow

```
Configuration → LogFetcherFactory
    ↓
LogFetcherService.initialize()
    ↓
    ├─ AzureAuthenticator.authenticate()
    ├─ Validate configuration
    └─ Create LogsQueryClient
    ↓
LogFetcherService.fetchLogs()
    ↓
    ├─ CircuitBreaker.execute() → Check state
    ├─ RateLimitHandler.shouldWait() → Check rate limit
    ├─ KQLQueryBuilder.buildQuery() → Generate KQL
    ├─ LogsQueryClient.queryWorkspace() → Azure API call
    ├─ LogEntryParser.parseBatch() → Parse results
    └─ Update metrics
    ↓
Return QueryResult (entries, metadata, metrics)
```

## Error Handling Flow

```
Query Execution
    ↓
Circuit Breaker Check
    ├─ OPEN → Reject immediately
    └─ CLOSED/HALF-OPEN → Proceed
    ↓
Rate Limit Check
    ├─ Rate Limited → Wait with backoff
    └─ Not Limited → Proceed
    ↓
Execute Azure API Call
    ↓
    ├─ Success → Record success, reset counters
    ├─ 429 Rate Limit → Record event, calculate backoff, retry
    ├─ 503 Service Unavailable → Record failure, retry
    ├─ Timeout → Retry with smaller window
    └─ Other Error → Check if retryable, retry or fail
    ↓
Update Circuit Breaker State
Update Metrics
```

## Observability

### Metrics Tracked
- Query counts (total, successful, failed)
- Entry counts (fetched, parsed, parse errors)
- Timing (average, p95, p99 duration)
- Error rates by type
- Circuit breaker state transitions
- Rate limit events

### Logging Strategy
- Structured JSON logging with pino
- Request IDs for distributed tracing
- Authentication attempts (success/failure)
- Query execution details
- Parse errors with context
- Circuit breaker state changes

### Health Checks
- Authentication status
- Circuit breaker not open
- Recent query success (<10 min)
- Metrics collection active
- Rate limit state healthy

## Testing Strategy

### Unit Tests (>80% coverage)
- Mock all Azure SDK dependencies
- Test each component in isolation
- Verify error handling paths
- Boundary condition testing

### Integration Tests
- Real Azure Application Insights (dev)
- End-to-end authentication flow
- Rate limiting with actual responses
- Circuit breaker under load

### Performance Tests
- Query execution benchmarks
- Large result set memory usage
- Streaming performance
- Concurrent request handling

## Implementation Phases

### Phase 1: Core (Week 1-2)
- ✅ Interface and class definitions
- ⬜ Azure authentication
- ⬜ Query builder
- ⬜ Query execution
- ⬜ Log parsing

### Phase 2: Resilience (Week 2-3)
- ⬜ Rate limit handler
- ⬜ Circuit breaker
- ⬜ Retry logic
- ⬜ Error handling

### Phase 3: Scale (Week 3-4)
- ⬜ Pagination
- ⬜ Streaming
- ⬜ Metrics
- ⬜ Health checks

### Phase 4: Quality (Week 4)
- ⬜ Unit tests
- ⬜ Integration tests
- ⬜ Performance tests
- ⬜ Documentation

## Security Considerations

### Credential Management
- Never log credentials or tokens
- Use managed identity in production
- Store secrets in environment variables
- Rotate credentials regularly

### Query Safety
- Parameterize queries to prevent injection
- Validate time ranges
- 30-second query timeout
- Azure RBAC for workspace access

### Audit Trail
- Log all authentication attempts
- Track failed queries
- Include request IDs
- Sanitize sensitive data

## Performance Targets

| Metric | Target | Monitoring |
|--------|--------|-----------|
| Query Success Rate | >99.5% | Alert if <99% |
| Average Query Duration | <2s | Alert if >5s |
| Parse Error Rate | <1% | Alert if >5% |
| Rate Limit Events | <10/hour | Alert if >20/hour |
| Circuit Breaker Opens | 0 | Alert on any |
| Authentication Failures | 0 | Alert on any |

## Files Created

All architecture artifacts are stored in the repository:

```
/src/log-fetcher/
  ├── interfaces.ts          # TypeScript interfaces (25+)
  └── classes.ts             # Class structures (7 core classes)

/docs/architecture/
  ├── log-fetcher-adr.md              # Architecture Decision Record
  ├── log-fetcher-diagram.md          # Architecture diagrams (C4, sequence, state)
  ├── log-fetcher-tech-evaluation.md  # Technology evaluation matrix
  └── log-fetcher-summary.md          # This document
```

## Next Steps

1. **Review Architecture** - Stakeholder review of design decisions
2. **Implement Core** - Start with Phase 1 implementation
3. **Add Resilience** - Phase 2 circuit breaker and rate limiting
4. **Test Thoroughly** - Comprehensive test suite
5. **Deploy & Monitor** - Production deployment with observability

## Key Takeaways

✅ **Modular Design**: Component-based architecture for flexibility and testability

✅ **Resilience First**: Circuit breaker and rate limiting prevent cascading failures

✅ **Type Safety**: Comprehensive TypeScript interfaces for compile-time guarantees

✅ **Azure Best Practices**: DefaultAzureCredential, managed identity, recommended SDKs

✅ **Observability**: Comprehensive metrics, structured logging, health checks

✅ **Scalability**: Streaming and pagination for large result sets

✅ **Security**: Safe credential management, query parameterization, audit trails

## References

- Specification: `/openspec/changes/add-mvp-error-detection-agent/specs/log-fetcher/spec.md`
- Azure Monitor Query SDK: https://docs.microsoft.com/en-us/javascript/api/@azure/monitor-query
- DefaultAzureCredential: https://docs.microsoft.com/en-us/javascript/api/@azure/identity
- Circuit Breaker Pattern: https://martinfowler.com/bliki/CircuitBreaker.html
- Exponential Backoff: https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/

---

**Architecture Status**: ✅ Design Complete - Ready for Implementation

**Last Updated**: 2025-12-13

**Architect**: System Architecture Designer

**Stored in Swarm Memory**:
- `/swarm/architect/log-fetcher/interfaces`
- `/swarm/architect/log-fetcher/classes`
- `/swarm/architect/log-fetcher/adr`
- `/swarm/architect/log-fetcher/diagrams`
