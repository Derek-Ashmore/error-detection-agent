# Architecture Decision Record: Log Fetcher Component

## Status
Proposed

## Context
The error-detection-agent system requires a reliable, scalable component to fetch log entries from Azure Application Insights. The component must handle authentication, query execution, rate limiting, resilience patterns, and log parsing while maintaining high availability and observability.

## Key Requirements
1. Authenticate with Azure using DefaultAzureCredential (managed identity or service principal)
2. Execute KQL queries with time-range filtering
3. Handle Azure API rate limits (429 responses) with exponential backoff
4. Implement circuit breaker for service unavailability (503 errors)
5. Parse log entries gracefully, handling incomplete or malformed data
6. Support pagination and streaming for large result sets (>1000 entries)
7. Provide comprehensive observability (metrics, logging, tracing)

## Architecture Decisions

### 1. Component Composition Pattern

**Decision**: Use composition over inheritance with specialized components

**Rationale**:
- **Single Responsibility**: Each component (Authenticator, QueryBuilder, RateLimitHandler, CircuitBreaker, Parser) has one clear purpose
- **Testability**: Components can be tested in isolation with mock dependencies
- **Flexibility**: Components can be swapped or customized without affecting others
- **Maintainability**: Changes to one component don't ripple through the system

**Alternatives Considered**:
- Monolithic service class: Rejected due to poor testability and high coupling
- Inheritance hierarchy: Rejected due to inflexibility and fragile base class problems

**Trade-offs**:
- ✅ Better testability, modularity, and maintainability
- ❌ More classes and interfaces to manage
- ❌ Slightly more complex initialization

### 2. Azure Authentication Strategy

**Decision**: Support both managed identity and service principal with DefaultAzureCredential

**Rationale**:
- **Security**: Managed identity is preferred for production (no credential storage)
- **Flexibility**: Service principal supports local development and non-Azure environments
- **Azure Best Practice**: DefaultAzureCredential follows Azure SDK recommended pattern
- **Fallback Chain**: Automatically tries multiple authentication methods

**Implementation**:
```typescript
class AzureAuthenticator {
  authenticate() {
    // Try in order: Managed Identity → Service Principal → Other methods
    return new DefaultAzureCredential({
      managedIdentityClientId: config.clientId,
      tenantId: config.tenantId,
    });
  }
}
```

**Trade-offs**:
- ✅ Secure by default with managed identity
- ✅ Works in multiple environments
- ❌ Requires proper Azure RBAC configuration

### 3. Rate Limiting with Exponential Backoff and Jitter

**Decision**: Implement exponential backoff with jitter for rate limit handling

**Rationale**:
- **Azure API Compliance**: Respects Retry-After headers from 429 responses
- **Thundering Herd Prevention**: Jitter prevents all clients retrying simultaneously
- **Adaptive Behavior**: Increases polling interval after consecutive rate limit errors
- **Observability**: Tracks and logs all rate limit events

**Algorithm**:
```
delay = min(
  initialDelay * (backoffMultiplier ^ attempt),
  maxDelay
) * (1 + random(0, jitterFactor))
```

**Trade-offs**:
- ✅ Prevents service overload and cascading failures
- ✅ Compliant with Azure API guidelines
- ❌ Can introduce longer wait times during high load

### 4. Circuit Breaker Pattern for Resilience

**Decision**: Three-state circuit breaker (Closed → Open → Half-Open)

**Rationale**:
- **Fail Fast**: Prevents wasted API calls when service is down
- **Automatic Recovery**: Periodically tests service availability
- **Resource Protection**: Prevents cascade failures to downstream systems
- **Operational Continuity**: System continues other operations while waiting for recovery

**State Transitions**:
- **Closed → Open**: After N consecutive failures (N=5)
- **Open → Half-Open**: After recovery timeout (60 seconds)
- **Half-Open → Closed**: After M successful calls (M=2)
- **Half-Open → Open**: On any failure during testing

**Trade-offs**:
- ✅ Prevents cascading failures
- ✅ Enables graceful degradation
- ❌ May reject requests during recovery testing
- ❌ Requires tuning of thresholds

### 5. Separation of Query Construction and Execution

**Decision**: KQLQueryBuilder class independent of query execution

**Rationale**:
- **Reusability**: Queries can be previewed, logged, or tested separately
- **Security**: Centralized query construction prevents KQL injection
- **Optimization**: Query optimization logic is isolated and composable
- **Debugging**: Queries can be logged before execution for troubleshooting

**Pattern**:
```typescript
const query = queryBuilder.buildQuery(startTime, endTime);
logger.debug('Executing KQL query:', query);
const result = await client.queryWorkspace(workspaceId, query);
```

