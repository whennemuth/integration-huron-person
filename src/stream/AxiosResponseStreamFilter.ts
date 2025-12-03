import { AxiosResponse } from 'axios';
import { Transform } from 'stream';
import { JsonParser } from './JsonParser';
import { JsonFieldFilter } from './JsonFieldFilter';

/**
 * Interface for processing axios responses to filter streaming data in-flight.
 * Implementations should handle response filtering to reduce memory usage during data streaming.
 */
export interface ResponseProcessor {
  /**
   * Process an axios response, potentially filtering or transforming the data stream.
   * @param response The raw axios response to process
   * @returns The processed response with filtered/transformed data
   */
  processResponse<T>(response: AxiosResponse<T>): Promise<AxiosResponse<T>>;
}

/**
 * Configuration for AxiosResponseStreamFilterConfig
 */
export interface AxiosResponseStreamFilterConfig {
  fieldsToKeep: string[];
  customFilterCase?: (source: any, target?: any) => void
}

/**
 * Response stream filter specifically designed for large api operations.
 * This class processes axios responses to filter streaming JSON responses in-flight,
 * reducing memory usage when processing large datasets (e.g., 100K records × 10KB each).
 *
 * The filter can remove unwanted fields from the response stream as data is downloaded,
 * preventing the full unfiltered dataset from being loaded into memory.
 *
 * @example
 * ```typescript
 * const filter = new AxiosResponseStreamFilter({
 *   fieldsToKeep: ['id', 'name', 'email']
 * });
 *
 * // Use with API client
 * const response = await apiClient.get({
 *   url: '/persons',
 *   responseFilter: filter
 * });
 * const processedResponse = filter.processResponse(response);
 * ```
 */
export class AxiosResponseStreamFilter implements ResponseProcessor {

  constructor(private config: AxiosResponseStreamFilterConfig) {}

  /**
   * Process an axios response by applying filtering logic.
   * Applies streaming JSON field filtering to reduce memory usage.
   *
   * @param response The raw axios response to process (expected to have responseType: 'stream')
   * @returns The processed response with filtered data
   */
  async processResponse<T>(response: AxiosResponse<T>): Promise<AxiosResponse<T>> {
    return new Promise((resolve, reject) => {
      const filteredObjects: any[] = [];
      const { fieldsToKeep, customFilterCase } = this.config;
      
      (response.data as any)
        .pipe(new JsonParser({ extractPath: 'response[*]' }))  // Extract objects from response array
        .pipe(new JsonFieldFilter(fieldsToKeep, customFilterCase))   // Filter fields from each object
        .on('data', (filteredObject: any) => {
          filteredObjects.push(filteredObject);  // Collect filtered items
        })
        .on('end', () => {
          // Replace response data with filtered results
          (response as any).data = { response: filteredObjects };
          resolve(response);
        })
        .on('error', reject);
    });
  }
}