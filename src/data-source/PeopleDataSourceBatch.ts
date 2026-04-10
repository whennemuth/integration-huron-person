import { Timer } from "integration-core";
import { ConfigManager } from "../config/ConfigManager";
import { AxiosResponseStreamFilter, ResponseProcessor } from "../stream/AxiosResponseStreamFilter";
import { BuCdmPeopleDataSource } from "./PeopleCdmDataSource";

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
    const workspaceFolder = process.argv[2];
    const configPath = require('path').resolve(workspaceFolder, 'config.json');
        
    // Load configuration
    const configManager = ConfigManager.getInstance();
    const config = configManager
      .reset()
      .fromSecretManager(process.env.SECRET_ARN) // Load from Secrets Manager first if SECRET_ARN is provided
      .fromEnvironment()
      .fromFileSystem(configPath)
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