**Trade-offs**:
- ✅ Better testability and debugging
- ✅ Centralized query optimization
- ❌ Additional abstraction layer

### 6. Streaming and Pagination for Large Result Sets

**Decision**: Support both pagination and streaming modes

**Rationale**:
- **Memory Efficiency**: Prevents loading all results in memory (>1000 entries)
- **Progress Tracking**: Enables observability for long-running queries
- **Backpressure**: Streaming mode allows consumer to control flow
- **Flexibility**: Different modes for different use cases

**Implementation Modes**:
1. **Standard**: Fetch all results, return array (for small result sets)
2. **Pagination**: Fetch pages sequentially, invoke callback per page
3. **Streaming**: Fetch and process entries one-by-one with backpressure

**Trade-offs**:
- ✅ Handles large result sets efficiently
- ✅ Provides progress visibility
- ❌ More complex API surface
- ❌ Callback-based APIs can be harder to debug

### 7. Graceful Log Entry Parsing

**Decision**: Never fail on incomplete or malformed log entries

**Rationale**:
- **Resilience**: One bad log entry shouldn't stop processing
- **Data Quality**: Azure logs may have inconsistent schemas
- **Observability**: Track parse errors for monitoring and alerting
- **Auditability**: Preserve raw entries for investigation

**Error Handling**:
- Log warning for malformed entries
- Increment parse error counter in metrics
- Continue processing remaining entries
- Store raw entry in LogEntry.rawEntry for debugging

**Trade-offs**:
- ✅ Robust against schema changes
- ✅ Maintains system availability
- ❌ May silently drop useful log data if not monitored

### 8. Comprehensive Metrics and Observability

**Decision**: Track detailed metrics for all operations

**Rationale**:
- **Operations**: Enable monitoring, alerting, and SLA tracking
- **Debugging**: Provide context for troubleshooting issues
- **Capacity Planning**: Track query durations and volumes
- **Health Checks**: Support automated health monitoring

**Metrics Tracked**:
- Query counts (total, successful, failed)
- Entry counts (fetched, parsed, parse errors)
- Timing (average duration, p95, p99)
- Error rates (by type)
- Circuit breaker state transitions
- Rate limit events

**Trade-offs**:
- ✅ Excellent observability and debugging
- ✅ Enables proactive monitoring
- ❌ Slight performance overhead for metrics collection
- ❌ Requires metrics backend for full value

### 9. Structured Error Handling

**Decision**: Use strongly-typed error objects with context

**Rationale**:
- **Debugging**: Rich error context aids troubleshooting
- **Retry Logic**: Errors marked as retryable or non-retryable
- **Observability**: Errors include request IDs for distributed tracing
- **Type Safety**: Compile-time checking of error types

**Error Structure**:
```typescript
interface LogFetcherError {
  type: LogFetcherErrorType;
  message: string;
  originalError?: Error;
  requestId?: string;
  context?: Record<string, unknown>;
  retryable: boolean;
}
```

**Trade-offs**:
- ✅ Better debugging and error analysis
- ✅ Enables intelligent retry logic
- ❌ More verbose error handling code

### 10. Factory Pattern for Service Creation

**Decision**: Provide LogFetcherFactory for service instantiation

**Rationale**:
- **Simplicity**: Hide complex dependency wiring from consumers
- **Defaults**: Provide sensible default implementations
- **Flexibility**: Allow custom component injection for advanced use cases
- **Configuration**: Support creating service from AppConfig

**Usage**:
```typescript
// Simple usage with defaults
const fetcher = LogFetcherFactory.create(config);

// Advanced usage with custom components
const fetcher = LogFetcherFactory.createWithComponents(config, {
  rateLimitHandler: new CustomRateLimitHandler(customConfig)
});
```

**Trade-offs**:
- ✅ Easy to use for common cases
- ✅ Flexible for advanced scenarios
- ❌ Additional abstraction to understand

## Component Interaction Flow

```
Client Request
    ↓
LogFetcherService.fetchLogs()
    ↓
    ├─→ CircuitBreaker.execute()
    │       ↓
    │   [Check State: Closed/Open/Half-Open]
    │       ↓
    │   [If Open: Reject Request]
    │       ↓
    ├─→ RateLimitHandler.shouldWait()
    │       ↓
    │   [Calculate Backoff if Rate Limited]
    │       ↓
    ├─→ AzureAuthenticator.getCredential()
    │       ↓
    │   [Return Cached or Refresh Credential]
    │       ↓
    ├─→ KQLQueryBuilder.buildQuery()
    │       ↓
    │   [Generate Optimized KQL Query]
    │       ↓
    ├─→ LogsQueryClient.queryWorkspace()
    │       ↓
    │   [Execute Query Against Azure]
    │       ↓
    │   [Handle Errors: 429, 503, Timeout]
    │       ↓
    ├─→ LogEntryParser.parseBatch()
    │       ↓
    │   [Parse Raw Entries to LogEntry[]]
    │       ↓
    └─→ Return QueryResult
            ↓
        Update Metrics
```

