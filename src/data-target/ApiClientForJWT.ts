import axios, { AxiosInstance, AxiosResponse } from 'axios';
import * as jwt from 'jsonwebtoken';
import { IApiClient } from '../ApiClient';
import { ResponseProcessor } from '../stream/AxiosResponseStreamFilter';
import { BasicAuthConfig, AuthBasic } from './AuthBasic';
import type { TokenAuthConfig } from './AuthToken';
import { AuthToken } from './AuthToken';

/**
 * Configuration for JWT-authenticated API endpoint
 */
export type EndpointConfigForJWT = {
  baseUrl: string;
  timeout?: number;
} & (BasicAuthConfig | TokenAuthConfig);

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

    // Add request interceptor for URL logging
    this.axiosInstance.interceptors.request.use(
      (config: any) => {
        // Log the full URL that Axios will use
        const fullUrl = axios.getUri(config);
        console.log(`[ApiClientForJWT] Making request to: ${config.method?.toUpperCase()} ${fullUrl}`);
        return config;
      },
      (error: any) => Promise.reject(error)
    );

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
   * Authenticate and obtain JWT token using the configured method
   */
  private async authenticate(): Promise<void> {
    const config = this.endpointConfig;
    
    switch (config.authMethod) {
      case 'basic':
        const basicAuth = new AuthBasic(config);
        this.jwtToken = await basicAuth.authenticate();
        // Decode token expiry from JWT
        this.tokenExpiry = this.decodeTokenExpiry(this.jwtToken);
        break;
        
      case 'externalToken':
        const tokenAuth = new AuthToken(config);
        this.jwtToken = await tokenAuth.authenticate();
        // External tokens are valid for 60 minutes per HRS documentation
        this.tokenExpiry = Date.now() + (60 * 60 * 1000);
        break;
        
      default:
        throw new Error(`Unsupported authentication method: ${(config as any).authMethod}`);
    }

    console.log(`Successfully authenticated with ${config.authMethod} method`);
  }

  /**
   * Decode token expiry from JWT payload
   */
  private decodeTokenExpiry(token: string): number {
    try {
      const decoded = jwt.decode(token) as any;
      return decoded.exp ? decoded.exp * 1000 : Date.now() + (60 * 60 * 1000); // Default 1 hour
    } catch (decodeError) {
      // If we can't decode, assume 1 hour validity
      return Date.now() + (60 * 60 * 1000);
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
  async get<T = any>(params: { url: string, params?: any, responseFilter?: ResponseProcessor }): Promise<AxiosResponse<T>> {
    const response: AxiosResponse<T> = await this.axiosInstance.get(params.url, { 
      params: params.params,
      responseType: params.responseFilter ? 'stream' : 'json'
    });

    if(!params.responseFilter) {
      // The response has all of the data and can be returned as is.
      return response;
    }

    // The response is a stream. The data has not yet come over that stream, but will do so when processed.
    return params.responseFilter.processResponse(response);
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
   * Make authenticated PATCH request
   */
  async patch<T = any>(url: string, data?: any): Promise<AxiosResponse<T>> {
    return this.axiosInstance.patch(url, data);
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