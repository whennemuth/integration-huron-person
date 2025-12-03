import axios, { AxiosResponse } from 'axios';

export type TokenAuthConfig = {
  authMethod: 'externalToken';
  externalToken: string;
  userId: string; // User ID from contact info
  loginSvcPath?: string; // Path to login service, defaults to '/loginsvc/api/v1/token/'
};

/**
 * External token authentication handler for JWT token retrieval
 */
export class AuthToken {
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

    return token;
  }
}