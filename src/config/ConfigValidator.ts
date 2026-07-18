import { FileConfig, DatabaseConfig, S3Config } from 'integration-core';
import { Config, ExecutionMode } from './Config';

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
  isValid(executionMode: ExecutionMode): boolean {
    try {
      this.validateConfig(executionMode);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Validate configuration structure and required fields
   * Throws an error with descriptive message if validation fails
   */
  validateConfig(executionMode: ExecutionMode): void {
    // For 'people' mode, handle both API-based and S3-based data sources
    let dataSourceRequiredFields: string[] = [];
    
    if (executionMode === 'person') {
      dataSourceRequiredFields = [
        'dataSource.person.endpointConfig.baseUrl',
        'dataSource.person.endpointConfig.apiKey',
        'dataSource.person.fetchPath'
      ];
    } else if (executionMode === 'people') {
      // Check if it's S3-based or API-based
      const peopleConfig = this.config.dataSource.people;
      if (peopleConfig && 'bucketName' in peopleConfig) {
        // S3-based data source
        dataSourceRequiredFields = [
          'dataSource.people.bucketName',
          'dataSource.people.key',
          'dataSource.people.region'
        ];
      } else {
        // API-based data source
        dataSourceRequiredFields = [
          'dataSource.people.endpointConfig.baseUrl',
          'dataSource.people.endpointConfig.apiKey',
          'dataSource.people.fetchPath'
        ];
      }
    } else if (executionMode === 'terms') {
      dataSourceRequiredFields = [
        'dataSource.terms.endpointConfig.baseUrl',
        'dataSource.terms.endpointConfig.apiKey',
        'dataSource.terms.fetchPath'
      ];
    } // 'none' mode requires no dataSource fields

    // Required fields for JWT authentication (DataTarget) - now discriminated union
    const dataTargetBaseFields = [
      'dataTarget.endpointConfig.baseUrl',
      'dataTarget.endpointConfig.authMethod',
      'dataTarget.personsPath',
      'dataTarget.organizationsPath'
    ];

    // General required fields
    const generalRequiredFields = [
      'landscape',
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
    
    // Validate optional S3 CSV configs if present
    this.validateS3CsvConfigs();

    // Validate URLs (only for API-based data sources)
    try {
      let dataSourceUrl: string | undefined;
      
      if (executionMode === 'person') {
        dataSourceUrl = this.config.dataSource.person?.endpointConfig.baseUrl;
      } else if (executionMode === 'people') {
        const peopleConfig = this.config.dataSource.people;
        // Only validate URL for API-based config (not S3-based)
        if (peopleConfig && 'endpointConfig' in peopleConfig) {
          dataSourceUrl = peopleConfig.endpointConfig.baseUrl;
        }
      } else if (executionMode === 'terms') {
        dataSourceUrl = this.config.dataSource.terms?.endpointConfig.baseUrl;
      }
      
      if (dataSourceUrl) {
        new URL(dataSourceUrl);
      }
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
   * Validate optional S3 CSV configurations for states and countries
   */
  private validateS3CsvConfigs(): void {
    const { dataSource } = this.config;
    
    // Validate statesCsvS3Config if present
    if (dataSource?.statesCsvS3Config) {
      const { bucketName, key, region } = dataSource.statesCsvS3Config;
      if (!bucketName) {
        throw new Error('statesCsvS3Config requires bucketName');
      }
      if (!key) {
        throw new Error('statesCsvS3Config requires key (full S3 object path)');
      }
      if (!region) {
        throw new Error('statesCsvS3Config requires region');
      }
    }
    
    // Validate countriesCsvS3Config if present
    if (dataSource?.countriesCsvS3Config) {
      const { bucketName, key, region } = dataSource.countriesCsvS3Config;
      if (!bucketName) {
        throw new Error('countriesCsvS3Config requires bucketName');
      }
      if (!key) {
        throw new Error('countriesCsvS3Config requires key (full S3 object path)');
      }
      if (!region) {
        throw new Error('countriesCsvS3Config requires region');
      }
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