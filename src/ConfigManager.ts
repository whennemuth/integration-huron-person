import * as fs from 'fs';
import * as path from 'path';
import { FileConfig, DatabaseConfig, S3Config } from 'integration-core';
import { Config } from './Config';

/**
 * Configuration manager for loading and validating configuration
 */
export class ConfigManager {
  private static instance: ConfigManager;
  private config: Config | null = null;

  private constructor() {}

  /**
   * Get singleton instance of ConfigManager
   */
  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  /**
   * Load configuration from file
   */
  loadConfig(configPath: string = './config.json'): Config {
    try {
      const absolutePath = path.resolve(configPath);
      
      if (!fs.existsSync(absolutePath)) {
        throw new Error(`Configuration file not found at: ${absolutePath}`);
      }

      const configContent = fs.readFileSync(absolutePath, 'utf-8');
      const parsedConfig = JSON.parse(configContent) as Config;
      
      this.validateConfig(parsedConfig);
      this.config = parsedConfig;
      
      console.log(`Configuration loaded successfully from: ${absolutePath}`);
      return this.config;
    } catch (error) {
      throw new Error(`Failed to load configuration: ${error}`);
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): Config {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call loadConfig() first.');
    }
    return this.config;
  }

  /**
   * Validate configuration structure and required fields
   */
  private validateConfig(config: any): void {
    // Required fields for API Key authentication (DataSource)
    const dataSourceRequiredFields = [
      'dataSource.endpointConfig.baseUrl',
      'dataSource.endpointConfig.apiKey',
      'dataSource.fetchPersonsEndpoint'
    ];

    // Required fields for JWT authentication (DataTarget) - now discriminated union
    const dataTargetBaseFields = [
      'dataTarget.endpointConfig.baseUrl',
      'dataTarget.endpointConfig.authMethod',
      'dataTarget.personsPath'
    ];

    // Validate auth method specific fields
    const authMethod = config.dataTarget?.endpointConfig?.authMethod;
    let dataTargetAuthFields: string[] = [];
    
    if (authMethod === 'basic') {
      dataTargetAuthFields = [
        'dataTarget.endpointConfig.authTokenUrl',
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

    const dataTargetRequiredFields = [...dataTargetBaseFields, ...dataTargetAuthFields];

    // General required fields
    const generalRequiredFields = [
      'integration.clientId',
      'storage.type',
      'storage.config'
    ];

    const allRequiredFields = [...dataSourceRequiredFields, ...dataTargetRequiredFields, ...generalRequiredFields];

    for (const field of allRequiredFields) {
      if (!this.getNestedProperty(config, field)) {
        throw new Error(`Missing required configuration field: ${field}`);
      }
    }

    // Validate storage configuration based on type
    this.validateStorageConfig(config.storage);

    // Validate URLs
    try {
      new URL(config.dataSource.endpointConfig.baseUrl);
      new URL(config.dataTarget.endpointConfig.baseUrl);
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

  /**
   * Get environment-specific configuration override
   */
  getEnvironmentConfig(): Partial<Config> {
    const envOverrides: Partial<Config> = {};

    // Override with environment variables if present
    
    // DataSource (API Key authentication) overrides
    if (process.env.DATASOURCE_ENDPOINTCONFIG_BASE_URL) {
      envOverrides.dataSource = {
        ...envOverrides.dataSource || this.config?.dataSource,
        endpointConfig: {
          ...this.config?.dataSource?.endpointConfig,
          baseUrl: process.env.DATASOURCE_ENDPOINTCONFIG_BASE_URL
        }
      } as any;
    }

    if (process.env.DATASOURCE_ENDPOINTCONFIG_API_KEY) {
      envOverrides.dataSource = {
        ...envOverrides.dataSource || this.config?.dataSource,
        endpointConfig: {
          ...envOverrides.dataSource?.endpointConfig || this.config?.dataSource?.endpointConfig,
          apiKey: process.env.DATASOURCE_ENDPOINTCONFIG_API_KEY
        }
      } as any;
    }

    // DataTarget (JWT authentication) overrides
    if (process.env.DATATARGET_ENDPOINTCONFIG_BASE_URL) {
      envOverrides.dataTarget = {
        ...envOverrides.dataTarget || this.config?.dataTarget,
        endpointConfig: {
          ...this.config?.dataTarget?.endpointConfig,
          baseUrl: process.env.DATATARGET_ENDPOINTCONFIG_BASE_URL
        }
      } as any;
    }

    if (process.env.DATATARGET_ENDPOINTCONFIG_USERNAME) {
      envOverrides.dataTarget = {
        ...envOverrides.dataTarget || this.config?.dataTarget,
        endpointConfig: {
          ...envOverrides.dataTarget?.endpointConfig || this.config?.dataTarget?.endpointConfig,
          username: process.env.DATATARGET_ENDPOINTCONFIG_USERNAME
        }
      } as any;
    }

    if (process.env.DATATARGET_ENDPOINTCONFIG_PASSWORD) {
      envOverrides.dataTarget = {
        ...envOverrides.dataTarget || this.config?.dataTarget,
        endpointConfig: {
          ...envOverrides.dataTarget?.endpointConfig || this.config?.dataTarget?.endpointConfig,
          password: process.env.DATATARGET_ENDPOINTCONFIG_PASSWORD
        }
      } as any;
    }

    if (process.env.DATATARGET_ENDPOINTCONFIG_AUTH_TOKEN_URL) {
      envOverrides.dataTarget = {
        ...envOverrides.dataTarget || this.config?.dataTarget,
        endpointConfig: {
          ...envOverrides.dataTarget?.endpointConfig || this.config?.dataTarget?.endpointConfig,
          authTokenUrl: process.env.DATATARGET_ENDPOINTCONFIG_AUTH_TOKEN_URL
        }
      } as any;
    }

    if (process.env.CLIENT_ID) {
      envOverrides.integration = {
        ...this.config?.integration,
        clientId: process.env.CLIENT_ID
      } as any;
    }

    return envOverrides;
  }
}