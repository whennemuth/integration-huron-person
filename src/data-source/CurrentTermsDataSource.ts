import { DataSource, Timer, TestEnvironment } from 'integration-core';
import { Config } from '../config/Config';
import { ConfigManager } from '../config/ConfigManager';
import { ResponseProcessor } from '../stream/AxiosResponseStreamFilter';
import { EndpointConfigForApiKey } from './ApiClientForApiKey';
import { BuCdmDataSource } from './DataSource';

/**
 * Represents a single term from the BU CDM API
 */
interface Term {
  term: string;
  termDescription: string;
  academicCareer: string;
  termBeginDate: string;
  termEndDate: string;
  currentInd: string;
}

/**
 * Response structure for current terms retrieval
 * The API may return terms directly as an array or wrapped in various object properties
 */
interface CurrentTermsResponse {
  data?: Term[];
  items?: Term[];
  terms?: Term[];
  response?: Term[];
  [key: string]: any;
}

/**
 * DataSource implementation for fetching current terms data from Boston University CDM API
 */
class BuCdmCurrentTermsDataSource extends BuCdmDataSource implements DataSource {
  public readonly name = 'Boston University CDM Current Terms Data Source';
  public readonly description = 'Fetches current terms data from Boston University CDM API endpoint';

  constructor(params: { config: Config, responseFilter?: ResponseProcessor }) {
    super(params);
  }

  protected getEndpointConfig(): EndpointConfigForApiKey {
    const { terms } = this.config.dataSource;
    if (!terms) {
      throw new Error('Terms data source configuration is required for terms execution mode');
    }
    return {
      ...terms.endpointConfig,
      timeout: terms.endpointConfig.timeout || this.config.integration.timeout
    };
  }

  protected getFetchPath(): string {
    const { terms } = this.config.dataSource;
    if (!terms) {
      throw new Error('Terms data source configuration is required for terms execution mode');
    }
    return terms.fetchPath;
  }

  /**
   * Override fetchRaw to handle flexible response structures from the terms API
   * The terms endpoint may return data in various formats
   */
  async fetchRaw(): Promise<Term[]> {
    try {
      const timer = new Timer();
      console.log(`Fetching data from ${this.name}...`);

      timer.start();
      const response = await this.apiClient.get<CurrentTermsResponse>({
        url: this.getFetchPath(),
        responseFilter: this.responseFilter
      });
      timer.stop();

      if (response.status !== 200) {
        throw new Error(`Failed to fetch current terms: HTTP ${response.status} ${response.statusText}`);
      }

      // Handle various possible response structures
      const data = response.data;
      let rawData: Term[];

      if (Array.isArray(data)) {
        rawData = data;
      } else if (data.response && Array.isArray(data.response)) {
        rawData = data.response;
      } else if (data.data && Array.isArray(data.data)) {
        rawData = data.data;
      } else if (data.items && Array.isArray(data.items)) {
        rawData = data.items;
      } else if (data.terms && Array.isArray(data.terms)) {
        rawData = data.terms;
      } else {
        // Wrap single object in array
        rawData = [data as Term];
      }

      timer.logElapsed(`Successfully fetched ${rawData.length} term record(s)`);
      return rawData;
    } catch (error) {
      console.error(`Failed to fetch data from ${this.name}:`, error);
      throw new Error(`Failed to fetch data from ${this.name}: ${error}`);
    }
  }
}

/**
 * Main entry point
 */
async function main() {
  try {
    // Load configuration
    const configManager = ConfigManager.getInstance(true);
    const config = configManager
      .reset()
      .fromEnvironment()
      .fromFileSystem()
      .getConfig('terms');

    // Output the loaded config to console
    console.log('Loaded Configuration:', JSON.stringify(config, null, 2));

    // Create data source instance
    const dataSource = new BuCdmCurrentTermsDataSource({ config });

    // Fetch raw terms data
    const rawData = await dataSource.fetchRaw();

    // Output the fetched data to console
    console.log('Fetched Current Terms Data:', JSON.stringify(rawData, null, 2));

    process.exit(0);
  } catch (error) {
    console.error('DataSource failed:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  const testEnvironment = TestEnvironment('CURRENT_TERMS_DATASOURCE');
  main();
}

export { Term, CurrentTermsResponse, BuCdmCurrentTermsDataSource };
