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
