/**
 * Rate limit handler with exponential backoff
 *
 * This module handles Azure API rate limits (HTTP 429) with retry logic
 * and exponential backoff delays.
 */

import type { RateLimitInfo, RetryConfig } from './types';

/**
 * Handles rate limiting and retry logic for Azure API calls
 */
export class RateLimitHandler {
  private readonly config: RetryConfig;
  private consecutiveRateLimits = 0;
  private readonly rateLimitThreshold = 3;

  /**
   * Creates a new rate limit handler
   * @param config - Retry configuration
   */
  constructor(config: RetryConfig) {
    this.validateConfig(config);
    this.config = config;
  }

  /**
   * Execute a function with retry logic and exponential backoff
   *
   * @param fn - Async function to execute
   * @param attemptNumber - Current attempt number (used for recursion)
   * @returns Result of the function
   * @throws Error if max retries exceeded
   */
  async executeWithRetry<T>(fn: () => Promise<T>, attemptNumber = 0): Promise<T> {
    try {
      const result = await fn();

      // Reset consecutive rate limits on success
      this.consecutiveRateLimits = 0;

      return result;
    } catch (error) {
      const rateLimitInfo = this.extractRateLimitInfo(error);

      // Check if we should retry
      if (attemptNumber >= this.config.maxRetries) {
        throw new Error(
          `Max retries (${this.config.maxRetries}) exceeded: ${this.getErrorMessage(error)}`
        );
      }

      // Handle rate limit error
      if (rateLimitInfo.isLimited) {
        this.consecutiveRateLimits++;

        if (this.consecutiveRateLimits >= this.rateLimitThreshold) {
          // Alert threshold reached (would trigger notification in production)
          console.warn(
            `Rate limit threshold reached: ${this.consecutiveRateLimits} consecutive rate limits`
          );
        }

        const delayMs = this.calculateDelay(attemptNumber, rateLimitInfo);
        await this.delay(delayMs);

        return this.executeWithRetry(fn, attemptNumber + 1);
      }

      // Handle other retryable errors (network, timeout, 503, etc.)
      if (this.isRetryableError(error)) {
        const delayMs = this.calculateDelay(attemptNumber);
        await this.delay(delayMs);

        return this.executeWithRetry(fn, attemptNumber + 1);
      }

      // Non-retryable error
      throw error;
    }
  }

  /**
   * Calculate delay for next retry using exponential backoff
   *
   * @param attemptNumber - Current attempt number
   * @param rateLimitInfo - Optional rate limit information
   * @returns Delay in milliseconds
   */
  private calculateDelay(attemptNumber: number, rateLimitInfo?: RateLimitInfo): number {
    // Use retry-after header if available
    if (rateLimitInfo?.retryAfterMs !== undefined && rateLimitInfo.retryAfterMs !== null) {
      return rateLimitInfo.retryAfterMs;
    }

    // Exponential backoff: initialDelay * (backoffMultiplier ^ attemptNumber)
    const exponentialDelay =
      this.config.initialDelayMs * Math.pow(this.config.backoffMultiplier, attemptNumber);

    // Add jitter to prevent thundering herd (±20% randomization)
    const jitter = exponentialDelay * 0.2 * (Math.random() - 0.5);
    const delayWithJitter = exponentialDelay + jitter;

    // Cap at maximum delay
    return Math.min(delayWithJitter, this.config.maxDelayMs);
  }

  /**
   * Extract rate limit information from error
   *
   * @param error - Error object
   * @returns Rate limit information
   */
  private extractRateLimitInfo(error: unknown): RateLimitInfo {
    // Check if this is a rate limit error (429)
    if (this.isRateLimitError(error)) {
      // Try to extract retry-after header
      const retryAfter = this.extractRetryAfter(error);

      return {
        isLimited: true,
        retryAfterMs: retryAfter,
        resetTime: retryAfter !== undefined ? new Date(Date.now() + retryAfter) : undefined,
      };
    }

    return { isLimited: false };
  }

