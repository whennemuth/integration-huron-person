import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { IApiClient } from './ApiClient';

/**
 * Configuration for API key-authenticated endpoint
 */
export interface EndpointConfigForApiKey {
  baseUrl: string;
  apiKey: string;
  timeout?: number;
}

/**
 * HTTP client for API key-authenticated APIs
 */
export class ApiClientForApiKey implements IApiClient {
  private axiosInstance: AxiosInstance;
  private endpointConfig: EndpointConfigForApiKey;

  constructor(endpointConfig: EndpointConfigForApiKey) {
    this.endpointConfig = endpointConfig;
    this.axiosInstance = axios.create({
      baseURL: endpointConfig.baseUrl,
      timeout: endpointConfig.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': endpointConfig.apiKey,
      },
    });
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
   * Get current API key (for debugging)
   */
  getCurrentApiKey(): string {
    return this.endpointConfig.apiKey;
  }
}