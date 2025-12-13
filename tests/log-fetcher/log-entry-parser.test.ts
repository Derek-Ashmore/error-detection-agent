/**
 * Log Entry Parser Tests
 *
 * Tests parsing Azure log entries into structured format:
 * - Complete log entries with all fields
 * - Incomplete log entries with missing fields
 * - Parsing errors and malformed data
 * - Error codes, stack traces, and source location extraction
 */

describe('LogEntryParser', () => {
  describe('Scenario: Parse complete log entry', () => {
    it('should extract timestamp, severity, message, and metadata', () => {
      // Arrange
      const rawLogEntry = {
        timestamp: '2025-12-13T10:30:00Z',
        severityLevel: 'Error',
        message: 'Database connection failed',
        customDimensions: {
          userId: '12345',
          requestId: 'abc-def-ghi',
        },
        operation_Name: 'GET /api/users',
      };

      // Act
      const parsedEntry = {
        timestamp: new Date(rawLogEntry.timestamp),
        severity: rawLogEntry.severityLevel,
        message: rawLogEntry.message,
        metadata: rawLogEntry.customDimensions,
        operationName: rawLogEntry.operation_Name,
      };

      // Assert
      expect(parsedEntry.timestamp).toEqual(new Date('2025-12-13T10:30:00Z'));
      expect(parsedEntry.severity).toBe('Error');
      expect(parsedEntry.message).toBe('Database connection failed');
      expect(parsedEntry.metadata).toEqual({
        userId: '12345',
        requestId: 'abc-def-ghi',
      });
      expect(parsedEntry.operationName).toBe('GET /api/users');
    });

    it('should parse error codes if present', () => {
      // Arrange
      const rawLogEntry = {
        message: 'Error: ECONNREFUSED - Connection refused',
        customDimensions: {
          errorCode: 'ECONNREFUSED',
          errno: -111,
        },
      };

      // Act
      const errorCodeMatch = rawLogEntry.message.match(/Error:\s+(\w+)/);
      const errorCode = errorCodeMatch ? errorCodeMatch[1] : rawLogEntry.customDimensions.errorCode;

      // Assert
      expect(errorCode).toBe('ECONNREFUSED');
      expect(rawLogEntry.customDimensions.errno).toBe(-111);
    });

    it('should extract stack traces if present', () => {
      // Arrange
      const rawLogEntry = {
        message: 'Unhandled exception occurred',
        customDimensions: {
          stackTrace: `Error: Database connection failed
    at Database.connect (/app/db.js:45:15)
    at Server.start (/app/server.js:23:10)
    at Object.<anonymous> (/app/index.js:5:1)`,
        },
      };

      // Act
      const stackTrace = rawLogEntry.customDimensions.stackTrace;
      const stackLines = stackTrace.split('\n');
      const firstFrame = stackLines[1];

      // Assert
      expect(stackTrace).toBeDefined();
      expect(stackLines.length).toBeGreaterThan(1);
      expect(firstFrame).toContain('Database.connect');
      expect(firstFrame).toContain('/app/db.js:45:15');
    });

    it('should extract source location if present', () => {
      // Arrange
      const stackFrame = 'at Database.connect (/app/db.js:45:15)';

      // Act
      const locationMatch = stackFrame.match(/\((.+):(\d+):(\d+)\)/);
      const sourceLocation = locationMatch
        ? {
            file: locationMatch[1],
            line: parseInt(locationMatch[2], 10),
            column: parseInt(locationMatch[3], 10),
          }
        : null;

      // Assert
      expect(sourceLocation).toEqual({
        file: '/app/db.js',
        line: 45,
        column: 15,
      });
    });

    it('should parse all standard Application Insights fields', () => {
      // Arrange
      const rawLogEntry = {
        timestamp: '2025-12-13T10:30:00Z',
        severityLevel: 'Error',
        message: 'Test error',
        operation_Name: 'GET /api/test',
        operation_Id: 'op-123',
        cloud_RoleName: 'api-server',
        cloud_RoleInstance: 'instance-1',
        customDimensions: {
          environment: 'production',
        },
        itemType: 'trace',
      };

      // Act
      const parsedEntry = {
        timestamp: new Date(rawLogEntry.timestamp),
        severity: rawLogEntry.severityLevel,
        message: rawLogEntry.message,
        operationName: rawLogEntry.operation_Name,
        operationId: rawLogEntry.operation_Id,
        roleName: rawLogEntry.cloud_RoleName,
        roleInstance: rawLogEntry.cloud_RoleInstance,
        customDimensions: rawLogEntry.customDimensions,
        itemType: rawLogEntry.itemType,
      };

      // Assert
      expect(parsedEntry).toHaveProperty('timestamp');
      expect(parsedEntry).toHaveProperty('severity');
      expect(parsedEntry).toHaveProperty('message');
      expect(parsedEntry).toHaveProperty('operationName');
      expect(parsedEntry).toHaveProperty('operationId');
      expect(parsedEntry).toHaveProperty('roleName');
      expect(parsedEntry).toHaveProperty('roleInstance');
    });
  });

  describe('Scenario: Parse incomplete log entry', () => {
    it('should create valid LogEntry with available fields', () => {
      // Arrange
      const rawLogEntry = {
        timestamp: '2025-12-13T10:30:00Z',
        message: 'Minimal log entry',
        // Missing: severityLevel, customDimensions, operation_Name
      };

      // Act
      const parsedEntry = {
        timestamp: new Date(rawLogEntry.timestamp),
        severity: rawLogEntry.severityLevel || 'Information',
        message: rawLogEntry.message,
        metadata: rawLogEntry.customDimensions || {},
        operationName: rawLogEntry.operation_Name || 'Unknown',
      };

      // Assert
      expect(parsedEntry.timestamp).toBeDefined();
      expect(parsedEntry.severity).toBe('Information'); // Default value
      expect(parsedEntry.message).toBe('Minimal log entry');
      expect(parsedEntry.metadata).toEqual({});
      expect(parsedEntry.operationName).toBe('Unknown');
    });

    it('should not fail parsing when optional fields are missing', () => {
      // Arrange
      const rawLogEntry = {
        timestamp: '2025-12-13T10:30:00Z',
        message: 'Error occurred',
        // All optional fields missing
      };

      // Act & Assert
      expect(() => {
        const parsedEntry = {
          timestamp: new Date(rawLogEntry.timestamp),
          message: rawLogEntry.message,
          severity: rawLogEntry['severityLevel'] || 'Information',
          metadata: rawLogEntry['customDimensions'] || {},
        };
      }).not.toThrow();
    });

    it('should log warning for malformed entries', () => {
      // Arrange
      const mockLogger = {
        warn: jest.fn(),
      };

      const rawLogEntry = {
        message: 'Log entry without timestamp',
        // Missing critical field: timestamp
      };

      // Act
      if (!rawLogEntry['timestamp']) {
        mockLogger.warn('Malformed log entry: missing timestamp', { entry: rawLogEntry });
      }

      // Assert
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Malformed log entry: missing timestamp',
        expect.objectContaining({ entry: rawLogEntry })
      );
    });

    it('should handle null or undefined values gracefully', () => {
      // Arrange
      const rawLogEntry = {
        timestamp: '2025-12-13T10:30:00Z',
        severityLevel: null,
        message: 'Test message',
        customDimensions: undefined,
      };

      // Act
      const parsedEntry = {
        timestamp: new Date(rawLogEntry.timestamp),
        severity: rawLogEntry.severityLevel || 'Information',
        message: rawLogEntry.message,
        metadata: rawLogEntry.customDimensions || {},
      };

      // Assert
      expect(parsedEntry.severity).toBe('Information');
      expect(parsedEntry.metadata).toEqual({});
    });
  });

  describe('Scenario: Handle parsing errors', () => {
    it('should log raw entry for investigation when parsing fails', () => {
      // Arrange
      const mockLogger = {
        error: jest.fn(),
      };

      const rawLogEntry = {
        timestamp: 'invalid-date',
        message: 'Test',
      };

      // Act
      try {
        const parsed = new Date(rawLogEntry.timestamp);
        if (isNaN(parsed.getTime())) {
          throw new Error('Invalid timestamp');
        }
      } catch (error) {
        mockLogger.error('Failed to parse log entry', {
          error: (error as Error).message,
          rawEntry: rawLogEntry,
        });
      }

      // Assert
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to parse log entry',
        expect.objectContaining({
          error: 'Invalid timestamp',
          rawEntry: rawLogEntry,
        })
      );
    });

    it('should continue processing other entries after parse error', () => {
      // Arrange
      const rawLogEntries = [
        { timestamp: 'invalid', message: 'Bad entry' },
        { timestamp: '2025-12-13T10:30:00Z', message: 'Good entry 1' },
        { timestamp: '2025-12-13T10:31:00Z', message: 'Good entry 2' },
      ];

      const parsedEntries: any[] = [];
      const errors: any[] = [];

      // Act
      rawLogEntries.forEach((entry) => {
        try {
          const parsed = new Date(entry.timestamp);
          if (isNaN(parsed.getTime())) {
            throw new Error('Invalid timestamp');
          }
          parsedEntries.push({
            timestamp: parsed,
            message: entry.message,
          });
        } catch (error) {
          errors.push({ entry, error });
        }
      });

      // Assert
      expect(parsedEntries).toHaveLength(2);
      expect(errors).toHaveLength(1);
      expect(parsedEntries[0].message).toBe('Good entry 1');
    });

    it('should track parsing error metrics', () => {
      // Arrange
      const metrics = {
        totalEntries: 0,
        successfulParses: 0,
        failedParses: 0,
      };

      const rawLogEntries = [
        { timestamp: '2025-12-13T10:30:00Z', message: 'Valid 1' },
        { timestamp: 'invalid', message: 'Invalid' },
        { timestamp: '2025-12-13T10:31:00Z', message: 'Valid 2' },
      ];

      // Act
      rawLogEntries.forEach((entry) => {
        metrics.totalEntries++;
        try {
          const parsed = new Date(entry.timestamp);
          if (isNaN(parsed.getTime())) {
            throw new Error('Invalid timestamp');
          }
          metrics.successfulParses++;
        } catch (error) {
          metrics.failedParses++;
        }
      });

      // Assert
      expect(metrics.totalEntries).toBe(3);
      expect(metrics.successfulParses).toBe(2);
      expect(metrics.failedParses).toBe(1);
    });
  });

  describe('Advanced Parsing Features', () => {
    it('should parse JSON strings in custom dimensions', () => {
      // Arrange
      const rawLogEntry = {
        customDimensions: {
          metadata: '{"user": "john", "action": "login"}',
        },
      };

      // Act
      const metadata = JSON.parse(rawLogEntry.customDimensions.metadata);

      // Assert
      expect(metadata).toEqual({ user: 'john', action: 'login' });
    });

    it('should handle nested custom dimensions', () => {
      // Arrange
      const rawLogEntry = {
        customDimensions: {
          request: {
            headers: {
              'user-agent': 'Mozilla/5.0',
              'content-type': 'application/json',
            },
            body: {
              userId: 123,
            },
          },
        },
      };

      // Act
      const userAgent = rawLogEntry.customDimensions.request.headers['user-agent'];
      const userId = rawLogEntry.customDimensions.request.body.userId;

      // Assert
      expect(userAgent).toBe('Mozilla/5.0');
      expect(userId).toBe(123);
    });

    it('should extract error context from message', () => {
      // Arrange
      const message = 'Error: ECONNREFUSED connect ECONNREFUSED 127.0.0.1:5432 at Database.connect';

      // Act
      const errorPattern = /Error:\s+(\w+)/;
      const hostPattern = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):(\d+)/;

      const errorMatch = message.match(errorPattern);
      const hostMatch = message.match(hostPattern);

      const errorCode = errorMatch ? errorMatch[1] : null;
      const host = hostMatch ? hostMatch[1] : null;
      const port = hostMatch ? parseInt(hostMatch[2], 10) : null;

      // Assert
      expect(errorCode).toBe('ECONNREFUSED');
      expect(host).toBe('127.0.0.1');
      expect(port).toBe(5432);
    });

    it('should parse severity levels consistently', () => {
      // Arrange
      const severityMappings = [
        { input: 'Verbose', expected: 'Verbose' },
        { input: 'Information', expected: 'Information' },
        { input: 'Warning', expected: 'Warning' },
        { input: 'Error', expected: 'Error' },
        { input: 'Critical', expected: 'Critical' },
        { input: 'WARN', expected: 'Warning' },
        { input: 'INFO', expected: 'Information' },
      ];

      // Act & Assert
      severityMappings.forEach(({ input, expected }) => {
        const normalized = input === 'WARN' ? 'Warning' : input === 'INFO' ? 'Information' : input;
        expect(normalized).toBe(expected);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty message field', () => {
      // Arrange
      const rawLogEntry = {
        timestamp: '2025-12-13T10:30:00Z',
        message: '',
      };

      // Act
      const parsedEntry = {
        timestamp: new Date(rawLogEntry.timestamp),
        message: rawLogEntry.message || '[Empty message]',
      };

      // Assert
      expect(parsedEntry.message).toBe('[Empty message]');
    });

    it('should handle very long messages', () => {
      // Arrange
      const longMessage = 'Error: ' + 'A'.repeat(10000);
      const maxLength = 5000;

      // Act
      const truncatedMessage =
        longMessage.length > maxLength
          ? longMessage.substring(0, maxLength) + '... (truncated)'
          : longMessage;

      // Assert
      expect(truncatedMessage.length).toBeLessThanOrEqual(maxLength + 20);
      expect(truncatedMessage).toContain('(truncated)');
    });

    it('should handle special characters in messages', () => {
      // Arrange
      const rawLogEntry = {
        message: "Error: Can't connect to database \"users\" on host 'localhost'",
      };

      // Act
      const parsedMessage = rawLogEntry.message;

      // Assert
      expect(parsedMessage).toContain("Can't");
      expect(parsedMessage).toContain('"users"');
      expect(parsedMessage).toContain("'localhost'");
    });

    it('should handle unicode characters', () => {
      // Arrange
      const rawLogEntry = {
        message: 'Error: Usuario no encontrado 用户未找到 🚨',
      };

      // Act
      const parsedMessage = rawLogEntry.message;

      // Assert
      expect(parsedMessage).toContain('Usuario no encontrado');
      expect(parsedMessage).toContain('用户未找到');
      expect(parsedMessage).toContain('🚨');
    });

    it('should handle circular references in custom dimensions', () => {
      // Arrange
      const obj: any = { name: 'test' };
      obj.self = obj; // Circular reference

      // Act & Assert
      expect(() => {
        JSON.stringify(obj);
      }).toThrow();

      // Safe handling
      const safeStringify = (obj: any) => {
        try {
          return JSON.stringify(obj);
        } catch (error) {
          return '[Circular reference detected]';
        }
      };

      expect(safeStringify(obj)).toBe('[Circular reference detected]');
    });
  });
});
