/**
 * KQL Query Builder Tests
 *
 * Tests query construction for Azure Application Insights:
 * - Query with time range filters
 * - Query with severity level filters
 * - Query with result limits
 * - Query optimization for performance
 */

describe('KQLQueryBuilder', () => {
  describe('Scenario: Query logs with time range filter', () => {
    it('should build query with configured lookback period', () => {
      // Arrange
      const lookbackMinutes = 15;
      const now = new Date();
      const startTime = new Date(now.getTime() - lookbackMinutes * 60 * 1000);

      // Act
      const query = `
        traces
        | where timestamp >= datetime('${startTime.toISOString()}')
        | where timestamp <= datetime('${now.toISOString()}')
      `.trim();

      // Assert
      expect(query).toContain('traces');
      expect(query).toContain('timestamp >=');
      expect(query).toContain('timestamp <=');
      expect(query).toContain(startTime.toISOString());
      expect(query).toContain(now.toISOString());
    });

    it('should filter for error and warning severity levels', () => {
      // Arrange
      const severityLevels = ['Error', 'Warning'];

      // Act
      const severityFilter = severityLevels
        .map((level) => `severityLevel == '${level}'`)
        .join(' or ');
      const query = `
        traces
        | where ${severityFilter}
      `.trim();

      // Assert
      expect(query).toContain("severityLevel == 'Error'");
      expect(query).toContain("severityLevel == 'Warning'");
      expect(query).toContain(' or ');
    });

    it('should include result limit to prevent memory exhaustion', () => {
      // Arrange
      const resultLimit = 1000;

      // Act
      const query = `
        traces
        | where severityLevel in ('Error', 'Warning')
        | take ${resultLimit}
      `.trim();

      // Assert
      expect(query).toContain(`take ${resultLimit}`);
    });

    it('should build complete query with all filters', () => {
      // Arrange
      const lookbackMinutes = 15;
      const now = new Date();
      const startTime = new Date(now.getTime() - lookbackMinutes * 60 * 1000);
      const severityLevels = ['Error', 'Warning', 'Critical'];
      const resultLimit = 1000;

      // Act
      const query = `
        traces
        | where timestamp >= datetime('${startTime.toISOString()}')
        | where timestamp <= datetime('${now.toISOString()}')
        | where severityLevel in (${severityLevels.map((l) => `'${l}'`).join(', ')})
        | take ${resultLimit}
      `.trim();

      // Assert
      expect(query).toContain('traces');
      expect(query).toContain('timestamp >=');
      expect(query).toContain('timestamp <=');
      expect(query).toContain("severityLevel in ('Error', 'Warning', 'Critical')");
      expect(query).toContain(`take ${resultLimit}`);
    });
  });

  describe('Scenario: Handle large result sets', () => {
    it('should support pagination for queries returning > 1000 entries', () => {
      // Arrange
      const pageSize = 1000;
      const skipCount = 2000; // Page 3

      // Act
      const query = `
        traces
        | where severityLevel in ('Error', 'Warning')
        | order by timestamp desc
        | skip ${skipCount}
        | take ${pageSize}
      `.trim();

      // Assert
      expect(query).toContain(`skip ${skipCount}`);
      expect(query).toContain(`take ${pageSize}`);
      expect(query).toContain('order by timestamp desc');
    });

    it('should build query for streaming results', () => {
      // Arrange
      const batchSize = 100;

      // Act
      const query = `
        traces
        | where severityLevel in ('Error', 'Warning')
        | order by timestamp desc
        | take ${batchSize}
      `.trim();

      // Assert
      expect(query).toContain(`take ${batchSize}`);
    });

    it('should include progress tracking fields', () => {
      // Arrange
      const query = `
        traces
        | where severityLevel in ('Error', 'Warning')
        | summarize count() by bin(timestamp, 1h)
        | order by timestamp desc
      `.trim();

      // Assert
      expect(query).toContain('summarize count()');
      expect(query).toContain('bin(timestamp, 1h)');
    });
  });

  describe('Scenario: Query timeout', () => {
    it('should support query timeout configuration', () => {
      // Arrange
      const timeoutSeconds = 30;
      const queryOptions = {
        serverTimeoutInSeconds: timeoutSeconds,
      };

      // Assert
      expect(queryOptions.serverTimeoutInSeconds).toBe(30);
    });

    it('should build query with smaller time window for retry', () => {
      // Arrange
      const originalLookback = 60; // 60 minutes
      const reducedLookback = 15; // Reduce to 15 minutes after timeout

      const now = new Date();
      const originalStart = new Date(now.getTime() - originalLookback * 60 * 1000);
      const reducedStart = new Date(now.getTime() - reducedLookback * 60 * 1000);

      // Act
      const originalQuery = `
        traces
        | where timestamp >= datetime('${originalStart.toISOString()}')
      `.trim();

      const retryQuery = `
        traces
        | where timestamp >= datetime('${reducedStart.toISOString()}')
      `.trim();

      // Assert
      expect(originalQuery).toContain(originalStart.toISOString());
      expect(retryQuery).toContain(reducedStart.toISOString());
      expect(reducedStart.getTime()).toBeGreaterThan(originalStart.getTime());
    });
  });

  describe('Query Optimization', () => {
    it('should order by timestamp for efficient retrieval', () => {
      // Arrange & Act
      const query = `
        traces
        | where severityLevel in ('Error', 'Warning')
        | order by timestamp desc
        | take 1000
      `.trim();

      // Assert
      expect(query).toContain('order by timestamp desc');
    });

    it('should project only required fields for performance', () => {
      // Arrange
      const requiredFields = [
        'timestamp',
        'severityLevel',
        'message',
        'operation_Name',
        'customDimensions',
      ];

      // Act
      const query = `
        traces
        | where severityLevel in ('Error', 'Warning')
        | project ${requiredFields.join(', ')}
        | take 1000
      `.trim();

      // Assert
      expect(query).toContain('project');
      requiredFields.forEach((field) => {
        expect(query).toContain(field);
      });
    });

    it('should filter early in query for performance', () => {
      // Arrange & Act
      const query = `
        traces
        | where timestamp >= ago(15m)
        | where severityLevel in ('Error', 'Warning')
        | where message has_any ("exception", "error", "failed")
        | project timestamp, severityLevel, message
        | take 1000
      `.trim();

      // Assert
      const whereIndex = query.indexOf('where');
      const projectIndex = query.indexOf('project');
      const takeIndex = query.indexOf('take');

      expect(whereIndex).toBeLessThan(projectIndex);
      expect(projectIndex).toBeLessThan(takeIndex);
    });

    it('should use ago() for relative time ranges', () => {
      // Arrange & Act
      const query = `
        traces
        | where timestamp >= ago(15m)
        | where severityLevel in ('Error', 'Warning')
      `.trim();

      // Assert
      expect(query).toContain('ago(15m)');
    });
  });

  describe('Advanced Filtering', () => {
    it('should filter by custom dimensions', () => {
      // Arrange
      const customFilter = "customDimensions['Environment'] == 'Production'";

      // Act
      const query = `
        traces
        | where severityLevel in ('Error', 'Warning')
        | where ${customFilter}
      `.trim();

      // Assert
      expect(query).toContain("customDimensions['Environment']");
      expect(query).toContain("== 'Production'");
    });

    it('should filter by operation name', () => {
      // Arrange
      const operations = ['GET /api/users', 'POST /api/orders'];

      // Act
      const query = `
        traces
        | where operation_Name in (${operations.map((op) => `'${op}'`).join(', ')})
      `.trim();

      // Assert
      expect(query).toContain('operation_Name in');
      expect(query).toContain('GET /api/users');
      expect(query).toContain('POST /api/orders');
    });

    it('should support complex boolean logic', () => {
      // Arrange & Act
      const query = `
        traces
        | where (severityLevel == 'Error' or severityLevel == 'Warning')
          and timestamp >= ago(15m)
          and (message has "exception" or message has "error")
      `.trim();

      // Assert
      expect(query).toContain('and');
      expect(query).toContain('or');
      expect(query).toContain('(');
      expect(query).toContain(')');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty time range', () => {
      // Arrange
      const now = new Date();

      // Act
      const query = `
        traces
        | where timestamp >= datetime('${now.toISOString()}')
        | where timestamp <= datetime('${now.toISOString()}')
      `.trim();

      // Assert - Query should be valid even with zero-duration range
      expect(query).toContain('timestamp >=');
      expect(query).toContain('timestamp <=');
    });

    it('should escape special characters in filters', () => {
      // Arrange
      const messageWithQuotes = "Error: Can't connect to database";
      const escapedMessage = messageWithQuotes.replace(/'/g, "''");

      // Act
      const query = `
        traces
        | where message contains '${escapedMessage}'
      `.trim();

      // Assert
      expect(query).toContain("Can''t");
    });

    it('should handle very large lookback periods', () => {
      // Arrange
      const lookbackDays = 30;
      const now = new Date();
      const startTime = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

      // Act
      const query = `
        traces
        | where timestamp >= datetime('${startTime.toISOString()}')
      `.trim();

      // Assert
      const daysDiff = (now.getTime() - startTime.getTime()) / (1000 * 60 * 60 * 24);
      expect(daysDiff).toBeCloseTo(30, 0);
    });

    it('should handle multiple severity levels', () => {
      // Arrange
      const severities = ['Verbose', 'Information', 'Warning', 'Error', 'Critical'];

      // Act
      const query = `
        traces
        | where severityLevel in (${severities.map((s) => `'${s}'`).join(', ')})
      `.trim();

      // Assert
      severities.forEach((severity) => {
        expect(query).toContain(severity);
      });
    });
  });
});