## Performance Considerations

### Query Optimization
- Project only required fields in KQL queries
- Use time-range filters to minimize data scanned
- Leverage Azure indexes (timestamp, severity level)
- Set appropriate batch sizes (default: 1000)

### Memory Management
- Stream results for large queries (>1000 entries)
- Use pagination to avoid loading all data
- Clear parsed entry cache periodically
- Monitor heap usage in metrics

### Network Efficiency
- Reuse LogsQueryClient instance (connection pooling)
- Compress query requests if supported
- Use Azure SDK built-in retry policies
- Enable HTTP/2 for multiplexing

## Security Considerations

### Credential Management
- Never log credentials or tokens
- Use managed identity in production
- Store service principal secrets in environment variables
- Rotate credentials regularly

### Query Safety
- Parameterize query inputs to prevent injection
- Validate time ranges to prevent excessive data access
- Limit maximum query duration (30s timeout)
- Restrict workspace access via Azure RBAC

### Observability
- Log all authentication attempts (success/failure)
- Track failed query attempts for security monitoring
- Include request IDs for audit trails
- Sanitize sensitive data in logs

## Testing Strategy

### Unit Tests
- Mock all external dependencies (Azure SDK, credentials)
- Test each component in isolation
- Verify error handling paths
- Test boundary conditions (empty results, max retries, etc.)

### Integration Tests
- Test against real Azure Application Insights (dev environment)
- Verify authentication flow end-to-end
- Test rate limiting with actual API responses
- Validate circuit breaker behavior under load

### Performance Tests
- Benchmark query execution times
- Test memory usage with large result sets
- Verify streaming performance
- Load test with concurrent requests

## Migration Path

### Phase 1: Core Implementation
1. Implement interfaces and base classes
2. Create default implementations
3. Add comprehensive unit tests
4. Validate against specification

### Phase 2: Azure Integration
1. Integrate Azure SDK
2. Implement authentication
3. Add query execution
4. Test against dev Azure workspace

### Phase 3: Resilience Features
1. Implement rate limiting
2. Add circuit breaker
3. Add retry logic
4. Load test resilience

### Phase 4: Observability
1. Add metrics collection
2. Implement health checks
3. Add structured logging
4. Create dashboards

## Monitoring and Alerting

### Key Metrics to Monitor
- **Query Success Rate**: > 99.5% target
- **Average Query Duration**: < 2s target
- **Rate Limit Events**: Alert if > 10 per hour
- **Circuit Breaker Opens**: Alert on any occurrence
- **Parse Error Rate**: < 1% target
- **Authentication Failures**: Alert on any occurrence

### Health Check Indicators
- Authentication status: Valid credential
- Circuit breaker state: Not open
- Recent query success: Within last 10 minutes
- Metrics collection: Active
- Rate limit state: Not in consecutive failure mode

## Future Enhancements

### Potential Improvements
1. **Query Result Caching**: Cache recent queries to reduce API calls
2. **Adaptive Polling**: Adjust query interval based on error rate
3. **Multi-Workspace Support**: Query multiple workspaces in parallel
4. **Custom Metrics Export**: Export metrics to Azure Monitor
5. **Query Optimizer**: Analyze and optimize expensive queries
6. **Predictive Rate Limiting**: Predict and prevent rate limit hits

### Technical Debt to Address
- None currently (greenfield implementation)

## Conclusion

This architecture provides a robust, scalable, and maintainable solution for fetching logs from Azure Application Insights. The component-based design enables testing, customization, and evolution while the resilience patterns ensure high availability and graceful degradation under failure conditions.

The design balances complexity with maintainability, providing simple APIs for common use cases while supporting advanced scenarios through customization. Comprehensive observability enables operational excellence and rapid issue resolution.

## References

- Azure Monitor Query SDK: https://docs.microsoft.com/en-us/javascript/api/@azure/monitor-query
- Azure DefaultAzureCredential: https://docs.microsoft.com/en-us/javascript/api/@azure/identity
- KQL Language Reference: https://docs.microsoft.com/en-us/azure/data-explorer/kusto/query/
- Circuit Breaker Pattern: https://martinfowler.com/bliki/CircuitBreaker.html
- Exponential Backoff: https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
