import * as fs from 'fs';
import { DataSource } from 'integration-core';
import { Config } from '../config/Config';
import { ConfigManager } from '../config/ConfigManager';
import { AxiosResponseStreamFilter, ResponseProcessor } from '../stream/AxiosResponseStreamFilter';
import { EndpointConfigForApiKey } from './ApiClientForApiKey';
import { BuCdmDataSource } from './DataSource';

/**
 * DataSource implementation for fetching single person data from Boston University CRM API
 */
class BuCdmPersonDataSource extends BuCdmDataSource implements DataSource {
  public readonly name = 'Boston University CRM Person Data Source';
  public readonly description = 'Fetches single person data from Boston University CRM API endpoint';

  constructor(params: { config: Config, responseFilter?: ResponseProcessor, buid?: string }) {
    super(params);
  }

  protected getEndpointConfig(): EndpointConfigForApiKey {
    const { person } = this.config.dataSource;
    if (!person) {
      throw new Error('Person data source configuration is required for person execution mode');
    }
    return {
      ...person.endpointConfig,
      timeout: person.endpointConfig.timeout || this.config.integration.timeout
    };
  }

  protected getFetchPath(): string {
    const { person } = this.config.dataSource;
    if (!person) {
      throw new Error('Person data source configuration is required for person execution mode');
    }
    return person.fetchPath;
  }
}


/**
 * Main entry point
 */
async function main() {
  try {
    // Load configuration
    const configManager = ConfigManager.getInstance();

    const config = configManager.reset().fromEnvironment().fromFileSystem().getConfig('person');

    // Output the loaded config to console.
    console.log('Loaded Configuration:', JSON.stringify(config, null, 2));

    // Create data source instance
    let responseFilter: ResponseProcessor | undefined;

    // Destructure for easier access
    const person = config.dataSource.person;
    const fieldsOfInterest = person?.fieldsOfInterest;

    if (fieldsOfInterest) {
      responseFilter = new AxiosResponseStreamFilter({ fieldsOfInterest });
    }
    const dataSource = new BuCdmPersonDataSource({ config, responseFilter, buid: 'U21967744' });

    // Fetch raw person data
    const rawData = await dataSource.fetchRaw();

    // Output the fetched data to console.
    console.log('Fetched Person Data:', JSON.stringify(rawData, null, 2));

    // Output the first element of the rawData array to a file as formatted JSON.
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

