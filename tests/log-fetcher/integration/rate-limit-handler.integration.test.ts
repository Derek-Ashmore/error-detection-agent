/**
 * Integration tests for RateLimitHandler
 *
 * Tests actual retry and rate limit behavior with real implementation
 */

import { RateLimitHandler } from '../../../src/log-fetcher/rate-limit-handler';
import type { RetryConfig } from '../../../src/log-fetcher/types';

describe('RateLimitHandler Integration Tests', () => {
  let rateLimitHandler: RateLimitHandler;

  const testConfig: RetryConfig = {
    maxRetries: 3,
    initialDelayMs: 100,
    maxDelayMs: 5000,
    backoffMultiplier: 2,
  };

  beforeEach(() => {
    rateLimitHandler = new RateLimitHandler(testConfig);
  });

  describe('Retry Mechanism', () => {
    it('should successfully execute function on first attempt', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');

      const result = await rateLimitHandler.executeWithRetry(mockFn);

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should retry on network failures', async () => {
      let attemptCount = 0;
      const mockFn = jest.fn().mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 3) {
          const error: any = new Error('Network error');
          error.code = 'ECONNRESET';
          return Promise.reject(error);
        }
        return Promise.resolve('success');
      });

      const result = await rateLimitHandler.executeWithRetry(mockFn);

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(3);
    }, 10000);

    it('should throw after max retries exceeded on retryable errors', async () => {
      const mockFn = jest.fn().mockImplementation(() => {
        const error: any = new Error('Persistent error');
        error.code = 'ETIMEDOUT';
        return Promise.reject(error);
      });

      await expect(rateLimitHandler.executeWithRetry(mockFn)).rejects.toThrow(
        'Max retries'
      );
      expect(mockFn).toHaveBeenCalledTimes(testConfig.maxRetries + 1);
    }, 10000);

    it('should apply exponential backoff between retries', async () => {
      let attemptCount = 0;
      const timestamps: number[] = [];

      const mockFn = jest.fn().mockImplementation(() => {
        timestamps.push(Date.now());
        attemptCount++;
        if (attemptCount < 3) {
          const error: any = new Error('Retry');
          error.code = 'ECONNRESET';
          return Promise.reject(error);
        }
        return Promise.resolve('success');
      });

      await rateLimitHandler.executeWithRetry(mockFn);

      expect(timestamps.length).toBe(3);

      const delay1 = timestamps[1] - timestamps[0];
      const delay2 = timestamps[2] - timestamps[1];

      expect(delay1).toBeGreaterThanOrEqual(testConfig.initialDelayMs * 0.8);
      expect(delay2).toBeGreaterThanOrEqual(delay1 * 1.5);
    }, 10000);
  });

  describe('Rate Limit Handling', () => {
    it('should handle rate limit with 429 status code', async () => {
      let attemptCount = 0;
      const mockFn = jest.fn().mockImplementation(() => {
        attemptCount++;
        if (attemptCount === 1) {
          const error: any = new Error('Rate limited');
          error.statusCode = 429;
          return Promise.reject(error);
        }
        return Promise.resolve('success');
      });

      const result = await rateLimitHandler.executeWithRetry(mockFn);

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(2);
    }, 10000);

    it('should respect retry-after header', async () => {
      const startTime = Date.now();
      let attemptCount = 0;

      const mockFn = jest.fn().mockImplementation(() => {
        attemptCount++;
        if (attemptCount === 1) {
          const error: any = new Error('Rate limited');
          error.statusCode = 429;
          error.response = {
            headers: {
              'retry-after': '1', // 1 second
            },
          };
          return Promise.reject(error);
        }
        return Promise.resolve('success');
      });

      const result = await rateLimitHandler.executeWithRetry(mockFn);
      const duration = Date.now() - startTime;

      expect(result).toBe('success');
      expect(duration).toBeGreaterThanOrEqual(900); // At least 0.9 seconds
    }, 10000);

    it('should track consecutive rate limits', async () => {
      let attemptCount = 0;
      const mockFn = jest.fn().mockImplementation(() => {
        attemptCount++;
        if (attemptCount <= 2) {
          const error: any = new Error('Rate limited');
          error.statusCode = 429;
          return Promise.reject(error);
        }
        return Promise.resolve('success');
      });

      await rateLimitHandler.executeWithRetry(mockFn);

      expect(rateLimitHandler.getConsecutiveRateLimits()).toBe(0); // Reset on success
    }, 10000);
  });

  describe('Error Classification', () => {
    it('should retry on 503 Service Unavailable', async () => {
      let attemptCount = 0;
      const mockFn = jest.fn().mockImplementation(() => {
        attemptCount++;
        if (attemptCount === 1) {
          const error: any = new Error('Service Unavailable');
          error.statusCode = 503;
          return Promise.reject(error);
        }
        return Promise.resolve('success');
      });

      const result = await rateLimitHandler.executeWithRetry(mockFn);

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(2);
    }, 10000);

    it('should not retry on 404 Not Found', async () => {
      const mockFn = jest.fn().mockImplementation(() => {
        const error: any = new Error('Not Found');
        error.statusCode = 404;
        return Promise.reject(error);
      });

      await expect(rateLimitHandler.executeWithRetry(mockFn)).rejects.toThrow(
        'Not Found'
      );
      expect(mockFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('Concurrent Execution', () => {
    it('should handle multiple concurrent requests', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');

      const promises = [
        rateLimitHandler.executeWithRetry(mockFn),
        rateLimitHandler.executeWithRetry(mockFn),
        rateLimitHandler.executeWithRetry(mockFn),
      ];

      const results = await Promise.all(promises);

      expect(results).toEqual(['success', 'success', 'success']);
      expect(mockFn).toHaveBeenCalledTimes(3);
    });

    it('should handle intermittent failures across retries', async () => {
      let callCount = 0;
      const mockFn = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          const error: any = new Error('Intermittent');
          error.code = 'ECONNRESET';
          return Promise.reject(error);
        }
        return Promise.resolve('success');
      });

      const result = await rateLimitHandler.executeWithRetry(mockFn);

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(2);
    }, 10000);
  });
});
