# Configuration System Usage Guide

This guide demonstrates how to use the configuration system in the Error Detection Agent.

## Basic Usage

### Loading Configuration from Default Location

```typescript
import { loadConfig } from './config';

// Load configuration from default locations
// (config/default.yaml, config/default.yml, config.yaml, or config.yml)
const config = loadConfig();

console.log(config.azureMonitor.workspaceId);
console.log(config.github.repository);
```

### Loading Configuration from Specific Path

```typescript
import { loadConfig } from './config';

// Load from a specific file
const config = loadConfig({
  configPath: './config/production.yaml'
});
```

### Using Environment Variables

The configuration system automatically reads these environment variables:

- `AZURE_WORKSPACE_ID` → `azureMonitor.workspaceId`
- `AZURE_TENANT_ID` → `azureMonitor.tenantId`
- `AZURE_CLIENT_ID` → `azureMonitor.clientId`
- `AZURE_CLIENT_SECRET` → `azureMonitor.clientSecret`
- `AZURE_SUBSCRIPTION_ID` → `azureMonitor.subscriptionId`
- `AZURE_RESOURCE_GROUP` → `azureMonitor.resourceGroup`
- `GITHUB_TOKEN` → `github.token`
- `GITHUB_REPOSITORY` → `github.repository`
- `LOG_LEVEL` → `logging.level`
- `ENVIRONMENT` → `environment`

```bash
# Set environment variables
export AZURE_CLIENT_SECRET="your-secret-here"
export GITHUB_TOKEN="ghp_your_token_here"
```

```typescript
// Load with environment overrides enabled (default)
const config = loadConfig({
  allowEnvOverrides: true
});

// The secrets from environment variables will override YAML values
```

### Environment-Specific Configuration

Create environment-specific configuration files:

- `config/development.yaml`
- `config/staging.yaml`
- `config/production.yaml`

```typescript
// Load production configuration
const config = loadConfig({
  environment: 'production'
});

// This will:
// 1. Load config/default.yaml
// 2. Merge with config/production.yaml (if exists)
// 3. Apply environment variable overrides
```

## Advanced Usage

### Custom Validation

```typescript
import { loadConfigWithSchema } from './config';
import { z } from 'zod';

// Define a custom schema for partial configuration
const customSchema = z.object({
  azureMonitor: z.object({
    workspaceId: z.string(),
    tenantId: z.string(),
  }),
  github: z.object({
    repository: z.string(),
  }),
});

// Load and validate with custom schema
const config = loadConfigWithSchema(customSchema, {
  configPath: './config/minimal.yaml'
});
```

### Validating Configuration Objects

```typescript
import { validateConfiguration } from './config';

// Validate a configuration object without loading from file
const configObject = {
  azureMonitor: { /* ... */ },
  logFetching: { /* ... */ },
  // ... other sections
};

try {
  const validated = validateConfiguration(configObject);
  console.log('Configuration is valid!');
} catch (error) {
  console.error('Validation failed:', error.message);
}
```

## Configuration Structure

### Complete Example

```typescript
import { loadConfig, type AppConfig } from './config';

const config: AppConfig = loadConfig();

// Azure Monitor settings
console.log(config.azureMonitor.workspaceId);
console.log(config.azureMonitor.tenantId);

// Log fetching settings
console.log(config.logFetching.queryIntervalMinutes);
console.log(config.logFetching.batchSize);

// Failure detection patterns
config.failureDetection.patterns.forEach(pattern => {
  console.log(`Pattern: ${pattern.name}`);
  console.log(`Type: ${pattern.type}`);
  console.log(`Priority: ${pattern.priority}`);
});

// GitHub integration
console.log(config.github.repository);
console.log(config.github.defaultLabels);

// Duplicate detection
console.log(config.duplicateDetection.enabled);
console.log(config.duplicateDetection.algorithm);

// Scheduler
console.log(config.scheduler.cronExpression);
console.log(config.scheduler.timezone);

// Logging
console.log(config.logging.level);
console.log(config.logging.format);
```

## Error Handling

```typescript
import { loadConfig, ConfigurationError } from './config';

try {
  const config = loadConfig();
} catch (error) {
  if (error instanceof ConfigurationError) {
    console.error('Configuration error:', error.message);

    // The cause property contains the original error
    if (error.cause) {
      console.error('Caused by:', error.cause);
    }
  } else {
    console.error('Unexpected error:', error);
  }
  process.exit(1);
}
```

## Type-Safe Configuration Access

```typescript
import type {
  AppConfig,
  AzureMonitorConfig,
  FailurePattern,
  GitHubConfig,
} from './config';

// Use types for function parameters
function initializeAzureMonitor(config: AzureMonitorConfig) {
  // config is fully typed
  console.log(config.workspaceId);
  console.log(config.tenantId);
}

// Use types for pattern processing
function processFailurePattern(pattern: FailurePattern) {
  console.log(`Processing ${pattern.name}`);
  console.log(`Regex: ${pattern.pattern}`);
  console.log(`Priority: ${pattern.priority}`);
}

const config = loadConfig();
initializeAzureMonitor(config.azureMonitor);
config.failureDetection.patterns.forEach(processFailurePattern);
```

## Best Practices

### 1. Keep Secrets in Environment Variables

```yaml
# config/default.yaml - DO NOT commit secrets!
azureMonitor:
  workspaceId: "your-workspace-id"
  tenantId: "00000000-0000-0000-0000-000000000000"
  clientId: "00000000-0000-0000-0000-000000000000"
  clientSecret: "placeholder-use-env-var"  # Override with AZURE_CLIENT_SECRET

github:
  repository: "your-org/your-repo"
  token: "placeholder-use-env-var"  # Override with GITHUB_TOKEN
```

```bash
# .env or environment
export AZURE_CLIENT_SECRET="actual-secret-value"
export GITHUB_TOKEN="ghp_actual_token"
```

### 2. Use Environment-Specific Files

```yaml
# config/development.yaml
environment: development
logging:
  level: debug
  enableConsole: true

# config/production.yaml
environment: production
logging:
  level: warn
  enableFile: true
  filePath: /var/log/error-detection-agent.log
```

### 3. Validate Early

```typescript
// Load and validate configuration at application startup
import { loadConfig } from './config';

let config;

try {
  config = loadConfig();
  console.log('Configuration loaded successfully');
} catch (error) {
  console.error('Failed to load configuration:', error);
  process.exit(1);
}

// Export for use throughout the application
export default config;
```

### 4. Use Type Definitions

```typescript
// Always use the provided types for type safety
import type { AppConfig } from './config';

// This function only accepts valid configuration
function startApplication(config: AppConfig) {
  // TypeScript will catch any invalid access
  console.log(config.environment);
}
```

## Configuration Validation Messages

The Zod schemas provide clear validation messages:

```
Configuration validation failed:
  - azureMonitor.tenantId: Tenant ID must be a valid UUID
  - logFetching.batchSize: Batch size cannot exceed 10000
  - failureDetection.patterns: At least one failure pattern is required
  - github.repository: Repository must be in format "owner/repo"
```

## Testing Configuration

```typescript
import { validateConfiguration } from './config';

describe('Application Configuration', () => {
  it('should load valid configuration', () => {
    const config = loadConfig({ configPath: './test-config.yaml' });
    expect(config.environment).toBe('development');
  });

  it('should validate configuration object', () => {
    const configObj = { /* ... */ };
    expect(() => validateConfiguration(configObj)).not.toThrow();
  });
});
```
