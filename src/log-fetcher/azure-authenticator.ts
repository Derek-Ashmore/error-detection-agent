/**
 * Azure authentication service using DefaultAzureCredential
 *
 * This module handles authentication with Azure Application Insights using
 * managed identity or service principal credentials.
 */

import { DefaultAzureCredential } from '@azure/identity';
import type { TokenCredential } from '@azure/identity';

/**
 * Authenticator for Azure services
 */
export class AzureAuthenticator {
  private credential: TokenCredential | null = null;
  private workspaceId: string;
  private retryCount = 0;
  private readonly maxRetries = 3;

  /**
   * Creates a new Azure authenticator
   * @param workspaceId - Azure Log Analytics workspace ID
   */
  constructor(workspaceId: string) {
    if (workspaceId === null || workspaceId === undefined || workspaceId.trim().length === 0) {
      throw new Error('Workspace ID is required');
    }
    this.workspaceId = workspaceId;
  }

  /**
   * Authenticate with Azure using DefaultAzureCredential
   *
   * This method attempts authentication with the following credential types in order:
   * 1. Environment variables (AZURE_CLIENT_ID, AZURE_TENANT_ID, AZURE_CLIENT_SECRET)
   * 2. Managed Identity
   * 3. Azure CLI
   * 4. Azure PowerShell
   *
   * @returns TokenCredential for Azure API calls
   * @throws Error if authentication fails after retries
   */
  async authenticate(): Promise<TokenCredential> {
    if (this.credential !== null) {
      return this.credential;
    }

    try {
      // Create DefaultAzureCredential which tries multiple authentication methods
      this.credential = new DefaultAzureCredential({
        // Enable logging for authentication troubleshooting
        loggingOptions: {
          allowLoggingAccountIdentifiers: true,
        },
      });

      // Test the credential by requesting a token
      await this.validateCredential(this.credential);

      this.retryCount = 0;
      return this.credential;
    } catch (error) {
      this.retryCount++;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (this.retryCount >= this.maxRetries) {
        const finalError = new Error(
          `Authentication failed after ${this.maxRetries} attempts: ${errorMessage}`
        );
        throw finalError;
      }

      // Calculate exponential backoff delay
      const delayMs = Math.min(1000 * Math.pow(2, this.retryCount - 1), 10000);
      await this.delay(delayMs);

      // Recursive retry
      return this.authenticate();
    }
  }

  /**
   * Validate credential by requesting a token
   * @param credential - Credential to validate
   * @throws Error if credential is invalid
   */
  private async validateCredential(credential: TokenCredential): Promise<void> {
    try {
      // Request a token for Azure Monitor scope
      const tokenResponse = await credential.getToken('https://api.loganalytics.io/.default');

      if (
        tokenResponse?.token !== null &&
        tokenResponse?.token !== undefined &&
        tokenResponse.token.length > 0
      ) {
        // Token is valid
      } else {
        throw new Error('Failed to obtain access token');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Credential validation failed: ${errorMessage}`);
    }
  }

  /**
   * Get the authenticated credential
   * @returns TokenCredential or null if not authenticated
   */
  getCredential(): TokenCredential | null {
    return this.credential;
  }

  /**
   * Get the workspace ID
   * @returns Workspace ID
   */
  getWorkspaceId(): string {
    return this.workspaceId;
  }

  /**
   * Check if currently authenticated
   * @returns True if authenticated
   */
  isAuthenticated(): boolean {
    return this.credential !== null;
  }

  /**
   * Reset authentication state (useful for testing or re-authentication)
   */
  reset(): void {
    this.credential = null;
    this.retryCount = 0;
  }

  /**
   * Delay helper for exponential backoff
   * @param ms - Milliseconds to delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
