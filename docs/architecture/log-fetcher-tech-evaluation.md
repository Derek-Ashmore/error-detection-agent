# Log Fetcher Component - Technology Evaluation Matrix

## Executive Summary

This document evaluates technology choices for the log-fetcher component, analyzing Azure SDK versions, authentication methods, query approaches, and resilience patterns.

## Azure SDK Evaluation

### @azure/monitor-query vs. @azure/loganalytics

| Criteria | @azure/monitor-query | @azure/loganalytics | Decision |
|----------|---------------------|---------------------|----------|
| **Status** | ✅ Current, actively maintained | ⚠️ Deprecated (legacy) | **monitor-query** |
| **TypeScript Support** | ✅ Full TypeScript, strong typing | ⚠️ Limited type definitions | **monitor-query** |
| **API Design** | ✅ Modern, promise-based | ❌ Older callback patterns | **monitor-query** |
| **Authentication** | ✅ @azure/identity integration | ❌ Manual credential handling | **monitor-query** |
| **Features** | ✅ Batch queries, resource queries | ⚠️ Basic query only | **monitor-query** |
| **Performance** | ✅ Optimized for Azure ARM | ⚠️ Older REST API | **monitor-query** |
| **Documentation** | ✅ Comprehensive, up-to-date | ⚠️ Outdated | **monitor-query** |
| **Bundle Size** | ✅ ~250KB (tree-shakeable) | ⚠️ ~180KB (older deps) | **monitor-query** |
| **Azure SDK Guidelines** | ✅ Follows latest guidelines | ❌ Pre-guidelines version | **monitor-query** |

**Recommendation**: Use `@azure/monitor-query@^1.2.0` (latest stable)

**Rationale**:
- Official Microsoft recommendation for new projects
- Better TypeScript support for type safety
- Integrated with modern @azure/identity
- Long-term support and active development
- Aligns with Azure SDK design guidelines

## Authentication Method Evaluation

### DefaultAzureCredential vs. Specific Credential Types

| Criteria | DefaultAzureCredential | ServicePrincipalCredential | ManagedIdentityCredential | Decision |
|----------|----------------------|---------------------------|--------------------------|----------|
| **Flexibility** | ✅ Tries multiple methods | ❌ Single method only | ❌ Single method only | **DefaultAzure** |
| **Local Dev** | ✅ Works with Azure CLI | ❌ Requires SP config | ❌ Fails locally | **DefaultAzure** |
| **Production** | ✅ Uses managed identity | ✅ Explicit credentials | ✅ Managed identity | **DefaultAzure** |
| **Security** | ✅ Best practice fallback | ⚠️ Manual credential management | ✅ No credential storage | **DefaultAzure** |
| **Configuration** | ✅ Minimal config needed | ❌ Requires all SP fields | ✅ No config needed | **DefaultAzure** |
| **Debugging** | ⚠️ Harder to diagnose failures | ✅ Clear error messages | ✅ Clear error messages | Specific types |
| **Testability** | ⚠️ Harder to mock | ✅ Easy to mock | ✅ Easy to mock | Specific types |

**Recommendation**: Use `DefaultAzureCredential` with logging

**Rationale**:
- Works seamlessly across development and production environments
- Recommended by Azure SDK team
- Automatic fallback chain: Managed Identity → Service Principal → Azure CLI → Interactive
- Reduces configuration complexity
- Mitigate debugging concerns with detailed logging

**Implementation**:
```typescript
const credential = new DefaultAzureCredential({
  managedIdentityClientId: config.clientId, // Optional: specify MI to use
  tenantId: config.tenantId,
  loggingOptions: {
    allowLoggingAccountIdentifiers: true,
    logger: customLogger // Log authentication attempts
  }
});
```

## Query Execution Approach

### Direct KQL Strings vs. Query Builder vs. Type-Safe Query API

| Criteria | Direct KQL Strings | Query Builder Class | Type-Safe Query API | Decision |
|----------|-------------------|--------------------|--------------------|----------|
| **Flexibility** | ✅ Full KQL power | ⚠️ Limited by builder | ❌ Restricted to supported operations | **Query Builder** |
| **Type Safety** | ❌ No compile-time checks | ⚠️ Partial type safety | ✅ Full type safety | Type-Safe API |
| **Testability** | ❌ Hard to validate | ✅ Easy to test | ✅ Easy to test | **Query Builder** |
| **Injection Safety** | ❌ Vulnerable if not careful | ✅ Parameterized by design | ✅ Parameterized by design | **Query Builder** |
| **Optimization** | ❌ Manual optimization | ✅ Built-in optimization | ✅ Built-in optimization | **Query Builder** |
| **Learning Curve** | ⚠️ Requires KQL knowledge | ✅ Guided API | ✅ Intuitive API | Type-Safe API |
| **Debugging** | ✅ See exact query | ✅ Can preview query | ⚠️ Generated query harder to inspect | **Query Builder** |
| **Extensibility** | ✅ Add any KQL features | ⚠️ Need to extend builder | ❌ Limited to API features | **Query Builder** |

