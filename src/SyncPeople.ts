import { EndToEnd } from 'integration-core';
import { Config } from './config/Config';
import { ConfigManager } from './config/ConfigManager';
import { DataMapper } from './data-mapper/DataMapper';
import { DeltaStrategyFactory } from './DeltaStrategyFactory';
import { BuCdmPeopleDataSource } from './data-source/PeopleDataSource';
import { BuCdmCurrentTermsDataSource } from './data-source/CurrentTermsDataSource';
import { HuronPersonDataTarget } from './data-target/PersonDataTarget';
import { AxiosResponseStreamFilter, ResponseProcessor } from './stream/AxiosResponseStreamFilter';
import { Cache } from './Cache';
export { AxiosResponseStreamFilter as PersonDataSourceResponseStreamFilter } from './stream/AxiosResponseStreamFilter';

/**
 * Main integration runner for Huron Person data. All data is pulled from Boston University CRM
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
      console.log('Starting Huron Person Integration...');
      console.log(`Client ID: ${this.config.integration.clientId}`);
      console.log(`Storage Type: ${this.config.storage.type}`);
      
      // Fetch current terms before initializing DataMapper
      console.log('Fetching current terms...');
      const termsDataSource = new BuCdmCurrentTermsDataSource({ config: this.config });
      const currentTerms = await termsDataSource.fetchRaw();
      console.log(`Fetched ${currentTerms.length} current term(s)`);

      // Create integration components with currentTerms
      const dataMapper = new DataMapper({ currentTerms });
      let responseFilter: ResponseProcessor | undefined;

      // Destructure for easier access
      const fieldsOfInterest = this.config.dataSource.people?.fieldsOfInterest;

      if (fieldsOfInterest) {
        responseFilter = new AxiosResponseStreamFilter({ fieldsOfInterest });
      }
      const dataSource = new BuCdmPeopleDataSource({ config: this.config, responseFilter });
      const dataTarget = new HuronPersonDataTarget(this.config, this.config.cache as any);
      const deltaStrategy = DeltaStrategyFactory.createStrategy(this.config);

      // Initialize EndToEnd integration
      this.endToEnd = new EndToEnd({
        dataSource,
        dataMapper,
        dataTarget,
        deltaStrategy
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
