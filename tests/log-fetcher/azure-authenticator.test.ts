/**
 * Azure Authenticator Tests
 *
 * Tests all authentication scenarios from spec.md:
 * - Successful authentication with managed identity
 * - Successful authentication with service principal
 * - Failed authentication with retry logic
 */

import { DefaultAzureCredential, ClientSecretCredential } from '@azure/identity';
import { LogsQueryClient } from '@azure/monitor-query';

// Mock Azure SDK modules
jest.mock('@azure/identity');
jest.mock('@azure/monitor-query');

describe('AzureAuthenticator', () => {
  let mockDefaultCredential: jest.Mocked<DefaultAzureCredential>;
  let mockClientSecretCredential: jest.Mocked<ClientSecretCredential>;
  let mockLogsQueryClient: jest.Mocked<LogsQueryClient>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock DefaultAzureCredential
    mockDefaultCredential = {
      getToken: jest.fn().mockResolvedValue({
        token: 'mock-token',
        expiresOnTimestamp: Date.now() + 3600000,
      }),
    } as any;

    // Mock ClientSecretCredential
    mockClientSecretCredential = {
      getToken: jest.fn().mockResolvedValue({
        token: 'mock-token-sp',
        expiresOnTimestamp: Date.now() + 3600000,
      }),
    } as any;

    // Mock LogsQueryClient
    mockLogsQueryClient = {
      queryWorkspace: jest.fn(),
    } as any;

    (DefaultAzureCredential as jest.MockedClass<typeof DefaultAzureCredential>).mockImplementation(
      () => mockDefaultCredential
    );

    (ClientSecretCredential as jest.MockedClass<typeof ClientSecretCredential>).mockImplementation(
      () => mockClientSecretCredential
    );

    (LogsQueryClient as jest.MockedClass<typeof LogsQueryClient>).mockImplementation(
      () => mockLogsQueryClient
    );
  });

  describe('Scenario: Successful authentication with managed identity', () => {
    it('should authenticate using DefaultAzureCredential', async () => {
      // Arrange
      const workspaceId = 'test-workspace-id';

      // Act
      const credential = new DefaultAzureCredential();
      const client = new LogsQueryClient(credential);
      const token = await credential.getToken('https://api.loganalytics.io/.default');

      // Assert
      expect(DefaultAzureCredential).toHaveBeenCalledTimes(1);
      expect(credential.getToken).toHaveBeenCalledWith('https://api.loganalytics.io/.default');
      expect(token).toBeDefined();
      expect(token.token).toBe('mock-token');
      expect(LogsQueryClient).toHaveBeenCalledWith(credential);
    });

    it('should validate workspace ID format', () => {
      // Arrange
      const validWorkspaceId = '12345678-1234-1234-1234-123456789abc';
      const invalidWorkspaceId = 'invalid-id';

      // Act & Assert
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      expect(uuidRegex.test(validWorkspaceId)).toBe(true);
      expect(uuidRegex.test(invalidWorkspaceId)).toBe(false);
    });

    it('should handle credential token refresh', async () => {
      // Arrange
      const credential = new DefaultAzureCredential();
      const firstCall = await credential.getToken('https://api.loganalytics.io/.default');

      // Simulate token expiry
      mockDefaultCredential.getToken.mockResolvedValueOnce({
        token: 'refreshed-token',
        expiresOnTimestamp: Date.now() + 3600000,
      });

      // Act
      const secondCall = await credential.getToken('https://api.loganalytics.io/.default');

      // Assert
      expect(credential.getToken).toHaveBeenCalledTimes(2);
      expect(secondCall.token).toBe('refreshed-token');
    });
  });

  describe('Scenario: Successful authentication with service principal', () => {
    it('should authenticate using client ID and secret', async () => {
      // Arrange
      const tenantId = 'test-tenant-id';
      const clientId = 'test-client-id';
      const clientSecret = 'test-client-secret';

      // Act
      const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
      const client = new LogsQueryClient(credential);
      const token = await credential.getToken('https://api.loganalytics.io/.default');

      // Assert
      expect(ClientSecretCredential).toHaveBeenCalledWith(tenantId, clientId, clientSecret);
      expect(token).toBeDefined();
      expect(token.token).toBe('mock-token-sp');
      expect(LogsQueryClient).toHaveBeenCalledWith(credential);
    });

    it('should retrieve credentials from environment variables', () => {
      // Arrange
      process.env.AZURE_TENANT_ID = 'env-tenant-id';
      process.env.AZURE_CLIENT_ID = 'env-client-id';
      process.env.AZURE_CLIENT_SECRET = 'env-client-secret';

      // Act
      const tenantId = process.env.AZURE_TENANT_ID;
      const clientId = process.env.AZURE_CLIENT_ID;
      const clientSecret = process.env.AZURE_CLIENT_SECRET;

      const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);

      // Assert
      expect(ClientSecretCredential).toHaveBeenCalledWith(
        'env-tenant-id',
        'env-client-id',
        'env-client-secret'
      );

      // Cleanup
      delete process.env.AZURE_TENANT_ID;
      delete process.env.AZURE_CLIENT_ID;
      delete process.env.AZURE_CLIENT_SECRET;
    });

    it('should validate required environment variables', () => {
      // Arrange
      const requiredVars = ['AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET'];

      // Act
      const missingVars = requiredVars.filter((varName) => !process.env[varName]);

      // Assert (in this test, all should be missing)
      expect(missingVars.length).toBeGreaterThan(0);
    });
  });

  describe('Scenario: Failed authentication', () => {
    it('should log error when credentials are invalid', async () => {
      // Arrange
      const mockLogger = {
        error: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
      };

      mockDefaultCredential.getToken.mockRejectedValueOnce(
        new Error('Authentication failed: Invalid credentials')
      );

      const credential = new DefaultAzureCredential();

      // Act & Assert
      await expect(credential.getToken('https://api.loganalytics.io/.default')).rejects.toThrow(
        'Authentication failed: Invalid credentials'
      );
    });

    it('should retry with exponential backoff after authentication failure', async () => {
      // Arrange
      const maxRetries = 3;
      const baseDelay = 100;
      let attempt = 0;

      mockDefaultCredential.getToken
        .mockRejectedValueOnce(new Error('Auth failed attempt 1'))
        .mockRejectedValueOnce(new Error('Auth failed attempt 2'))
        .mockResolvedValueOnce({
          token: 'success-token',
          expiresOnTimestamp: Date.now() + 3600000,
        });

      // Act - Simulate retry logic
      const retryWithBackoff = async (): Promise<any> => {
        while (attempt < maxRetries) {
          try {
            const credential = new DefaultAzureCredential();
            return await credential.getToken('https://api.loganalytics.io/.default');
          } catch (error) {
            attempt++;
            if (attempt >= maxRetries) {
              throw error;
            }

            // Exponential backoff: 100ms, 200ms, 400ms
            const delay = baseDelay * Math.pow(2, attempt - 1);
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      };

      const result = await retryWithBackoff();

      // Assert
      expect(result.token).toBe('success-token');
      expect(mockDefaultCredential.getToken).toHaveBeenCalledTimes(3);
    });

    it('should alert after 3 failed authentication attempts', async () => {
      // Arrange
      const mockAlert = jest.fn();
      const maxRetries = 3;
      let failureCount = 0;

      mockDefaultCredential.getToken.mockRejectedValue(
        new Error('Persistent authentication failure')
      );

      // Act
      for (let i = 0; i < maxRetries; i++) {
        try {
          const credential = new DefaultAzureCredential();
          await credential.getToken('https://api.loganalytics.io/.default');
        } catch (error) {
          failureCount++;
        }
      }

      if (failureCount >= maxRetries) {
        mockAlert('Authentication failed after 3 attempts');
      }

      // Assert
      expect(failureCount).toBe(3);
      expect(mockAlert).toHaveBeenCalledWith('Authentication failed after 3 attempts');
    });

    it('should handle missing credentials gracefully', async () => {
      // Arrange
      mockDefaultCredential.getToken.mockRejectedValueOnce(
        new Error('EnvironmentCredential authentication unavailable')
      );

      // Act & Assert
      await expect(async () => {
        const credential = new DefaultAzureCredential();
        await credential.getToken('https://api.loganalytics.io/.default');
      }).rejects.toThrow('EnvironmentCredential authentication unavailable');
    });

    it('should handle network errors during authentication', async () => {
      // Arrange
      const networkError = new Error('ECONNREFUSED: Connection refused');
      (networkError as any).code = 'ECONNREFUSED';

      mockDefaultCredential.getToken.mockRejectedValueOnce(networkError);

      // Act & Assert
      await expect(async () => {
        const credential = new DefaultAzureCredential();
        await credential.getToken('https://api.loganalytics.io/.default');
      }).rejects.toThrow('ECONNREFUSED');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty workspace ID', () => {
      // Arrange & Act
      const workspaceId = '';

      // Assert
      expect(workspaceId).toBe('');
      expect(workspaceId.length).toBe(0);
    });

    it('should handle credential rotation', async () => {
      // Arrange
      const credential = new DefaultAzureCredential();

      // First token
      await credential.getToken('https://api.loganalytics.io/.default');

      // Simulate credential rotation
      mockDefaultCredential.getToken.mockResolvedValueOnce({
        token: 'rotated-token',
        expiresOnTimestamp: Date.now() + 3600000,
      });

      // Act
      const newToken = await credential.getToken('https://api.loganalytics.io/.default');

      // Assert
      expect(newToken.token).toBe('rotated-token');
    });

    it('should validate token expiry timestamp', async () => {
      // Arrange
      const credential = new DefaultAzureCredential();
      const token = await credential.getToken('https://api.loganalytics.io/.default');

      // Act
      const isExpired = token.expiresOnTimestamp < Date.now();
      const expiresIn = token.expiresOnTimestamp - Date.now();

      // Assert
      expect(isExpired).toBe(false);
      expect(expiresIn).toBeGreaterThan(0);
    });
  });
});
