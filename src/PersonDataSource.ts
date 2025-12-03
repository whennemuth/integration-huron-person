import { DataSource, Input } from 'integration-core';
import { ApiClientForApiKey, EndpointConfigForApiKey } from './ApiClientForApiKey';
import { Config } from './Config';
import { ConfigManager } from './ConfigManager';
import { Timer } from './Timer';
import { DataMapper } from './DataMapper';

/**
 * DataSource implementation for fetching person data from Boston University CRM API
 */
class BuCdmPersonDataSource implements DataSource {
  public readonly name = 'Boston University CRM Data Source';
  public readonly description = 'Fetches person data from Boston University CRM API endpoint';

  private apiClient: ApiClientForApiKey;
  private config: Config;
  private dataMapper: DataMapper;
  private params: { config: Config, dataMapper: DataMapper, buid?: string };

  constructor(params: { config: Config, dataMapper: DataMapper, buid?: string }) {
    this.params = params;
    this.config = params.config;
    this.dataMapper = params.dataMapper;
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
      const response = await this.apiClient.get<{ response: any[] }>(
        this.config.dataSource.fetchPersonsEndpoint + (this.params.buid ? `?buid=${this.params.buid}` : '')
      );
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
    const config = configManager.loadConfig();

    // Output the loaded config to console.
    console.log('Loaded Configuration:', JSON.stringify(config, null, 2));

    // Create data source instance
    const dataMapper = new DataMapper();
    const dataSource = new BuCdmPersonDataSource({ config, dataMapper, buid: 'U21967744' });

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
