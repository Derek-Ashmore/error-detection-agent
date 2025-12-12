/**
 * Zod validation schemas for configuration
 *
 * This module defines comprehensive Zod schemas that validate the configuration
 * structure and provide clear error messages for invalid configurations.
 */

import { z } from 'zod';

/**
 * Azure Monitor configuration schema
 */
export const azureMonitorSchema = z.object({
  workspaceId: z.string().min(1, 'Workspace ID is required'),
  tenantId: z.string().uuid('Tenant ID must be a valid UUID'),
  clientId: z.string().uuid('Client ID must be a valid UUID'),
  clientSecret: z.string().min(1, 'Client secret is required'),
  subscriptionId: z.string().uuid('Subscription ID must be a valid UUID').optional(),
  resourceGroup: z.string().optional(),
  endpoint: z.string().url('Endpoint must be a valid URL').optional(),
});

/**
 * Log fetching configuration schema
 */
export const logFetchingSchema = z.object({
  queryIntervalMinutes: z.number().int().positive('Query interval must be a positive integer'),
  batchSize: z
    .number()
    .int()
    .positive('Batch size must be a positive integer')
    .max(10000, 'Batch size cannot exceed 10000'),
  lookbackMinutes: z.number().int().positive('Lookback minutes must be a positive integer'),
  maxRetries: z
    .number()
    .int()
    .nonnegative('Max retries must be non-negative')
    .max(10, 'Max retries cannot exceed 10'),
  retryDelayMs: z.number().int().positive('Retry delay must be a positive integer'),
  queryTimeoutMs: z.number().int().positive('Query timeout must be a positive integer'),
  queryTemplate: z.string().optional(),
});

/**
 * Failure pattern schema
 */
export const failurePatternSchema = z.object({
  name: z.string().min(1, 'Pattern name is required'),
  pattern: z.string().min(1, 'Pattern regex is required'),
  type: z.enum(['error', 'warning', 'critical'], {
    errorMap: () => ({ message: 'Type must be one of: error, warning, critical' }),
  }),
  priority: z
    .number()
    .int()
    .min(1, 'Priority must be at least 1')
    .max(10, 'Priority cannot exceed 10'),
  description: z.string().optional(),
  enabled: z.boolean(),
});

/**
 * Failure detection configuration schema
 */
export const failureDetectionSchema = z.object({
  patterns: z.array(failurePatternSchema).min(1, 'At least one failure pattern is required'),
  confidenceThreshold: z
    .number()
    .min(0, 'Confidence threshold must be at least 0')
    .max(1, 'Confidence threshold cannot exceed 1'),
  enableMlDetection: z.boolean(),
  errorKeywords: z.array(z.string()),
  failureLogLevels: z.array(z.string()),
});

/**
 * GitHub configuration schema
 */
export const githubSchema = z.object({
  repository: z.string().regex(/^[\w-]+\/[\w-]+$/, 'Repository must be in format "owner/repo"'),
  token: z.string().min(1, 'GitHub token is required'),
  apiEndpoint: z.string().url('API endpoint must be a valid URL').optional(),
  defaultLabels: z.array(z.string()),
  assignees: z.array(z.string()).optional(),
  autoAssign: z.boolean(),
  issueTitleTemplate: z.string().optional(),
  issueBodyTemplate: z.string().optional(),
});

/**
 * Duplicate detection configuration schema
 */
export const duplicateDetectionSchema = z.object({
  enabled: z.boolean(),
  similarityThreshold: z
    .number()
    .min(0, 'Similarity threshold must be at least 0')
    .max(1, 'Similarity threshold cannot exceed 1'),
  timeWindowHours: z.number().int().positive('Time window must be a positive integer'),
  algorithm: z.enum(['levenshtein', 'jaccard', 'cosine'], {
    errorMap: () => ({ message: 'Algorithm must be one of: levenshtein, jaccard, cosine' }),
  }),
  compareFields: z.array(z.string()).min(1, 'At least one compare field is required'),
  enableFuzzyMatching: z.boolean(),
});

/**
 * Scheduler configuration schema
 */
export const schedulerSchema = z.object({
  enabled: z.boolean(),
  cronExpression: z.string().min(1, 'Cron expression is required'),
  timezone: z.string().min(1, 'Timezone is required'),
  runOnStartup: z.boolean(),
  maxConcurrentExecutions: z
    .number()
    .int()
    .positive('Max concurrent executions must be a positive integer'),
  executionTimeoutMs: z.number().int().positive('Execution timeout must be a positive integer'),
});

/**
 * Email notification configuration schema
 */
const emailConfigSchema = z.object({
  smtpHost: z.string().min(1, 'SMTP host is required'),
  smtpPort: z.number().int().positive('SMTP port must be a positive integer'),
  from: z.string().email('From must be a valid email address'),
  to: z
    .array(z.string().email('Each recipient must be a valid email address'))
    .min(1, 'At least one recipient is required'),
  username: z.string().optional(),
  password: z.string().optional(),
});

/**
 * Slack notification configuration schema
 */
const slackConfigSchema = z.object({
  webhookUrl: z.string().url('Webhook URL must be a valid URL'),
  channel: z.string().optional(),
  username: z.string().optional(),
});

/**
 * Teams notification configuration schema
 */
const teamsConfigSchema = z.object({
  webhookUrl: z.string().url('Webhook URL must be a valid URL'),
});

/**
 * Notification configuration schema
 */
export const notificationSchema = z.object({
  enabled: z.boolean(),
  channels: z.array(z.string()),
  severityLevels: z.array(z.string()),
  email: emailConfigSchema.optional(),
  slack: slackConfigSchema.optional(),
  teams: teamsConfigSchema.optional(),
});

/**
 * Logging configuration schema
 */
export const loggingSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error'], {
    errorMap: () => ({ message: 'Log level must be one of: debug, info, warn, error' }),
  }),
  format: z.enum(['json', 'text'], {
    errorMap: () => ({ message: 'Log format must be one of: json, text' }),
  }),
  enableConsole: z.boolean(),
  enableFile: z.boolean(),
  filePath: z.string().optional(),
  maxFileSize: z.number().int().positive('Max file size must be a positive integer').optional(),
  maxFiles: z.number().int().positive('Max files must be a positive integer').optional(),
});

/**
 * Complete application configuration schema
 */
export const appConfigSchema = z.object({
  azureMonitor: azureMonitorSchema,
  logFetching: logFetchingSchema,
  failureDetection: failureDetectionSchema,
  github: githubSchema,
  duplicateDetection: duplicateDetectionSchema,
  scheduler: schedulerSchema,
  notification: notificationSchema.optional(),
  logging: loggingSchema,
  environment: z.enum(['development', 'staging', 'production'], {
    errorMap: () => ({ message: 'Environment must be one of: development, staging, production' }),
  }),
  version: z.string().optional(),
});

/**
 * Type inference from schema
 */
export type ValidatedAppConfig = z.infer<typeof appConfigSchema>;
