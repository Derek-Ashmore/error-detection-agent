# Integration Tests Setup Guide

## Overview

This project includes integration tests for the log-fetcher module that test against real Azure Application Insights resources. These tests validate the actual functionality of the code with real Azure services.

## Types of Tests

### Unit Tests
- Located in `tests/log-fetcher/*.test.ts`
- Mock Azure SDK calls
- Run with: `npm test`
- Fast execution (< 5 seconds)

### Integration Tests
- Located in `tests/log-fetcher/integration/*.integration.test.ts`
- Use real Azure credentials
- Test actual Azure connectivity
- Run with: `npm run test:integration`
- Slower execution (30-60 seconds)

## Local Development Setup

### Prerequisites

1. **Azure Service Principal** with access to Log Analytics workspace
2. **Azure Workspace ID** for Application Insights

### Environment Configuration

1. Copy the example environment file:
   ```bash
   cp .env.test.example .env.test
   ```

2. Fill in your Azure credentials in `.env.test`:
   ```env
   AZURE_TENANT_ID=your-tenant-id
   AZURE_CLIENT_ID=your-client-id
   AZURE_CLIENT_SECRET=your-client-secret
   AZURE_SUBSCRIPTION_ID=your-subscription-id
   AZURE_WORKSPACE_ID=your-workspace-id
   ```

3. **IMPORTANT**: Never commit `.env.test` to version control!

### Running Tests Locally

```bash
# Unit tests only (mocked, no Azure required)
npm test

# Integration tests only (requires Azure credentials)
npm run test:integration

# All tests
npm run test:all

# Unit tests with coverage
npm run test:coverage
```

## GitHub Actions / CI Setup

### Required Secrets

Configure the following secrets in your GitHub repository settings:

1. `AZURE_TENANT_ID` - Your Azure tenant ID
2. `AZURE_CLIENT_ID` - Service principal client ID
3. `AZURE_CLIENT_SECRET` - Service principal client secret
4. `AZURE_SUBSCRIPTION_ID` - Your Azure subscription ID
5. `AZURE_WORKSPACE_ID` - Log Analytics workspace ID

### Setting Up Secrets

1. Go to: `https://github.com/YOUR_USERNAME/YOUR_REPO/settings/secrets/actions`
2. Click "New repository secret"
3. Add each secret listed above

### Workflow Behavior

- **Pull Requests**: Both unit and integration tests run automatically
- **Unit Tests**: Always run, fail fast if errors detected
- **Integration Tests**: Run with Azure credentials from secrets
- **Coverage Reports**: Posted as PR comments

## Integration Test Coverage

The integration tests provide coverage for:

1. **Azure Authentication**
   - Service principal authentication
   - Credential caching
   - Token refresh

2. **Log Fetching**
   - Complete workflow from Azure
   - Time range queries
   - Error handling

3. **Circuit Breaker**
   - State transitions
   - Failure tracking
   - Recovery behavior

4. **Rate Limit Handler**
   - Retry mechanisms
   - Exponential backoff
   - Retry-after header handling

5. **KQL Query Builder**
   - Query generation
   - Filter application
   - Optimization

## Troubleshooting

### Integration Tests Skipped

If integration tests are skipped, it means `AZURE_TENANT_ID` is not set:

```
SKIP  tests/log-fetcher/integration/azure-authenticator.integration.test.ts
```

**Solution**: Set up environment variables or run unit tests only.

### Authentication Failures

```
Error: Authentication failed: Invalid credentials
```

**Solutions**:
1. Verify service principal credentials are correct
2. Ensure service principal has "Log Analytics Reader" role
3. Check workspace ID is valid

### Timeout Errors

```
Error: Timeout - Async callback was not invoked within the 30000 ms timeout
```

**Solutions**:
1. Check network connectivity to Azure
2. Verify firewall isn't blocking Azure endpoints
3. Increase timeout in test files if needed

### Missing Coverage

If log-fetcher shows 0% coverage after running tests:

```
log-fetcher  | 0% | 0% | 0% | 0%
```

**Solution**: Integration tests must actually execute. Ensure:
1. Azure credentials are set
2. Tests are running (not skipped)
3. `test:integration` script is being used

## Best Practices

1. **Local Development**:
   - Use `.env.test` for local credentials
   - Run integration tests before pushing
   - Keep unit tests fast

2. **CI/CD**:
   - Store credentials in GitHub Secrets
   - Never commit credentials
   - Monitor test execution time

3. **Test Writing**:
   - Use `describeIfAzure` for conditional execution
   - Set appropriate timeouts (30-60s for integration)
   - Clean up resources after tests

4. **Security**:
   - Rotate credentials regularly
   - Use least-privilege service principals
   - Monitor Azure costs from test execution

## Additional Resources

- [Azure Service Principal Setup](https://learn.microsoft.com/en-us/azure/active-directory/develop/howto-create-service-principal-portal)
- [Log Analytics Access Control](https://learn.microsoft.com/en-us/azure/azure-monitor/logs/manage-access)
- [GitHub Actions Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
