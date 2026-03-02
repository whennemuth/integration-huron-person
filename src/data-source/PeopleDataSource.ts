import * as fs from 'fs';
import { DataSource, Timer } from 'integration-core';
import { Config } from '../config/Config';
import { ConfigManager } from '../config/ConfigManager';
import { AxiosResponseStreamFilter, ResponseProcessor } from '../stream/AxiosResponseStreamFilter';
import { EndpointConfigForApiKey } from './ApiClientForApiKey';
import { BuCdmDataSource } from './DataSource';

/**
 * DataSource implementation for fetching bulk people data from Boston University CDM API
 */
class BuCdmPeopleDataSource extends BuCdmDataSource implements DataSource {
  public readonly name = 'Boston University CDM People Data Source';
  public readonly description = 'Fetches bulk people data from Boston University CDM API endpoint';

  constructor(params: { config: Config, responseFilter?: ResponseProcessor }) {
    super(params);
  }

  protected getEndpointConfig(): EndpointConfigForApiKey {
    const { people } = this.config.dataSource;
    if (!people) {
      throw new Error('People data source configuration is required for people execution mode');
    }
    return {
      ...people.endpointConfig,
      timeout: people.endpointConfig.timeout || this.config.integration.timeout
    };
  }

  protected getFetchPath(): string {
    const { people } = this.config.dataSource;
    if (!people) {
      throw new Error('People data source configuration is required for people execution mode');
    }
    return people.fetchPath;
  }
}


/**
 * Main entry point
 */
async function main() {
  try {
    // Load configuration
    const configManager = ConfigManager.getInstance();

    const config = configManager.reset().fromEnvironment().fromFileSystem().getConfig('people');

    // Output the loaded config to console.
    console.log('Loaded Configuration:', JSON.stringify(config, null, 2));

    // Create data source instance
    let responseFilter: ResponseProcessor | undefined;

    // Destructure for easier access
    const people = config.dataSource.people;
    const fieldsOfInterest = people?.fieldsOfInterest;

    if (fieldsOfInterest) {
      responseFilter = new AxiosResponseStreamFilter({ fieldsOfInterest });
    }
    const dataSource = new BuCdmPeopleDataSource({ config, responseFilter });

    // Fetch data
    const timer = new Timer();
    timer.start();   
    const rawData = await dataSource.fetchRaw();
    timer.stop();
    timer.logElapsed(`Fetched people data in`);

    // Output the fetched data to console
    console.log('Fetched People Data:', JSON.stringify(rawData, null, 2));

    // Output all elements of the rawData array to a file as formatted JSON.
    fs.writeFileSync('fetched_people_data.json', JSON.stringify(rawData, null, 2));

    process.exit(0);
  } catch (error) {
    console.error('Error fetching people data:', error);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main();
}

export { BuCdmPeopleDataSource };
