/**
 * Configuration module
 *
 * This module provides centralized access to the configuration system.
 * It exports all configuration types, schemas, and the loader.
 */

// Export types
export type {
  AppConfig,
  AzureMonitorConfig,
  LogFetchingConfig,
  FailurePattern,
  FailureDetectionConfig,
  GitHubConfig,
  DuplicateDetectionConfig,
  SchedulerConfig,
  NotificationConfig,
  LoggingConfig,
  ConfigLoadOptions,
} from './types';

// Export schemas
export {
  azureMonitorSchema,
  logFetchingSchema,
  failurePatternSchema,
  failureDetectionSchema,
  githubSchema,
  duplicateDetectionSchema,
  schedulerSchema,
  notificationSchema,
  loggingSchema,
  appConfigSchema,
  type ValidatedAppConfig,
} from './schemas';

// Export loader functions
export {
  loadConfig,
  loadConfigWithSchema,
  validateConfiguration,
  ConfigurationError,
} from './loader';