  /**
   * Check if error is a rate limit error (HTTP 429)
   *
   * @param error - Error to check
   * @returns True if rate limit error
   */
  private isRateLimitError(error: unknown): boolean {
    if (error === null || error === undefined || typeof error !== 'object') {
      return false;
    }

    // Check for Azure SDK error structure
    const azureError = error as { statusCode?: number; code?: string };

    return (
      azureError.statusCode === 429 ||
      azureError.code === 'TooManyRequests' ||
      azureError.code === '429'
    );
  }

  /**
   * Extract retry-after value from error
   *
   * @param error - Error object
   * @returns Retry-after delay in milliseconds, or undefined
   */
  private extractRetryAfter(error: unknown): number | undefined {
    if (error === null || error === undefined || typeof error !== 'object') {
      return undefined;
    }

    const azureError = error as {
      response?: {
        headers?: {
          'retry-after'?: string | number;
          'x-ms-retry-after-ms'?: string | number;
        };
      };
    };

    const headers = azureError.response?.headers;
    if (headers === undefined || headers === null) {
      return undefined;
    }

    // Try x-ms-retry-after-ms first (Azure-specific)
    const msHeader = headers['x-ms-retry-after-ms'];
    if (msHeader !== undefined && msHeader !== null) {
      const ms = typeof msHeader === 'string' ? parseInt(msHeader, 10) : msHeader;
      if (!isNaN(ms)) {
        return ms;
      }
    }

    // Try standard retry-after header
    const retryAfter = headers['retry-after'];
    if (retryAfter !== undefined && retryAfter !== null) {
      const value = typeof retryAfter === 'string' ? parseInt(retryAfter, 10) : retryAfter;
      if (!isNaN(value)) {
        // retry-after is in seconds, convert to milliseconds
        return value * 1000;
      }
    }

    return undefined;
  }

  /**
   * Check if error is retryable (network, timeout, 503, etc.)
   *
   * @param error - Error to check
   * @returns True if retryable
   */
  private isRetryableError(error: unknown): boolean {
    if (error === null || error === undefined || typeof error !== 'object') {
      return false;
    }

    const azureError = error as {
      statusCode?: number;
      code?: string;
      message?: string;
    };

    // Retryable HTTP status codes
    const retryableStatusCodes = [408, 500, 502, 503, 504];
    if (azureError.statusCode !== undefined && retryableStatusCodes.includes(azureError.statusCode)) {
      return true;
    }

    // Retryable error codes
    const retryableCodes = [
      'ETIMEDOUT',
      'ECONNRESET',
      'ECONNREFUSED',
      'ENOTFOUND',
      'ENETUNREACH',
      'NETWORK_ERROR',
    ];
    if (azureError.code !== undefined && retryableCodes.includes(azureError.code)) {
      return true;
    }

    // Check for timeout in message
    const message = azureError.message?.toLowerCase() ?? '';
    if (message.includes('timeout') || message.includes('timed out')) {
      return true;
    }

    return false;
  }

  /**
   * Get consecutive rate limit count
   * @returns Number of consecutive rate limits
   */
  getConsecutiveRateLimits(): number {
    return this.consecutiveRateLimits;
  }

  /**
   * Reset consecutive rate limit counter
   */
  resetRateLimitCount(): void {
    this.consecutiveRateLimits = 0;
  }

  /**
   * Validate retry configuration
   * @param config - Configuration to validate
   */
  private validateConfig(config: RetryConfig): void {
    if (config.maxRetries < 0 || config.maxRetries > 10) {
      throw new Error('maxRetries must be between 0 and 10');
    }

    if (config.initialDelayMs < 0) {
      throw new Error('initialDelayMs must be non-negative');
    }

    if (config.maxDelayMs < config.initialDelayMs) {
      throw new Error('maxDelayMs must be >= initialDelayMs');
    }

    if (config.backoffMultiplier < 1) {
      throw new Error('backoffMultiplier must be >= 1');
    }
  }

  /**
   * Extract error message from error object
   * @param error - Error object
   * @returns Error message string
   */
  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    return 'Unknown error';
  }

  /**
   * Delay helper
   * @param ms - Milliseconds to delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
