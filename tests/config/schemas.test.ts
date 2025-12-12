/**
 * Tests for Zod validation schemas
 */

import { describe, it, expect } from '@jest/globals';
import { z } from 'zod';
import {
  azureMonitorSchema,
  logFetchingSchema,
  failurePatternSchema,
  githubSchema,
  duplicateDetectionSchema,
  schedulerSchema,
  loggingSchema,
  appConfigSchema,
} from '../../src/config/schemas';

describe('Zod Validation Schemas', () => {
  describe('azureMonitorSchema', () => {
    it('should validate valid Azure Monitor configuration', () => {
      const valid = {
        workspaceId: 'test-workspace',
        tenantId: '12345678-1234-1234-1234-123456789012',
        clientId: '87654321-4321-4321-4321-210987654321',
        clientSecret: 'secret',
      };

      expect(() => azureMonitorSchema.parse(valid)).not.toThrow();
    });

    it('should reject invalid tenant ID format', () => {
      const invalid = {
        workspaceId: 'test',
        tenantId: 'not-a-uuid',
        clientId: '87654321-4321-4321-4321-210987654321',
        clientSecret: 'secret',
      };

      expect(() => azureMonitorSchema.parse(invalid)).toThrow(z.ZodError);
    });

    it('should reject missing required fields', () => {
      const invalid = {
        workspaceId: 'test',
      };

      expect(() => azureMonitorSchema.parse(invalid)).toThrow(z.ZodError);
    });

    it('should accept optional fields', () => {
      const valid = {
        workspaceId: 'test',
        tenantId: '12345678-1234-1234-1234-123456789012',
        clientId: '87654321-4321-4321-4321-210987654321',
        clientSecret: 'secret',
        subscriptionId: '11111111-1111-1111-1111-111111111111',
        resourceGroup: 'test-rg',
      };

      expect(() => azureMonitorSchema.parse(valid)).not.toThrow();
    });
  });

  describe('logFetchingSchema', () => {
    it('should validate valid log fetching configuration', () => {
      const valid = {
        queryIntervalMinutes: 5,
        batchSize: 1000,
        lookbackMinutes: 60,
        maxRetries: 3,
        retryDelayMs: 5000,
        queryTimeoutMs: 30000,
      };

      expect(() => logFetchingSchema.parse(valid)).not.toThrow();
    });

    it('should reject negative values', () => {
      const invalid = {
        queryIntervalMinutes: -5,
        batchSize: 1000,
        lookbackMinutes: 60,
        maxRetries: 3,
        retryDelayMs: 5000,
        queryTimeoutMs: 30000,
      };

      expect(() => logFetchingSchema.parse(invalid)).toThrow(z.ZodError);
    });

    it('should reject batch size exceeding maximum', () => {
      const invalid = {
        queryIntervalMinutes: 5,
        batchSize: 20000,
        lookbackMinutes: 60,
        maxRetries: 3,
        retryDelayMs: 5000,
        queryTimeoutMs: 30000,
      };

      expect(() => logFetchingSchema.parse(invalid)).toThrow(z.ZodError);
    });

    it('should reject max retries exceeding limit', () => {
      const invalid = {
        queryIntervalMinutes: 5,
        batchSize: 1000,
        lookbackMinutes: 60,
        maxRetries: 15,
        retryDelayMs: 5000,
        queryTimeoutMs: 30000,
      };

      expect(() => logFetchingSchema.parse(invalid)).toThrow(z.ZodError);
    });
  });

  describe('failurePatternSchema', () => {
    it('should validate valid failure pattern', () => {
      const valid = {
        name: 'TestPattern',
        pattern: 'error|exception',
        type: 'error' as const,
        priority: 5,
        enabled: true,
      };

      expect(() => failurePatternSchema.parse(valid)).not.toThrow();
    });

    it('should reject invalid pattern type', () => {
      const invalid = {
        name: 'TestPattern',
        pattern: 'error',
        type: 'invalid',
        priority: 5,
        enabled: true,
      };

      expect(() => failurePatternSchema.parse(invalid)).toThrow(z.ZodError);
    });

    it('should reject priority out of range', () => {
      const invalid = {
        name: 'TestPattern',
        pattern: 'error',
        type: 'error' as const,
        priority: 15,
        enabled: true,
      };

      expect(() => failurePatternSchema.parse(invalid)).toThrow(z.ZodError);
    });
  });

  describe('githubSchema', () => {
    it('should validate valid GitHub configuration', () => {
      const valid = {
        repository: 'owner/repo',
        token: 'ghp_token',
        defaultLabels: ['bug'],
        autoAssign: false,
      };

      expect(() => githubSchema.parse(valid)).not.toThrow();
    });

    it('should reject invalid repository format', () => {
      const invalid = {
        repository: 'invalid-format',
        token: 'token',
        defaultLabels: ['bug'],
        autoAssign: false,
      };

      expect(() => githubSchema.parse(invalid)).toThrow(z.ZodError);
    });

    it('should accept optional assignees', () => {
      const valid = {
        repository: 'owner/repo',
        token: 'token',
        defaultLabels: ['bug'],
        assignees: ['user1', 'user2'],
        autoAssign: true,
      };

      expect(() => githubSchema.parse(valid)).not.toThrow();
    });
  });

  describe('duplicateDetectionSchema', () => {
    it('should validate valid duplicate detection configuration', () => {
      const valid = {
        enabled: true,
        similarityThreshold: 0.85,
        timeWindowHours: 24,
        algorithm: 'jaccard' as const,
        compareFields: ['message', 'stackTrace'],
        enableFuzzyMatching: true,
      };

      expect(() => duplicateDetectionSchema.parse(valid)).not.toThrow();
    });

    it('should reject similarity threshold out of range', () => {
      const invalid = {
        enabled: true,
        similarityThreshold: 1.5,
        timeWindowHours: 24,
        algorithm: 'jaccard' as const,
        compareFields: ['message'],
        enableFuzzyMatching: true,
      };

      expect(() => duplicateDetectionSchema.parse(invalid)).toThrow(z.ZodError);
    });

    it('should reject invalid algorithm', () => {
      const invalid = {
        enabled: true,
        similarityThreshold: 0.85,
        timeWindowHours: 24,
        algorithm: 'invalid',
        compareFields: ['message'],
        enableFuzzyMatching: true,
      };

      expect(() => duplicateDetectionSchema.parse(invalid)).toThrow(z.ZodError);
    });

    it('should reject empty compare fields', () => {
      const invalid = {
        enabled: true,
        similarityThreshold: 0.85,
        timeWindowHours: 24,
        algorithm: 'jaccard' as const,
        compareFields: [],
        enableFuzzyMatching: true,
      };

      expect(() => duplicateDetectionSchema.parse(invalid)).toThrow(z.ZodError);
    });
  });

  describe('schedulerSchema', () => {
    it('should validate valid scheduler configuration', () => {
      const valid = {
        enabled: true,
        cronExpression: '*/5 * * * *',
        timezone: 'UTC',
        runOnStartup: true,
        maxConcurrentExecutions: 1,
        executionTimeoutMs: 300000,
      };

      expect(() => schedulerSchema.parse(valid)).not.toThrow();
    });

    it('should reject empty cron expression', () => {
      const invalid = {
        enabled: true,
        cronExpression: '',
        timezone: 'UTC',
        runOnStartup: true,
        maxConcurrentExecutions: 1,
        executionTimeoutMs: 300000,
      };

      expect(() => schedulerSchema.parse(invalid)).toThrow(z.ZodError);
    });

    it('should reject zero max concurrent executions', () => {
      const invalid = {
        enabled: true,
        cronExpression: '*/5 * * * *',
        timezone: 'UTC',
        runOnStartup: true,
        maxConcurrentExecutions: 0,
        executionTimeoutMs: 300000,
      };

      expect(() => schedulerSchema.parse(invalid)).toThrow(z.ZodError);
    });
  });

  describe('loggingSchema', () => {
    it('should validate valid logging configuration', () => {
      const valid = {
        level: 'info' as const,
        format: 'json' as const,
        enableConsole: true,
        enableFile: false,
      };

      expect(() => loggingSchema.parse(valid)).not.toThrow();
    });

    it('should reject invalid log level', () => {
      const invalid = {
        level: 'invalid',
        format: 'json',
        enableConsole: true,
        enableFile: false,
      };

      expect(() => loggingSchema.parse(invalid)).toThrow(z.ZodError);
    });

    it('should accept optional file configuration', () => {
      const valid = {
        level: 'debug' as const,
        format: 'text' as const,
        enableConsole: true,
        enableFile: true,
        filePath: './logs/app.log',
        maxFileSize: 10485760,
        maxFiles: 5,
      };

      expect(() => loggingSchema.parse(valid)).not.toThrow();
    });
  });

  describe('appConfigSchema', () => {
    it('should validate complete application configuration', () => {
      const valid = {
        azureMonitor: {
          workspaceId: 'test',
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
              type: 'error' as const,
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
          algorithm: 'jaccard' as const,
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
          level: 'info' as const,
          format: 'json' as const,
          enableConsole: true,
          enableFile: false,
        },
        environment: 'development' as const,
      };

      expect(() => appConfigSchema.parse(valid)).not.toThrow();
    });

    it('should reject invalid environment', () => {
      const invalid = {
        azureMonitor: {
          workspaceId: 'test',
          tenantId: '12345678-1234-1234-1234-123456789012',
          clientId: '87654321-4321-4321-4321-210987654321',
          clientSecret: 'secret',
        },
        environment: 'invalid',
      };

      expect(() => appConfigSchema.parse(invalid)).toThrow(z.ZodError);
    });
  });
});
