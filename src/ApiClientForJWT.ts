import axios, { AxiosInstance, AxiosResponse } from 'axios';
import * as jwt from 'jsonwebtoken';
import { IApiClient } from './ApiClient';

/**
 * Configuration for JWT-authenticated API endpoint
 */
export interface EndpointConfigForJWT {
  baseUrl: string;
  authTokenUrl: string;
  username: string;
  password: string;
  timeout?: number;
}

/**
 * HTTP client for JWT-authenticated APIs
 */
export class ApiClientForJWT implements IApiClient {
  private axiosInstance: AxiosInstance;
  private endpointConfig: EndpointConfigForJWT;
  private jwtToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(endpointConfig: EndpointConfigForJWT) {
    this.endpointConfig = endpointConfig;
    this.axiosInstance = axios.create({
      baseURL: endpointConfig.baseUrl,
      timeout: endpointConfig.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add request interceptor to ensure valid JWT token
    this.axiosInstance.interceptors.request.use(
      async (config: any) => {
        await this.ensureValidToken();
        if (this.jwtToken) {
          config.headers.Authorization = `Bearer ${this.jwtToken}`;
        }
        return config;
      },
      (error: any) => Promise.reject(error)
    );
  }

  /**
   * Authenticate and obtain JWT token using base64 encoded credentials
   */
  private async authenticate(): Promise<void> {
    const { authTokenUrl, username, password, timeout=30000 } = this.endpointConfig;
    try {
      
      // Encode credentials on-the-fly using username|password convention
      const credentials = Buffer.from(`${username}|${password}`).toString('base64');
      
      const response: AxiosResponse = await axios.post(
        authTokenUrl,
        {},
        {
          headers: {
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/json',
          },
          timeout,
        }
      );

      this.jwtToken = response.data.token || response.data.access_token;
      
      if (!this.jwtToken) {
        throw new Error('No token received from authentication endpoint');
      }

      // Decode token to get expiry (assuming standard JWT)
      try {
        const decoded = jwt.decode(this.jwtToken) as any;
        this.tokenExpiry = decoded.exp ? decoded.exp * 1000 : Date.now() + (60 * 60 * 1000); // Default 1 hour
      } catch (decodeError) {
        // If we can't decode, assume 1 hour validity
        this.tokenExpiry = Date.now() + (60 * 60 * 1000);
      }

      console.log(`Successfully authenticated with Huron API at ${authTokenUrl}`);
    } catch (error) {
      console.error('Authentication failed:', error);
      throw new Error(`Failed to authenticate with API at ${authTokenUrl}: ${error}`);
    }
  }

  /**
   * Ensure we have a valid JWT token, refresh if necessary
   */
  private async ensureValidToken(): Promise<void> {
    const now = Date.now();
    const bufferTime = 5 * 60 * 1000; // 5 minutes buffer

    if (!this.jwtToken || now >= (this.tokenExpiry - bufferTime)) {
      console.log('Token expired or missing, refreshing...');
      await this.authenticate();
    }
  }

  /**
   * Make authenticated GET request
   */
  async get<T = any>(url: string, params?: any): Promise<AxiosResponse<T>> {
    return this.axiosInstance.get(url, { params });
  }

  /**
   * Make authenticated POST request
   */
  async post<T = any>(url: string, data?: any): Promise<AxiosResponse<T>> {
    return this.axiosInstance.post(url, data);
  }

  /**
   * Make authenticated PUT request
   */
  async put<T = any>(url: string, data?: any): Promise<AxiosResponse<T>> {
    return this.axiosInstance.put(url, data);
  }

  /**
   * Make authenticated DELETE request
   */
  async delete<T = any>(url: string): Promise<AxiosResponse<T>> {
    return this.axiosInstance.delete(url);
  }

  /**
   * Get current JWT token (for debugging)
   */
  getCurrentToken(): string | null {
    return this.jwtToken;
  }
}