import {
  DeltaStorage,
  DeltaStrategy,
  DeltaStrategyForDatabase,
  DeltaStrategyForFileSystem,
  DeltaStrategyForS3Bucket,
  DeltaStrategyParams,
  FieldSet,
  FileConfig,
  isDatabaseConfig,
  isS3Config
} from 'integration-core';
import { Config } from '../config/Config';
import { UpsertDeltaStrategy } from './UpsertDeltaStrategy';
import { ChunkedDeltaStrategy } from './ChunkedDeltaStrategy';
import { IgnoreRemovalsDeltaStrategy } from './IgnoreRemovalsDeltaStrategy';

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
 * Factory for creating appropriate delta strategy based on configuration
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
    if (chunkId && (config as any).integratedDeltaClientId) {
      console.log('🔄  Chunked processing mode - wrapping strategy with ChunkedDeltaStrategy');
      deltaStrategy = new ChunkedDeltaStrategy(deltaStrategy, config);
    }

    /** Wrap with UpsertDeltaStrategy if effective bulkReset is enabled (bulkReset=true OR trustPreviousStorage=false) */
    if (effectiveBulkReset) {
      console.log('🔄  Bulk reset mode enabled - wrapping strategy with UpsertDeltaStrategy');
      deltaStrategy = new UpsertDeltaStrategy(deltaStrategy, config, lookupPersonInTargetSystemCache);
    }

    /**
     * Redirect baseline reads to shared integrated path in chunked processor mode.
     * 
     * Problem: EndToEnd.execute() performs a post-push fetchPreviousData for hash restoration,
     * but passes config.integration.clientId (chunk-specific deltas path). In chunked mode,
     * that path doesn't exist; the baseline lives in the shared delta-storage directory created
     * by the merger.
     * 
     * Solution: Wrap the strategy's storage so fetchPreviousData is redirected to
     * integratedDeltaClientId (delta-storage) while updatePreviousData writes remain at the
     * original chunk-specific path. This ensures:
     * - Delta computation reads use integrated baseline (ChunkedDeltaStrategy handles this).
     * - Post-push hash restoration reads also use integrated baseline (wrapper handles this).
     * - Chunk outputs continue writing to deltas/{timestamp}/chunk-{id}.ndjson.
     * 
     * Applied only in chunked processor mode (chunkId + integratedDeltaClientId both present).
     */
    const integratedDeltaClientId = (config as any).integratedDeltaClientId as string | undefined;
    if (chunkId && integratedDeltaClientId) {
      const originalStorage = deltaStrategy.storage;
      const redirectedStorage = {
        name: originalStorage.name,
        description: originalStorage.description,
        fetchPreviousData: async (params: { clientId: string; limitTo?: any[] }) => {
          const redirectedParams = {
            ...params,
            clientId: integratedDeltaClientId
          };
          console.log(`Redirecting baseline read clientId from ${params.clientId} to ${integratedDeltaClientId}`);
          return originalStorage.fetchPreviousData(redirectedParams as any);
        },
        updatePreviousData: async (params: {
          clientId: string;
          newPreviousData: any[];
          primaryKeyFields?: Set<string>;
          failureCount?: number;
          cleanup?: boolean;
        }) => {
          // Keep chunk-specific writes unchanged.
          return originalStorage.updatePreviousData(params as any);
        }
      };

      Object.defineProperty(deltaStrategy, 'storage', {
        get: () => redirectedStorage,
        configurable: true
      });
    }

    return deltaStrategy;
  }
}
