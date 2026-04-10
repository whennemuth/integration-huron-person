import {
  DeltaStorage,
  DeltaStrategy,
  DeltaStrategyForDatabase,
  DeltaStrategyForFileSystem,
  DeltaStrategyForS3Bucket,
  DeltaStrategyParams,
  FileConfig,
  isDatabaseConfig,
  isS3Config
} from 'integration-core';
import { Config } from '../config/Config';
import { UpsertDeltaStrategy } from './UpsertDeltaStrategy';
import { ChunkedDeltaStrategy } from './ChunkedDeltaStrategy';

/**
 * Parameters for creating a delta strategy
 */
export interface CreateStrategyParams {
  config: Config;
  chunkId?: string;
  bulkReset?: boolean;
}

/**
 * Factory for creating appropriate delta strategy based on configuration
 */
export class DeltaStrategyFactory {
  
  /**
   * Create delta strategy based on storage configuration
   * @param params - Parameters object containing config, optional chunkId, and optional bulkReset flag
   */
  static createStrategy(params: CreateStrategyParams): DeltaStrategy {
    const { config, chunkId, bulkReset = false } = params;
    const { storage } = config;
    
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
    // Wrap with ChunkedDeltaStrategy if chunkId is provided (parallel chunk processing)
    // This ensures all chunks read from the integrated previous-input.ndjson
    if (chunkId && (config as any).integratedDeltaClientId) {
      console.log('Chunked processing mode - wrapping strategy with ChunkedDeltaStrategy');
      deltaStrategy = new ChunkedDeltaStrategy(deltaStrategy, config);
    }
    // Wrap with UpsertDeltaStrategy if bulkReset is enabled
    if (bulkReset) {
      console.log('🔄 Bulk reset mode enabled - wrapping strategy with UpsertDeltaStrategy');
      deltaStrategy = new UpsertDeltaStrategy(deltaStrategy, config);
    }

    return deltaStrategy;
  }
}
