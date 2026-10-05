import { Timer, TestEnvironment } from 'integration-core';
import { ConfigManager } from "../config/ConfigManager";
import { AxiosResponseStreamFilter, ResponseProcessor } from "../stream/AxiosResponseStreamFilter";
import { BuCdmPeopleDataSource } from "./PeopleCdmDataSource";
import { getLocalConfig } from '../Utils';

export type BuCdmPeopleDataSourceBatchConfig = {
  dataSource: BuCdmPeopleDataSource, 
  batchSize?: number
  offset?: number; // Optional starting offset for pagination (default is 0)
    // Optional limit on total number of calls that can be made to the source API for 
    // records to process (useful for testing or partial processing)
  iterationLimit?: number; 
  // Optional guard checked before each fetch; return true if offset is already past a
  // boundary established elsewhere (e.g. by another parallel task), so this iteration should
  // be discarded rather than fetched/processed.
  isOffsetPastKnownEnd?: (offset: number) => Promise<boolean>;
  // Optional (default false). If true, the first batch smaller than batchSize (a "partial") is
  // treated as the end of the records. If false, only an empty batch marks the end, since the
  // source API is known to occasionally return a partial batch mid-population.
  stopAtFirstPartial?: boolean;
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
  private _lastOffsetUsed?: number;

  constructor(private config: BuCdmPeopleDataSourceBatchConfig) {
    if (config.iterationLimit !== undefined && config.iterationLimit === -1) {
      this._batchable = false;
      console.log('Batching disabled via iterationLimit=-1; recordCount/offset query params will not be sent and only one request will be made.');
      config.iterationLimit = 0;
    }
  }

  protected abstract process: (response: any[]) => Promise<void>

  public processBatch = async (): Promise<void> => {
    let { dataSource, batchSize = 100, offset = 0, iterationLimit = 0, isOffsetPastKnownEnd, stopAtFirstPartial = false } = this.config;
    let iterations: number = 0;

    this.setQueryParam(dataSource, 'recordCount', batchSize);

    do {
      if (isOffsetPastKnownEnd && await isOffsetPastKnownEnd(offset)) {
        this._hasMoreRecords = false;
        this._lastOffsetUsed = offset;
        console.error(`Offset ${offset} is already past a boundary established elsewhere for this run; discarding as an API glitch and stopping.`);
        break;
      }

      this.setQueryParam(dataSource, 'offset', offset);
      this._lastOffsetUsed = offset;
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
      if (responseLength === 0) {
        this._hasMoreRecords = false;
        console.log(`Batch ${offset} returned no records. Assuming no more records to process.`);
        break;
      }

      if (responseLength < batchSize) {
        if (stopAtFirstPartial) {
          this._hasMoreRecords = false;
          console.log(`Batch ${offset} returned ${responseLength} records, which is less than the batch size of ${batchSize}. Assuming no more records to process.`);
          break;
        }
        console.warn(`Batch ${offset} returned ${responseLength} records, which is less than the batch size of ${batchSize}. Continuing anyway (stopAtFirstPartial=false) - only an empty batch marks the end of the records.`);
      }

      // If a call limit is set and we've processed enough records, stop processing
      if (iterationLimit > 0 && iterations >= iterationLimit) {
        console.log(`Processed ${iterations} iterations, which meets or exceeds the call limit of ${iterationLimit}. Stopping processing.`);
        break;
      }
    } while (true);
  }

  /**
   * Set a batch-specific query parameter on the data source. NOTE: This will be cancelled
   * if the data source is not batchable (e.g. if iterationLimit = -1 was set in the constructor), 
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

  /**
   * True if the loop stopped because the end of the records was detected: an empty batch, a
   * partial batch (only if stopAtFirstPartial), a discarded offset (isOffsetPastKnownEnd), or the
   * single request of non-batchable mode. False if it stopped only because iterationLimit was met.
   */
  public reachedTheEndOfRecords(): boolean {
    return !this._hasMoreRecords;
  }

  /**
   * The offset of the last (or only) page requested from the API, regardless of outcome - or, if
   * isOffsetPastKnownEnd discarded an offset before it was ever requested, that discarded offset.
   */
  public getLastOffsetUsed(): number | undefined {
    return this._lastOffsetUsed;
  }
}

export { BuCdmPeopleDataSourceBatch };

if(require.main === module) {
const testEnvironment = TestEnvironment('PEOPLE_DATASOURCE_BATCH');

  [
    'HURON_PERSON_CONFIG_PATH',
    'SECRET_ARN',
    'STOP_AT_FIRST_PARTIAL'
  ].forEach(testEnvironment.getVarOrEmptyString);
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
    }({ dataSource, batchSize: 100, offset: 7, iterationLimit: 10, stopAtFirstPartial: process.env.STOP_AT_FIRST_PARTIAL === 'true' });

    const timer = new Timer();
    timer.start();   
    
    // Process batches until there are no more records
    await batchProcessor.processBatch();

    timer.stop();
    timer.logElapsed(`Fetched and processed ${batchProcessor.recordsProcessed()} people data in`);    
  })();

}