**Recommendation**: Use Query Builder class with KQL string fallback

**Rationale**:
- Centralize query construction logic for consistency
- Enable query optimization (projections, filters)
- Prevent KQL injection vulnerabilities
- Allow testing queries independently of execution
- Provide escape hatch for advanced KQL when needed

**Implementation**:
```typescript
class KQLQueryBuilder {
  buildQuery(startTime: Date, endTime: Date): string {
    // Generate optimized KQL with parameterized values
    const filters = [
      this.buildTimeRangeFilter(startTime, endTime),
      this.buildSeverityFilter(),
      ...this.config.customFilters || []
    ];

    return `
      ${this.config.tableName || 'traces'}
      | where ${filters.join(' and ')}
      | project timestamp, severityLevel, message, customDimensions, operation_Id
      | limit ${this.config.maxResults}
    `;
  }

  // Escape hatch for custom queries
  buildCustomQuery(template: string, params: Record<string, unknown>): string {
    return this.parameterizeQuery(template, params);
  }
}
```

## Retry Strategy Evaluation

### Exponential Backoff vs. Linear Backoff vs. Constant Delay

| Criteria | Exponential Backoff | Linear Backoff | Constant Delay | Decision |
|----------|--------------------|--------------|--------------|---------|
| **Rate Limit Handling** | ✅ Best for API rate limits | ⚠️ OK but slower recovery | ❌ Can worsen rate limiting | **Exponential** |
| **Server Overload** | ✅ Reduces load exponentially | ⚠️ Slow load reduction | ❌ Maintains high load | **Exponential** |
| **Thundering Herd** | ⚠️ Needs jitter | ⚠️ Needs jitter | ❌ Severe thundering herd | **Exponential + Jitter** |
| **Recovery Time** | ⚠️ Can be slow for transient errors | ✅ Predictable timing | ✅ Fast for transient errors | Linear/Constant |
| **Azure Recommendations** | ✅ Recommended by Azure | ⚠️ Not standard | ❌ Not recommended | **Exponential** |
| **Implementation Complexity** | ⚠️ Moderate | ✅ Simple | ✅ Very simple | Constant |

**Recommendation**: Exponential backoff with jitter and max retry cap

**Algorithm**:
```
delay = min(
  initialDelay * (2 ^ attempt),
  maxDelay
) * (1 + random(0, 0.3))
```

**Configuration**:
- Initial delay: 1000ms
- Max delay: 32000ms (32 seconds)
- Max retries: 5
- Jitter factor: 30%

**Rationale**:
- Recommended by Azure SDK team and industry best practices
- Effectively handles rate limiting and server overload
- Jitter prevents synchronized retries across multiple instances
- Max retry cap prevents infinite loops
- Max delay cap ensures bounded retry time

## Pagination Strategy Evaluation

### Continuation Token vs. Skip/Take vs. Cursor-based

| Criteria | Continuation Token | Skip/Take | Cursor-based | Decision |
|----------|-------------------|-----------|--------------|----------|
| **Azure Support** | ✅ Native support | ❌ Not supported in KQL | ❌ Not supported | **Continuation** |
| **Performance** | ✅ Efficient, stateful | ❌ Poor for large offsets | ✅ Efficient | **Continuation** |
| **Consistency** | ✅ Consistent results | ❌ Results can shift | ✅ Consistent results | **Continuation** |
| **Implementation** | ✅ Built into SDK | ❌ Manual implementation | ❌ Manual implementation | **Continuation** |
| **Memory Usage** | ✅ Low (streaming possible) | ⚠️ Needs full result set | ✅ Low | **Continuation** |

**Recommendation**: Use Azure SDK continuation tokens

**Rationale**:
- Native support in @azure/monitor-query
- Efficient and consistent pagination
- Handles large result sets without performance degradation
- Built-in support for streaming

**Implementation**:
```typescript
async fetchLogsWithPagination(
  startTime: Date,
  endTime: Date,
  onPage: (result: QueryResult) => Promise<void>
): Promise<number> {
  let continuationToken: string | undefined;
  let totalFetched = 0;

  do {
    const result = await this.fetchLogs(startTime, endTime, {
      continuationToken
    });

    await onPage(result);
    totalFetched += result.entries.length;
    continuationToken = result.continuationToken;

  } while (continuationToken);

  return totalFetched;
}
```

## Circuit Breaker Implementation

