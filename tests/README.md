# Test Directory

This directory contains all test files for the error-detection-agent project.

## Structure

```
tests/
├── setup.ts           # Global test setup and utilities
├── example.test.ts    # Example test file (delete when not needed)
└── README.md          # This file
```

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run tests in CI mode
npm run test:ci

# Run tests with verbose output
npm run test:verbose
```

## Coverage Thresholds

This project maintains **>90% code coverage** on:
- Branches: 90%
- Functions: 90%
- Lines: 90%
- Statements: 90%

## Test File Naming

- Unit tests: `*.test.ts` or `*.spec.ts`
- Place tests in this `/tests` directory
- Mirror source structure when appropriate

## Writing Tests

Example test structure:

```typescript
import { testUtils } from './setup';

describe('Feature Name', () => {
  describe('Specific Functionality', () => {
    it('should do something specific', () => {
      // Arrange
      const input = 'test';

      // Act
      const result = someFunction(input);

      // Assert
      expect(result).toBe('expected');
    });
  });
});
```

## Test Utilities

Available in `testUtils` from `./setup.ts`:
- `delay(ms)` - Async delay helper
- `createMockLogger()` - Mock logger for testing

## Best Practices

1. **Arrange-Act-Assert Pattern**: Structure tests clearly
2. **One Assertion Per Test**: Keep tests focused
3. **Descriptive Names**: Use clear test descriptions
4. **Mock External Dependencies**: Isolate units under test
5. **Test Edge Cases**: Cover error conditions and boundaries
6. **Clean Up**: Use beforeEach/afterEach for setup/teardown
