import { AxiosResponse } from 'axios';
import { ResponseProcessor } from './stream/AxiosResponseStreamFilter';

/**
 * Interface for API client to enable testing with mocks
 */
export interface IApiClient {
  get<T = any>(params: { url: string, params?: any, responseFilter?: ResponseProcessor }): Promise<AxiosResponse<T>>;
  post<T = any>(url: string, data?: any): Promise<AxiosResponse<T>>;
  put<T = any>(url: string, data?: any): Promise<AxiosResponse<T>>;
  delete<T = any>(url: string): Promise<AxiosResponse<T>>;
}