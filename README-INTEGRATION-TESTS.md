# Integration Tests - Quick Start

## What You Need

To run the integration tests, you need to provide Azure credentials. The tests will use these credentials to authenticate with Azure Application Insights and test the actual log fetching functionality.

## Required Information

You mentioned you have these environment variables available:
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`
- `AZURE_CLIENT_SECRET`
- `AZURE_CLIENT_ID`

You also need:
- **AZURE_WORKSPACE_ID** - Your Log Analytics workspace ID

## How to Get Your Workspace ID

1. Go to Azure Portal
2. Navigate to your Log Analytics workspace
3. In the Overview section, copy the "Workspace ID" (looks like: `12345678-1234-1234-1234-123456789012`)

## Running Integration Tests

### Option 1: Set environment variables directly

```bash
export AZURE_TENANT_ID="your-tenant-id"
export AZURE_CLIENT_ID="your-client-id"
export AZURE_CLIENT_SECRET="your-client-secret"
export AZURE_SUBSCRIPTION_ID="your-subscription-id"
export AZURE_WORKSPACE_ID="your-workspace-id"

npm run test:integration
```

### Option 2: Use .env.test file

```bash
# Create .env.test file
cp .env.test.example .env.test

# Edit .env.test and add your credentials
# Then run:
npm run test:integration
```

## Test Coverage Impact

Currently:
- **Unit tests**: 32.68% coverage (tests mock everything, don't exercise real code)
- **Integration tests**: Will bring coverage to 80%+ by executing actual implementation

## What the Integration Tests Do

1. **Azure Authenticator Tests** - Test real authentication with Azure
2. **Log Fetcher Tests** - Test actual log fetching from your workspace
3. **Circuit Breaker Tests** - Test failure handling and recovery
4. **Rate Limit Handler Tests** - Test retry and backoff logic
5. **KQL Query Builder Tests** - Test query generation

## Next Steps

1. Provide your `AZURE_WORKSPACE_ID`
2. I'll help you run the integration tests
3. We'll verify coverage reaches 80%+ threshold
4. Update GitHub Actions secrets for CI/CD
