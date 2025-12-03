import axios, { AxiosResponse } from 'axios';

export type BasicAuthConfig = {
  authMethod: 'basic';
  loginSvcPath: string;
  username: string;
  password: string;
};

/**
 * Basic authentication handler for JWT token retrieval
 */
export class AuthBasic {
  private config: BasicAuthConfig & { baseUrl: string; timeout?: number };

  constructor(config: BasicAuthConfig & { baseUrl: string; timeout?: number }) {
    this.config = config;
  }

  /**
   * Authenticate using basic auth method
   */
  async authenticate(): Promise<string> {
    const { loginSvcPath, username, password, timeout = 30000 } = this.config;
    
    // Encode credentials using username|password convention
    const credentials = Buffer.from(`${username}|${password}`).toString('base64');
    
    const response: AxiosResponse = await axios.post(
      loginSvcPath,
      {},
      {
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/json',
        },
        timeout,
      }
    );

    const token = response.data.token || response.data.access_token;
    if (!token) {
      throw new Error('No token received from basic authentication endpoint');
    }

    return token;
  }
}