/**
 * Configuration loader with YAML parsing and Zod validation
 *
 * This module provides functionality to load configuration from YAML files,
 * validate using Zod schemas, and apply environment variable overrides.
 */

import * as fs from 'fs';
import * as path from 'path';

import * as yaml from 'js-yaml';
import { z } from 'zod';

import { appConfigSchema } from './schemas';
import { AppConfig, ConfigLoadOptions } from './types';

/**
 * Configuration loading error
 */
export class ConfigurationError extends Error {
  public override readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'ConfigurationError';
    this.cause = cause;
  }
}

/**
 * Default configuration file paths
 */
const DEFAULT_CONFIG_PATHS = [
  'config/default.yaml',
  'config/default.yml',
  'config.yaml',
  'config.yml',
];

/**
 * Find configuration file
 */
function findConfigFile(configPath?: string): string {
  if (configPath !== undefined && configPath !== '') {
    const resolvedPath = path.resolve(configPath);
    if (!fs.existsSync(resolvedPath)) {
      throw new ConfigurationError(`Configuration file not found: ${resolvedPath}`);
    }
    return resolvedPath;
  }

  // Try default paths
  for (const defaultPath of DEFAULT_CONFIG_PATHS) {
    const resolvedPath = path.resolve(defaultPath);
    if (fs.existsSync(resolvedPath)) {
      return resolvedPath;
    }
  }

  throw new ConfigurationError(
    `No configuration file found. Tried: ${DEFAULT_CONFIG_PATHS.join(', ')}`
  );
}

/**
 * Environment variable substitution result
 */
interface EnvSubstitution {
  variable: string;
  usedDefault: boolean;
}

/**
 * Substitute environment variables in a value
 * Supports patterns:
 * - env:VAR_NAME - substitutes with environment variable, fails if not set
 * - env:VAR_NAME:default_value - substitutes with env var or default if not set
 */
function substituteEnvVar(value: string): { value: unknown; substitution?: EnvSubstitution } {
  const envPattern = /^env:([A-Z_][A-Z0-9_]*?)(?::(.*))?$/;
  const match = envPattern.exec(value);

  if (!match) {
    return { value };
  }

  const varName = match[1];
  const defaultValue = match[2];

  if (varName === undefined) {
    return { value };
  }

  const envValue = process.env[varName];

  if (envValue !== undefined) {
    return {
      value: envValue,
      substitution: { variable: varName, usedDefault: false },
    };
  }

  if (defaultValue !== undefined) {
    return {
      value: defaultValue,
      substitution: { variable: varName, usedDefault: true },
    };
  }

  throw new ConfigurationError(
    `Required environment variable ${varName} is not set and no default value provided`
  );
}

/**
 * Recursively process configuration values for environment variable substitution
 */
function processEnvSubstitutions(value: unknown, substitutions: EnvSubstitution[] = []): unknown {
  // Handle string values - check for env: pattern
  if (typeof value === 'string') {
    const result = substituteEnvVar(value);
    if (result.substitution !== undefined) {
      substitutions.push(result.substitution);
    }
    return result.value;
  }

  // Handle arrays - recursively process each element
  if (Array.isArray(value)) {
    return value.map((item) => processEnvSubstitutions(item, substitutions));
  }

  // Handle objects - recursively process each property
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = processEnvSubstitutions(val, substitutions);
    }
    return result;
  }

  // Return primitive values as-is (number, boolean, null, undefined)
  return value;
}

/**
 * Load YAML file
 */
function loadYamlFile(filePath: string): unknown {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const parsed = yaml.load(fileContent);

    if (parsed === null || parsed === undefined || typeof parsed !== 'object') {
      throw new ConfigurationError('Configuration file must contain an object');
    }

    return parsed;
  } catch (error) {
    if (error instanceof ConfigurationError) {
      throw error;
    }
    throw new ConfigurationError(`Failed to load YAML file: ${filePath}`, error);
  }
}

