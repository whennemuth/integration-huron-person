import { DataSource, DeltaStrategy, EndToEnd, FieldSet, IntegrationResult, isS3Config, TestEnvironment, Timer } from 'integration-core';
import { getLocalConfig } from '../bin';
import { Cache } from './Cache';
import { Config, TargetPersonDeleteType } from './config/Config';
import { ConfigManager } from './config/ConfigManager';
import { getDataMapper, DataMapper, StaticMapUsage } from './data-mapper/DataMapper';
import { FieldFilter, FieldFilterParams } from './data-mapper/FieldFilter';
import { getDataSource } from './data-source/DataSource';
import { TargetApiErrorEventProcessor } from './data-target/ApiClientForJWT';
import { HuronPersonDataTarget } from './data-target/PersonDataTarget';
import { IntegratedDeltaClientIdDeltaStrategy } from './delta-strategy/decorators/IntegratedDeltaClientId';
import { DeltaStrategyFactory } from './delta-strategy/DeltaStrategyFactory';
import { PushedChangeTypesDeltaStrategy } from './delta-strategy/decorators/PushedChangeTypes';
import { PushedChanges } from './delta-strategy/PushedChanges';
import { PreviousStateSource, previousStateSourceOf } from './delta-strategy/PreviousStateSource';
import { AxiosResponseStreamFilter, ResponseProcessor } from './stream/AxiosResponseStreamFilter';
import { ApiRetryStrategy } from './ApiRetryStrategy';

export { AxiosResponseStreamFilter as PersonDataSourceResponseStreamFilter } from './stream/AxiosResponseStreamFilter';

/**
 * Optional per-person async hook, invoked once for each record mapped during an integration
 * run - whether mapping succeeded (`mapped` set) or failed (`error` set instead) - and
 * regardless of whether the overall sync ultimately succeeds (see HuronPersonIntegration.run()).
 * A single object parameter is used (rather than positional args) so that supplying `error`
 * without `mapped` (or vice versa) is unambiguous. Only runs if provided.
 */
type PersonRecordProcessor = (record: { raw: any, mapped?: FieldSet, error?: unknown }) => Promise<void>;

type HuronPersonIntegrationParams = {
  configPath?: string, 
  cache?: Cache<string, string>, 
  config?: Config;
  staticMapUsage?: StaticMapUsage;
  /**
   * previousStateSource: where previous state comes from (PreviousStateSource.ts). `storage` (the default): the
   * stored hashes decide what changed. `target` (a bulk reset): every person is looked up in the target, through
   * lookupPersonInTargetSystemCache when given.
   */
  previousStateSource?: PreviousStateSource;
  lookupPersonInTargetSystemCache?: (person: FieldSet | string) => Promise<any>
  errorEventProcessor?: TargetApiErrorEventProcessor;
  /**
   * retryStrategy: Optional retry strategy for handling transient API failures (429, 5xx, network errors).
   * Must implement ApiRetryStrategy interface.
   */
  retryStrategy?: ApiRetryStrategy;
  cleanupPreviousData?: boolean; // Optional flag to control whether previous data should be cleaned up after update
  ignoreRemovals?: boolean; // Optional flag to control whether person removals should be ignored in delta computation (used for chunked processing where removals are determined by post-processor)
  /**
   * personRecordProcessor: Optional per-person async hook invoked once per record encountered
   * during mapping (success or failure) regardless of whether the sync itself ultimately
   * succeeds. Only runs if provided (dependency injection - no-op otherwise).
   */
  personRecordProcessor?: PersonRecordProcessor;
};

/**
 * Main integration runner for Huron Person data. All data is pulled from Boston University CDM
 * system via the CDM API, transformed/mapped, and pushed to the Huron target API.
 */
class HuronPersonIntegration {
  private config: Config;
  private endToEnd: EndToEnd;
  private staticMapUsage?: StaticMapUsage;
  private previousStateSource: PreviousStateSource;
  private lookupPersonInTargetSystemCache?: (person: FieldSet | string) => Promise<any>;
  private retryStrategy?: ApiRetryStrategy;
  private cleanupPreviousData?: boolean;
  private ignoreRemovals: boolean;
  private personRecordProcessor?: PersonRecordProcessor;
  private errorEventProcessor?: TargetApiErrorEventProcessor;

