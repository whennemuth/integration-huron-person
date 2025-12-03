import { EndToEnd } from 'integration-core';
import { Config } from './config/Config';
import { ConfigManager } from './config/ConfigManager';
import { DataMapper } from './DataMapper';
import { DeltaStrategyFactory } from './DeltaStrategyFactory';
import { BuCdmPersonDataSource } from './data-source/PersonDataSource';
import { HuronPersonDataTarget } from './data-target/PersonDataTarget';
import { AxiosResponseStreamFilter, ResponseProcessor } from './stream/AxiosResponseStreamFilter';
export { AxiosResponseStreamFilter as PersonDataSourceResponseStreamFilter } from './stream/AxiosResponseStreamFilter';

/**
 * Main integration runner for Huron Person data. All data is pulled from Boston University CRM
 * system via the CDM API, transformed/mapped, and pushed to the Huron target API.
 */
class HuronPersonIntegration {
  private config: Config;
  private endToEnd: EndToEnd;

  constructor(configPath?: string) {
    // Load configuration with chaining API
    const configManager = ConfigManager.getInstance();
    this.config = configManager.reset().fromFileSystem(configPath).fromEnvironment().getConfig();

    // Create integration components
    const dataMapper = new DataMapper();
    let responseFilter: ResponseProcessor | undefined;

    // Destructure for easier access
    const { config, config: { dataSource: { fieldsToKeep } } } = this;

    if (fieldsToKeep) {
      responseFilter = new AxiosResponseStreamFilter({ fieldsToKeep });
    }
    const dataSource = new BuCdmPersonDataSource({ config, dataMapper, responseFilter });
    const dataTarget = new HuronPersonDataTarget(config);
    const deltaStrategy = DeltaStrategyFactory.createStrategy(config);

    // Initialize EndToEnd integration
    this.endToEnd = new EndToEnd({
      dataSource,
      dataTarget,
      deltaStrategy
    });
  }

  /**
   * Execute the complete integration process
   */
  async run(): Promise<void> {
    try {
      console.log('Starting Huron Person Integration...');
      console.log(`Client ID: ${this.config.integration.clientId}`);
      console.log(`Storage Type: ${this.config.storage.type}`);
      
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
    const integration = new HuronPersonIntegration();
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
