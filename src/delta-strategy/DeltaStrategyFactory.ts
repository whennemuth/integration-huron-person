import {
  DeltaStorage,
  DeltaStrategy,
  DeltaStrategyForDatabase,
  DeltaStrategyForDynamoDB,
  DeltaStrategyForFileSystem,
  DeltaStrategyForS3Bucket,
  DeltaStrategyParams,
  DynamoDBConfig,
  FieldSet,
  FileConfig,
  isDatabaseConfig,
  isDynamoDBConfig,
  isS3Config
} from 'integration-core';
import { Config } from '../config/Config';
import { UpsertDeltaStrategy } from './decorators/Upsert';
import { ChunkedDeltaStrategy } from './decorators/Chunked';
import { IgnoreRemovalsDeltaStrategy } from './decorators/IgnoreRemovals';
import { IntegratedDeltaClientIdDeltaStrategy } from './decorators/IntegratedDeltaClientId';

/**
 * Parameters for creating a delta strategy
 */
export interface CreateStrategyParams {
  config: Config;
  ignoreRemovals?: boolean;
  chunkId?: string;
  bulkReset?: boolean;
  trustPreviousStorage?: boolean; // If false, forces UpsertDeltaStrategy even if bulkReset is false. Defaults to true (trusts previous storage).
  lookupPersonInTargetSystemCache?: (person: FieldSet | string) => Promise<any>; // Optional function for looking up person in target system (used by UpsertDeltaStrategy)
}

/**
 * Factory for creating appropriate delta strategy based on configuration.
 * The DeltaStrategy instance is built using one or more decorators depending on the configuration parameters.
 * 
 * Key configuration parameters that influence the strategy composition include:
 * - storage.type (file, database, s3, dynamodb)
 * - chunkId (presence indicates chunked processing)
 * - bulkReset (forces UpsertDeltaStrategy for cache-based lookups)
 * - integratedDeltaClientId (redirects baseline reads to shared integrated delta path)
 */
