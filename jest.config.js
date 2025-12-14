/** @type {import('jest').Config} */
module.exports = {
  // Use ts-jest preset for TypeScript support
  preset: 'ts-jest',

  // Test environment
  testEnvironment: 'node',

  // Root directory
  rootDir: '.',

  // Test match patterns
  testMatch: [
    '**/tests/**/*.test.ts',
    '**/tests/**/*.spec.ts',
    '**/__tests__/**/*.ts',
  ],

  // Test path ignore patterns for integration tests
  // Integration tests are run separately with different configuration
  testPathIgnorePatterns: process.env.RUN_INTEGRATION_TESTS === 'false'
    ? [
        '/node_modules/',
        '/dist/',
        '/build/',
        '/.swarm/',
        '/.claude-flow/',
        '/tests/**/integration/', // Skip integration tests in unit test runs
      ]
    : [
        '/node_modules/',
        '/dist/',
        '/build/',
        '/.swarm/',
        '/.claude-flow/',
      ],

  // Module file extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],

  // Transform files with ts-jest
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        strict: true,
        skipLibCheck: true,
      }
    }],
  },

  // Module name mapper for path aliases
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1',
  },

  // Coverage configuration - >90% threshold as per requirements
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json-summary'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.interface.ts',
    '!src/**/*.type.ts',
    '!src/**/index.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],

  // Clear mocks between tests
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,

  // Verbose output
  verbose: true,

  // Test timeout (5 seconds for unit tests, 60 seconds for integration tests)
  testTimeout: process.env.TEST_TYPE === 'integration' ? 60000 : 5000,

  // Coverage path ignore patterns
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/tests/',
    '/dist/',
    '/build/',
  ],

  // Global setup/teardown
  // globalSetup: '<rootDir>/tests/globalSetup.ts',
  // globalTeardown: '<rootDir>/tests/globalTeardown.ts',

  // Max workers for parallel test execution
  maxWorkers: '50%',

  // Notify on failures
  notifyMode: 'failure-change',

  // Error on deprecated APIs
  errorOnDeprecated: true,
};
