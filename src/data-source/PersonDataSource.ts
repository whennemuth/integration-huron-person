import { DataSource, Input } from 'integration-core';
import { ApiClientForApiKey, EndpointConfigForApiKey } from './ApiClientForApiKey';
import { Config } from '../config/Config';
import { ConfigManager } from '../config/ConfigManager';
import { Timer } from '../utils/Timer';
import { DataMapper } from '../DataMapper';
import { ResponseProcessor, AxiosResponseStreamFilter } from '../stream/AxiosResponseStreamFilter';
import axios from 'axios';

/**
 * DataSource implementation for fetching person data from Boston University CRM API
 */
class BuCdmPersonDataSource implements DataSource {
  public readonly name = 'Boston University CRM Data Source';
  public readonly description = 'Fetches person data from Boston University CRM API endpoint';

  private apiClient: ApiClientForApiKey;
  private config: Config;
  private dataMapper: DataMapper;
  private responseFilter: ResponseProcessor | undefined;
  private params: { config: Config, dataMapper: DataMapper, responseFilter?: ResponseProcessor, buid?: string };

  constructor(params: { config: Config, dataMapper: DataMapper, responseFilter?: ResponseProcessor, buid?: string }) {
    this.params = params;
    this.config = params.config;
    this.dataMapper = params.dataMapper;
    this.responseFilter = params.responseFilter;
    const endpointConfig: EndpointConfigForApiKey = {
      ...this.config.dataSource.endpointConfig,
      timeout: this.config.dataSource.endpointConfig.timeout || this.config.integration.timeout
    };
    this.apiClient = new ApiClientForApiKey(endpointConfig);
  }

  /**
   * Fetch raw person data from Boston University CRM API
   */
  async fetchRaw(): Promise<any[]> {
    try {
      const timer = new Timer();
      console.log('Fetching person data from Boston University CRM API...');
      
      timer.start();
      const response = await this.apiClient.get<{ response: any[] }>({
        url: this.config.dataSource.fetchPersonsPath + (this.params.buid ? `?buid=${this.params.buid}` : ''),
        responseFilter: this.responseFilter
      });
      timer.stop();

      const rawData = response.data.response;
      timer.logElapsed(`Successfully fetched ${rawData.length} person records`);
      
      return rawData;
    } catch (error) {
      console.error('Failed to fetch person data:', error);
      throw new Error(`Failed to fetch person data from Boston University CRM API: ${error}`);
    }
  }

  /**
   * Convert raw person data to integration-core Input format
   */
  convertRawToInput(rawData: any[]): Input {
    console.log('Converting raw person data to integration format...');
    return this.dataMapper.getMappedData(rawData);
  }
}


/**
 * Main entry point
 */
async function main() {
  try {
    // Load configuration
    const configManager = ConfigManager.getInstance();
    const config = configManager.reset().fromFileSystem().fromEnvironment().getConfig();

    // Output the loaded config to console.
    console.log('Loaded Configuration:', JSON.stringify(config, null, 2));

    // Create data source instance
    const dataMapper = new DataMapper();
    let responseFilter: ResponseProcessor | undefined;

    // Destructure for easier access
    const { dataSource: { fieldsToKeep } } = config;

    if (fieldsToKeep) {
      responseFilter = new AxiosResponseStreamFilter({ fieldsToKeep });
    }
    const dataSource = new BuCdmPersonDataSource({ config, dataMapper, responseFilter, buid: 'U21967744' });

    // Fetch raw person data
    const rawData = await dataSource.fetchRaw();

    // Output the fetched data to console.
    console.log('Fetched Person Data:', JSON.stringify(rawData, null, 2));

    // Output the first element of the rawData array to a file as formatted JSON.
    const fs = require('fs');
    fs.writeFileSync('fetchedPersonData.json', JSON.stringify(rawData[0], null, 2));

    process.exit(0);
  } catch (error) {
    console.error('DataSource failed:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main();
}

export { BuCdmPersonDataSource };