export class DeltaStrategyFactory {  
  /**
   * Create delta strategy based on storage configuration
   * @param params - Parameters object containing config, optional chunkId, optional bulkReset flag, and optional trustPreviousStorage flag
   */
  static createStrategy(params: CreateStrategyParams): DeltaStrategy {
    const { 
      config, chunkId, bulkReset = false, trustPreviousStorage = true, lookupPersonInTargetSystemCache, ignoreRemovals = false 
    } = params;
    const { storage } = config;

    // Compute effective bulkReset: use UpsertDeltaStrategy if bulkReset is true OR if trustPreviousStorage is false
    // This ensures cache-based lookups are used when:
    // 1) bulkReset = true (explicit bulk reset requested), OR
    // 2) trustPreviousStorage = false (previous.ndjson is not trustworthy, use cached lookups instead)
    const effectiveBulkReset = bulkReset || !trustPreviousStorage;

    console.log(`Creating delta strategy: ${
      JSON.stringify({
        storageType: storage.type,
        chunkId,
        bulkReset,
        trustPreviousStorage,
        effectiveBulkReset,
        ignoreRemovals,
        lookupPersonInTargetSystemCache: !!lookupPersonInTargetSystemCache ? 'provided' : 'not provided'
      })
    }`);
    
    // Create custom output path/key prefix function if chunkId is provided
    const createChunkedOutputPath = chunkId 
      ? (baseName: string) => {
          // Replace previous-input.ndjson with chunk-{id}.ndjson (no subdirectory needed)
          // The base path already includes the full directory structure
          return baseName.replace('previous-input.ndjson', `chunk-${chunkId}.ndjson`);
        }
      : undefined;
    
    // Clone storage.config to avoid mutating the original
    const strategyParams: DeltaStrategyParams = {
      clientId: config.integration.clientId,
      config: { ...storage.config }
    };

    let deltaStrategy: DeltaStrategy;
    
    switch (storage.type) {
      case 'file':
        if( ! (storage.config as FileConfig)?.path) {
          throw new Error('Invalid file storage configuration');
        }
        // Inject custom outputPath if chunked
        if (createChunkedOutputPath) {
          (strategyParams.config as FileConfig).outputPath = createChunkedOutputPath;
        }
        deltaStrategy = new DeltaStrategyForFileSystem(strategyParams);
        break;
        
      case 'database':
        if( ! isDatabaseConfig(storage.config)) {
          throw new Error('Invalid database configuration');
        }
        deltaStrategy = new DeltaStrategyForDatabase(strategyParams);
        break;
        
      case 's3':
        if( ! isS3Config(storage.config)) {
          throw new Error('Invalid S3 configuration');
        }
        // Inject custom outputKeyPrefix if chunked
        if (createChunkedOutputPath) {
          (strategyParams.config as any).outputKeyPrefix = createChunkedOutputPath;
        }
        deltaStrategy = new DeltaStrategyForS3Bucket(strategyParams);
        break;

      case 'dynamodb':
        if( ! isDynamoDBConfig(storage.config)) {
          throw new Error('Invalid DynamoDB configuration');
        }
        // DynamoDB doesn't need custom output paths - writes directly to tables
        // Chunk-scoped operations handled by batch operations with personIds from current chunk
        deltaStrategy = new DeltaStrategyForDynamoDB(strategyParams);
        break;

      default:
        throw new Error(`Unsupported storage type: ${storage.type}`);
    }

    const { DRY_RUN = 'false' } = process.env;
    const dryRun = DRY_RUN.toLowerCase().trim() === 'true';
    if(dryRun) {
      // Wrap the storage to intercept updatePreviousData calls
      const originalStorage = deltaStrategy.storage;
      
      // Create a wrapped storage that blocks writes
      const wrappedStorage: DeltaStorage = { 
        name: '[DRY RUN] mock storage',
        description: '[DRY RUN] storage N/A',
        fetchPreviousData: async (params:any) => {
          // We can still fetch previous data to compute delta, but we won't update it after 
          return originalStorage.fetchPreviousData(params); 
        },
        wouldOverwritePreviousData: async (clientId: string) => {
          return originalStorage.wouldOverwritePreviousData(clientId);
        },
        updatePreviousData: async (params:any) => {
          console.log(`[DRY RUN] - updatePreviousData: ${JSON.stringify(params, null, 2)}`);
          return;
        }
      };

      // Override the storage getter to return our wrapped version
      Object.defineProperty(deltaStrategy, 'storage', {
        get: () => wrappedStorage,
        configurable: true
      });
    }

    /**
     * Wrap with IgnoreRemovalsDeltaStrategy if ignoreRemovals flag is set. Used if the
     * source system API call is only returning a subset of the total population as per 
     * its own delta adjudication. In this scenario, we want to preserve any "removed"
     * records from the delta result since they may not be truly removed from the source
     * system - they just weren't included in this API response.
     */
    if(ignoreRemovals) {
      console.log('🔄  Ignored removals processing mode - wrapping strategy with IgnoreRemovalsDeltaStrategy');
      deltaStrategy = new IgnoreRemovalsDeltaStrategy(deltaStrategy);
    }

    /**
     * Wrap with ChunkedDeltaStrategy if chunkId is provided (parallel chunk processing)
     * This ensures all chunks read from the integrated previous-input.ndjson
     */
    if (chunkId && config.integratedDeltaClientId) {
      console.log('🔄  Chunked processing mode - wrapping strategy with ChunkedDeltaStrategy');
      deltaStrategy = new ChunkedDeltaStrategy(deltaStrategy, config);
    }

    /** Wrap with UpsertDeltaStrategy if effective bulkReset is enabled (bulkReset=true OR trustPreviousStorage=false) */
    if (effectiveBulkReset) {
      console.log('🔄  Bulk reset mode enabled - wrapping strategy with UpsertDeltaStrategy');
      deltaStrategy = new UpsertDeltaStrategy(deltaStrategy, config, lookupPersonInTargetSystemCache);
    }

    /**
     * Wrap with IntegratedDeltaClientIdDeltaStrategy if integratedDeltaClientId is configured.
     * This redirects baseline reads to the shared integrated delta path, while preserving original clientId for writes.
     */
    const integratedDeltaClientId = config.integratedDeltaClientId;
    if (integratedDeltaClientId) {
      console.log('🔄  Integrated delta client ID detected - wrapping strategy with IntegratedDeltaClientIdDeltaStrategy');
      deltaStrategy = new IntegratedDeltaClientIdDeltaStrategy(deltaStrategy, integratedDeltaClientId);
    }

    return deltaStrategy;
  }
}
