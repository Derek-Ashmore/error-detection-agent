/**
 * Example demonstrating configuration secrets redaction
 *
 * This example shows how to use the utility functions to safely
 * log and export configuration with sensitive data redacted.
 */

import { loadConfig, redactSecrets, exportConfiguration, getConfigSummary } from '../src/config';

async function main() {
  console.log('='.repeat(80));
  console.log('Configuration Redaction Example');
  console.log('='.repeat(80));
  console.log();

  try {
    // Load configuration (this would normally include secrets)
    console.log('1. Loading configuration...');
    const config = loadConfig({
      configPath: './config/default.yaml',
      environment: 'development',
    });
    console.log('✓ Configuration loaded successfully');
    console.log();

    // Example 1: Redact secrets for safe logging
    console.log('2. Redacting secrets for safe logging...');
    const redacted = redactSecrets(config);
    console.log('✓ Secrets redacted');
    console.log();
    console.log('Safe to log (all secrets replaced with ***):', );
    console.log(JSON.stringify(redacted, null, 2));
    console.log();

    // Example 2: Export configuration as YAML with redacted secrets
    console.log('3. Exporting configuration as YAML...');
    const yamlConfig = exportConfiguration(config);
    console.log('✓ Configuration exported to YAML');
    console.log();
    console.log('YAML output (safe to share):');
    console.log(yamlConfig);
    console.log();

    // Example 3: Create a safe summary for logging
    console.log('4. Creating safe configuration summary...');
    const summary = getConfigSummary(config);
    console.log('✓ Summary created');
    console.log();
    console.log('Configuration summary (safe to log):');
    console.log(JSON.stringify(summary, null, 2));
    console.log();

    // Example 4: Demonstrate what gets redacted
    console.log('5. Fields that get redacted:');
    console.log('   - Fields containing "token"');
    console.log('   - Fields containing "secret"');
    console.log('   - Fields containing "password"');
    console.log('   - Fields containing "key"');
    console.log('   - Fields containing "credential"');
    console.log();
    console.log('   Examples:');
    console.log('   - azureMonitor.clientSecret → "***"');
    console.log('   - github.token → "***"');
    console.log('   - notification.email.password → "***"');
    console.log('   - anyFieldWithKey → "***"');
    console.log();

    console.log('='.repeat(80));
    console.log('✓ All examples completed successfully!');
    console.log('='.repeat(80));
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Run the example
if (require.main === module) {
  main().catch(console.error);
}

export { main };
