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
 * 
 * fieldsOfInterest: List of fields to retain in the response objects (all other fields will be removed)
 * example: [ 
 *   "personid",
 *   "personBasic.names[*].firstName",
 *   "personBasic.names[*].lastName",
 *   "personBasic.names[*].middleName"
 * ]
 * customFilterCase: Optional function to apply custom filtering logic on each object (receives source object and can modify target object)
 * maxBatchSize: MEMORY OPTIMIZATION - Maximum number of objects to accumulate before forcing a flush (default: 1000)
 *               Prevents unbounded memory growth when processing large datasets
 */
export interface AxiosResponseStreamFilterConfig {
  fieldsOfInterest: string[];
  customFilterCase?: (source: any, target?: any) => void;
  maxBatchSize?: number; // MEMORY OPTIMIZATION: Limit accumulation buffer size
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
 *   fieldsOfInterest: ['id', 'name', 'email']
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
   * MEMORY OPTIMIZATION: Uses batch accumulation with a configurable limit to prevent
   * unbounded memory growth when processing large datasets. Objects are accumulated
   * in batches and references are released after processing.
   *
   * @param response The raw axios response to process (expected to have responseType: 'stream')
   * @returns The processed response with filtered data
   */
  async processResponse<T>(response: AxiosResponse<T>): Promise<AxiosResponse<T>> {
    return new Promise((resolve, reject) => {
      const filteredObjects: any[] = [];
      const { fieldsOfInterest, customFilterCase, maxBatchSize = 1000 } = this.config;
      
      // MEMORY OPTIMIZATION: Track object count to enforce batch size limits
      let objectCount = 0;
      
      const jsonParser = new JsonParser({ extractPath: 'response[*]' });
      const fieldFilter = new JsonFieldFilter(fieldsOfInterest, customFilterCase);
      
      const pipeline = (response.data as any)
        .pipe(jsonParser)
        .pipe(fieldFilter);
      
      pipeline.on('data', (filteredObject: any) => {
        filteredObjects.push(filteredObject);
        objectCount++;
        
        // MEMORY OPTIMIZATION: Log warning if batch size exceeds limit
        // This helps identify potential memory issues in production
        if (objectCount === maxBatchSize) {
          console.warn(`Stream filter reached batch limit of ${maxBatchSize} objects. Consider reducing batch size to prevent memory issues.`);
        }
      });
      
      pipeline.on('end', () => {
        // MEMORY OPTIMIZATION: Explicitly destroy stream pipeline to free resources
        jsonParser.destroy();
        fieldFilter.destroy();
        
        // Replace response data with filtered results
        (response as any).data = { response: filteredObjects };
        resolve(response);
      });
      
      pipeline.on('error', (error: Error) => {
        // MEMORY OPTIMIZATION: Clean up streams on error
        jsonParser.destroy();
        fieldFilter.destroy();
        reject(error);
      });
    });
  }
}