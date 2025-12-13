/**
 * Configuration utility functions
 *
 * Provides utility functions for configuration management including:
 * - Secret redaction for safe logging and export
 * - Configuration export to YAML format
 * - Validation report generation
 */

import * as yaml from 'js-yaml';
import { z } from 'zod';

import { AppConfig } from './types';

/**
 * Sensitive field patterns that should be redacted
 * Fields matching these patterns will have their values replaced with "***"
 */
const SENSITIVE_FIELD_PATTERNS = [/token/i, /secret/i, /password/i, /key/i, /credential/i];

/**
 * Check if a field name is sensitive and should be redacted
 *
 * @param fieldName - The field name to check
 * @returns True if the field should be redacted
 */
function isSensitiveField(fieldName: string): boolean {
  return SENSITIVE_FIELD_PATTERNS.some((pattern) => pattern.test(fieldName));
}

/**
 * Recursively redact sensitive values in an object
 *
 * @param obj - The object to redact
 * @param path - Current path in the object (for tracking field names)
 * @returns A new object with sensitive values redacted
 */
function redactObject(obj: unknown, path: string = ''): unknown {
  // Handle null and undefined
  if (obj === null || obj === undefined) {
    return obj;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map((item, index) => redactObject(item, `${path}[${index}]`));
  }

  // Handle objects
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path !== '' ? `${path}.${key}` : key;

      // Check if this field should be redacted
      if (isSensitiveField(key)) {
        // Keep the field name but redact the value
        result[key] = '***';
      } else {
        // Recursively process nested objects
        result[key] = redactObject(value, currentPath);
      }
    }

    return result;
  }

  // Return primitive values as-is
  return obj;
}

/**
 * Redact sensitive information from configuration
 *
 * Creates a deep copy of the configuration with sensitive fields redacted.
 * Fields containing "token", "secret", "password", "key", or "credential"
 * (case-insensitive) will have their values replaced with "***".
 *
 * The field names remain visible for debugging purposes.
 *
 * @param config - The application configuration to redact
 * @returns A new configuration object with sensitive values redacted
 *
 * @example
 * ```typescript
 * const config = loadConfig();
 * const redacted = redactSecrets(config);
 * console.log(JSON.stringify(redacted, null, 2)); // Safe to log
 * ```
 */
export function redactSecrets(config: AppConfig): AppConfig {
  return redactObject(config) as AppConfig;
}

/**
 * Export configuration to YAML format with secrets redacted
 *
 * Converts the configuration to YAML format with all sensitive fields
 * redacted for safe sharing or logging. This is useful for:
 * - Saving configuration templates
 * - Sharing configuration examples
 * - Debugging configuration issues without exposing secrets
 *
 * @param config - The application configuration to export
 * @returns YAML string representation with redacted secrets
 *
 * @example
 * ```typescript
 * const config = loadConfig();
 * const yamlConfig = exportConfiguration(config);
 * fs.writeFileSync('config-template.yaml', yamlConfig);
 * ```
 */
export function exportConfiguration(config: AppConfig): string {
  const redacted = redactSecrets(config);

  // Convert to YAML with proper formatting
  const yamlString = yaml.dump(redacted, {
    indent: 2,
    lineWidth: 100,
    noRefs: true,
    sortKeys: false,
  });

  return yamlString;
}

/**
 * Format a single validation error into a human-readable string
 *
 * @param error - Zod validation error
 * @returns Formatted error string
 */
function formatValidationError(error: z.ZodIssue): string {
  const path = error.path.length > 0 ? error.path.join('.') : 'root';
  const value = 'received' in error ? ` (received: ${String(error.received)})` : '';

  switch (error.code) {
    case 'invalid_type':
      return `  ✗ ${path}: Expected ${error.expected}, but got ${error.received}`;

    case 'invalid_string':
      if (error.validation === 'regex') {
        return `  ✗ ${path}: Value does not match required pattern`;
      }
      if (error.validation === 'email') {
        return `  ✗ ${path}: Invalid email format${value}`;
      }
      if (error.validation === 'url') {
        return `  ✗ ${path}: Invalid URL format${value}`;
      }
      return `  ✗ ${path}: Invalid string value${value}`;

    case 'invalid_enum_value':
      return `  ✗ ${path}: Must be one of: ${error.options.join(', ')}${value}`;

    case 'too_small':
      if (error.type === 'string') {
        return `  ✗ ${path}: Must be at least ${error.minimum} characters long`;
      }
      if (error.type === 'number') {
        return `  ✗ ${path}: Must be at least ${error.minimum}`;
      }
      if (error.type === 'array') {
        return `  ✗ ${path}: Must contain at least ${error.minimum} items`;
      }
      return `  ✗ ${path}: Value too small`;

    case 'too_big':
      if (error.type === 'string') {
        return `  ✗ ${path}: Must be at most ${error.maximum} characters long`;
      }
      if (error.type === 'number') {
        return `  ✗ ${path}: Must be at most ${error.maximum}`;
      }
      if (error.type === 'array') {
        return `  ✗ ${path}: Must contain at most ${error.maximum} items`;
      }
      return `  ✗ ${path}: Value too large`;

    case 'invalid_union':
      return `  ✗ ${path}: Value does not match any of the expected types`;

    case 'unrecognized_keys':
      return `  ✗ ${path}: Unrecognized keys: ${error.keys.join(', ')}`;

    case 'custom':
      return `  ✗ ${path}: ${error.message}`;

    default:
      return `  ✗ ${path}: ${error.message}`;
  }
}

