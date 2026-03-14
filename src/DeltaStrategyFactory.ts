import {
  DeltaStrategy,
  DeltaStrategyForDatabase,
  DeltaStrategyForFileSystem,
  DeltaStrategyForS3Bucket,
  DeltaStrategyParams,
  FileConfig,
  isDatabaseConfig,
  isS3Config
} from 'integration-core';
import { Config } from './config/Config';

/**
 * Factory for creating appropriate delta strategy based on configuration
 */
export class DeltaStrategyFactory {
  
  /**
   * Create delta strategy based on storage configuration
   */
  static createStrategy(config: Config): DeltaStrategy {
    const { storage } = config;
    
    const strategyParams: DeltaStrategyParams = {
      clientId: config.integration.clientId,
      config: storage.config
    };
    
    switch (storage.type) {
      case 'file':
        if( ! (storage.config as FileConfig)?.path) {
          throw new Error('Invalid file storage configuration');
        }
        return new DeltaStrategyForFileSystem(strategyParams);
        
      case 'database':
        if( ! isDatabaseConfig(storage.config)) {
          throw new Error('Invalid database configuration');
        }
        return new DeltaStrategyForDatabase(strategyParams);
        
      case 's3':
        if( ! isS3Config(storage.config)) {
          throw new Error('Invalid S3 configuration');
        }
        return new DeltaStrategyForS3Bucket(strategyParams);
        
      default:
        throw new Error(`Unsupported storage type: ${storage.type}`);
    }
  }
}