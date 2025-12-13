/**
 * Circuit breaker pattern implementation
 *
 * This module implements a circuit breaker to prevent cascading failures
 * when the Azure API is consistently unavailable.
 */

import { CircuitBreakerState, type CircuitBreakerStats } from './types';

/**
 * Circuit breaker to prevent cascading failures
 */
export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private lastFailureTime: Date | null = null;
  private nextRetryTime: Date | null = null;
  private totalRequests = 0;
  private totalFailures = 0;

  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;

  /**
   * Creates a new circuit breaker
   * @param failureThreshold - Number of consecutive failures to open circuit (default: 5)
   * @param resetTimeoutMs - Time to wait before attempting recovery in open state (default: 300000ms = 5 minutes)
   */
  constructor(failureThreshold = 5, resetTimeoutMs = 300000) {
    if (failureThreshold < 1) {
      throw new Error('Failure threshold must be at least 1');
    }
    if (resetTimeoutMs < 1000) {
      throw new Error('Reset timeout must be at least 1000ms');
    }

    this.failureThreshold = failureThreshold;
    this.resetTimeoutMs = resetTimeoutMs;
  }

  /**
   * Execute a function with circuit breaker protection
   *
   * @param fn - Async function to execute
   * @returns Result of the function
   * @throws Error if circuit is open
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit should transition from open to half-open
    if (this.state === CircuitBreakerState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.transitionToHalfOpen();
      } else {
        throw new Error(
          `Circuit breaker is OPEN. Next retry at ${this.nextRetryTime?.toISOString()}`
        );
      }
    }

    this.totalRequests++;

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    // Reset failure count
    this.failureCount = 0;

    // If in half-open state, transition back to closed
    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.transitionToClosed();
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(): void {
    this.failureCount++;
    this.totalFailures++;
    this.lastFailureTime = new Date();

    // If in half-open state, go back to open on any failure
    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.transitionToOpen();
      return;
    }

    // If in closed state, check if we should open
    if (this.state === CircuitBreakerState.CLOSED && this.failureCount >= this.failureThreshold) {
      this.transitionToOpen();
    }
  }

  /**
   * Transition to CLOSED state
   */
  private transitionToClosed(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.nextRetryTime = null;
  }

  /**
   * Transition to OPEN state
   */
  private transitionToOpen(): void {
    this.state = CircuitBreakerState.OPEN;
    this.nextRetryTime = new Date(Date.now() + this.resetTimeoutMs);
  }

  /**
   * Transition to HALF_OPEN state
   */
  private transitionToHalfOpen(): void {
    this.state = CircuitBreakerState.HALF_OPEN;
    this.failureCount = 0;
  }

  /**
   * Check if enough time has passed to attempt reset
   * @returns True if should attempt reset
   */
  private shouldAttemptReset(): boolean {
    if (this.nextRetryTime === null) {
      return false;
    }
    return Date.now() >= this.nextRetryTime.getTime();
  }

  /**
   * Get current circuit breaker state
   * @returns Current state
   */
  getState(): CircuitBreakerState {
    return this.state;
  }

  /**
   * Get circuit breaker statistics
   * @returns Statistics object
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime ?? undefined,
      nextRetryTime: this.nextRetryTime ?? undefined,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
    };
  }

  /**
   * Check if circuit is allowing requests
   * @returns True if circuit is closed or half-open
   */
  isAllowingRequests(): boolean {
    if (this.state === CircuitBreakerState.CLOSED) {
      return true;
    }

    if (this.state === CircuitBreakerState.OPEN && this.shouldAttemptReset()) {
      return true;
    }

    return this.state === CircuitBreakerState.HALF_OPEN;
  }

  /**
   * Manually reset the circuit breaker (useful for testing or manual recovery)
   */
  reset(): void {
    this.transitionToClosed();
    this.lastFailureTime = null;
    this.totalRequests = 0;
    this.totalFailures = 0;
  }

  /**
   * Force circuit to open (useful for testing or manual intervention)
   */
  forceOpen(): void {
    this.transitionToOpen();
  }
}
