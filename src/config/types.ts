/**
 * Configuration types for the Error Detection Agent
 *
 * This module defines comprehensive TypeScript types for all configuration sections
 * including Azure Monitor, log fetching, failure detection, GitHub integration, and more.
 */

/**
 * Azure Monitor workspace configuration
 */
export interface AzureMonitorConfig {
  /** Azure Log Analytics workspace ID */
  workspaceId: string;

  /** Azure tenant ID for authentication */
  tenantId: string;

  /** Azure client ID (service principal) */
  clientId: string;

  /** Azure client secret (should be from environment variable) */
  clientSecret: string;

  /** Optional subscription ID */
  subscriptionId?: string;

  /** Optional resource group name */
  resourceGroup?: string;

  /** API endpoint override (defaults to Azure public cloud) */
  endpoint?: string;
}

/**
 * Log fetching configuration
 */
export interface LogFetchingConfig {
  /** Query interval in minutes */
  queryIntervalMinutes: number;

  /** Batch size for log retrieval */
  batchSize: number;

  /** Lookback period in minutes for initial query */
  lookbackMinutes: number;

  /** Maximum number of retries for failed queries */
  maxRetries: number;

  /** Retry delay in milliseconds */
  retryDelayMs: number;

  /** Timeout for log queries in milliseconds */
  queryTimeoutMs: number;

  /** KQL query template or path to query file */
  queryTemplate?: string;
}

/**
 * Failure detection pattern configuration
 */
export interface FailurePattern {
  /** Pattern name/identifier */
  name: string;

  /** Regular expression pattern to match */
  pattern: string;

  /** Pattern type (error, warning, critical) */
  type: 'error' | 'warning' | 'critical';

  /** Priority level (1-10, 10 being highest) */
  priority: number;

  /** Description of what this pattern detects */
  description?: string;

  /** Whether this pattern is enabled */
  enabled: boolean;
}

/**
 * Failure detection configuration
 */
export interface FailureDetectionConfig {
  /** List of failure patterns to detect */
  patterns: FailurePattern[];

  /** Minimum threshold for pattern matching confidence */
  confidenceThreshold: number;

  /** Enable ML-based pattern detection */
  enableMlDetection: boolean;

  /** Custom error keywords to detect */
  errorKeywords: string[];

  /** Log levels to consider as failures */
  failureLogLevels: string[];
}

/**
 * GitHub integration configuration
 */
export interface GitHubConfig {
  /** GitHub repository in format 'owner/repo' */
  repository: string;

  /** GitHub personal access token (should be from environment variable) */
  token: string;

  /** GitHub API endpoint (defaults to api.github.com) */
  apiEndpoint?: string;

  /** Default labels to apply to created issues */
  defaultLabels: string[];

  /** GitHub user/team to assign issues to */
  assignees?: string[];

  /** Enable auto-assignment of issues */
  autoAssign: boolean;

  /** Issue title template */
  issueTitleTemplate?: string;

  /** Issue body template */
  issueBodyTemplate?: string;
}

/**
 * Duplicate detection configuration
 */
export interface DuplicateDetectionConfig {
  /** Enable duplicate detection */
  enabled: boolean;

  /** Similarity threshold (0-1, 1 being exact match) */
  similarityThreshold: number;

  /** Time window in hours to check for duplicates */
  timeWindowHours: number;

  /** Algorithm to use (levenshtein, jaccard, cosine) */
  algorithm: 'levenshtein' | 'jaccard' | 'cosine';

  /** Fields to compare for similarity */
  compareFields: string[];

  /** Enable fuzzy matching */
  enableFuzzyMatching: boolean;
}

/**
 * Scheduler configuration
 */
export interface SchedulerConfig {
  /** Enable automatic scheduling */
  enabled: boolean;

  /** Cron expression for scheduling (e.g., "every 5 minutes" format) */
  cronExpression: string;

  /** Timezone for cron scheduling */
  timezone: string;

  /** Enable immediate execution on startup */
  runOnStartup: boolean;

  /** Maximum concurrent executions */
  maxConcurrentExecutions: number;

  /** Execution timeout in milliseconds */
  executionTimeoutMs: number;
}

/**
 * Notification configuration
 */
export interface NotificationConfig {
  /** Enable notifications */
  enabled: boolean;

  /** Notification channels (email, slack, teams, etc.) */
  channels: string[];

  /** Notification severity levels to send */
  severityLevels: string[];

  /** Email configuration */
  email?: {
    smtpHost: string;
    smtpPort: number;
    from: string;
    to: string[];
    username?: string;
    password?: string;
  };

  /** Slack configuration */
  slack?: {
    webhookUrl: string;
    channel?: string;
    username?: string;
  };

  /** Microsoft Teams configuration */
  teams?: {
    webhookUrl: string;
  };
}

/**
 * Logging configuration
 */
export interface LoggingConfig {
  /** Log level (debug, info, warn, error) */
  level: 'debug' | 'info' | 'warn' | 'error';

  /** Log output format (json, text) */
  format: 'json' | 'text';

  /** Enable console logging */
  enableConsole: boolean;

  /** Enable file logging */
  enableFile: boolean;

  /** Log file path (if file logging enabled) */
  filePath?: string;

  /** Maximum log file size in bytes */
  maxFileSize?: number;

  /** Maximum number of log files to retain */
  maxFiles?: number;
}

/**
 * Complete application configuration
 */
export interface AppConfig {
  /** Azure Monitor configuration */
  azureMonitor: AzureMonitorConfig;

  /** Log fetching configuration */
  logFetching: LogFetchingConfig;

  /** Failure detection configuration */
  failureDetection: FailureDetectionConfig;

  /** GitHub integration configuration */
  github: GitHubConfig;

  /** Duplicate detection configuration */
  duplicateDetection: DuplicateDetectionConfig;

  /** Scheduler configuration */
  scheduler: SchedulerConfig;

  /** Notification configuration */
  notification?: NotificationConfig;

  /** Logging configuration */
  logging: LoggingConfig;

  /** Environment (development, staging, production) */
  environment: 'development' | 'staging' | 'production';

  /** Application version */
  version?: string;
}

/**
 * Configuration loading options
 */
export interface ConfigLoadOptions {
  /** Path to configuration file */
  configPath?: string;

  /** Environment-specific overrides */
  environment?: string;

  /** Validate configuration */
  validate?: boolean;

  /** Allow environment variable overrides */
  allowEnvOverrides?: boolean;
}