### Polly (C#) vs. Opossum (Node.js) vs. Custom Implementation

| Criteria | Polly (C#) | Opossum | Custom Implementation | Decision |
|----------|-----------|---------|----------------------|----------|
| **Language** | ❌ C# only | ✅ Node.js/TypeScript | ✅ TypeScript | **Opossum or Custom** |
| **Features** | ✅ Comprehensive | ✅ Full circuit breaker | ⚠️ Depends on implementation | Opossum |
| **Maturity** | ✅ Battle-tested | ✅ Well-established | ❌ Untested | **Opossum** |
| **Bundle Size** | N/A | ⚠️ ~50KB | ✅ Minimal | Custom |
| **Customization** | ⚠️ Limited | ⚠️ Limited | ✅ Full control | **Custom** |
| **Testing** | ✅ Well-tested | ✅ Well-tested | ⚠️ Need to test | Opossum |
| **Dependencies** | N/A | ⚠️ Adds dependency | ✅ No dependencies | **Custom** |
| **Documentation** | ✅ Excellent | ✅ Good | ⚠️ Self-documented | Opossum |

**Recommendation**: Custom implementation for this project

**Rationale**:
- Requirements are straightforward (closed/open/half-open states)
- Full control over behavior and metrics integration
- No additional dependencies
- Easier to integrate with existing logging and metrics
- Educational value for team understanding
- Lightweight implementation (~200 LOC)

**If using library**: Choose `opossum` for Node.js projects requiring advanced features

## Logging Framework Evaluation

### Winston vs. Pino vs. console.log

| Criteria | Winston | Pino | console.log | Decision |
|----------|---------|------|------------|----------|
| **Performance** | ⚠️ Moderate | ✅ Very fast (async) | ✅ Fast (sync) | **Pino** |
| **Structured Logging** | ✅ Full support | ✅ Full support | ❌ String only | **Pino/Winston** |
| **TypeScript Support** | ✅ Good types | ✅ Excellent types | ✅ Built-in | **Pino** |
| **Transports** | ✅ Many available | ✅ Via pino-pretty, etc. | ❌ Console only | Winston/Pino |
| **JSON Output** | ✅ Supported | ✅ Default format | ❌ Not supported | **Pino** |
| **Bundle Size** | ⚠️ ~180KB | ✅ ~15KB | ✅ 0KB (built-in) | **Pino** |
| **Learning Curve** | ⚠️ Moderate | ✅ Simple | ✅ None | console.log |
| **Azure Integration** | ✅ Can integrate | ✅ Can integrate | ⚠️ Manual | Pino/Winston |

**Recommendation**: Use Pino for production, with structured logging

**Rationale**:
- Excellent performance with async logging
- Native JSON output (ideal for Azure Monitor)
- Low overhead and small bundle size
- Great TypeScript support
- Structured logging for better observability
- Easy integration with Application Insights

**Configuration**:
```typescript
import pino from 'pino';

const logger = pino({
  level: config.logging.level,
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  // Azure Application Insights compatible
  serializers: {
    err: pino.stdSerializers.err,
  }
});
```

## Metrics Collection Strategy

### OpenTelemetry vs. Custom Metrics vs. Azure Monitor SDK

| Criteria | OpenTelemetry | Custom Metrics | Azure Monitor SDK | Decision |
|----------|--------------|---------------|------------------|----------|
| **Vendor Lock-in** | ✅ Vendor-neutral | ✅ Full control | ❌ Azure-specific | **OpenTelemetry** |
| **Azure Integration** | ✅ Via exporters | ⚠️ Manual | ✅ Native | Azure Monitor |
| **Standards** | ✅ Industry standard | ❌ Custom | ⚠️ Azure-specific | **OpenTelemetry** |
| **Overhead** | ⚠️ Moderate | ✅ Minimal | ⚠️ Moderate | Custom |
| **Features** | ✅ Comprehensive | ⚠️ Basic | ✅ Azure-specific features | **OpenTelemetry** |
| **Learning Curve** | ⚠️ Moderate | ✅ Minimal | ⚠️ Azure-specific | Custom |
| **Future-proof** | ✅ Standard evolving | ⚠️ Manual updates | ⚠️ Vendor-dependent | **OpenTelemetry** |

**Recommendation**: Start with custom metrics, migrate to OpenTelemetry later

**Phase 1 (MVP)**: Simple custom metrics
```typescript
interface LogFetcherMetrics {
  totalQueries: number;
  successfulQueries: number;
  failedQueries: number;
  averageQueryDurationMs: number;
  // ... other metrics
}
```

**Phase 2 (Future)**: OpenTelemetry integration
- Vendor-neutral metrics and tracing
- Better ecosystem integration
- More advanced observability features

**Rationale**:
- Start simple to meet MVP requirements
- Avoid premature optimization
- Easy to migrate to OpenTelemetry later
- Custom metrics sufficient for initial phase

## Testing Framework

### Jest vs. Mocha/Chai vs. Vitest

| Criteria | Jest | Mocha/Chai | Vitest | Decision |
|----------|------|-----------|--------|----------|
| **TypeScript Support** | ✅ Via ts-jest | ⚠️ Requires setup | ✅ Native | **Vitest/Jest** |
| **Performance** | ⚠️ Moderate | ⚠️ Moderate | ✅ Very fast (Vite) | **Vitest** |
| **Mocking** | ✅ Built-in | ❌ Requires sinon | ✅ Built-in | **Vitest/Jest** |
| **Matchers** | ✅ Comprehensive | ✅ Via chai | ✅ Jest-compatible | **Vitest/Jest** |
| **Coverage** | ✅ Built-in | ⚠️ Requires nyc | ✅ Built-in | **Vitest/Jest** |
| **Community** | ✅ Very large | ✅ Large | ⚠️ Growing | **Jest** |
| **Watch Mode** | ✅ Good | ⚠️ Basic | ✅ Excellent | **Vitest** |
| **Azure SDK Mocking** | ✅ Well-documented | ⚠️ Manual | ✅ Jest-compatible | **Jest/Vitest** |

**Recommendation**: Use Jest for this project

**Rationale**:
- Already used by many Azure SDK projects
- Excellent TypeScript support
- Built-in mocking for Azure SDK clients
- Large community with Azure examples
- Comprehensive documentation
- Good integration with CI/CD

**Alternative**: Vitest is excellent if using Vite build system

## Technology Stack Summary

### Final Recommendations

| Component | Technology | Version | Rationale |
|-----------|-----------|---------|-----------|
| **Azure SDK** | @azure/monitor-query | ^1.2.0 | Current, maintained, TypeScript support |
| **Authentication** | @azure/identity | ^4.0.0 | DefaultAzureCredential, best practices |
| **Logging** | pino | ^8.16.0 | Fast, structured, Azure-compatible |
| **Testing** | jest | ^29.7.0 | Comprehensive, Azure SDK examples |
| **TypeScript** | typescript | ^5.3.0 | Latest stable, strict mode |
| **Circuit Breaker** | Custom | N/A | Lightweight, tailored to requirements |
| **Rate Limiting** | Custom | N/A | Specific to Azure API behavior |
| **Metrics** | Custom → OpenTelemetry | Future | Start simple, evolve to standard |

## Implementation Priorities

### Phase 1: Core Functionality (Week 1-2)
1. ✅ Interface and class definitions
2. ⬜ Azure authentication with DefaultAzureCredential
3. ⬜ KQL query builder
4. ⬜ Basic query execution
5. ⬜ Log entry parsing

### Phase 2: Resilience (Week 2-3)
1. ⬜ Rate limit handler with exponential backoff
2. ⬜ Circuit breaker implementation
3. ⬜ Retry logic integration
4. ⬜ Error handling and classification

### Phase 3: Scale & Observability (Week 3-4)
1. ⬜ Pagination support
2. ⬜ Streaming mode
3. ⬜ Metrics collection
4. ⬜ Structured logging
5. ⬜ Health checks

### Phase 4: Testing & Documentation (Week 4)
1. ⬜ Unit tests (>80% coverage)
2. ⬜ Integration tests with Azure
3. ⬜ Performance benchmarks
4. ⬜ API documentation
5. ⬜ Runbooks and troubleshooting guides

## Risk Assessment

### High Risk Items
1. **Azure API Rate Limits**: Mitigated by backoff and circuit breaker
2. **Authentication Failures**: Mitigated by retry logic and detailed logging
3. **Large Result Sets**: Mitigated by streaming and pagination
4. **Network Failures**: Mitigated by circuit breaker and retries

### Medium Risk Items
1. **Schema Changes**: Monitor Azure API for breaking changes
2. **Performance**: Benchmark and optimize query construction
3. **Memory Leaks**: Careful management of result streaming

### Low Risk Items
1. **TypeScript Compilation**: Well-defined types minimize runtime errors
2. **Test Coverage**: Comprehensive testing strategy planned

## Conclusion

This technology evaluation supports the architecture decisions documented in the ADR. The chosen stack balances:

- **Maturity**: Use proven, well-maintained libraries
- **Performance**: Optimize for production workloads
- **Maintainability**: TypeScript, testing, clear architecture
- **Azure Integration**: Native SDK support, best practices
- **Future-proofing**: Standards-based where possible, extensible design

The phased implementation approach minimizes risk while delivering value incrementally.
