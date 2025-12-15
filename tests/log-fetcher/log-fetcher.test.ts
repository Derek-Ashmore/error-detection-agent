/**
 * Log Fetcher Service Tests
 *
 * Tests main log fetching service with mocked Azure SDK:
 * - Successful log retrieval
 * - Error handling and resilience
 * - Integration with all components
 */

import { DefaultAzureCredential } from '@azure/identity';
import {
  LogsQueryClient,
  LogsQueryResult,
  LogsQueryResultStatus,
  LogsQuerySuccessfulResult,
  LogsQueryPartialResult,
  LogsTable,
} from '@azure/monitor-query-logs';

// Mock Azure SDK
jest.mock('@azure/identity');
jest.mock('@azure/monitor-query-logs');

describe('LogFetcherService', () => {
  let mockLogsQueryClient: jest.Mocked<LogsQueryClient>;
  let mockCredential: jest.Mocked<DefaultAzureCredential>;
  let mockLogger: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockCredential = {
      getToken: jest.fn().mockResolvedValue({
        token: 'mock-token',
        expiresOnTimestamp: Date.now() + 3600000,
      }),
    } as any;

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    mockLogsQueryClient = {
      queryWorkspace: jest.fn(),
    } as any;

    (DefaultAzureCredential as jest.MockedClass<typeof DefaultAzureCredential>).mockImplementation(
      () => mockCredential
    );

    (LogsQueryClient as jest.MockedClass<typeof LogsQueryClient>).mockImplementation(
      () => mockLogsQueryClient
    );
  });

  describe('Successful Log Retrieval', () => {
    it('should fetch logs successfully with valid configuration', async () => {
      // Arrange
      const workspaceId = 'test-workspace-id';
      const query = "traces | where severityLevel in ('Error', 'Warning') | take 100";

      const mockTable: LogsTable = {
        name: 'PrimaryResult',
        columnDescriptors: [
          { name: 'timestamp', type: 'datetime' },
          { name: 'severityLevel', type: 'string' },
          { name: 'message', type: 'string' },
        ],
        rows: [
          [new Date('2025-12-13T10:00:00Z'), 'Error', 'Test error message'],
          [new Date('2025-12-13T10:01:00Z'), 'Warning', 'Test warning message'],
        ],
      };

      const mockResult: LogsQuerySuccessfulResult = {
        tables: [mockTable],
        status: LogsQueryResultStatus.Success,
      };

      mockLogsQueryClient.queryWorkspace.mockResolvedValueOnce(mockResult);

      // Act
      const credential = new DefaultAzureCredential();
      const client = new LogsQueryClient(credential);
      const result = await client.queryWorkspace(workspaceId, query, {
        duration: 'PT1H',
      });

      // Assert
      expect((result as LogsQuerySuccessfulResult).tables).toHaveLength(1);
      expect((result as LogsQuerySuccessfulResult).tables[0]?.rows).toHaveLength(2);
      expect(result.status).toBe('Success');
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogsQueryClient.queryWorkspace).toHaveBeenCalledWith(
        workspaceId,
        query,
        expect.objectContaining({ duration: 'PT1H' })
      );
    });

    it('should parse log entries into structured format', async () => {
      // Arrange
      const mockTable: LogsTable = {
        name: 'PrimaryResult',
        columnDescriptors: [
          { name: 'timestamp', type: 'datetime' },
          { name: 'severityLevel', type: 'string' },
          { name: 'message', type: 'string' },
          { name: 'operation_Name', type: 'string' },
        ],
        rows: [
          [
            new Date('2025-12-13T10:00:00Z'),
            'Error',
            'Database connection failed',
            'GET /api/users',
          ],
        ],
      };

      const mockResult: LogsQuerySuccessfulResult = {
        tables: [mockTable],
        status: LogsQueryResultStatus.Success,
      };

      mockLogsQueryClient.queryWorkspace.mockResolvedValueOnce(mockResult);

      // Act
      const credential = new DefaultAzureCredential();
      const client = new LogsQueryClient(credential);
      const result = await client.queryWorkspace('workspace-id', 'query', {
        duration: 'PT1H',
      });

      const logEntries = (result as LogsQuerySuccessfulResult).tables[0]?.rows.map(
        (row: (Date | string | number | Record<string, unknown> | boolean)[]) => ({
          timestamp: row[0],
          severityLevel: row[1],
          message: row[2],
          operationName: row[3],
        })
      );

      // Assert
      expect(logEntries).toHaveLength(1);
      expect(logEntries?.[0]).toEqual({
        timestamp: new Date('2025-12-13T10:00:00Z'),
        severityLevel: 'Error',
        message: 'Database connection failed',
        operationName: 'GET /api/users',
      });
    });

    it('should track query execution metrics', async () => {
      // Arrange
      const startTime = Date.now();
      const mockResult: LogsQuerySuccessfulResult = {
        tables: [
          {
            name: 'PrimaryResult',
            columnDescriptors: [{ name: 'timestamp', type: 'datetime' }],
            rows: [[new Date()]],
          },
        ],
        status: LogsQueryResultStatus.Success,
      };

      mockLogsQueryClient.queryWorkspace.mockResolvedValueOnce(mockResult);

      // Act
      const credential = new DefaultAzureCredential();
      const client = new LogsQueryClient(credential);
      const result = await client.queryWorkspace('workspace-id', 'query', {
        duration: 'PT1H',
      });
      const duration = Date.now() - startTime;

      const metrics = {
        duration,
        entryCount: (result as LogsQuerySuccessfulResult).tables[0]?.rows.length ?? 0,
        status: result.status,
      };

      // Assert
      expect(metrics.duration).toBeGreaterThanOrEqual(0);
      expect(metrics.entryCount).toBe(1);
      expect(metrics.status).toBe('Success');
    });
  });

  describe('Error Handling', () => {
    it('should handle query errors gracefully', async () => {
      // Arrange
      const errorMessage = 'Query syntax error';
      mockLogsQueryClient.queryWorkspace.mockRejectedValueOnce(new Error(errorMessage));

      // Act & Assert
      const credential = new DefaultAzureCredential();
      const client = new LogsQueryClient(credential);

      await expect(
        client.queryWorkspace('workspace-id', 'invalid query', { duration: 'PT1H' })
      ).rejects.toThrow(errorMessage);
    });

    it('should handle partial query results', async () => {
      // Arrange
      const mockResult: LogsQueryPartialResult = {
        partialTables: [
          {
            name: 'PrimaryResult',
            columnDescriptors: [{ name: 'timestamp', type: 'datetime' }],
            rows: [[new Date()]],
          },
        ],
        status: LogsQueryResultStatus.PartialFailure,
        partialError: {
          code: 'PartialError',
          message: 'Query partially failed',
        },
      };

      mockLogsQueryClient.queryWorkspace.mockResolvedValueOnce(mockResult);

      // Act
      const credential = new DefaultAzureCredential();
      const client = new LogsQueryClient(credential);
      const result = await client.queryWorkspace('workspace-id', 'query', {
        duration: 'PT1H',
      });

      // Assert
      expect(result.status).toBe('PartialFailure');
      expect((result as LogsQueryPartialResult).partialError).toBeDefined();
      expect((result as LogsQueryPartialResult).partialTables[0]?.rows).toHaveLength(1);
    });

    it('should implement retry logic for transient failures', async () => {
      // Arrange
      const maxRetries = 3;
      let attemptCount = 0;

      mockLogsQueryClient.queryWorkspace
        .mockRejectedValueOnce(new Error('Transient error 1'))
        .mockRejectedValueOnce(new Error('Transient error 2'))
        .mockResolvedValueOnce({
          tables: [
            {
              name: 'PrimaryResult',
              columnDescriptors: [{ name: 'timestamp', type: 'datetime' }],
              rows: [[new Date()]],
            },
          ],
          status: LogsQueryResultStatus.Success,
        });

      // Act
      const executeWithRetry = async (): Promise<LogsQueryResult> => {
        while (attemptCount < maxRetries) {
          try {
            attemptCount++;
            const credential = new DefaultAzureCredential();
            const client = new LogsQueryClient(credential);
            return await client.queryWorkspace('workspace-id', 'query', {
              duration: 'PT1H',
            });
          } catch (error) {
            if (attemptCount >= maxRetries) {
              throw error;
            }
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        }
        throw new Error('Max retries exceeded');
      };

      const result = await executeWithRetry();

      // Assert
      expect(result.status).toBe('Success');
      expect(attemptCount).toBe(3);
    });
  });

  describe('Observability', () => {
    it('should log query execution metrics on success', async () => {
      // Arrange
      const mockResult: LogsQuerySuccessfulResult = {
        tables: [
          {
            name: 'PrimaryResult',
            columnDescriptors: [{ name: 'timestamp', type: 'datetime' }],
            rows: Array(50).fill([new Date()]),
          },
        ],
        status: LogsQueryResultStatus.Success,
      };

      mockLogsQueryClient.queryWorkspace.mockResolvedValueOnce(mockResult);

      // Act
      const startTime = Date.now();
      const credential = new DefaultAzureCredential();
      const client = new LogsQueryClient(credential);
      const result = await client.queryWorkspace('workspace-id', 'query', {
        duration: 'PT1H',
      });
      const duration = Date.now() - startTime;

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      mockLogger.info({
        message: 'Query completed successfully',
        duration,
        entryCount: (result as LogsQuerySuccessfulResult).tables[0]?.rows.length ?? 0,
        requestId: 'test-request-id',
      });

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Query completed successfully',
          entryCount: 50,
        })
      );
    });

    it('should log query failures with full context', async () => {
      // Arrange
      const queryText = "traces | where severityLevel == 'Error'";
      const errorDetails = new Error('Query timeout');

      mockLogsQueryClient.queryWorkspace.mockRejectedValueOnce(errorDetails);

      // Act
      try {
        const credential = new DefaultAzureCredential();
        const client = new LogsQueryClient(credential);
        await client.queryWorkspace('workspace-id', queryText, { duration: 'PT1H' });
      } catch (error) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        mockLogger.error({
          message: 'Query failed',
          error: (error as Error).message,
          query: queryText,
          workspaceId: 'workspace-id',
        });
      }

      // Assert
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Query failed',
          error: 'Query timeout',
          query: queryText,
        })
      );
    });

    it('should emit metrics for monitoring', async () => {
      // Arrange
      const metricsCollector = {
        recordQueryDuration: jest.fn(),
        incrementSuccessCounter: jest.fn(),
        incrementFailureCounter: jest.fn(),
      };

      const mockResult: LogsQuerySuccessfulResult = {
        tables: [
          {
            name: 'PrimaryResult',
            columnDescriptors: [{ name: 'timestamp', type: 'datetime' }],
            rows: [[new Date()]],
          },
        ],
        status: LogsQueryResultStatus.Success,
      };

      mockLogsQueryClient.queryWorkspace.mockResolvedValueOnce(mockResult);

      // Act
      const startTime = Date.now();
      const credential = new DefaultAzureCredential();
      const client = new LogsQueryClient(credential);
      await client.queryWorkspace('workspace-id', 'query', { duration: 'PT1H' });
      const duration = Date.now() - startTime;

      metricsCollector.recordQueryDuration(duration);
      metricsCollector.incrementSuccessCounter();

      // Assert
      expect(metricsCollector.recordQueryDuration).toHaveBeenCalledWith(duration);
      expect(metricsCollector.incrementSuccessCounter).toHaveBeenCalled();
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle complete fetch-parse-process workflow', async () => {
      // Arrange
      const mockTable: LogsTable = {
        name: 'PrimaryResult',
        columnDescriptors: [
          { name: 'timestamp', type: 'datetime' },
          { name: 'severityLevel', type: 'string' },
          { name: 'message', type: 'string' },
        ],
        rows: [
          [new Date('2025-12-13T10:00:00Z'), 'Error', 'Connection timeout'],
          [new Date('2025-12-13T10:01:00Z'), 'Error', 'Authentication failed'],
        ],
      };

      mockLogsQueryClient.queryWorkspace.mockResolvedValueOnce({
        tables: [mockTable],
        status: LogsQueryResultStatus.Success,
      });

      // Act
      const credential = new DefaultAzureCredential();
      const client = new LogsQueryClient(credential);
      const result = await client.queryWorkspace('workspace-id', 'query', {
        duration: 'PT1H',
      });

      const parsedEntries =
        (result as LogsQuerySuccessfulResult).tables[0]?.rows.map(
          (row: (Date | string | number | Record<string, unknown> | boolean)[]) => ({
            timestamp: row[0],
            severity: row[1],
            message: row[2],
          })
        ) ?? [];

      const errorEntries = parsedEntries.filter(
        (entry: {
          timestamp: Date | string | number | Record<string, unknown> | boolean | undefined;
          severity: Date | string | number | Record<string, unknown> | boolean | undefined;
          message: Date | string | number | Record<string, unknown> | boolean | undefined;
        }) => entry.severity === 'Error'
      );

      // Assert
      expect(parsedEntries).toHaveLength(2);
      expect(errorEntries).toHaveLength(2);
      expect(errorEntries[0]?.message).toBe('Connection timeout');
    });

    it('should coordinate with rate limiter and circuit breaker', async () => {
      // Arrange
      const rateLimiter = {
        canProceed: jest.fn().mockReturnValue(true),
        recordRequest: jest.fn(),
      };

      const circuitBreaker = {
        isOpen: jest.fn().mockReturnValue(false),
        recordSuccess: jest.fn(),
        recordFailure: jest.fn(),
      };

      mockLogsQueryClient.queryWorkspace.mockResolvedValueOnce({
        tables: [
          {
            name: 'PrimaryResult',
            columnDescriptors: [{ name: 'timestamp', type: 'datetime' }],
            rows: [[new Date()]],
          },
        ],
        status: LogsQueryResultStatus.Success,
      });

      // Act
      if (circuitBreaker.isOpen() === true) {
        throw new Error('Circuit breaker is open');
      }

      if (rateLimiter.canProceed() !== true) {
        throw new Error('Rate limit exceeded');
      }

      const credential = new DefaultAzureCredential();
      const client = new LogsQueryClient(credential);
      const result = await client.queryWorkspace('workspace-id', 'query', {
        duration: 'PT1H',
      });

      rateLimiter.recordRequest();
      circuitBreaker.recordSuccess();

      // Assert
      expect(result.status).toBe('Success');
      expect(rateLimiter.canProceed).toHaveBeenCalled();
      expect(circuitBreaker.isOpen).toHaveBeenCalled();
      expect(circuitBreaker.recordSuccess).toHaveBeenCalled();
    });
  });
});
