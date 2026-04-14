import { Timer } from "integration-core";
import { ConfigManager } from "../config/ConfigManager";
import { AxiosResponseStreamFilter, ResponseProcessor } from "../stream/AxiosResponseStreamFilter";
import { BuCdmPeopleDataSource } from "./PeopleCdmDataSource";
import { getLocalConfig } from "../Utils";

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
  private response: any[] = [];
  private _recordsProcessed = 0;

  constructor(private dataSource: BuCdmPeopleDataSource, private batchSize: number = 100) {
    dataSource.setQueryParam('recordCount', batchSize);
  }

  private hasMoreRecords = (): boolean => {
    return this.response.length === this.batchSize;
  }

  protected abstract process: (response: any[]) => Promise<void>

  public processBatch = async (): Promise<void> => {
    const { dataSource, hasMoreRecords } = this;

    let offset = 0;
    do {
      dataSource.setQueryParam('offset', offset);
      this.response = await dataSource.fetchRaw();
      await this.process(this.response);
      this._recordsProcessed += this.response.length;
      // offset += this.response.length;
      offset++;
    } while (hasMoreRecords());
  }

  public recordsProcessed(): number {
    return this._recordsProcessed;
  }
}

export { BuCdmPeopleDataSourceBatch };

if(require.main === module) {

  (async () => {
    // Load configuration
    const configManager = ConfigManager.getInstance();
    const localConfigPath = process.env.HURON_PERSON_CONFIG_PATH || getLocalConfig();
    const config = configManager
      .reset()
      .fromSecretManager(process.env.SECRET_ARN) // Load from Secrets Manager first if SECRET_ARN is provided
      .fromEnvironment()
      .fromFileSystem(localConfigPath)
      .getConfig('people');

    // Create data source instance
    let responseFilter: ResponseProcessor | undefined;

    // Destructure for easier access
    const people = config.dataSource.people;
    const fieldsOfInterest = people?.fieldsOfInterest;

    if (fieldsOfInterest) {
      responseFilter = new AxiosResponseStreamFilter({ fieldsOfInterest });
    }
    const dataSource = new BuCdmPeopleDataSource({ config, responseFilter });

    const batchProcessor = new class extends BuCdmPeopleDataSourceBatch {
      protected process = async (response: any[]): Promise<void> => {
        console.log(`Procesing batch of ${response.length} records [{ personid: ${response[0]?.personid} }...]`);
        // Your implementation here
      };
    }(dataSource, 100);

    const timer = new Timer();
    timer.start();   
    
    // Process batches until there are no more records
    await batchProcessor.processBatch();

    timer.stop();
    timer.logElapsed(`Fetched and processed ${batchProcessor.recordsProcessed()} people data in`);    
  })();

}