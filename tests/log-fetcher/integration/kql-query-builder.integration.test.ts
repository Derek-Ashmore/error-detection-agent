/**
 * Integration tests for KqlQueryBuilder
 *
 * Tests actual KQL query generation
 */

import { KqlQueryBuilder } from '../../../src/log-fetcher/kql-query-builder';

describe('KqlQueryBuilder Integration Tests', () => {
  let queryBuilder: KqlQueryBuilder;
  const batchSize = 100;
  const severityLevels = ['Error', 'Warning'];

  beforeEach(() => {
    queryBuilder = new KqlQueryBuilder(batchSize, severityLevels);
  });

  describe('Query Generation', () => {
    it('should build valid KQL query for time range', () => {
      const timeRange = {
        startTime: new Date('2024-01-01T00:00:00Z'),
        endTime: new Date('2024-01-01T23:59:59Z'),
      };

      const query = queryBuilder.buildLogQuery(timeRange);

      expect(query).toBeDefined();
      expect(typeof query).toBe('string');
      expect(query).toContain('union');
      expect(query).toContain('traces');
      expect(query).toContain('exceptions');
      expect(query).toContain('requests');
      expect(query).toContain('where timestamp >=');
      expect(query).toContain('where timestamp <=');
    });

    it('should include severity level filters', () => {
      const timeRange = {
        startTime: new Date('2024-01-01T00:00:00Z'),
        endTime: new Date('2024-01-01T23:59:59Z'),
      };

      const query = queryBuilder.buildLogQuery(timeRange);

      expect(query).toContain('severityLevel');
    });

    it('should apply batch size limit', () => {
      const timeRange = {
        startTime: new Date('2024-01-01T00:00:00Z'),
        endTime: new Date('2024-01-01T23:59:59Z'),
      };

      const query = queryBuilder.buildLogQuery(timeRange);

      expect(query).toContain('take');
      expect(query).toContain(batchSize.toString());
    });

    it('should order results by timestamp', () => {
      const timeRange = {
        startTime: new Date('2024-01-01T00:00:00Z'),
        endTime: new Date('2024-01-01T23:59:59Z'),
      };

      const query = queryBuilder.buildLogQuery(timeRange);

      expect(query).toContain('order by timestamp');
    });
  });

  describe('Count Query', () => {
    it('should build count query for time range', () => {
      const timeRange = {
        startTime: new Date('2024-01-01T00:00:00Z'),
        endTime: new Date('2024-01-01T23:59:59Z'),
      };

      const query = queryBuilder.buildCountQuery(timeRange);

      expect(query).toBeDefined();
      expect(query).toContain('summarize count()');
      expect(query).toContain('union');
    });
  });

  describe('Query Validation', () => {
    it('should reject invalid time ranges', () => {
      const invalidTimeRange = {
        startTime: new Date('2024-01-01T23:59:59Z'),
        endTime: new Date('2024-01-01T00:00:00Z'), // End before start
      };

      expect(() => queryBuilder.buildLogQuery(invalidTimeRange)).toThrow();
    });

    it('should handle very recent time ranges', () => {
      const timeRange = {
        startTime: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
        endTime: new Date(),
      };

      const query = queryBuilder.buildLogQuery(timeRange);

      expect(query).toBeDefined();
      expect(query).toContain('where timestamp >=');
    });
  });

  describe('Constructor Validation', () => {
    it('should validate batch size limits', () => {
      expect(() => new KqlQueryBuilder(0)).toThrow();
      expect(() => new KqlQueryBuilder(-1)).toThrow();
      expect(() => new KqlQueryBuilder(10001)).toThrow();
    });

    it('should accept valid batch sizes', () => {
      expect(() => new KqlQueryBuilder(1)).not.toThrow();
      expect(() => new KqlQueryBuilder(5000)).not.toThrow();
      expect(() => new KqlQueryBuilder(10000)).not.toThrow();
    });

    it('should accept custom severity levels', () => {
      const builder = new KqlQueryBuilder(100, ['Error', 'Critical', 'Warning']);
      const timeRange = {
        startTime: new Date('2024-01-01T00:00:00Z'),
        endTime: new Date('2024-01-01T23:59:59Z'),
      };

      const query = builder.buildLogQuery(timeRange);

      expect(query).toBeDefined();
    });
  });

  describe('Time Range Formatting', () => {
    it('should format dates in ISO 8601 for KQL', () => {
      const timeRange = {
        startTime: new Date('2024-01-15T10:30:00.000Z'),
        endTime: new Date('2024-01-15T11:30:00.000Z'),
      };

      const query = queryBuilder.buildLogQuery(timeRange);

      expect(query).toContain('2024-01-15');
      expect(query).toContain('datetime(');
    });

    it('should handle maximum valid time range (30 days)', () => {
      const now = new Date();
      const timeRange = {
        startTime: new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000), // 29 days ago
        endTime: now,
      };

      const query = queryBuilder.buildLogQuery(timeRange);

      expect(query).toBeDefined();
      expect(query).toContain('datetime(');
    });

    it('should reject time range exceeding 30 days', () => {
      const timeRange = {
        startTime: new Date('2024-01-01T00:00:00.000Z'),
        endTime: new Date('2024-12-31T23:59:59.999Z'), // > 30 days
      };

      expect(() => queryBuilder.buildLogQuery(timeRange)).toThrow(
        'Time range cannot exceed 30 days'
      );
    });
  });

  describe('Query Structure', () => {
    it('should include all required projections', () => {
      const timeRange = {
        startTime: new Date('2024-01-01T00:00:00Z'),
        endTime: new Date('2024-01-01T23:59:59Z'),
      };

      const query = queryBuilder.buildLogQuery(timeRange);

      expect(query).toContain('project');
      expect(query).toContain('timestamp');
      expect(query).toContain('severityLevel');
      expect(query).toContain('message');
      expect(query).toContain('itemType');
      expect(query).toContain('customDimensions');
    });

    it('should use union for multiple table types', () => {
      const timeRange = {
        startTime: new Date('2024-01-01T00:00:00Z'),
        endTime: new Date('2024-01-01T23:59:59Z'),
      };

      const query = queryBuilder.buildLogQuery(timeRange);

      expect(query).toContain('union');
      expect(query).toContain('traces');
      expect(query).toContain('exceptions');
      expect(query).toContain('requests');
    });
  });
});