  constructor(params: HuronPersonIntegrationParams) {
    const { 
      configPath, cache, config, staticMapUsage, errorEventProcessor,
      retryStrategy, cleanupPreviousData=true, lookupPersonInTargetSystemCache, ignoreRemovals = false,
      personRecordProcessor
    } = params;
    // Resolved (and checked) up front, so an invalid setting, or the removed bulkReset / trustPreviousStorage, fails
    // before any work
    const previousStateSource = previousStateSourceOf(params);

    console.log(`⚙️  HuronPersonIntegration params: ${JSON.stringify({
      configPath,
      cache: !!cache ? 'provided' : 'not provided',
      config: !!config ? 'provided' : 'not provided',
      staticMapUsage,
      previousStateSource,
      lookupPersonInTargetSystemCache: !!lookupPersonInTargetSystemCache ? 'provided' : 'not provided',
      ignoreRemovals,
      retryStrategy: !!retryStrategy ? retryStrategy : 'not provided',
      cleanupPreviousData: !!cleanupPreviousData ? cleanupPreviousData : 'not provided'
    })}`);
    
    this.staticMapUsage = staticMapUsage;
    this.previousStateSource = previousStateSource;
    this.errorEventProcessor = errorEventProcessor;
    this.lookupPersonInTargetSystemCache = lookupPersonInTargetSystemCache;
    this.retryStrategy = retryStrategy;
    this.cleanupPreviousData = cleanupPreviousData;
    this.ignoreRemovals = ignoreRemovals;
    this.personRecordProcessor = personRecordProcessor;
    
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
   * The delta strategy to run with: for DynamoDB storage, one whose storage records in person history each
   * person's change as the push made it (PushedChangeTypesDeltaStrategy), so the changes it lists for a run
   * agree with the run's figures however the delta was computed. Other storages keep only a baseline, so
   * their strategy is returned as it is.
   */
  static recordingPushedChanges(deltaStrategy: DeltaStrategy, storageType: string | undefined, pushedChanges: PushedChanges): DeltaStrategy {
    return storageType === 'dynamodb' ? new PushedChangeTypesDeltaStrategy(deltaStrategy, pushedChanges) : deltaStrategy;
  }

  /**
   * Execute the complete integration process
   * @param taskName - Optional custom task name for logging
   * @param chunkId - Optional chunk identifier for parallel processing
   * @returns IntegrationResult with processing statistics
   */
  async run(taskName?: string, chunkId?: string): Promise<IntegrationResult> {
    // Hoisted so the finally block below can still reach them if execute() throws
    let dataMapper: DataMapper | undefined;
    let timer: Timer | undefined;
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
      
      timer = new Timer();
      timer.start();

      // Create integration components with currentTerms
      const { 
        staticMapUsage: { countryMap=false, orgMap=false, stateMap=false } = {},
        errorEventProcessor, previousStateSource, ignoreRemovals,
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

      dataMapper = await getDataMapper(config, { orgMap, stateMap, countryMap });

      let responseFilter: ResponseProcessor | undefined;
      if (fieldsOfInterest) {
        responseFilter = new AxiosResponseStreamFilter({ fieldsOfInterest });
      }
      let dataSource: DataSource = getDataSource(config, responseFilter, this.retryStrategy) as DataSource;
      
      // Each successful push, so that DynamoDB storage records in person history what the push did
      const pushedChanges = new PushedChanges();

      const dataTarget = new HuronPersonDataTarget({
        config,
        cache: config.cache as any,
        errorEventProcessor,
        pushRecorder: pushedChanges
      });
      
      // JWT Safeguard: Ensure valid token before any data operations
      // This guarantees that we have a JWT token acquired and cached before we start processing
      console.log('[SyncPeople] Acquiring JWT token for data target API...');
      await dataTarget.ensureValidToken();
      console.log(`[SyncPeople] JWT token acquired and ready. Expires in ${dataTarget.getTokenExpiryMinutes()} minutes`);
      
      let deltaStrategy = DeltaStrategyFactory.createStrategy({
        config,
        chunkId,
        previousStateSource,
        lookupPersonInTargetSystemCache,
        ignoreRemovals
      });
      deltaStrategy = HuronPersonIntegration.recordingPushedChanges(deltaStrategy, type, pushedChanges);

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

      return result;
    } catch (error) {
      console.error(`✗ ${taskName} failed:`, error);
      throw error;
    } finally {
      // Custom per-person async processing (dependency injection - only runs if provided).
      // Runs regardless of per-record mapping outcome or overall sync success/failure.
      if (this.personRecordProcessor && dataMapper) {
        console.log(`Running custom per-person processor over ${dataMapper.mappedPersonRecords.length} record(s)...`);
        for (const { raw, mapped, error } of dataMapper.mappedPersonRecords) {
          try {
            await this.personRecordProcessor({ raw, mapped, error });
          } catch (processorError) {
            // Don't fail the entire sync just because a custom side-channel operation failed
            console.error('Custom person record processor failed for a record:', processorError);
          }
        }
      }

      // Stopped here (not the try block) so elapsed time also covers the processor loop above
      if (timer) {
        timer.stop();
        timer.logElapsed(`✓ ${taskName} completed`);
      }
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

export { HuronPersonIntegration, HuronPersonIntegrationParams, PersonRecordProcessor };

