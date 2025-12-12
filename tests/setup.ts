/**
 * Jest Test Setup
 *
 * This file runs before each test suite.
 * Configure global test utilities, mocks, and environment here.
 */

// Extend Jest matchers if needed
// import '@testing-library/jest-dom';

// Global test timeout
jest.setTimeout(5000);

// Mock console methods to reduce noise in tests (optional)
global.console = {
  ...console,
  // Uncomment to suppress console output in tests
  // log: jest.fn(),
  // debug: jest.fn(),
  // info: jest.fn(),
  // warn: jest.fn(),
  // error: jest.fn(),
};

// Global beforeEach hook
beforeEach(() => {
  // Clear all mocks before each test
  jest.clearAllMocks();
});

// Global afterEach hook
afterEach(() => {
  // Clean up after each test
  jest.restoreAllMocks();
});

// Global test utilities
export const testUtils = {
  /**
   * Delay execution for testing async operations
   */
  delay: (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms)),

  /**
   * Create a mock logger for testing
   */
  createMockLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
};
