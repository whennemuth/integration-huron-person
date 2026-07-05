import { DataSource, EndToEnd, FieldSet, IntegrationResult, isS3Config, TestEnvironment, Timer } from 'integration-core';
import { getLocalConfig } from '../bin';
import { Cache } from './Cache';
import { Config, TargetPersonDeleteType } from './config/Config';
import { ConfigManager } from './config/ConfigManager';
import { getDataMapper, StaticMapUsage } from './data-mapper/DataMapper';
import { FieldFilter, FieldFilterParams } from './data-mapper/FieldFilter';
import { getDataSource } from './data-source/DataSource';
import { TargetApiErrorEventProcessor } from './data-target/ApiClientForJWT';
import { HuronPersonDataTarget } from './data-target/PersonDataTarget';
import { IntegratedDeltaClientIdDeltaStrategy } from './delta-strategy/decorators/IntegratedDeltaClientId';
import { DeltaStrategyFactory } from './delta-strategy/DeltaStrategyFactory';
import { AxiosResponseStreamFilter, ResponseProcessor } from './stream/AxiosResponseStreamFilter';
import { ApiRetryStrategy } from './ApiRetryStrategy';

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
  /** 
   * trustPreviousStorage: If false, forces use of the cache-based lookup (upsert mode) even when
   * bulkReset is false. Useful when previous-input.ndjson cannot be trusted and cached lookups
   * should determine create-vs-patch decisions. When true (default), existing delta storage is trusted.
   */
  trustPreviousStorage?: boolean;
  lookupPersonInTargetSystemCache?: (person: FieldSet | string) => Promise<any>
  errorEventProcessor?: TargetApiErrorEventProcessor;
  /**
   * retryStrategy: Optional retry strategy for handling transient API failures (429, 5xx, network errors).
   * Must implement ApiRetryStrategy interface.
   */
  retryStrategy?: ApiRetryStrategy;
  cleanupPreviousData?: boolean; // Optional flag to control whether previous data should be cleaned up after update
  ignoreRemovals?: boolean; // Optional flag to control whether person removals should be ignored in delta computation (used for chunked processing where removals are determined by merger)
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
  private trustPreviousStorage: boolean;
  private lookupPersonInTargetSystemCache?: (person: FieldSet | string) => Promise<any>;
  private errorEventProcessor?: TargetApiErrorEventProcessor;
  private retryStrategy?: ApiRetryStrategy;
  private cleanupPreviousData?: boolean;
  private ignoreRemovals: boolean;

  constructor(params: HuronPersonIntegrationParams) {
    const { 
      configPath, cache, config, staticMapUsage, bulkReset = false, trustPreviousStorage = true, errorEventProcessor, 
      retryStrategy, cleanupPreviousData=true, lookupPersonInTargetSystemCache, ignoreRemovals = false
    } = params;

    console.log(`⚙️  HuronPersonIntegration params: ${JSON.stringify({
      configPath,
      cache: !!cache ? 'provided' : 'not provided',
      config: !!config ? 'provided' : 'not provided',
      staticMapUsage,
      bulkReset,
      trustPreviousStorage,
      lookupPersonInTargetSystemCache: !!lookupPersonInTargetSystemCache ? 'provided' : 'not provided',
      ignoreRemovals,
      retryStrategy: !!retryStrategy ? retryStrategy : 'not provided',
      cleanupPreviousData: !!cleanupPreviousData ? cleanupPreviousData : 'not provided'
    })}`);
    
    this.staticMapUsage = staticMapUsage;
    this.bulkReset = bulkReset;
    this.trustPreviousStorage = trustPreviousStorage;
    this.errorEventProcessor = errorEventProcessor;
    this.lookupPersonInTargetSystemCache = lookupPersonInTargetSystemCache;
    this.retryStrategy = retryStrategy;
    this.cleanupPreviousData = cleanupPreviousData;
    this.ignoreRemovals = ignoreRemovals;
    
    // Use provided config or load from environment/filesystem
    if (config) {
      this.config = config;
    } else {
      // Load configuration with chaining API
      const configManager = ConfigManager.getInstance();
      this.config = configManager.reset().fromEnvironment().fromFileSystem(configPath).getConfig('people');
    }

    // Store cache on config if provided - this enables JWT token caching across all API clients
    if (cache) {
      this.config.cache = cache as any;
    }

    if(errorEventProcessor) {
      this.config.dataTarget.endpointConfig.errorEventProcessor = errorEventProcessor;
    }

    if(retryStrategy) {
      this.config.dataTarget.endpointConfig.retryStrategy = retryStrategy;
    }

    // Note: DataMapper initialization is deferred to run() method where we can fetch current terms
    this.endToEnd = null as any; // Will be initialized in run()
  }

  /**
   * Execute the complete integration process
   * @param taskName - Optional custom task name for logging
   * @param chunkId - Optional chunk identifier for parallel processing
   * @returns IntegrationResult with processing statistics
   */
  async run(taskName?: string, chunkId?: string): Promise<IntegrationResult> {
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
      const { 
        staticMapUsage: { countryMap=false, orgMap=false, stateMap=false } = {},
        errorEventProcessor, bulkReset, trustPreviousStorage, ignoreRemovals,
        lookupPersonInTargetSystemCache, cleanupPreviousData
      } = this;

      // Ensure personDeleteType ALWAYS reflects the Huron soft-delete requirement
      const { SOFT, HARD } = TargetPersonDeleteType;
      let { dataTarget: { personDeleteType=SOFT } = {} } = config;
      if (personDeleteType !== SOFT) {
        console.warn(`⚠️  Warning: personDeleteType is configured as ${personDeleteType}, ` +
          `but Huron requires soft deletes. Overriding to SOFT delete and enabling cleanup ` +
          `of previous data.`);
        personDeleteType = SOFT;
      }

      const dataMapper = await getDataMapper(config, { orgMap, stateMap, countryMap });

      let responseFilter: ResponseProcessor | undefined;
      if (fieldsOfInterest) {
        responseFilter = new AxiosResponseStreamFilter({ fieldsOfInterest });
      }
      let dataSource: DataSource = getDataSource(config, responseFilter, this.retryStrategy) as DataSource;
      const dataTarget = new HuronPersonDataTarget({ config, cache: config.cache as any, errorEventProcessor });
      
      // JWT Safeguard: Ensure valid token before any data operations
      // This guarantees that we have a JWT token acquired and cached before we start processing
      console.log('[SyncPeople] Acquiring JWT token for data target API...');
      await dataTarget.ensureValidToken();
      console.log(`[SyncPeople] JWT token acquired and ready. Expires in ${dataTarget.getTokenExpiryMinutes()} minutes`);
      
      // Calculate effective bulkReset: use upsert (cache-based lookup) if bulkReset is true OR if trustPreviousStorage is false
      const effectiveBulkReset = bulkReset || !trustPreviousStorage;
      const deltaStrategy = DeltaStrategyFactory.createStrategy({ 
        config, 
        chunkId, 
        bulkReset: effectiveBulkReset,
        trustPreviousStorage,
        lookupPersonInTargetSystemCache,
        ignoreRemovals
      });

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
        fieldFilter: fs => new FieldFilter({ ...fieldFilterParms, fieldSet: fs }).filter(),
        // Only allow cleanup of previous data if using HARD deletes (Should be never - We never remove users from Huron).
        cleanupPreviousData: (personDeleteType as TargetPersonDeleteType) === HARD ? cleanupPreviousData : false 
      });
      
      const result = await this.endToEnd.execute();

      // Add mapping errors to failure count (they were filtered out by DataMapper before reaching EndToEnd)
      const mappingErrorCount = dataMapper.getMappingErrorCount();
      if (mappingErrorCount > 0) {
        console.log(`Mapping errors filtered: ${mappingErrorCount} record(s) failed during mapping phase`);
        result.failureCount += mappingErrorCount;
        result.totalProcessed += mappingErrorCount;
      }

      timer.stop();
      timer.logElapsed(`✓ ${taskName} completed`);
      
      return result;
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
  const { 
    CACHE_ENABLED, 
    CACHE_PATH, 
    HURON_PERSON_CONFIG_PATH,
    DELTA_STORAGE_BUCKET
  } = process.env;

  if(CACHE_ENABLED !== 'true') {
    console.log('CACHE_ENABLED environment variable is not set to "true". You need to cache the access token for bulk operations.');
    return;
  }

  if( ! CACHE_PATH) {
    console.log('CACHE_PATH environment variable is not set. You need to set this to a writable path for caching the access token for bulk operations.');
    return;
  }

  try {
    // Load configuration
    const localConfigPath = HURON_PERSON_CONFIG_PATH || getLocalConfig();
    const configManager = ConfigManager.getInstance();
    const config = configManager.reset().fromEnvironment().fromFileSystem(localConfigPath).getConfig('people');
    const { dataSource: { people } = {} } = config;

    // Remove fieldsOfInterest to disable source person lookup field filtering for this run, ensuring all fields from the source are available for mapping and delta processing. This is necessary because the batch sync may require fields that are not included in the default fieldsOfInterest.
    delete config.dataSource.people!.fieldsOfInterest;

    // Settings in the .env file may be competing with the settings from config.json.
    // Favor the s3 settings over cdm settings in anticipation of this situation.
    if((people as any)?.bucketName) {
      delete (config.dataSource.people as any)?.fetchPath;
      delete (config.dataSource.people as any)?.endpointConfig;
    }

    if(DELTA_STORAGE_BUCKET && isS3Config(config.storage.config)) {
      console.log(`Using custom delta storage bucket from environment variable: ${DELTA_STORAGE_BUCKET}`);
      config.storage.config.bucketName = DELTA_STORAGE_BUCKET;
    }

    IntegratedDeltaClientIdDeltaStrategy.customizeConfig(
      config, 
      'SYNC_PEOPLE_INTEGRATED_DELTA_CLIENT_ID'
    ); 

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
  const testEnvironment = TestEnvironment('SYNC_PEOPLE');

  [
    'CACHE_PATH',
    'HURON_PERSON_CONFIG_PATH',
    'INTEGRATED_DELTA_CLIENT_ID',
    'DELTA_STORAGE_BUCKET'
  ].forEach(testEnvironment.getVarOrEmptyString);
  main();
}

export { HuronPersonIntegration, HuronPersonIntegrationParams };

