import { DataSource, EndToEnd, Timer } from 'integration-core';
import { Cache } from './Cache';
import { Config } from './config/Config';
import { ConfigManager } from './config/ConfigManager';
import { getDataMapper, StaticMapUsage } from './data-mapper/DataMapper';
import { FieldFilter, FieldFilterParams } from './data-mapper/FieldFilter';
import { getDataSource } from './data-source/DataSource';
import { HuronPersonDataTarget } from './data-target/PersonDataTarget';
import { DeltaStrategyFactory } from './delta-strategy/DeltaStrategyFactory';
import { AxiosResponseStreamFilter, ResponseProcessor } from './stream/AxiosResponseStreamFilter';
export { AxiosResponseStreamFilter as PersonDataSourceResponseStreamFilter } from './stream/AxiosResponseStreamFilter';

type HuronPersonIntegrationParams = {
  configPath?: string, 
  cache?: Cache<string, string>, 
  config?: Config;
  staticMapUsage?: StaticMapUsage;
  /** 
   * bulkReset: If true, means upserting will be used where deltas are determined by realtime 
   * lookups against the target API instead of the stored (key + hash) cache. 
   */
  bulkReset?: boolean;
};

/**
 * Main integration runner for Huron Person data. All data is pulled from Boston University CDM
 * system via the CDM API, transformed/mapped, and pushed to the Huron target API.
 */
class HuronPersonIntegration {
  private config: Config;
  private endToEnd: EndToEnd;
  private staticMapUsage?: StaticMapUsage;
  private bulkReset: boolean;

  constructor(params: HuronPersonIntegrationParams) {
    const { configPath, cache, config, staticMapUsage, bulkReset = false } = params;
    this.staticMapUsage = staticMapUsage;
    this.bulkReset = bulkReset;
    
    // Use provided config or load from environment/filesystem
    if (config) {
      this.config = config;
    } else {
      // Load configuration with chaining API
      const configManager = ConfigManager.getInstance();
      this.config = configManager.reset().fromEnvironment().fromFileSystem(configPath).getConfig('people');
    }

    // Note: DataMapper initialization is deferred to run() method where we can fetch current terms
    this.endToEnd = null as any; // Will be initialized in run()
  }

  /**
   * Execute the complete integration process
   * @param taskName - Optional custom task name for logging
   * @param chunkId - Optional chunk identifier for parallel processing
   */
  async run(taskName?: string, chunkId?: string): Promise<void> {
    try {
      const { config, config: { 
        dataSource: { people: { fieldsOfInterest } = {} } = {},
        integration: { clientId } = {},
        storage: { type } = {}
      } } = this;

      if ( ! taskName) {
        taskName = chunkId ? `Huron Person Integration (Chunk ${chunkId})` : 'Huron Person Integration';
      }
      
      console.log(`Starting ${taskName}...`);
      console.log(`Client ID: ${clientId}`);
      console.log(`Storage Type: ${type}`);
      if (chunkId) {
        console.log(`Chunk ID: ${chunkId}`);
      }
      
      const timer = new Timer();
      timer.start();

      // Create integration components with currentTerms
      const { countryMap=false, orgMap=false, stateMap=false } = this.staticMapUsage || {};
      const dataMapper = await getDataMapper(config, { orgMap, stateMap, countryMap });

      let responseFilter: ResponseProcessor | undefined;
      if (fieldsOfInterest) {
        responseFilter = new AxiosResponseStreamFilter({ fieldsOfInterest });
      }
      let dataSource: DataSource = getDataSource(config, responseFilter) as DataSource;
      const dataTarget = new HuronPersonDataTarget({ config, cache: config.cache as any });
      const deltaStrategy = DeltaStrategyFactory.createStrategy({ config, chunkId, bulkReset: this.bulkReset });
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

      timer.stop();
      timer.logElapsed(`✓ ${taskName} completed`);
    } catch (error) {
      console.error(`✗ ${taskName} failed:`, error);
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
 * NOTE: Set DRYRUN=true in environment if you want the target system to remain untouched.
 * This will be the .env file if running locally. In production, set the environment variable 
 * on the container or serverless function configuration.
 */
async function main() {
  try {
    // Load configuration
    const configManager = ConfigManager.getInstance();
    const config = configManager.reset().fromEnvironment().fromFileSystem().getConfig('people');
    const { dataSource: { people } = {} } = config;

    // Remove fieldsOfInterest to disable source person lookup field filtering for this run, ensuring all fields from the source are available for mapping and delta processing. This is necessary because the batch sync may require fields that are not included in the default fieldsOfInterest.
    delete config.dataSource.people!.fieldsOfInterest;

    // Settings in the .env file may be competing with the settings from config.json.
    // Favor the s3 settings over cdm settings in anticipation of this situation.
    if((people as any)?.bucketName) {
      delete (config.dataSource.people as any)?.fetchPath;
      delete (config.dataSource.people as any)?.endpointConfig;
    }
    
    const staticMapUsage: StaticMapUsage = { countryMap: false, orgMap: true, stateMap: true };
    const integration = new HuronPersonIntegration({ config, staticMapUsage });
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

export { HuronPersonIntegration, HuronPersonIntegrationParams };

