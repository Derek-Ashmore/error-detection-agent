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
import { AppConfig, ConfigLoadOptions } from './types';
import { appConfigSchema } from './schemas';

/**
 * Configuration loading error
 */
export class ConfigurationError extends Error {
  public override readonly cause?: unknown;

  constructor(
    message: string,
    cause?: unknown,
  ) {
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
  if (configPath) {
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
    `No configuration file found. Tried: ${DEFAULT_CONFIG_PATHS.join(', ')}`,
  );
}

/**
 * Load YAML file
 */
function loadYamlFile(filePath: string): unknown {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const parsed = yaml.load(fileContent);

    if (!parsed || typeof parsed !== 'object') {
      throw new ConfigurationError('Configuration file must contain an object');
    }

    return parsed;
  } catch (error) {
    if (error instanceof ConfigurationError) {
      throw error;
    }
    throw new ConfigurationError(
      `Failed to load YAML file: ${filePath}`,
      error,
    );
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
function applyEnvironmentOverrides(config: any): void {
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
    if (envValue) {
      setNestedValue(config, configPath, envValue);
    }
  }
}

/**
 * Set nested object value using dot notation
 */
function setNestedValue(obj: any, path: string, value: any): void {
  const keys = path.split('.');
  let current = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!key) continue;
    if (!(key in current)) {
      current[key] = {};
    }
    current = current[key];
  }

  const lastKey = keys[keys.length - 1];
  if (lastKey) {
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
      const formattedErrors = error.errors.map(err => {
        const path = err.path.join('.');
        return `  - ${path}: ${err.message}`;
      }).join('\n');

      throw new ConfigurationError(
        `Configuration validation failed:\n${formattedErrors}`,
        error,
      );
    }
    throw new ConfigurationError('Configuration validation failed', error);
  }
}

/**
 * Load environment-specific overrides
 */
function loadEnvironmentOverrides(
  baseConfig: any,
  environment?: string,
  basePath?: string,
): any {
  if (!environment) {
    return baseConfig;
  }

  const envConfigPaths = [
    `config/${environment}.yaml`,
    `config/${environment}.yml`,
  ];

  for (const envPath of envConfigPaths) {
    const resolvedPath = path.resolve(basePath || '', envPath);
    if (fs.existsSync(resolvedPath)) {
      try {
        const envConfig = loadYamlFile(resolvedPath);
        return deepMerge(baseConfig, envConfig);
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
function deepMerge(target: any, source: any): any {
  const result = { ...target };

  for (const key in source) {
    if (source.hasOwnProperty(key)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
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

    // Load environment-specific overrides
    config = loadEnvironmentOverrides(config, environment, baseDir);

    // Apply environment variable overrides
    if (allowEnvOverrides) {
      applyEnvironmentOverrides(config);
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
  options: ConfigLoadOptions = {},
): T {
  const {
    configPath,
    environment = process.env['NODE_ENV'],
    allowEnvOverrides = true,
  } = options;

  try {
    // Find and load base configuration file
    const filePath = findConfigFile(configPath);
    const baseDir = path.dirname(filePath);
    let config = loadYamlFile(filePath);

    // Load environment-specific overrides
    config = loadEnvironmentOverrides(config, environment, baseDir);

    // Apply environment variable overrides
    if (allowEnvOverrides) {
      applyEnvironmentOverrides(config);
    }

    // Validate with custom schema
    return schema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const formattedErrors = error.errors.map(err => {
        const path = err.path.join('.');
        return `  - ${path}: ${err.message}`;
      }).join('\n');

      throw new ConfigurationError(
        `Configuration validation failed:\n${formattedErrors}`,
        error,
      );
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
