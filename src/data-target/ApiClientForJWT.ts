import axios, { AxiosInstance, AxiosResponse } from 'axios';
import * as jwt from 'jsonwebtoken';
import { IApiClient } from '../ApiClient';
import { Cache } from '../Cache';
import { ResponseProcessor } from '../stream/AxiosResponseStreamFilter';
import { AuthBasic, BasicAuthConfig } from './AuthBasic';
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
  private cache?: Cache<string, string>;

  public static JWT_BASIC_TOKEN_CACHE_KEY = 'jwt-basic-token-cache';
  public static JWT_EXTERNAL_TOKEN_CACHE_KEY = 'jwt-external-token-cache';

  constructor(endpointConfig: EndpointConfigForJWT, cache?:Cache<string,string>) {
    this.endpointConfig = endpointConfig;
    this.axiosInstance = axios.create({
      baseURL: endpointConfig.baseUrl,
      timeout: endpointConfig.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Store cache instance - if provided, caching is enabled
    this.cache = cache;

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
  private decodeTokenExpiry = (token: string): number => {
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
    const { endpointConfig: { authMethod }, decodeTokenExpiry } = this;
    const { JWT_BASIC_TOKEN_CACHE_KEY, JWT_EXTERNAL_TOKEN_CACHE_KEY } = ApiClientForJWT;

    // Check cache first if caching is enabled
    if (this.cache) {
      const cacheKey = authMethod === 'basic' ? JWT_BASIC_TOKEN_CACHE_KEY : JWT_EXTERNAL_TOKEN_CACHE_KEY;
      const cachedJwt = this.cache.get(cacheKey);
      const cachedJwtExpiry = cachedJwt ? decodeTokenExpiry(cachedJwt) : 0;
      if (cachedJwt && now < (cachedJwtExpiry - bufferTime)) {
        console.log(`Using cached JWT token with ${Math.round((cachedJwtExpiry - now) / 60000)} minutes until expiry`);
        this.jwtToken = cachedJwt;
        this.tokenExpiry = cachedJwtExpiry;
        return;
      }
    }

    this.tokenExpiry = this.jwtToken ? decodeTokenExpiry(this.jwtToken) : 0;
    const expiryMinutes = Math.round((this.tokenExpiry - now) / 60000);

    // If no token or expired, authenticate for new token
    if (!this.jwtToken || now >= (this.tokenExpiry - bufferTime)) {
      console.log('JWT token expired or missing, refreshing...');

      await this.authenticate();
      
      // Cache the new token if caching is enabled
      if (this.jwtToken && this.cache) {
        console.log(`Caching new JWT token with ${expiryMinutes} minutes until expiry`);
        const cacheKey = authMethod === 'basic' ? JWT_BASIC_TOKEN_CACHE_KEY : JWT_EXTERNAL_TOKEN_CACHE_KEY;
        this.cache.set(cacheKey, this.jwtToken);
      }
      else {
        console.log(`Caching disabled.Acquired new JWT token with ${expiryMinutes} minutes until expiry`);
      }
    }
    else {
      console.log(`Existing JWT token is still valid with ${expiryMinutes} minutes until expiry`);
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