/**
 * Apply environment variable overrides
 *
 * Environment variables are mapped as follows:
 * - AZURE_WORKSPACE_ID -> azureMonitor.workspaceId
 * - AZURE_TENANT_ID -> azureMonitor.tenantId
 * - AZURE_CLIENT_ID -> azureMonitor.clientId
 * - AZURE_CLIENT_SECRET -> azureMonitor.clientSecret
 * - GITHUB_TOKEN -> github.token
 * - GITHUB_REPOSITORY -> github.repository
 */
function applyEnvironmentOverrides(config: Record<string, unknown>): void {
  const envMappings: Record<string, string> = {
    AZURE_WORKSPACE_ID: 'azureMonitor.workspaceId',
    AZURE_TENANT_ID: 'azureMonitor.tenantId',
    AZURE_CLIENT_ID: 'azureMonitor.clientId',
    AZURE_CLIENT_SECRET: 'azureMonitor.clientSecret',
    AZURE_SUBSCRIPTION_ID: 'azureMonitor.subscriptionId',
    AZURE_RESOURCE_GROUP: 'azureMonitor.resourceGroup',
    GITHUB_TOKEN: 'github.token',
    GITHUB_REPOSITORY: 'github.repository',
    LOG_LEVEL: 'logging.level',
    ENVIRONMENT: 'environment',
  };

  for (const [envVar, configPath] of Object.entries(envMappings)) {
    const envValue = process.env[envVar];
    if (envValue !== undefined && envValue !== '') {
      setNestedValue(config, configPath, envValue);
    }
  }
}

/**
 * Set nested object value using dot notation
 */
function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.');
  let current: Record<string, unknown> = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (key === undefined || key === '') {
      continue;
    }
    if (!(key in current)) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }

  const lastKey = keys[keys.length - 1];
  if (lastKey !== undefined && lastKey !== '') {
    current[lastKey] = value;
  }
}

/**
 * Validate configuration using Zod schema
 */
function validateConfig(config: unknown): AppConfig {
  try {
    return appConfigSchema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const formattedErrors = error.errors
        .map((err) => {
          const path = err.path.join('.');
          return `  - ${path}: ${err.message}`;
        })
        .join('\n');

      throw new ConfigurationError(`Configuration validation failed:\n${formattedErrors}`, error);
    }
    throw new ConfigurationError('Configuration validation failed', error);
  }
}

/**
 * Load environment-specific overrides
 */
function loadEnvironmentOverrides(
  baseConfig: Record<string, unknown>,
  environment?: string,
  basePath?: string
): Record<string, unknown> {
  if (environment === undefined || environment === '') {
    return baseConfig;
  }

  const envConfigPaths = [`config/${environment}.yaml`, `config/${environment}.yml`];

  for (const envPath of envConfigPaths) {
    const resolvedPath = path.resolve(basePath ?? '', envPath);
    if (fs.existsSync(resolvedPath)) {
      try {
        const envConfig = loadYamlFile(resolvedPath);
        return deepMerge(baseConfig, envConfig as Record<string, unknown>);
      } catch (error) {
        // Continue if environment-specific file fails to load
        console.warn(`Warning: Failed to load environment config: ${envPath}`);
      }
    }
  }

  return baseConfig;
}

/**
 * Deep merge two objects
 */
function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...target };

  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const sourceValue = source[key];
      const targetValue = target[key];
      if (
        sourceValue !== null &&
        sourceValue !== undefined &&
        typeof sourceValue === 'object' &&
        !Array.isArray(sourceValue)
      ) {
        result[key] = deepMerge(
          (targetValue !== null &&
          targetValue !== undefined &&
          typeof targetValue === 'object' &&
          !Array.isArray(targetValue)
            ? targetValue
            : {}) as Record<string, unknown>,
          sourceValue as Record<string, unknown>
        );
      } else {
        result[key] = sourceValue;
      }
    }
  }

  return result;
}

