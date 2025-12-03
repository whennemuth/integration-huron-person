import { 
  DeltaStrategy,
  DeltaStrategyParams,
  DeltaStrategyForFileSystem,
  DeltaStrategyForDatabase,
  DeltaStrategyForS3Bucket,
  FileConfig,
  DatabaseConfig,
  S3Config
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
        const fileConfig = storage.config as FileConfig;
        return new DeltaStrategyForFileSystem(strategyParams);
        
      case 'database':
        const dbConfig = storage.config as DatabaseConfig;
        return new DeltaStrategyForDatabase(strategyParams);
        
      case 's3':
        const s3Config = storage.config as S3Config;
        return new DeltaStrategyForS3Bucket(strategyParams);
        
      default:
        throw new Error(`Unsupported storage type: ${storage.type}`);
    }
  }
}