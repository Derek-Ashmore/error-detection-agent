/**
 * Integration tests for CircuitBreaker
 *
 * Tests the actual circuit breaker behavior with real execution
 */

import { CircuitBreaker } from '../../../src/log-fetcher/circuit-breaker';
import { CircuitBreakerState } from '../../../src/log-fetcher/types';

describe('CircuitBreaker Integration Tests', () => {
  let circuitBreaker: CircuitBreaker;
  const failureThreshold = 3;
  const resetTimeout = 1000; // 1 second for faster tests

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker(failureThreshold, resetTimeout);
  });

  describe('Circuit State Transitions', () => {
    it('should start in CLOSED state', () => {
      // Act
      const stats = circuitBreaker.getStats();

      // Assert
      expect(stats.state).toBe(CircuitBreakerState.CLOSED);
      expect(stats.failureCount).toBe(0);
    });

    it('should execute function successfully in CLOSED state', async () => {
      // Arrange
      const mockFn = jest.fn().mockResolvedValue('success');

      // Act
      const result = await circuitBreaker.execute(mockFn);

      // Assert
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(circuitBreaker.getStats().state).toBe(CircuitBreakerState.CLOSED);
    });

    it('should track failures and open circuit after threshold', async () => {
      // Arrange
      const mockFn = jest.fn().mockRejectedValue(new Error('Service unavailable'));

      // Act - Execute failing function multiple times
      for (let i = 0; i < failureThreshold; i++) {
        try {
          await circuitBreaker.execute(mockFn);
        } catch (error) {
          // Expected to fail
        }
      }

      // Assert
      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitBreakerState.OPEN);
      expect(stats.failureCount).toBe(failureThreshold);
    });

    it('should reject requests immediately when circuit is OPEN', async () => {
      // Arrange - Open the circuit
      const failingFn = jest.fn().mockRejectedValue(new Error('Fail'));
      for (let i = 0; i < failureThreshold; i++) {
        try {
          await circuitBreaker.execute(failingFn);
        } catch (error) {
          // Expected
        }
      }

      const mockFn = jest.fn().mockResolvedValue('success');

      // Act & Assert
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow('Circuit breaker is OPEN');
      expect(mockFn).not.toHaveBeenCalled(); // Function should not execute
    });

    it('should transition to HALF_OPEN after reset timeout', async () => {
      // Arrange - Open the circuit
      const failingFn = jest.fn().mockRejectedValue(new Error('Fail'));
      for (let i = 0; i < failureThreshold; i++) {
        try {
          await circuitBreaker.execute(failingFn);
        } catch (error) {
          // Expected
        }
      }

      // Act - Wait for reset timeout
      await new Promise((resolve) => setTimeout(resolve, resetTimeout + 100));

      // Try to execute - this should transition to HALF_OPEN
      const successFn = jest.fn().mockResolvedValue('success');
      await circuitBreaker.execute(successFn);

      // Assert
      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitBreakerState.CLOSED); // Back to CLOSED after success
    }, 5000);

    it('should reset failure count on successful execution', async () => {
      // Arrange
      const failingFn = jest.fn().mockRejectedValue(new Error('Fail'));
      const successFn = jest.fn().mockResolvedValue('success');

      // Act - Some failures
      try {
        await circuitBreaker.execute(failingFn);
      } catch (error) {
        // Expected
      }

      // Then success
      await circuitBreaker.execute(successFn);

      // Assert
      const stats = circuitBreaker.getStats();
      expect(stats.failureCount).toBe(0);
      expect(stats.state).toBe(CircuitBreakerState.CLOSED);
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should track total requests and failures', async () => {
      // Arrange
      const successFn = jest.fn().mockResolvedValue('success');
      const failingFn = jest.fn().mockRejectedValue(new Error('Fail'));

      // Act
      await circuitBreaker.execute(successFn);
      await circuitBreaker.execute(successFn);
      try {
        await circuitBreaker.execute(failingFn);
      } catch (error) {
        // Expected
      }

      // Assert
      const stats = circuitBreaker.getStats();
      expect(stats.totalRequests).toBe(3);
      expect(stats.totalFailures).toBe(1);
    });

    it('should record last failure time', async () => {
      // Arrange
      const failingFn = jest.fn().mockRejectedValue(new Error('Fail'));
      const beforeFailure = new Date();

      // Act
      try {
        await circuitBreaker.execute(failingFn);
      } catch (error) {
        // Expected
      }

      // Assert
      const stats = circuitBreaker.getStats();
      expect(stats.lastFailureTime).toBeDefined();
      expect(stats.lastFailureTime!.getTime()).toBeGreaterThanOrEqual(beforeFailure.getTime());
    });
  });

  describe('Real-world Scenarios', () => {
    it('should handle mixed success and failure patterns', async () => {
      // Arrange
      const results = ['success', 'fail', 'success', 'fail', 'fail', 'success'];
      let callCount = 0;

      const mixedFn = jest.fn().mockImplementation(() => {
        const result = results[callCount++];
        if (result === 'success') {
          return Promise.resolve(result);
        }
        return Promise.reject(new Error(result));
      });

      // Act
      for (const _ of results) {
        try {
          await circuitBreaker.execute(mixedFn);
        } catch (error) {
          // Expected for failures
        }
      }

      // Assert
      const stats = circuitBreaker.getStats();
      expect(stats.totalRequests).toBe(6);
      expect(stats.totalFailures).toBe(3);
      expect(stats.state).toBe(CircuitBreakerState.CLOSED); // Success resets count
    });

    it('should protect against cascading failures', async () => {
      // Arrange
      const slowFailingFn = jest.fn().mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Timeout')), 100);
        });
      });

      // Act - Trigger failures to open circuit
      for (let i = 0; i < failureThreshold; i++) {
        try {
          await circuitBreaker.execute(slowFailingFn);
        } catch (error) {
          // Expected
        }
      }

      // Now circuit is open, subsequent calls should fail fast
      const startTime = Date.now();
      try {
        await circuitBreaker.execute(slowFailingFn);
      } catch (error) {
        // Expected
      }
      const duration = Date.now() - startTime;

      // Assert - Should fail immediately, not wait for timeout
      expect(duration).toBeLessThan(50); // Much less than the 100ms timeout
      expect(slowFailingFn).toHaveBeenCalledTimes(failureThreshold); // No additional calls
    });
  });
});
