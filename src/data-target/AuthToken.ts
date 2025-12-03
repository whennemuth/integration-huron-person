import axios, { AxiosResponse } from 'axios';
import { ConfigManager } from '../config/ConfigManager';
import { EndpointConfigForJWT } from './ApiClientForJWT';

type TokenAuthConfig = {
  authMethod: 'externalToken';
  externalToken: string;
  userId: string; // User ID from contact info
  loginSvcPath?: string; // Path to login service, defaults to '/loginsvc/api/v1/token/'
};

/**
 * External token authentication handler for JWT token retrieval
 */
class AuthToken {
  private config: TokenAuthConfig & { baseUrl: string; timeout?: number };

  constructor(config: TokenAuthConfig & { baseUrl: string; timeout?: number }) {
    this.config = config;
  }

  /**
   * Authenticate using external token method (HRS recommended)
   */
  async authenticate(): Promise<string> {
    const { externalToken, userId, baseUrl, timeout = 30000, loginSvcPath = '/loginsvc/api/v1/token/' } = this.config;

    // Properly join URL parts ensuring single "/" between components
    const normalizedBaseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    const normalizedSvcPath = loginSvcPath.replace(/^\/*/, '').replace(/\/$/, ''); // Remove leading/trailing slashes
    const tokenUrl = `${normalizedBaseUrl}/${normalizedSvcPath}/${userId}`;

    const response: AxiosResponse = await axios.get(
      tokenUrl,
      {
        headers: {
          Authorization: `Bearer ${externalToken}`,
        },
        timeout,
      }
    );

    // HRS returns JWT as plain string response
    const token = response.data;
    if (!token || typeof token !== 'string') {
      throw new Error('No JWT token received from external token authentication');
    }

    console.log('Successfully retrieved JWT token via external token authentication');
    return token;
  }
}


/**
 * Test the AuthToken class independently
 */
async function main() {
  // Load configuration with chaining API
  const config = ConfigManager
    .getInstance()
    .fromEnvironment()
    .fromFileSystem()
    .getConfig();

  const tokenAuthConfig = config.dataTarget.endpointConfig as EndpointConfigForJWT & TokenAuthConfig;

  const authToken = new AuthToken(tokenAuthConfig);
  try {
    const token = await authToken.authenticate();
    console.log('Retrieved JWT token:', token);
  } catch (error) {
    console.error('Error during authentication:', error);
  }
}


// Run if this file is executed directly
if (require.main === module) {
  main();
}

export { AuthToken, TokenAuthConfig };
