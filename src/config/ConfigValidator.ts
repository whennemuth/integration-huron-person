import { FileConfig, DatabaseConfig, S3Config } from 'integration-core';
import { Config } from './Config';

/**
 * Configuration validator for validating configuration structure and content
 */
export class ConfigValidator {
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  /**
   * Validate the configuration and return true if valid, false if invalid
   */
  isValid(): boolean {
    try {
      this.validateConfig();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Validate configuration structure and required fields
   * Throws an error with descriptive message if validation fails
   */
  validateConfig(): void {
    // Required fields for API Key authentication (DataSource)
    const dataSourceRequiredFields = [
      'dataSource.endpointConfig.baseUrl',
      'dataSource.endpointConfig.apiKey',
      'dataSource.fetchPersonsPath'
    ];

    // Required fields for JWT authentication (DataTarget) - now discriminated union
    const dataTargetBaseFields = [
      'dataTarget.endpointConfig.baseUrl',
      'dataTarget.endpointConfig.authMethod',
      'dataTarget.personsPath'
    ];

    // General required fields
    const generalRequiredFields = [
      'integration.clientId',
      'storage.type',
      'storage.config'
    ];

    // First check basic required fields (without auth-specific ones)
    const basicRequiredFields = [...dataSourceRequiredFields, ...dataTargetBaseFields, ...generalRequiredFields];
    
    for (const field of basicRequiredFields) {
      if (!this.getNestedProperty(this.config, field)) {
        throw new Error(`Missing required configuration field: ${field}`);
      }
    }

    // Now validate auth method and check auth-specific fields
    const authMethod = this.config.dataTarget?.endpointConfig?.authMethod;
    let dataTargetAuthFields: string[] = [];
    
    if (authMethod === 'basic') {
      dataTargetAuthFields = [
        'dataTarget.endpointConfig.loginSvcPath',
        'dataTarget.endpointConfig.username', 
        'dataTarget.endpointConfig.password'
      ];
    } else if (authMethod === 'externalToken') {
      dataTargetAuthFields = [
        'dataTarget.endpointConfig.externalToken',
        'dataTarget.endpointConfig.userId'
      ];
    } else {
      throw new Error(`Invalid authMethod: ${authMethod}. Must be 'basic' or 'externalToken'`);
    }

    // Check auth-specific required fields
    for (const field of dataTargetAuthFields) {
      if (!this.getNestedProperty(this.config, field)) {
        throw new Error(`Missing required configuration field: ${field}`);
      }
    }

    // Validate storage configuration based on type
    this.validateStorageConfig(this.config.storage);

    // Validate URLs
    try {
      new URL(this.config.dataSource.endpointConfig.baseUrl);
      new URL(this.config.dataTarget.endpointConfig.baseUrl);
    } catch {
      throw new Error('Invalid baseUrl in dataSource or dataTarget endpointConfig');
    }

    console.log('Configuration validation passed');
  }

  /**
   * Validate storage-specific configuration
   */
  private validateStorageConfig(storage: { type: string; config: any }): void {
    switch (storage.type) {
      case 'file':
        const fileConfig = storage.config as FileConfig;
        if (!fileConfig.path) {
          throw new Error('File storage requires path configuration');
        }
        break;

      case 'database':
        const dbConfig = storage.config as DatabaseConfig;
        if (!dbConfig.type) {
          throw new Error('Database storage requires type configuration');
        }
        if (dbConfig.type === 'sqlite' && !dbConfig.filename && !dbConfig.database) {
          throw new Error('SQLite requires filename or database configuration');
        }
        if (dbConfig.type !== 'sqlite' && !dbConfig.host) {
          throw new Error('Non-SQLite databases require host configuration');
        }
        break;

      case 's3':
        const s3Config = storage.config as S3Config;
        if (!s3Config.bucketName) {
          throw new Error('S3 storage requires bucketName configuration');
        }
        break;

      default:
        throw new Error(`Unsupported storage type: ${storage.type}`);
    }
  }

  /**
   * Get nested property from object using dot notation
   */
  private getNestedProperty(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : null;
    }, obj);
  }
}