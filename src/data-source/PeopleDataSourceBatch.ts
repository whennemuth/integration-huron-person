import { Timer } from "integration-core";
import { ConfigManager } from "../config/ConfigManager";
import { AxiosResponseStreamFilter, ResponseProcessor } from "../stream/AxiosResponseStreamFilter";
import { BuCdmPeopleDataSource } from "./PeopleCdmDataSource";
import { getLocalConfig } from "../Utils";

export type BuCdmPeopleDataSourceBatchConfig = {
  dataSource: BuCdmPeopleDataSource, 
  batchSize?: number
  offset?: number; // Optional starting offset for pagination (default is 0)
  limit?: number; // Optional limit on total records to process (useful for testing or partial processing)
};

/**
 * Abstract batch processor for BuCdmPeopleDataSource. Handles pagination logic and batch 
 * processing flow, allowing subclasses to "inject" custom processing logic to be applied to each
 * batch of people fetched from the CDM API by implementing the abstract `process` method. This 
 * is useful for scenarios where the total number of records is large and we want to process them 
 * in manageable chunks, or when we want to apply specific transformations or side effects to 
 * each batch of people data as it is fetched from the CDM API. The class keeps track of the 
 * total number of records processed across all batches and provides a method to retrieve that 
 * count. The batch size can be configured via the constructor, allowing for flexibility based on 
 * memory constraints or processing requirements. 
 * 
 * Note: This class is designed to work with API-based chunking and is not compatible with 
 * S3-based data sources, as it relies on query parameters for pagination and batch processing.
 * 
 * Usage:
 * 1. Extend this abstract class and implement the `process` method with your custom logic for 
 *    handling each batch of people data.
 * 2. Instantiate your subclass with a configured instance of `BuCdmPeopleDataSource` and call 
 *    the `processBatch` method to start processing.
 * 3. Use the `recordsProcessed` method to get the total count of records processed after 
 *    completion.
 */
abstract class BuCdmPeopleDataSourceBatch {
  // MEMORY OPTIMIZATION (Secondary): Keep response array small and clear it after each iteration
  // Primary fix: ApiClientForApiKey now uses streaming to prevent buffering responses in memory
  private response: any[] = [];
  private _recordsProcessed = 0;
  private _hasMoreRecords: boolean = true;
  private _batchable: boolean = true;

  constructor(private config: BuCdmPeopleDataSourceBatchConfig) {
    if (config.limit !== undefined && config.limit === -1) {
      this._batchable = false;
      console.log('Batching disabled via limit=-1; recordCount/offset query params will not be sent and only one request will be made.');
      config.limit = 0;
    }
  }

  protected abstract process: (response: any[]) => Promise<void>

  public processBatch = async (): Promise<void> => {
    let { dataSource, batchSize = 100, offset = 0, limit = 0 } = this.config;
    let iterations: number = 0;

    this.setQueryParam(dataSource, 'recordCount', batchSize);

    do {
      this.setQueryParam(dataSource, 'offset', offset);
      this.response = await dataSource.fetchRaw();
      await this.process(this.response);
      this._recordsProcessed += this.response.length;
      
      // MEMORY OPTIMIZATION (Secondary): Clear response reference after processing
      // Primary fix: ApiClientForApiKey now uses streaming to prevent buffering
      const responseLength = this.response.length;
      this.response = [];
      
      // MEMORY OPTIMIZATION (Defensive): Recreate axios instance every 10 batches
      // This clears connection pools and helps prevent any residual memory buildup
      if (offset > 0 && offset % 10 === 0) {
        (dataSource as any).apiClient.recreateInstance();
        console.log(`Recreated axios instance at batch ${offset} to prevent memory buildup`);
      }
      
      offset++;
      iterations++;

      // Non-batchable mode is a deliberate single-request flow (for strict single-record endpoints).
      if (!this._batchable) {
        this._hasMoreRecords = false;
        console.log('Non-batchable mode completed one request; stopping batch loop.');
        break;
      }
      
      // Use cached responseLength instead of this.response.length for hasMoreRecords check
      if (responseLength < batchSize) {
        this._hasMoreRecords = false;
        console.log(`Batch ${offset} returned ${responseLength} records, which is less than the batch size of ${batchSize}. Assuming no more records to process.`);
        break;
      }

      // If a limit is set and we've processed enough records, stop processing
      if (limit > 0 && iterations >= limit) {
        console.log(`Processed ${iterations} iterations, which meets or exceeds the limit of ${limit}. Stopping processing.`);
        break;
      }
    } while (true);
  }

  /**
   * Set a batch-specific query parameter on the data source. NOTE: This will be cancelled
   * if the data source is not batchable (e.g. if limit = -1 was set in the constructor), 
   * since in that case we want to fetch all records in one batch and not apply any 
   * batch-specific parameters (probably a test run against the API that returns only one person).
   * @param dataSource 
   * @param key 
   * @param value 
   * @returns 
   */
  private setQueryParam = (dataSource: BuCdmPeopleDataSource, key: string, value: any): void => {
    if(!this._batchable) {
      return;
    }
    dataSource.setQueryParam(key, value);
  }

  public recordsProcessed(): number {
    return this._recordsProcessed;
  }

  public hasMoreRecords(): boolean {
    return this._hasMoreRecords;
  }

  public reachedTheEndOfRecords(): boolean {
    return !this._hasMoreRecords;
  }
}

export { BuCdmPeopleDataSourceBatch };

if(require.main === module) {

  (async () => {
    // Load configuration
    const configManager = ConfigManager.getInstance();
    const localConfigPath = process.env.HURON_PERSON_CONFIG_PATH || getLocalConfig();
    const config = await configManager
      .reset()
      .fromSecretManager(process.env.SECRET_ARN) // Load from Secrets Manager first if SECRET_ARN is provided
      .fromEnvironment()
      .fromFileSystem(localConfigPath)
      .getConfigAsync('people');

    // Create data source instance
    let responseFilter: ResponseProcessor | undefined;

    // Destructure for easier access
    const people = config.dataSource.people;
    const fieldsOfInterest = people?.fieldsOfInterest;

    if (fieldsOfInterest) {
      // MEMORY OPTIMIZATION: Set maxBatchSize to prevent unbounded accumulation in stream filter
      responseFilter = new AxiosResponseStreamFilter({ 
        fieldsOfInterest,
        maxBatchSize: 500 // Limit to 500 objects per batch
      });
    }
    const dataSource = new BuCdmPeopleDataSource({ config, responseFilter });

    const batchProcessor = new class extends BuCdmPeopleDataSourceBatch {
      protected process = async (response: any[]): Promise<void> => {
        console.log(`Procesing batch of ${response.length} records [{ personid: ${response[0]?.personid} }...]`);
        // Your implementation here
      };
    }({ dataSource, batchSize: 100, offset: 7, limit: 10 });

    const timer = new Timer();
    timer.start();   
    
    // Process batches until there are no more records
    await batchProcessor.processBatch();

    timer.stop();
    timer.logElapsed(`Fetched and processed ${batchProcessor.recordsProcessed()} people data in`);    
  })();

}