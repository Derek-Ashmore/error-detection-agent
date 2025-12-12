/**
 * Example: Loading and using configuration
 *
 * This example demonstrates how to load and use the configuration system.
 */

import { loadConfig, ConfigurationError } from '../src/config';

async function main() {
  try {
    console.log('Loading configuration...');

    // Load configuration from default location (config/default.yaml)
    const config = loadConfig();

    console.log('\n✅ Configuration loaded successfully!\n');

    // Display Azure Monitor configuration
    console.log('Azure Monitor Configuration:');
    console.log('  Workspace ID:', config.azureMonitor.workspaceId);
    console.log('  Tenant ID:', config.azureMonitor.tenantId);
    console.log('  Client ID:', config.azureMonitor.clientId);

    // Display log fetching configuration
    console.log('\nLog Fetching Configuration:');
    console.log('  Query Interval:', config.logFetching.queryIntervalMinutes, 'minutes');
    console.log('  Batch Size:', config.logFetching.batchSize);
    console.log('  Lookback Period:', config.logFetching.lookbackMinutes, 'minutes');

    // Display failure detection patterns
    console.log('\nFailure Detection Patterns:');
    config.failureDetection.patterns.forEach((pattern, index) => {
      console.log(`  ${index + 1}. ${pattern.name}`);
      console.log(`     Type: ${pattern.type}`);
      console.log(`     Priority: ${pattern.priority}`);
      console.log(`     Enabled: ${pattern.enabled}`);
    });

    // Display GitHub configuration
    console.log('\nGitHub Configuration:');
    console.log('  Repository:', config.github.repository);
    console.log('  Default Labels:', config.github.defaultLabels.join(', '));
    console.log('  Auto-assign:', config.github.autoAssign);

    // Display duplicate detection configuration
    console.log('\nDuplicate Detection:');
    console.log('  Enabled:', config.duplicateDetection.enabled);
    console.log('  Similarity Threshold:', config.duplicateDetection.similarityThreshold);
    console.log('  Algorithm:', config.duplicateDetection.algorithm);

    // Display scheduler configuration
    console.log('\nScheduler Configuration:');
    console.log('  Enabled:', config.scheduler.enabled);
    console.log('  Cron Expression:', config.scheduler.cronExpression);
    console.log('  Timezone:', config.scheduler.timezone);

    // Display logging configuration
    console.log('\nLogging Configuration:');
    console.log('  Level:', config.logging.level);
    console.log('  Format:', config.logging.format);
    console.log('  Console:', config.logging.enableConsole);

    // Display environment
    console.log('\nEnvironment:', config.environment);

    console.log('\n✅ All configuration sections validated successfully!');

  } catch (error) {
    if (error instanceof ConfigurationError) {
      console.error('❌ Configuration Error:', error.message);

      if (error.cause) {
        console.error('\nCaused by:', error.cause);
      }

      process.exit(1);
    } else {
      console.error('❌ Unexpected Error:', error);
      process.exit(1);
    }
  }
}

// Run the example
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
