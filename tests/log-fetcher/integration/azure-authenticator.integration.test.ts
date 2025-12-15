/**
 * Integration tests for AzureAuthenticator
 *
 * These tests use real Azure credentials and test actual authentication
 */

import { AzureAuthenticator } from '../../../src/log-fetcher/azure-authenticator';

// Skip these tests if Azure credentials are not available
const describeIfAzure =
  process.env['AZURE_TENANT_ID'] !== undefined &&
  process.env['AZURE_TENANT_ID'] !== null &&
  process.env['AZURE_TENANT_ID'] !== ''
    ? describe
    : describe.skip;

describeIfAzure('AzureAuthenticator Integration Tests', () => {
  const workspaceId = process.env['AZURE_WORKSPACE_ID'] ?? 'test-workspace-id';

  describe('Real Azure Authentication', () => {
    it('should authenticate with service principal credentials', async () => {
      // Arrange
      const authenticator = new AzureAuthenticator(workspaceId);

      // Act
      const credential = await authenticator.authenticate();

      // Assert
      expect(credential).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(credential.getToken).toBeDefined();

      // Verify we can get a token
      const token = await credential.getToken('https://api.loganalytics.io/.default');
      expect(token).not.toBeNull();
      if (token !== null) {
        // eslint-disable-next-line jest/no-conditional-expect
        expect(token.token).not.toBe('');
        // eslint-disable-next-line jest/no-conditional-expect
        expect(token.expiresOnTimestamp).toBeGreaterThan(Date.now());
      }
    }, 30000); // 30 second timeout for network calls

    it('should cache credentials after first authentication', async () => {
      // Arrange
      const authenticator = new AzureAuthenticator(workspaceId);

      // Act - First authentication
      const credential1 = await authenticator.authenticate();

      // Act - Second authentication (should return cached)
      const credential2 = await authenticator.authenticate();

      // Assert
      expect(credential1).toBe(credential2); // Same object reference
    }, 30000);

    it('should handle workspace ID validation', () => {
      // Assert
      expect(() => new AzureAuthenticator('')).toThrow('Workspace ID is required');
      expect(() => new AzureAuthenticator('  ')).toThrow('Workspace ID is required');
    });

    it('should create authenticator with valid workspace ID', () => {
      // Act
      const authenticator = new AzureAuthenticator(workspaceId);

      // Assert
      expect(authenticator).toBeDefined();
    });
  });
});
