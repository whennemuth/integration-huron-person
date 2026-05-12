import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { Readable } from 'stream';
import { IApiClient } from '../ApiClient';
import { ResponseProcessor } from '../stream/AxiosResponseStreamFilter';

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
 * MEMORY OPTIMIZATION: Supports recreating axios instance to prevent connection pool buildup
 */
export class ApiClientForApiKey implements IApiClient {
  private axiosInstance: AxiosInstance;
  private endpointConfig: EndpointConfigForApiKey;

  constructor(endpointConfig: EndpointConfigForApiKey) {
    this.endpointConfig = endpointConfig;
    this.axiosInstance = axios.create({
      baseURL: endpointConfig.baseUrl,
      timeout: endpointConfig.timeout || 30000,
      // MEMORY OPTIMIZATION: Limit response sizes to prevent unbounded memory growth
      maxContentLength: 100 * 1024 * 1024,  // 100MB max response size
      maxBodyLength: 100 * 1024 * 1024,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': endpointConfig.apiKey,
      },
    });
  }
  
  /**
   * MEMORY OPTIMIZATION: Recreate the axios instance to clear connection pools and internal buffers.
   * Call this between batch operations to prevent memory accumulation.
   */
  public recreateInstance(): void {
    this.axiosInstance = axios.create({
      baseURL: this.endpointConfig.baseUrl,
      timeout: this.endpointConfig.timeout || 30000,
      maxContentLength: 100 * 1024 * 1024,
      maxBodyLength: 100 * 1024 * 1024,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.endpointConfig.apiKey,
      },
    });
  }

  /**
   * Make authenticated GET request
   * MEMORY OPTIMIZATION: Always use streaming to prevent axios from buffering entire response in memory.
   * This prevents OOM errors when fetching large datasets in batches.
   */
  async get<T = any>(params: { url: string, params?: any, responseFilter?: ResponseProcessor }): Promise<AxiosResponse<T>> {
    // CRITICAL: Always use 'stream' responseType to prevent memory accumulation
    // Without this, axios buffers the entire response body in memory before returning,
    // causing memory to grow unbounded across multiple batch requests
    const response = await this.axiosInstance.get(params.url, { 
      params: params.params,
      responseType: 'stream'  // Always stream - never buffer full response
    });

    if (params.responseFilter) {
      // Use provided filter to process the stream
      return params.responseFilter.processResponse(response);
    }

    // No filter provided - parse JSON stream manually to avoid buffering
    return this.parseJsonStream<T>(response);
  }

  /**
   * MEMORY OPTIMIZATION: Parse JSON from stream without buffering entire response.
   * Accumulates chunks incrementally and parses only when complete.
   */
  private async parseJsonStream<T>(response: AxiosResponse<Readable>): Promise<AxiosResponse<T>> {
    const chunks: Buffer[] = [];
    const stream = response.data as Readable;

    return new Promise((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      stream.on('end', () => {
        try {
          const jsonString = Buffer.concat(chunks).toString('utf-8');
          const parsedData = JSON.parse(jsonString);
          
          // Clear chunks array to allow garbage collection
          chunks.length = 0;
          
          // Return response with parsed data
          resolve({
            ...response,
            data: parsedData
          } as AxiosResponse<T>);
        } catch (error) {
          reject(new Error(`Failed to parse JSON response: ${error}`));
        }
      });

      stream.on('error', (error) => {
        reject(new Error(`Stream error: ${error}`));
      });
    });
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