/**
 * Load and validate configuration
 *
 * @param options - Configuration loading options
 * @returns Validated application configuration
 *
 * @example
 * ```typescript
 * // Load from default location
 * const config = loadConfig();
 *
 * // Load from specific path
 * const config = loadConfig({ configPath: './my-config.yaml' });
 *
 * // Load with environment overrides
 * const config = loadConfig({
 *   environment: 'production',
 *   allowEnvOverrides: true
 * });
 * ```
 */
export function loadConfig(options: ConfigLoadOptions = {}): AppConfig {
  const {
    configPath,
    environment = process.env['NODE_ENV'],
    validate = true,
    allowEnvOverrides = true,
  } = options;

  try {
    // Find and load base configuration file
    const filePath = findConfigFile(configPath);
    const baseDir = path.dirname(filePath);
    let config = loadYamlFile(filePath);

    // Process environment variable substitutions in YAML values
    const substitutions: EnvSubstitution[] = [];
    config = processEnvSubstitutions(config, substitutions);

    // Log environment variable substitutions (not values for security)
    if (substitutions.length > 0) {
      console.log('[Config] Environment variable substitutions:');
      for (const sub of substitutions) {
        if (sub.usedDefault) {
          console.log(`  - ${sub.variable} (using default value)`);
        } else {
          console.log(`  - ${sub.variable}`);
        }
      }
    }

    // Load environment-specific overrides
    config = loadEnvironmentOverrides(config as Record<string, unknown>, environment, baseDir);

    // Apply environment variable overrides
    if (allowEnvOverrides) {
      applyEnvironmentOverrides(config as Record<string, unknown>);
    }

    // Validate configuration
    if (validate) {
      return validateConfig(config);
    }

    return config as AppConfig;
  } catch (error) {
    if (error instanceof ConfigurationError) {
      throw error;
    }
    throw new ConfigurationError('Failed to load configuration', error);
  }
}

/**
 * Load configuration with custom schema validation
 *
 * @param schema - Zod schema to validate against
 * @param options - Configuration loading options
 * @returns Validated configuration
 */
export function loadConfigWithSchema<T>(
  schema: z.ZodSchema<T>,
  options: ConfigLoadOptions = {}
): T {
  const { configPath, environment = process.env['NODE_ENV'], allowEnvOverrides = true } = options;

  try {
    // Find and load base configuration file
    const filePath = findConfigFile(configPath);
    const baseDir = path.dirname(filePath);
    let config = loadYamlFile(filePath);

    // Process environment variable substitutions in YAML values
    const substitutions: EnvSubstitution[] = [];
    config = processEnvSubstitutions(config, substitutions);

    // Log environment variable substitutions (not values for security)
    if (substitutions.length > 0) {
      console.log('[Config] Environment variable substitutions:');
      for (const sub of substitutions) {
        if (sub.usedDefault) {
          console.log(`  - ${sub.variable} (using default value)`);
        } else {
          console.log(`  - ${sub.variable}`);
        }
      }
    }

    // Load environment-specific overrides
    config = loadEnvironmentOverrides(config as Record<string, unknown>, environment, baseDir);

    // Apply environment variable overrides
    if (allowEnvOverrides) {
      applyEnvironmentOverrides(config as Record<string, unknown>);
    }

    // Validate with custom schema
    return schema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const formattedErrors = error.errors
        .map((err) => {
          const path = err.path.join('.');
          return `  - ${path}: ${err.message}`;
        })
        .join('\n');

      throw new ConfigurationError(`Configuration validation failed:\n${formattedErrors}`, error);
    }
    if (error instanceof ConfigurationError) {
      throw error;
    }
    throw new ConfigurationError('Failed to load configuration', error);
  }
}

/**
 * Validate configuration without loading from file
 *
 * @param config - Configuration object to validate
 * @returns Validated configuration
 */
export function validateConfiguration(config: unknown): AppConfig {
  return validateConfig(config);
}