/**
 * Generate a human-readable validation report from Zod errors
 *
 * Converts Zod validation errors into a formatted, user-friendly report
 * that's easy to understand and act upon. The report includes:
 * - A summary of the number of errors found
 * - Detailed error messages with field paths
 * - Specific information about what's wrong and expected values
 *
 * @param errors - Array of Zod validation issues
 * @returns Formatted validation report string
 *
 * @example
 * ```typescript
 * try {
 *   const config = loadConfig();
 * } catch (error) {
 *   if (error instanceof z.ZodError) {
 *     const report = generateValidationReport(error.errors);
 *     console.error(report);
 *   }
 * }
 * ```
 */
export function generateValidationReport(errors: z.ZodIssue[]): string {
  if (errors.length === 0) {
    return '✓ Configuration validation passed - no errors found';
  }

  const lines: string[] = [];

  // Header
  lines.push('═'.repeat(80));
  lines.push('Configuration Validation Report');
  lines.push('═'.repeat(80));
  lines.push('');
  lines.push(`Found ${errors.length} validation error${errors.length === 1 ? '' : 's'}:`);
  lines.push('');

  // Group errors by path for better organization
  const errorsByPath = new Map<string, z.ZodIssue[]>();
  for (const error of errors) {
    const path = error.path.length > 0 ? error.path.join('.') : 'root';
    const existing = errorsByPath.get(path) ?? [];
    existing.push(error);
    errorsByPath.set(path, existing);
  }

  // Format errors grouped by path
  const sortedPaths = Array.from(errorsByPath.keys()).sort();
  for (const path of sortedPaths) {
    const pathErrors = errorsByPath.get(path) ?? [];
    lines.push(`[${path}]`);
    for (const error of pathErrors) {
      lines.push(formatValidationError(error));
    }
    lines.push('');
  }

  // Footer with helpful tips
  lines.push('─'.repeat(80));
  lines.push('Troubleshooting Tips:');
  lines.push('  1. Check that all required fields are present in your config file');
  lines.push('  2. Verify that field values match the expected types');
  lines.push('  3. Ensure sensitive values are set via environment variables');
  lines.push('  4. Review the configuration schema documentation');
  lines.push('═'.repeat(80));

  return lines.join('\n');
}

/**
 * Create a safe configuration summary for logging
 *
 * Creates a minimal configuration summary with all secrets redacted,
 * suitable for logging or debugging output.
 *
 * @param config - The application configuration
 * @returns Object with safe configuration summary
 *
 * @example
 * ```typescript
 * const config = loadConfig();
 * const summary = getConfigSummary(config);
 * logger.info('Configuration loaded', summary);
 * ```
 */
export function getConfigSummary(config: AppConfig): Record<string, unknown> {
  return {
    environment: config.environment,
    version: config.version ?? 'unknown',
    azureMonitor: {
      workspaceId: config.azureMonitor.workspaceId,
      tenantId: config.azureMonitor.tenantId,
      endpoint: config.azureMonitor.endpoint ?? 'default',
      hasCredentials: Boolean(config.azureMonitor.clientId && config.azureMonitor.clientSecret),
    },
    github: {
      repository: config.github.repository,
      hasToken: Boolean(config.github.token),
      autoAssign: config.github.autoAssign,
      labels: config.github.defaultLabels,
    },
    logFetching: {
      queryIntervalMinutes: config.logFetching.queryIntervalMinutes,
      batchSize: config.logFetching.batchSize,
    },
    failureDetection: {
      patternsCount: config.failureDetection.patterns.length,
      mlEnabled: config.failureDetection.enableMlDetection,
    },
    scheduler: {
      enabled: config.scheduler.enabled,
      runOnStartup: config.scheduler.runOnStartup,
    },
    logging: {
      level: config.logging.level,
      format: config.logging.format,
      enableConsole: config.logging.enableConsole,
      enableFile: config.logging.enableFile,
    },
  };
}
