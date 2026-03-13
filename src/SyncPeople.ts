import { EndToEnd } from 'integration-core';
import { Cache } from './Cache';
import { Config } from './config/Config';
import { ConfigManager } from './config/ConfigManager';
import { BuCdmPeopleDataSource } from './data-source/PeopleDataSource';
import { HuronPersonDataTarget } from './data-target/PersonDataTarget';
import { DeltaStrategyFactory } from './DeltaStrategyFactory';
import { AxiosResponseStreamFilter, ResponseProcessor } from './stream/AxiosResponseStreamFilter';
import { getDataMapper } from './data-mapper/DataMapper';
import { FieldFilter, FieldFilterParams } from './data-mapper/FieldFilter';
export { AxiosResponseStreamFilter as PersonDataSourceResponseStreamFilter } from './stream/AxiosResponseStreamFilter';

/**
 * Main integration runner for Huron Person data. All data is pulled from Boston University CDM
 * system via the CDM API, transformed/mapped, and pushed to the Huron target API.
 */
class HuronPersonIntegration {
  private config: Config;
  private endToEnd: EndToEnd;

  constructor(params: { configPath?: string, cache?: Cache<string, string> }) {
    const { configPath, cache } = params;
    // Load configuration with chaining API
    const configManager = ConfigManager.getInstance();
    this.config = configManager.reset().fromEnvironment().fromFileSystem(configPath).getConfig('people');

    // Note: DataMapper initialization is deferred to run() method where we can fetch current terms
    this.endToEnd = null as any; // Will be initialized in run()
  }

  /**
   * Execute the complete integration process
   */
  async run(): Promise<void> {
    try {
      const { config, config: { 
        dataSource: { people: { fieldsOfInterest } = {} } = {},
        integration: { clientId } = {},
        storage: { type } = {}
      } } = this;
      
      console.log('Starting Huron Person Integration...');
      console.log(`Client ID: ${clientId}`);
      console.log(`Storage Type: ${type}`);

      // Create integration components with currentTerms
      const dataMapper = await getDataMapper(config);

      let responseFilter: ResponseProcessor | undefined;
      if (fieldsOfInterest) {
        responseFilter = new AxiosResponseStreamFilter({ fieldsOfInterest });
      }
      const dataSource = new BuCdmPeopleDataSource({ config, responseFilter });
      const dataTarget = new HuronPersonDataTarget({ config, cache: config.cache as any });
      const deltaStrategy = DeltaStrategyFactory.createStrategy(config);
      const fieldFilterParms = {
        stateMappings: dataMapper.stateMappings,
        countryMappings: dataMapper.countryMappings,
        orgMappings: dataMapper.orgMappings
      } as FieldFilterParams;

      // Initialize EndToEnd integration
      this.endToEnd = new EndToEnd({
        dataSource,
        dataMapper,
        dataTarget,
        deltaStrategy,
        // Apply field filtering to remove non-hashable fields before hashing
        fieldFilter: fs => new FieldFilter({ ...fieldFilterParms, fieldSet: fs }).filter() 
      });
      
      await this.endToEnd.execute();
      
      console.log('Huron Person Integration completed successfully');
    } catch (error) {
      console.error('Huron Person Integration failed:', error);
      throw error;
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): Config {
    return this.config;
  }
}

/**
 * Main entry point
 */
async function main() {
  try {
    const integration = new HuronPersonIntegration({ configPath: undefined, cache: undefined });
    await integration.run();
    process.exit(0);
  } catch (error) {
    console.error('Integration failed:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main();
}

export { HuronPersonIntegration };

