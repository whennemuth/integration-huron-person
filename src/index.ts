import { EndToEnd } from 'integration-core';
import { ConfigManager } from './ConfigManager';
import { BuCdmPersonDataSource } from './PersonDataSource';
import { DataMapper } from './DataMapper';
import { HuronPersonDataTarget } from './PersonDataTarget';
import { DeltaStrategyFactory } from './DeltaStrategyFactory';
import { Config } from './Config';

/**
 * Main integration runner for Huron Person data. All data is pulled from Boston University CRM
 * system via the CDM API, transformed/mapped, and pushed to the Huron target API.
 */
class HuronPersonIntegration {
  private config: Config;
  private endToEnd: EndToEnd;

  constructor(configPath?: string) {
    // Load configuration
    const configManager = ConfigManager.getInstance();
    this.config = configManager.loadConfig(configPath);

    // Apply environment overrides
    const envOverrides = configManager.getEnvironmentConfig();
    this.config = { ...this.config, ...envOverrides };

    // Create integration components
    const dataMapper = new DataMapper();
    const dataSource = new BuCdmPersonDataSource({ config: this.config, dataMapper });
    const dataTarget = new HuronPersonDataTarget(this.config);
    const deltaStrategy = DeltaStrategyFactory.createStrategy(this.config);

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