/**
 * Example Test File
 *
 * This demonstrates the test file structure and best practices.
 * Delete this file once you have actual tests.
 */

import { testUtils } from './setup';

describe('Example Test Suite', () => {
  describe('Basic Tests', () => {
    it('should pass a simple assertion', () => {
      expect(true).toBe(true);
    });

    it('should handle async operations', async () => {
      await testUtils.delay(10);
      expect(true).toBe(true);
    });
  });

  describe('Mock Tests', () => {
    it('should use mock functions', () => {
      const mockFn = jest.fn();
      mockFn('test');

      expect(mockFn).toHaveBeenCalledWith('test');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should use mock logger', () => {
      const logger = testUtils.createMockLogger();
      logger.info('test message');

      expect(logger.info).toHaveBeenCalledWith('test message');
    });
  });

  describe('Error Handling', () => {
    it('should catch errors', () => {
      const throwError = (): never => {
        throw new Error('Test error');
      };

      expect(throwError).toThrow('Test error');
    });

    it('should handle async errors', async () => {
      const asyncError = (): Promise<never> => {
        return Promise.reject(new Error('Async error'));
      };

      await expect(asyncError()).rejects.toThrow('Async error');
    });
  });

  describe('Test Coverage Examples', () => {
    class ExampleClass {
      add(a: number, b: number): number {
        return a + b;
      }

      subtract(a: number, b: number): number {
        return a - b;
      }

      divide(a: number, b: number): number {
        if (b === 0) {
          throw new Error('Division by zero');
        }
        return a / b;
      }
    }

    let calculator: ExampleClass;

    beforeEach(() => {
      calculator = new ExampleClass();
    });

    it('should add numbers', () => {
      expect(calculator.add(2, 3)).toBe(5);
    });

    it('should subtract numbers', () => {
      expect(calculator.subtract(5, 3)).toBe(2);
    });

    it('should divide numbers', () => {
      expect(calculator.divide(6, 2)).toBe(3);
    });

    it('should throw on division by zero', () => {
      expect(() => calculator.divide(5, 0)).toThrow('Division by zero');
    });
  });
});
