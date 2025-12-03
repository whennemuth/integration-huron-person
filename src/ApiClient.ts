import { AxiosResponse } from 'axios';

/**
 * Interface for API client to enable testing with mocks
 */
export interface IApiClient {
  get<T = any>(url: string, params?: any): Promise<AxiosResponse<T>>;
  post<T = any>(url: string, data?: any): Promise<AxiosResponse<T>>;
  put<T = any>(url: string, data?: any): Promise<AxiosResponse<T>>;
  delete<T = any>(url: string): Promise<AxiosResponse<T>>;
}