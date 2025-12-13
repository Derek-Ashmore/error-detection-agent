/**
 * Tests for configuration utility functions
 */

import { describe, expect, it } from '@jest/globals';
import { z } from 'zod';

import type { AppConfig } from '../../src/config/types';
import {
  exportConfiguration,
  generateValidationReport,
  getConfigSummary,
  redactSecrets,
} from '../../src/config/utils';

describe('Configuration Utilities', () => {
  // Sample configuration for testing
  const sampleConfig: AppConfig = {
    environment: 'development',
    version: '1.0.0',
    azureMonitor: {
      workspaceId: 'workspace-123',
      tenantId: 'tenant-456',
      clientId: 'client-789',
      clientSecret: 'super-secret-value',
      subscriptionId: 'sub-123',
      resourceGroup: 'rg-test',
      endpoint: 'https://api.loganalytics.io',
    },
    github: {
      repository: 'owner/repo',
      token: 'ghp_secrettoken123456',
      apiEndpoint: 'https://api.github.com',
      defaultLabels: ['bug', 'automated'],
      assignees: ['dev1'],
      autoAssign: true,
      issueTitleTemplate: 'Error: {{message}}',
      issueBodyTemplate: 'Details: {{details}}',
    },
    logFetching: {
      queryIntervalMinutes: 5,
      batchSize: 100,
      lookbackMinutes: 60,
      maxRetries: 3,
      retryDelayMs: 1000,
      queryTimeoutMs: 30000,
      queryTemplate: 'AppTraces | where TimeGenerated > ago(5m)',
    },
    failureDetection: {
      patterns: [
        {
          name: 'NullPointerException',
          pattern: 'NullPointerException',
          type: 'error',
          priority: 8,
          description: 'Null pointer exceptions',
          enabled: true,
        },
      ],
      confidenceThreshold: 0.8,
      enableMlDetection: true,
      errorKeywords: ['error', 'exception', 'failed'],
      failureLogLevels: ['Error', 'Critical'],
    },
    duplicateDetection: {
      enabled: true,
      similarityThreshold: 0.85,
      timeWindowHours: 24,
      algorithm: 'levenshtein',
      compareFields: ['message', 'stackTrace'],
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
    notification: {
      enabled: true,
      channels: ['email', 'slack'],
      severityLevels: ['error', 'critical'],
      email: {
        smtpHost: 'smtp.example.com',
        smtpPort: 587,
        from: 'alerts@example.com',
        to: ['dev@example.com'],
        username: 'smtp-user',
        password: 'smtp-password-secret',
      },
      slack: {
        webhookUrl: 'https://hooks.slack.com/services/SECRET/TOKEN/KEY',
        channel: '#alerts',
        username: 'Error Bot',
      },
    },
    logging: {
      level: 'info',
      format: 'json',
      enableConsole: true,
      enableFile: true,
      filePath: '/var/log/app.log',
      maxFileSize: 10485760,
      maxFiles: 5,
    },
  };

  describe('redactSecrets', () => {
    it('should redact sensitive fields in Azure Monitor config', () => {
      const redacted = redactSecrets(sampleConfig);

      expect(redacted.azureMonitor.clientSecret).toBe('***');
      expect(redacted.azureMonitor.workspaceId).toBe('workspace-123');
      expect(redacted.azureMonitor.tenantId).toBe('tenant-456');
    });

    it('should redact GitHub token', () => {
      const redacted = redactSecrets(sampleConfig);

      expect(redacted.github.token).toBe('***');
      expect(redacted.github.repository).toBe('owner/repo');
    });

    it('should redact notification credentials', () => {
      const redacted = redactSecrets(sampleConfig);

      expect(redacted.notification?.email?.password).toBe('***');
      expect(redacted.notification?.email?.smtpHost).toBe('smtp.example.com');
      expect(redacted.notification?.email?.from).toBe('alerts@example.com');
    });

    it('should redact all secret-like fields (case-insensitive)', () => {
      const configWithMixedCase = {
        ...sampleConfig,
        customAPI: {
          apiKey: 'secret-key',
          ApiToken: 'secret-token',
          ACCESS_TOKEN: 'secret-access',
          clientPassword: 'secret-password',
          OAuth_Credential: 'secret-credential',
        },
      } as unknown as AppConfig;

      const redacted = redactSecrets(configWithMixedCase);
      const custom = (redacted as unknown as Record<string, unknown>)['customAPI'] as Record<
        string,
        unknown
      >;

      expect(custom['apiKey']).toBe('***');
      expect(custom['ApiToken']).toBe('***');
      expect(custom['ACCESS_TOKEN']).toBe('***');
      expect(custom['clientPassword']).toBe('***');
      expect(custom['OAuth_Credential']).toBe('***');
    });

    it('should preserve non-sensitive field values', () => {
      const redacted = redactSecrets(sampleConfig);

      expect(redacted.environment).toBe('development');
      expect(redacted.version).toBe('1.0.0');
      expect(redacted.scheduler.cronExpression).toBe('*/5 * * * *');
      expect(redacted.logFetching.batchSize).toBe(100);
    });

    it('should handle nested objects', () => {
      const redacted = redactSecrets(sampleConfig);

      expect(redacted.notification?.slack?.webhookUrl).not.toBe('***'); // webhookUrl doesn't match patterns
      expect(redacted.notification?.slack?.channel).toBe('#alerts');
    });

    it('should handle arrays', () => {
      const redacted = redactSecrets(sampleConfig);

      expect(redacted.failureDetection.patterns).toHaveLength(1);
      expect(redacted.failureDetection.patterns[0]?.name).toBe('NullPointerException');
      expect(redacted.github.defaultLabels).toEqual(['bug', 'automated']);
    });

    it('should not modify original config', () => {
      const original = JSON.parse(JSON.stringify(sampleConfig));
      redactSecrets(sampleConfig);

      expect(sampleConfig).toEqual(original);
    });

    it('should handle null and undefined values', () => {
      const configWithNulls = {
        ...sampleConfig,
        notification: undefined,
      };

      const redacted = redactSecrets(configWithNulls);

      expect(redacted.notification).toBeUndefined();
    });
  });

  describe('exportConfiguration', () => {
    it('should export configuration as YAML with redacted secrets', () => {
      const yaml = exportConfiguration(sampleConfig);

      expect(yaml).toContain("clientSecret: '***'");
      expect(yaml).toContain("token: '***'");
      expect(yaml).toContain("password: '***'");
      expect(yaml).not.toContain('super-secret-value');
      expect(yaml).not.toContain('ghp_secrettoken123456');
    });

    it('should preserve non-sensitive values in YAML', () => {
      const yaml = exportConfiguration(sampleConfig);

      expect(yaml).toContain('environment: development');
      expect(yaml).toContain('workspaceId: workspace-123');
      expect(yaml).toContain('repository: owner/repo');
    });

    it('should format YAML with proper indentation', () => {
      const yaml = exportConfiguration(sampleConfig);

      expect(yaml).toContain('azureMonitor:');
      expect(yaml).toContain('  workspaceId:');
      expect(yaml).toContain('github:');
      expect(yaml).toContain('  repository:');
    });

    it('should handle arrays in YAML format', () => {
      const yaml = exportConfiguration(sampleConfig);

      expect(yaml).toContain('defaultLabels:');
      expect(yaml).toContain('- bug');
      expect(yaml).toContain('- automated');
    });

    it('should be valid YAML that can be parsed', () => {
      const yaml = exportConfiguration(sampleConfig);
      const jsYaml = require('js-yaml');

      expect(() => jsYaml.load(yaml)).not.toThrow();
    });
  });

  describe('generateValidationReport', () => {
    it('should generate report with no errors', () => {
      const report = generateValidationReport([]);

      expect(report).toContain('✓ Configuration validation passed');
      expect(report).toContain('no errors found');
    });

    it('should format invalid_type errors', () => {
      const errors: z.ZodIssue[] = [
        {
          code: 'invalid_type',
          expected: 'string',
          received: 'number',
          path: ['azureMonitor', 'workspaceId'],
          message: 'Expected string, received number',
        },
      ];

      const report = generateValidationReport(errors);

      expect(report).toContain('Configuration Validation Report');
      expect(report).toContain('Found 1 validation error:');
      expect(report).toContain('azureMonitor.workspaceId');
      expect(report).toContain('Expected string, but got number');
    });

    it('should format too_small errors for strings', () => {
      const errors: z.ZodIssue[] = [
        {
          code: 'too_small',
          minimum: 10,
          type: 'string',
          inclusive: true,
          exact: false,
          path: ['github', 'token'],
          message: 'String must contain at least 10 character(s)',
        },
      ];

      const report = generateValidationReport(errors);

      expect(report).toContain('github.token');
      expect(report).toContain('Must be at least 10 characters long');
    });

    it('should format too_big errors for numbers', () => {
      const errors: z.ZodIssue[] = [
        {
          code: 'too_big',
          maximum: 100,
          type: 'number',
          inclusive: true,
          exact: false,
          path: ['logFetching', 'batchSize'],
          message: 'Number must be less than or equal to 100',
        },
      ];

      const report = generateValidationReport(errors);

      expect(report).toContain('logFetching.batchSize');
      expect(report).toContain('Must be at most 100');
    });

    it('should format invalid_enum_value errors', () => {
      const errors: z.ZodIssue[] = [
        {
          code: 'invalid_enum_value',
          options: ['development', 'staging', 'production'],
          received: 'test',
          path: ['environment'],
          message: 'Invalid enum value',
        },
      ];

      const report = generateValidationReport(errors);

      expect(report).toContain('environment');
      expect(report).toContain('Must be one of: development, staging, production');
    });

    it('should handle multiple errors', () => {
      const errors: z.ZodIssue[] = [
        {
          code: 'invalid_type',
          expected: 'string',
          received: 'number',
          path: ['azureMonitor', 'workspaceId'],
          message: 'Expected string, received number',
        },
        {
          code: 'invalid_type',
          expected: 'number',
          received: 'string',
          path: ['logFetching', 'batchSize'],
          message: 'Expected number, received string',
        },
      ];

      const report = generateValidationReport(errors);

      expect(report).toContain('Found 2 validation errors:');
      expect(report).toContain('azureMonitor.workspaceId');
      expect(report).toContain('logFetching.batchSize');
    });

    it('should group errors by path', () => {
      const errors: z.ZodIssue[] = [
        {
          code: 'invalid_type',
          expected: 'string',
          received: 'number',
          path: ['azureMonitor', 'workspaceId'],
          message: 'Expected string, received number',
        },
        {
          code: 'too_small',
          minimum: 1,
          type: 'string',
          inclusive: true,
          exact: false,
          path: ['azureMonitor', 'tenantId'],
          message: 'String must contain at least 1 character(s)',
        },
      ];

      const report = generateValidationReport(errors);

      expect(report).toContain('[azureMonitor.workspaceId]');
      expect(report).toContain('[azureMonitor.tenantId]');
    });

    it('should include troubleshooting tips', () => {
      const errors: z.ZodIssue[] = [
        {
          code: 'invalid_type',
          expected: 'string',
          received: 'number',
          path: ['test'],
          message: 'Invalid',
        },
      ];

      const report = generateValidationReport(errors);

      expect(report).toContain('Troubleshooting Tips:');
      expect(report).toContain('Check that all required fields are present');
      expect(report).toContain('environment variables');
    });
  });

  describe('getConfigSummary', () => {
    it('should create safe summary with basic info', () => {
      const summary = getConfigSummary(sampleConfig);

      expect(summary).toHaveProperty('environment', 'development');
      expect(summary).toHaveProperty('version', '1.0.0');
    });

    it('should not expose sensitive values', () => {
      const summary = getConfigSummary(sampleConfig);
      const summaryStr = JSON.stringify(summary);

      expect(summaryStr).not.toContain('super-secret-value');
      expect(summaryStr).not.toContain('ghp_secrettoken123456');
      expect(summaryStr).not.toContain('smtp-password-secret');
    });

    it('should indicate presence of credentials without exposing them', () => {
      const summary = getConfigSummary(sampleConfig);

      expect(summary['azureMonitor']).toHaveProperty('hasCredentials', true);
      expect(summary['github']).toHaveProperty('hasToken', true);
    });

    it('should include non-sensitive configuration details', () => {
      const summary = getConfigSummary(sampleConfig);

      expect(summary['azureMonitor']).toHaveProperty('workspaceId', 'workspace-123');
      expect(summary['github']).toHaveProperty('repository', 'owner/repo');
      expect(summary['logFetching']).toHaveProperty('queryIntervalMinutes', 5);
      expect(summary['scheduler']).toHaveProperty('enabled', true);
    });

    it('should handle missing version', () => {
      const configNoVersion = { ...sampleConfig };
      delete configNoVersion.version;

      const summary = getConfigSummary(configNoVersion);

      expect(summary).toHaveProperty('version', 'unknown');
    });

    it('should be safe to log', () => {
      const summary = getConfigSummary(sampleConfig);

      // Should not throw when converting to string
      expect(() => JSON.stringify(summary)).not.toThrow();

      // Should not contain any sensitive patterns
      const summaryStr = JSON.stringify(summary);
      expect(summaryStr).not.toMatch(/secret/i);
      expect(summaryStr).not.toMatch(/password/i);
      expect(summaryStr).not.toMatch(/ghp_/);
    });
  });
});
