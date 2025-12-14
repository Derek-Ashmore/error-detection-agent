/**
 * Integration tests for LogFetcher
 *
 * These tests use real Azure credentials and test the complete log fetching workflow
 */

import { LogFetcher } from '../../../src/log-fetcher/log-fetcher';
import type { LogFetcherConfig } from '../../../src/log-fetcher/types';

// Skip these tests if Azure credentials are not available
const describeIfAzure =
  process.env['AZURE_TENANT_ID'] !== undefined &&
  process.env['AZURE_TENANT_ID'] !== null &&
  process.env['AZURE_TENANT_ID'] !== ''
    ? describe
    : describe.skip;

describeIfAzure('LogFetcher Integration Tests', () => {
  let logFetcher: LogFetcher;
  const workspaceId = process.env['AZURE_WORKSPACE_ID'] ?? 'test-workspace-id';

  const testConfig: LogFetcherConfig = {
    workspaceId,
    queryTimeoutMs: 30000,
    lookbackMinutes: 60,
    batchSize: 100,
    retry: {
      maxRetries: 3,
      initialDelayMs: 1000,
      maxDelayMs: 10000,
      backoffMultiplier: 2,
    },
    circuitBreakerThreshold: 5,
    circuitBreakerResetTimeoutMs: 60000,
  };

  beforeEach(() => {
    logFetcher = new LogFetcher(testConfig);
  });

  describe('Initialization', () => {
    it('should initialize successfully with valid configuration', async () => {
      await logFetcher.initialize();

      expect(logFetcher).toBeDefined();
    }, 30000);

    it('should validate configuration on construction', () => {
      expect(() => new LogFetcher({ ...testConfig, workspaceId: '' })).toThrow();
      expect(() => new LogFetcher({ ...testConfig, queryTimeoutMs: -1 })).toThrow();
      expect(() => new LogFetcher({ ...testConfig, batchSize: 0 })).toThrow();
    });
  });

  describe('Log Fetching', () => {
    beforeEach(async () => {
      await logFetcher.initialize();
    }, 30000);

    it('should fetch logs from Azure Application Insights', async () => {
      const timeRange = {
        startTime: new Date(Date.now() - 24 * 60 * 60 * 1000),
        endTime: new Date(),
      };

      const result = await logFetcher.fetchLogs(timeRange);

      expect(result).toBeDefined();
      expect(result.entries).toBeDefined();
      expect(Array.isArray(result.entries)).toBe(true);
      expect(result.totalCount).toBeGreaterThanOrEqual(0);
      expect(result.durationMs).toBeGreaterThan(0);
      expect(typeof result.hasMore).toBe('boolean');

      if (result.entries.length > 0) {
        const entry = result.entries[0];
        if (entry !== undefined) {
          // eslint-disable-next-line jest/no-conditional-expect
          expect(entry.timestamp).toBeInstanceOf(Date);
          // eslint-disable-next-line jest/no-conditional-expect
          expect(typeof entry.severity).toBe('string');
          // eslint-disable-next-line jest/no-conditional-expect
          expect(typeof entry.message).toBe('string');
        }
      }
    }, 60000);

    it('should throw error if not initialized', async () => {
      const uninitializedFetcher = new LogFetcher(testConfig);

      await expect(uninitializedFetcher.fetchLogs()).rejects.toThrow('Log fetcher not initialized');
    });
  });

  describe('Circuit Breaker Integration', () => {
    beforeEach(async () => {
      await logFetcher.initialize();
    }, 30000);

    it('should provide circuit breaker statistics', () => {
      const stats = logFetcher.getCircuitBreakerStats();

      expect(stats).toBeDefined();
      expect(stats.state).toBeDefined();
      expect(typeof stats.failureCount).toBe('number');
      expect(typeof stats.totalRequests).toBe('number');
    }, 30000);
  });
});
