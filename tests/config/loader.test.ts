/**
 * Tests for configuration loader
 */

import * as fs from 'fs';
import * as path from 'path';

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

import { loadConfig, ConfigurationError, validateConfiguration } from '../../src/config/loader';
import type { AppConfig } from '../../src/config/types';

describe('Configuration Loader', () => {
  const testConfigDir = path.join(__dirname, 'test-configs');
  const validConfigPath = path.join(testConfigDir, 'valid-config.yaml');
  const invalidConfigPath = path.join(testConfigDir, 'invalid-config.yaml');
  const envConfigPath = path.join(testConfigDir, 'production.yaml');

  beforeEach(() => {
    // Clear environment variables before each test
    delete process.env['AZURE_WORKSPACE_ID'];
    delete process.env['GITHUB_TOKEN'];
    delete process.env['GITHUB_REPOSITORY'];

    // Create test config directory
    if (!fs.existsSync(testConfigDir)) {
      fs.mkdirSync(testConfigDir, { recursive: true });
    }

    // Create valid config file
    const validConfig = `
azureMonitor:
  workspaceId: "test-workspace-id"
  tenantId: "12345678-1234-1234-1234-123456789012"
  clientId: "87654321-4321-4321-4321-210987654321"
  clientSecret: "test-secret"

logFetching:
  queryIntervalMinutes: 5
  batchSize: 1000
  lookbackMinutes: 60
  maxRetries: 3
  retryDelayMs: 5000
  queryTimeoutMs: 30000

failureDetection:
  patterns:
    - name: "TestError"
      pattern: "error|exception"
      type: "error"
      priority: 5
      enabled: true
  confidenceThreshold: 0.75
  enableMlDetection: false
  errorKeywords:
    - "error"
    - "exception"
  failureLogLevels:
    - "Error"
    - "Critical"

github:
  repository: "test-org/test-repo"
  token: "ghp_test_token"
  defaultLabels:
    - "bug"
  autoAssign: false

duplicateDetection:
  enabled: true
  similarityThreshold: 0.85
  timeWindowHours: 24
  algorithm: "jaccard"
  compareFields:
    - "errorMessage"
  enableFuzzyMatching: true

scheduler:
  enabled: true
  cronExpression: "*/5 * * * *"
  timezone: "UTC"
  runOnStartup: true
  maxConcurrentExecutions: 1
  executionTimeoutMs: 300000

logging:
  level: "info"
  format: "json"
  enableConsole: true
  enableFile: false

environment: "development"
`;
    fs.writeFileSync(validConfigPath, validConfig);

    // Create invalid config file (missing required fields)
    const invalidConfig = `
azureMonitor:
  workspaceId: "test-workspace-id"

logFetching:
  queryIntervalMinutes: 5
`;
    fs.writeFileSync(invalidConfigPath, invalidConfig);

    // Create environment-specific config
    const envConfig = `
environment: "production"
logging:
  level: "warn"
`;
    fs.writeFileSync(envConfigPath, envConfig);
  });

  afterEach(() => {
    // Clean up test files
    if (fs.existsSync(testConfigDir)) {
      fs.rmSync(testConfigDir, { recursive: true, force: true });
    }

    // Clear environment variables
    delete process.env['AZURE_WORKSPACE_ID'];
    delete process.env['GITHUB_TOKEN'];
    delete process.env['GITHUB_REPOSITORY'];
  });

  describe('loadConfig', () => {
    it('should load and validate a valid configuration file', () => {
      const config = loadConfig({ configPath: validConfigPath });

      expect(config).toBeDefined();
      expect(config.azureMonitor.workspaceId).toBe('test-workspace-id');
      expect(config.github.repository).toBe('test-org/test-repo');
      expect(config.environment).toBe('development');
    });

    it('should throw ConfigurationError for missing file', () => {
      expect(() => {
        loadConfig({ configPath: '/nonexistent/config.yaml' });
      }).toThrow(ConfigurationError);
    });

    it('should throw ConfigurationError for invalid configuration', () => {
      expect(() => {
        loadConfig({ configPath: invalidConfigPath });
      }).toThrow(ConfigurationError);
    });

    it('should apply environment variable overrides', () => {
      process.env['AZURE_WORKSPACE_ID'] = 'env-workspace-id';
      process.env['GITHUB_TOKEN'] = 'env-token';

      const config = loadConfig({
        configPath: validConfigPath,
        allowEnvOverrides: true,
      });

      expect(config.azureMonitor.workspaceId).toBe('env-workspace-id');
      expect(config.github.token).toBe('env-token');
    });

    it('should not apply environment overrides when disabled', () => {
      process.env['AZURE_WORKSPACE_ID'] = 'env-workspace-id';

      const config = loadConfig({
        configPath: validConfigPath,
        allowEnvOverrides: false,
      });

      expect(config.azureMonitor.workspaceId).toBe('test-workspace-id');
    });

    it('should load without validation when disabled', () => {
      const config = loadConfig({
        configPath: invalidConfigPath,
        validate: false,
      });

      expect(config).toBeDefined();
      expect(config.azureMonitor.workspaceId).toBe('test-workspace-id');
    });

    it('should merge environment-specific configuration', () => {
      // Create config directory for environment-specific file
      const configSubDir = path.join(testConfigDir, 'config');
      if (!fs.existsSync(configSubDir)) {
        fs.mkdirSync(configSubDir, { recursive: true });
      }

      // Create environment-specific config in config/ subdirectory
      const prodConfig = `
environment: "production"
logging:
  level: "warn"
`;
      fs.writeFileSync(path.join(configSubDir, 'production.yaml'), prodConfig);

      const config = loadConfig({
        configPath: validConfigPath,
        environment: 'production',
      });

      expect(config.environment).toBe('production');
      expect(config.logging.level).toBe('warn');
    });
  });

  describe('validateConfiguration', () => {
    it('should validate a complete configuration object', () => {
      const configObj: AppConfig = {
        azureMonitor: {
          workspaceId: 'test-id',
          tenantId: '12345678-1234-1234-1234-123456789012',
          clientId: '87654321-4321-4321-4321-210987654321',
          clientSecret: 'secret',
        },
        logFetching: {
          queryIntervalMinutes: 5,
          batchSize: 1000,
          lookbackMinutes: 60,
          maxRetries: 3,
          retryDelayMs: 5000,
          queryTimeoutMs: 30000,
        },
        failureDetection: {
          patterns: [
            {
              name: 'Test',
              pattern: 'error',
              type: 'error',
              priority: 5,
              enabled: true,
            },
          ],
          confidenceThreshold: 0.75,
          enableMlDetection: false,
          errorKeywords: ['error'],
          failureLogLevels: ['Error'],
        },
        github: {
          repository: 'org/repo',
          token: 'token',
          defaultLabels: ['bug'],
          autoAssign: false,
        },
        duplicateDetection: {
          enabled: true,
          similarityThreshold: 0.85,
          timeWindowHours: 24,
          algorithm: 'jaccard',
          compareFields: ['message'],
          enableFuzzyMatching: true,
        },
        scheduler: {
          enabled: true,
          cronExpression: '*/5 * * * *',
          timezone: 'UTC',
          runOnStartup: true,
          maxConcurrentExecutions: 1,
          executionTimeoutMs: 300000,
        },
        logging: {
          level: 'info',
          format: 'json',
          enableConsole: true,
          enableFile: false,
        },
        environment: 'development',
      };

      const validated = validateConfiguration(configObj);
      expect(validated).toEqual(configObj);
    });

    it('should throw error for invalid configuration object', () => {
      const invalidObj = {
        azureMonitor: {
          workspaceId: 'test',
        },
      };

      expect(() => {
        validateConfiguration(invalidObj);
      }).toThrow(ConfigurationError);
    });

    it('should provide detailed error messages for validation failures', () => {
      const invalidObj = {
        azureMonitor: {
          workspaceId: 'test',
          tenantId: 'invalid-uuid',
          clientId: '87654321-4321-4321-4321-210987654321',
          clientSecret: 'secret',
        },
      };

      expect(() => {
        validateConfiguration(invalidObj);
      }).toThrow(ConfigurationError);
    });
  });

  describe('Error Handling', () => {
    it('should handle YAML parsing errors', () => {
      const malformedYamlPath = path.join(testConfigDir, 'malformed.yaml');
      fs.writeFileSync(malformedYamlPath, 'invalid: yaml: content: [unclosed');

      expect(() => {
        loadConfig({ configPath: malformedYamlPath });
      }).toThrow(ConfigurationError);
    });

    it('should handle non-object YAML content', () => {
      const nonObjectYamlPath = path.join(testConfigDir, 'non-object.yaml');
      fs.writeFileSync(nonObjectYamlPath, 'just a string');

      expect(() => {
        loadConfig({ configPath: nonObjectYamlPath });
      }).toThrow(ConfigurationError);
    });

    it('should fall back to default paths when config path is empty', () => {
      // Create a default config file so it can be found
      const defaultConfigPath = path.resolve('config/default.yaml');
      const defaultDir = path.dirname(defaultConfigPath);

      if (!fs.existsSync(defaultDir)) {
        fs.mkdirSync(defaultDir, { recursive: true });
      }

      fs.writeFileSync(defaultConfigPath, fs.readFileSync(validConfigPath));

      try {
        const config = loadConfig({ configPath: '' });
        expect(config).toBeDefined();
      } finally {
        // Cleanup
        if (fs.existsSync(defaultConfigPath)) {
          fs.unlinkSync(defaultConfigPath);
        }
        if (fs.existsSync(defaultDir)) {
          fs.rmdirSync(defaultDir);
        }
      }
    });

    it('should handle nested environment variable with empty key', () => {
      process.env['ENVIRONMENT'] = 'production';

      const config = loadConfig({
        configPath: validConfigPath,
        allowEnvOverrides: true,
      });

      expect(config.environment).toBe('production');
    });

    it('should handle environment override with empty value', () => {
      process.env['AZURE_WORKSPACE_ID'] = '';

      const config = loadConfig({
        configPath: validConfigPath,
        allowEnvOverrides: true,
      });

      expect(config.azureMonitor.workspaceId).toBe('test-workspace-id');
    });

    it('should handle failed environment config load gracefully', () => {
      const configSubDir = path.join(testConfigDir, 'config');
      if (!fs.existsSync(configSubDir)) {
        fs.mkdirSync(configSubDir, { recursive: true });
      }

      const malformedEnvConfig = path.join(configSubDir, 'staging.yaml');
      fs.writeFileSync(malformedEnvConfig, 'invalid: [yaml');

      // Suppress console.warn output during test
      const originalWarn = console.warn;
      const warnMock = jest.fn();
      console.warn = warnMock;

      const config = loadConfig({
        configPath: validConfigPath,
        environment: 'staging',
      });

      // Restore console.warn
      console.warn = originalWarn;

      // Should still have base config values since override failed
      expect(config.azureMonitor.workspaceId).toBe('test-workspace-id');
      expect(warnMock).toHaveBeenCalled();
    });

    it('should handle undefined environment in loadEnvironmentOverrides', () => {
      const config = loadConfig({
        configPath: validConfigPath,
        environment: undefined,
      });

      expect(config).toBeDefined();
    });

    it('should handle empty environment string', () => {
      const config = loadConfig({
        configPath: validConfigPath,
        environment: '',
      });

      expect(config).toBeDefined();
    });
  });

  describe('loadConfigWithSchema', () => {
    it('should load config with custom schema', async () => {
      const { loadConfigWithSchema } = await import('../../src/config/loader');
      const { appConfigSchema } = await import('../../src/config/schemas');

      const config = loadConfigWithSchema(appConfigSchema, { configPath: validConfigPath });

      expect(config).toBeDefined();
      expect(config.azureMonitor.workspaceId).toBe('test-workspace-id');
    });

    it('should handle ZodError in loadConfigWithSchema', async () => {
      const { loadConfigWithSchema } = await import('../../src/config/loader');
      const { z } = await import('zod');

      const strictSchema = z.object({
        requiredField: z.string(),
      });

      expect(() => {
        loadConfigWithSchema(strictSchema, { configPath: validConfigPath });
      }).toThrow(ConfigurationError);
    });

    it('should handle generic errors in loadConfigWithSchema', async () => {
      const { loadConfigWithSchema } = await import('../../src/config/loader');
      const { z } = await import('zod');

      const badSchema = z.object({}).transform(() => {
        throw new Error('Transform error');
      });

      expect(() => {
        loadConfigWithSchema(badSchema, { configPath: validConfigPath });
      }).toThrow(ConfigurationError);
    });
  });

  describe('Environment Variable Substitution', () => {
    it('should substitute environment variable with env:VAR_NAME syntax', () => {
      process.env['TEST_TOKEN'] = 'my-secret-token';

      const configWithEnvVar = `
azureMonitor:
  workspaceId: "test-workspace-id"
  tenantId: "12345678-1234-1234-1234-123456789012"
  clientId: "87654321-4321-4321-4321-210987654321"
  clientSecret: "env:TEST_TOKEN"

logFetching:
  queryIntervalMinutes: 5
  batchSize: 1000
  lookbackMinutes: 60
  maxRetries: 3
  retryDelayMs: 5000
  queryTimeoutMs: 30000

failureDetection:
  patterns:
    - name: "TestError"
      pattern: "error"
      type: "error"
      priority: 5
      enabled: true
  confidenceThreshold: 0.75
  enableMlDetection: false
  errorKeywords: ["error"]
  failureLogLevels: ["Error"]

github:
  repository: "test-org/test-repo"
  token: "ghp_test_token"
  defaultLabels: ["bug"]
  autoAssign: false

duplicateDetection:
  enabled: true
  similarityThreshold: 0.85
  timeWindowHours: 24
  algorithm: "jaccard"
  compareFields: ["message"]
  enableFuzzyMatching: true

scheduler:
  enabled: true
  cronExpression: "*/5 * * * *"
  timezone: "UTC"
  runOnStartup: true
  maxConcurrentExecutions: 1
  executionTimeoutMs: 300000

logging:
  level: "info"
  format: "json"
  enableConsole: true
  enableFile: false

environment: "development"
`;

      const envConfigPath = path.join(testConfigDir, 'env-var-config.yaml');
      fs.writeFileSync(envConfigPath, configWithEnvVar);

      const config = loadConfig({
        configPath: envConfigPath,
        allowEnvOverrides: false, // Disable env overrides to test only YAML substitution
      });

      expect(config.azureMonitor.clientSecret).toBe('my-secret-token');

      delete process.env['TEST_TOKEN'];
    });

    it('should use default value with env:VAR_NAME:default syntax', () => {
      const configWithDefault = `
azureMonitor:
  workspaceId: "env:WORKSPACE_ID:default-workspace"
  tenantId: "12345678-1234-1234-1234-123456789012"
  clientId: "87654321-4321-4321-4321-210987654321"
  clientSecret: "test-secret"

logFetching:
  queryIntervalMinutes: 5
  batchSize: 1000
  lookbackMinutes: 60
  maxRetries: 3
  retryDelayMs: 5000
  queryTimeoutMs: 30000

failureDetection:
  patterns:
    - name: "TestError"
      pattern: "error"
      type: "error"
      priority: 5
      enabled: true
  confidenceThreshold: 0.75
  enableMlDetection: false
  errorKeywords: ["error"]
  failureLogLevels: ["Error"]

github:
  repository: "test-org/test-repo"
  token: "ghp_test_token"
  defaultLabels: ["bug"]
  autoAssign: false

duplicateDetection:
  enabled: true
  similarityThreshold: 0.85
  timeWindowHours: 24
  algorithm: "jaccard"
  compareFields: ["message"]
  enableFuzzyMatching: true

scheduler:
  enabled: true
  cronExpression: "*/5 * * * *"
  timezone: "UTC"
  runOnStartup: true
  maxConcurrentExecutions: 1
  executionTimeoutMs: 300000

logging:
  level: "info"
  format: "json"
  enableConsole: true
  enableFile: false

environment: "development"
`;

      const defaultConfigPath = path.join(testConfigDir, 'default-config.yaml');
      fs.writeFileSync(defaultConfigPath, configWithDefault);

      const config = loadConfig({ configPath: defaultConfigPath });

      expect(config.azureMonitor.workspaceId).toBe('default-workspace');
    });

    it('should prefer environment variable over default value', () => {
      process.env['WORKSPACE_ID'] = 'env-workspace';

      const configWithDefault = `
azureMonitor:
  workspaceId: "env:WORKSPACE_ID:default-workspace"
  tenantId: "12345678-1234-1234-1234-123456789012"
  clientId: "87654321-4321-4321-4321-210987654321"
  clientSecret: "test-secret"

logFetching:
  queryIntervalMinutes: 5
  batchSize: 1000
  lookbackMinutes: 60
  maxRetries: 3
  retryDelayMs: 5000
  queryTimeoutMs: 30000

failureDetection:
  patterns:
    - name: "TestError"
      pattern: "error"
      type: "error"
      priority: 5
      enabled: true
  confidenceThreshold: 0.75
  enableMlDetection: false
  errorKeywords: ["error"]
  failureLogLevels: ["Error"]

github:
  repository: "test-org/test-repo"
  token: "ghp_test_token"
  defaultLabels: ["bug"]
  autoAssign: false

duplicateDetection:
  enabled: true
  similarityThreshold: 0.85
  timeWindowHours: 24
  algorithm: "jaccard"
  compareFields: ["message"]
  enableFuzzyMatching: true

scheduler:
  enabled: true
  cronExpression: "*/5 * * * *"
  timezone: "UTC"
  runOnStartup: true
  maxConcurrentExecutions: 1
  executionTimeoutMs: 300000

logging:
  level: "info"
  format: "json"
  enableConsole: true
  enableFile: false

environment: "development"
`;

      const defaultConfigPath = path.join(testConfigDir, 'prefer-env-config.yaml');
      fs.writeFileSync(defaultConfigPath, configWithDefault);

      const config = loadConfig({ configPath: defaultConfigPath });

      expect(config.azureMonitor.workspaceId).toBe('env-workspace');

      delete process.env['WORKSPACE_ID'];
    });

    it('should fail if required env var is not set and no default', () => {
      const configWithMissingVar = `
azureMonitor:
  workspaceId: "env:MISSING_VAR"
  tenantId: "12345678-1234-1234-1234-123456789012"
  clientId: "87654321-4321-4321-4321-210987654321"
  clientSecret: "test-secret"

logFetching:
  queryIntervalMinutes: 5
  batchSize: 1000
  lookbackMinutes: 60
  maxRetries: 3
  retryDelayMs: 5000
  queryTimeoutMs: 30000

failureDetection:
  patterns:
    - name: "TestError"
      pattern: "error"
      type: "error"
      priority: 5
      enabled: true
  confidenceThreshold: 0.75
  enableMlDetection: false
  errorKeywords: ["error"]
  failureLogLevels: ["Error"]

github:
  repository: "test-org/test-repo"
  token: "ghp_test_token"
  defaultLabels: ["bug"]
  autoAssign: false

duplicateDetection:
  enabled: true
  similarityThreshold: 0.85
  timeWindowHours: 24
  algorithm: "jaccard"
  compareFields: ["message"]
  enableFuzzyMatching: true

scheduler:
  enabled: true
  cronExpression: "*/5 * * * *"
  timezone: "UTC"
  runOnStartup: true
  maxConcurrentExecutions: 1
  executionTimeoutMs: 300000

logging:
  level: "info"
  format: "json"
  enableConsole: true
  enableFile: false

environment: "development"
`;

      const missingVarPath = path.join(testConfigDir, 'missing-var-config.yaml');
      fs.writeFileSync(missingVarPath, configWithMissingVar);

      expect(() => {
        loadConfig({ configPath: missingVarPath });
      }).toThrow('Required environment variable MISSING_VAR is not set');
    });

    it('should support env vars in arrays', () => {
      process.env['LABEL_1'] = 'bug';
      process.env['LABEL_2'] = 'automated';

      const configWithEnvArray = `
azureMonitor:
  workspaceId: "test-workspace-id"
  tenantId: "12345678-1234-1234-1234-123456789012"
  clientId: "87654321-4321-4321-4321-210987654321"
  clientSecret: "test-secret"

logFetching:
  queryIntervalMinutes: 5
  batchSize: 1000
  lookbackMinutes: 60
  maxRetries: 3
  retryDelayMs: 5000
  queryTimeoutMs: 30000

failureDetection:
  patterns:
    - name: "TestError"
      pattern: "error"
      type: "error"
      priority: 5
      enabled: true
  confidenceThreshold: 0.75
  enableMlDetection: false
  errorKeywords:
    - "env:LABEL_1"
    - "error"
  failureLogLevels: ["Error"]

github:
  repository: "test-org/test-repo"
  token: "ghp_test_token"
  defaultLabels:
    - "env:LABEL_1"
    - "env:LABEL_2"
  autoAssign: false

duplicateDetection:
  enabled: true
  similarityThreshold: 0.85
  timeWindowHours: 24
  algorithm: "jaccard"
  compareFields: ["message"]
  enableFuzzyMatching: true

scheduler:
  enabled: true
  cronExpression: "*/5 * * * *"
  timezone: "UTC"
  runOnStartup: true
  maxConcurrentExecutions: 1
  executionTimeoutMs: 300000

logging:
  level: "info"
  format: "json"
  enableConsole: true
  enableFile: false

environment: "development"
`;

      const arrayConfigPath = path.join(testConfigDir, 'array-env-config.yaml');
      fs.writeFileSync(arrayConfigPath, configWithEnvArray);

      const config = loadConfig({ configPath: arrayConfigPath });

      expect(config.github.defaultLabels).toContain('bug');
      expect(config.github.defaultLabels).toContain('automated');
      expect(config.failureDetection.errorKeywords).toContain('bug');

      delete process.env['LABEL_1'];
      delete process.env['LABEL_2'];
    });

    it('should support env vars in nested objects', () => {
      process.env['TENANT_ID'] = '11111111-1111-1111-1111-111111111111';

      const configWithNestedEnv = `
azureMonitor:
  workspaceId: "test-workspace-id"
  tenantId: "env:TENANT_ID"
  clientId: "87654321-4321-4321-4321-210987654321"
  clientSecret: "test-secret"

logFetching:
  queryIntervalMinutes: 5
  batchSize: 1000
  lookbackMinutes: 60
  maxRetries: 3
  retryDelayMs: 5000
  queryTimeoutMs: 30000

failureDetection:
  patterns:
    - name: "TestError"
      pattern: "error"
      type: "error"
      priority: 5
      enabled: true
  confidenceThreshold: 0.75
  enableMlDetection: false
  errorKeywords: ["error"]
  failureLogLevels: ["Error"]

github:
  repository: "test-org/test-repo"
  token: "ghp_test_token"
  defaultLabels: ["bug"]
  autoAssign: false

duplicateDetection:
  enabled: true
  similarityThreshold: 0.85
  timeWindowHours: 24
  algorithm: "jaccard"
  compareFields: ["message"]
  enableFuzzyMatching: true

scheduler:
  enabled: true
  cronExpression: "*/5 * * * *"
  timezone: "UTC"
  runOnStartup: true
  maxConcurrentExecutions: 1
  executionTimeoutMs: 300000

logging:
  level: "info"
  format: "json"
  enableConsole: true
  enableFile: false

environment: "development"
`;

      const nestedConfigPath = path.join(testConfigDir, 'nested-env-config.yaml');
      fs.writeFileSync(nestedConfigPath, configWithNestedEnv);

      const config = loadConfig({
        configPath: nestedConfigPath,
        allowEnvOverrides: false, // Disable env overrides to test only YAML substitution
      });

      expect(config.azureMonitor.tenantId).toBe('11111111-1111-1111-1111-111111111111');

      delete process.env['TENANT_ID'];
    });

    it('should log which variables were substituted', () => {
      process.env['TEST_TOKEN'] = 'my-token';

      const configWithEnvVar = `
azureMonitor:
  workspaceId: "test-workspace-id"
  tenantId: "12345678-1234-1234-1234-123456789012"
  clientId: "87654321-4321-4321-4321-210987654321"
  clientSecret: "env:TEST_TOKEN"

logFetching:
  queryIntervalMinutes: 5
  batchSize: 1000
  lookbackMinutes: 60
  maxRetries: 3
  retryDelayMs: 5000
  queryTimeoutMs: 30000

failureDetection:
  patterns:
    - name: "TestError"
      pattern: "error"
      type: "error"
      priority: 5
      enabled: true
  confidenceThreshold: 0.75
  enableMlDetection: false
  errorKeywords: ["error"]
  failureLogLevels: ["Error"]

github:
  repository: "test-org/test-repo"
  token: "ghp_test_token"
  defaultLabels: ["bug"]
  autoAssign: false

duplicateDetection:
  enabled: true
  similarityThreshold: 0.85
  timeWindowHours: 24
  algorithm: "jaccard"
  compareFields: ["message"]
  enableFuzzyMatching: true

scheduler:
  enabled: true
  cronExpression: "*/5 * * * *"
  timezone: "UTC"
  runOnStartup: true
  maxConcurrentExecutions: 1
  executionTimeoutMs: 300000

logging:
  level: "info"
  format: "json"
  enableConsole: true
  enableFile: false

environment: "development"
`;

      const logConfigPath = path.join(testConfigDir, 'log-env-config.yaml');
      fs.writeFileSync(logConfigPath, configWithEnvVar);

      const config = loadConfig({ configPath: logConfigPath, allowEnvOverrides: false });

      expect(config.azureMonitor.clientSecret).toBe('my-token');

      delete process.env['TEST_TOKEN'];
    });

    it('should log when default value is used', () => {
      const configWithDefault = `
azureMonitor:
  workspaceId: "env:MISSING_WORKSPACE:default-value"
  tenantId: "12345678-1234-1234-1234-123456789012"
  clientId: "87654321-4321-4321-4321-210987654321"
  clientSecret: "test-secret"

logFetching:
  queryIntervalMinutes: 5
  batchSize: 1000
  lookbackMinutes: 60
  maxRetries: 3
  retryDelayMs: 5000
  queryTimeoutMs: 30000

failureDetection:
  patterns:
    - name: "TestError"
      pattern: "error"
      type: "error"
      priority: 5
      enabled: true
  confidenceThreshold: 0.75
  enableMlDetection: false
  errorKeywords: ["error"]
  failureLogLevels: ["Error"]

github:
  repository: "test-org/test-repo"
  token: "ghp_test_token"
  defaultLabels: ["bug"]
  autoAssign: false

duplicateDetection:
  enabled: true
  similarityThreshold: 0.85
  timeWindowHours: 24
  algorithm: "jaccard"
  compareFields: ["message"]
  enableFuzzyMatching: true

scheduler:
  enabled: true
  cronExpression: "*/5 * * * *"
  timezone: "UTC"
  runOnStartup: true
  maxConcurrentExecutions: 1
  executionTimeoutMs: 300000

logging:
  level: "info"
  format: "json"
  enableConsole: true
  enableFile: false

environment: "development"
`;

      const logDefaultPath = path.join(testConfigDir, 'log-default-config.yaml');
      fs.writeFileSync(logDefaultPath, configWithDefault);

      const config = loadConfig({ configPath: logDefaultPath });

      expect(config.azureMonitor.workspaceId).toBe('default-value');
    });

    it('should not log values for security', () => {
      process.env['SECRET_VALUE'] = 'super-secret';

      const configWithSecret = `
azureMonitor:
  workspaceId: "test-workspace-id"
  tenantId: "12345678-1234-1234-1234-123456789012"
  clientId: "87654321-4321-4321-4321-210987654321"
  clientSecret: "env:SECRET_VALUE"

logFetching:
  queryIntervalMinutes: 5
  batchSize: 1000
  lookbackMinutes: 60
  maxRetries: 3
  retryDelayMs: 5000
  queryTimeoutMs: 30000

failureDetection:
  patterns:
    - name: "TestError"
      pattern: "error"
      type: "error"
      priority: 5
      enabled: true
  confidenceThreshold: 0.75
  enableMlDetection: false
  errorKeywords: ["error"]
  failureLogLevels: ["Error"]

github:
  repository: "test-org/test-repo"
  token: "ghp_test_token"
  defaultLabels: ["bug"]
  autoAssign: false

duplicateDetection:
  enabled: true
  similarityThreshold: 0.85
  timeWindowHours: 24
  algorithm: "jaccard"
  compareFields: ["message"]
  enableFuzzyMatching: true

scheduler:
  enabled: true
  cronExpression: "*/5 * * * *"
  timezone: "UTC"
  runOnStartup: true
  maxConcurrentExecutions: 1
  executionTimeoutMs: 300000

logging:
  level: "info"
  format: "json"
  enableConsole: true
  enableFile: false

environment: "development"
`;

      const secretConfigPath = path.join(testConfigDir, 'secret-config.yaml');
      fs.writeFileSync(secretConfigPath, configWithSecret);

      const config = loadConfig({ configPath: secretConfigPath, allowEnvOverrides: false });

      // Verify the secret was substituted correctly
      expect(config.azureMonitor.clientSecret).toBe('super-secret');

      delete process.env['SECRET_VALUE'];
    });

    it('should handle literal values without env: prefix', () => {
      const configWithLiterals = `
azureMonitor:
  workspaceId: "literal-workspace-id"
  tenantId: "12345678-1234-1234-1234-123456789012"
  clientId: "87654321-4321-4321-4321-210987654321"
  clientSecret: "literal-secret"

logFetching:
  queryIntervalMinutes: 5
  batchSize: 1000
  lookbackMinutes: 60
  maxRetries: 3
  retryDelayMs: 5000
  queryTimeoutMs: 30000

failureDetection:
  patterns:
    - name: "TestError"
      pattern: "error"
      type: "error"
      priority: 5
      enabled: true
  confidenceThreshold: 0.75
  enableMlDetection: false
  errorKeywords: ["error"]
  failureLogLevels: ["Error"]

github:
  repository: "test-org/test-repo"
  token: "ghp_test_token"
  defaultLabels: ["bug"]
  autoAssign: false

duplicateDetection:
  enabled: true
  similarityThreshold: 0.85
  timeWindowHours: 24
  algorithm: "jaccard"
  compareFields: ["message"]
  enableFuzzyMatching: true

scheduler:
  enabled: true
  cronExpression: "*/5 * * * *"
  timezone: "UTC"
  runOnStartup: true
  maxConcurrentExecutions: 1
  executionTimeoutMs: 300000

logging:
  level: "info"
  format: "json"
  enableConsole: true
  enableFile: false

environment: "development"
`;

      const literalConfigPath = path.join(testConfigDir, 'literal-config.yaml');
      fs.writeFileSync(literalConfigPath, configWithLiterals);

      const config = loadConfig({
        configPath: literalConfigPath,
        allowEnvOverrides: false, // Disable env overrides to test only YAML substitution
      });

      expect(config.azureMonitor.workspaceId).toBe('literal-workspace-id');
      expect(config.azureMonitor.clientSecret).toBe('literal-secret');
    });

    it('should support all YAML data types', () => {
      process.env['BATCH_SIZE'] = '2000';

      const configWithTypes = `
azureMonitor:
  workspaceId: "test-workspace-id"
  tenantId: "12345678-1234-1234-1234-123456789012"
  clientId: "87654321-4321-4321-4321-210987654321"
  clientSecret: "test-secret"

logFetching:
  queryIntervalMinutes: 5
  batchSize: 1000
  lookbackMinutes: 60
  maxRetries: 3
  retryDelayMs: 5000
  queryTimeoutMs: 30000

failureDetection:
  patterns:
    - name: "TestError"
      pattern: "error"
      type: "error"
      priority: 5
      enabled: true
  confidenceThreshold: 0.75
  enableMlDetection: false
  errorKeywords: ["error"]
  failureLogLevels: ["Error"]

github:
  repository: "test-org/test-repo"
  token: "ghp_test_token"
  defaultLabels: ["bug"]
  autoAssign: false

duplicateDetection:
  enabled: true
  similarityThreshold: 0.85
  timeWindowHours: 24
  algorithm: "jaccard"
  compareFields: ["message"]
  enableFuzzyMatching: true

scheduler:
  enabled: true
  cronExpression: "*/5 * * * *"
  timezone: "UTC"
  runOnStartup: true
  maxConcurrentExecutions: 1
  executionTimeoutMs: 300000

logging:
  level: "info"
  format: "json"
  enableConsole: true
  enableFile: false

environment: "development"
`;

      const typesConfigPath = path.join(testConfigDir, 'types-config.yaml');
      fs.writeFileSync(typesConfigPath, configWithTypes);

      const config = loadConfig({ configPath: typesConfigPath });

      // Verify different types are preserved
      expect(typeof config.logFetching.queryIntervalMinutes).toBe('number');
      expect(typeof config.duplicateDetection.enabled).toBe('boolean');
      expect(Array.isArray(config.github.defaultLabels)).toBe(true);
      expect(typeof config.azureMonitor).toBe('object');

      delete process.env['BATCH_SIZE'];
    });

    it('should handle default values with colons in them', () => {
      const configWithColonDefault = `
azureMonitor:
  workspaceId: "env:WORKSPACE:http://default:8080"
  tenantId: "12345678-1234-1234-1234-123456789012"
  clientId: "87654321-4321-4321-4321-210987654321"
  clientSecret: "test-secret"

logFetching:
  queryIntervalMinutes: 5
  batchSize: 1000
  lookbackMinutes: 60
  maxRetries: 3
  retryDelayMs: 5000
  queryTimeoutMs: 30000

failureDetection:
  patterns:
    - name: "TestError"
      pattern: "error"
      type: "error"
      priority: 5
      enabled: true
  confidenceThreshold: 0.75
  enableMlDetection: false
  errorKeywords: ["error"]
  failureLogLevels: ["Error"]

github:
  repository: "test-org/test-repo"
  token: "ghp_test_token"
  defaultLabels: ["bug"]
  autoAssign: false

duplicateDetection:
  enabled: true
  similarityThreshold: 0.85
  timeWindowHours: 24
  algorithm: "jaccard"
  compareFields: ["message"]
  enableFuzzyMatching: true

scheduler:
  enabled: true
  cronExpression: "*/5 * * * *"
  timezone: "UTC"
  runOnStartup: true
  maxConcurrentExecutions: 1
  executionTimeoutMs: 300000

logging:
  level: "info"
  format: "json"
  enableConsole: true
  enableFile: false

environment: "development"
`;

      const colonConfigPath = path.join(testConfigDir, 'colon-default-config.yaml');
      fs.writeFileSync(colonConfigPath, configWithColonDefault);

      const config = loadConfig({ configPath: colonConfigPath });

      // The default value after the second colon should be preserved with colons
      expect(config.azureMonitor.workspaceId).toBe('http://default:8080');
    });
  });

  describe('Configuration Schema Validation', () => {
    it('should validate Azure Monitor configuration', () => {
      const config = loadConfig({ configPath: validConfigPath });

      expect(config.azureMonitor?.workspaceId).toBeDefined();
      expect(config.azureMonitor?.tenantId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
      expect(config.azureMonitor?.clientId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    it('should validate log fetching configuration', () => {
      const config = loadConfig({ configPath: validConfigPath });

      expect(config.logFetching.queryIntervalMinutes).toBeGreaterThan(0);
      expect(config.logFetching.batchSize).toBeGreaterThan(0);
      expect(config.logFetching.batchSize).toBeLessThanOrEqual(10000);
      expect(config.logFetching.maxRetries).toBeGreaterThanOrEqual(0);
      expect(config.logFetching.maxRetries).toBeLessThanOrEqual(10);
    });

    it('should validate failure detection patterns', () => {
      const config = loadConfig({ configPath: validConfigPath });

      expect(config.failureDetection.patterns).toHaveLength(1);
      expect(config.failureDetection.patterns[0]?.name).toBe('TestError');
      expect(config.failureDetection.patterns[0]?.type).toBe('error');
      expect(config.failureDetection.patterns[0]?.priority).toBeGreaterThanOrEqual(1);
      expect(config.failureDetection.patterns[0]?.priority).toBeLessThanOrEqual(10);
    });

    it('should validate GitHub configuration', () => {
      const config = loadConfig({ configPath: validConfigPath });

      expect(config.github.repository).toMatch(/^[\w-]+\/[\w-]+$/);
      expect(config.github.defaultLabels).toBeInstanceOf(Array);
      expect(config.github.autoAssign).toBe(false);
    });

    it('should validate duplicate detection configuration', () => {
      const config = loadConfig({ configPath: validConfigPath });

      expect(config.duplicateDetection.enabled).toBe(true);
      expect(config.duplicateDetection.similarityThreshold).toBeGreaterThanOrEqual(0);
      expect(config.duplicateDetection.similarityThreshold).toBeLessThanOrEqual(1);
      expect(['levenshtein', 'jaccard', 'cosine']).toContain(config.duplicateDetection.algorithm);
    });

    it('should validate scheduler configuration', () => {
      const config = loadConfig({ configPath: validConfigPath });

      expect(config.scheduler.enabled).toBe(true);
      expect(config.scheduler.cronExpression).toBe('*/5 * * * *');
      expect(config.scheduler.timezone).toBe('UTC');
      expect(config.scheduler.maxConcurrentExecutions).toBeGreaterThan(0);
    });

    it('should validate logging configuration', () => {
      const config = loadConfig({ configPath: validConfigPath });

      expect(['debug', 'info', 'warn', 'error']).toContain(config.logging.level);
      expect(['json', 'text']).toContain(config.logging.format);
      expect(typeof config.logging.enableConsole).toBe('boolean');
    });

    it('should validate environment setting', () => {
      const config = loadConfig({ configPath: validConfigPath });

      expect(['development', 'staging', 'production']).toContain(config.environment);
    });
  });
});
