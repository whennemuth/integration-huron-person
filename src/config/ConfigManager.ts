import { Config, ExecutionMode } from './Config';
import { ConfigFromEnvironment } from './ConfigFromEnvironment';
import { ConfigFromFileSystem } from './ConfigFromFileSystem';
import { ConfigFromSecretsManager } from './ConfigFromSecretsManager';
import { ConfigValidator } from './ConfigValidator';

/**
 * Configuration manager with fluent interface for chaining configuration sources
 */
export class ConfigManager {
  private static instance: ConfigManager;
  private config: Partial<Config> = {};
  private isValidated: boolean = false;
  private pendingLoads: Promise<void>[] = [];

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
   * Reset the configuration manager to start fresh
   */
  reset(): ConfigManager {
    this.config = {};
    this.isValidated = false;
    this.pendingLoads = [];
    return this;
  }

  fromPartial(partial?: Partial<Config>): ConfigManager {
    if( ! partial) {
      console.log('No valid configuration to load from partial config');
      return this;
    }
    try {
      this.config = this.deepMerge(partial, this.config);
      this.isValidated = false;
    } catch (error) {
      console.warn(`No valid configuration to load from partial config: ${error}`);
    }
    return this;
  }

  /**
   * Load configuration from file system and merge with existing config
   * Earlier sources take precedence over later sources
   */
  fromFileSystem(configPath?: string): ConfigManager {
    if( ! configPath) {
      console.log('No valid configuration to load from file system');
      return this;
    }
    try {
      const fileSystemLoader = new ConfigFromFileSystem();
      const fileConfig = fileSystemLoader.loadConfig(configPath);
      
      // Merge with precedence: existing config wins over new config
      this.config = this.deepMerge(fileConfig, this.config);
      this.isValidated = false;
    } catch (error) {
      console.log(`No valid configuration to load from file system (${configPath}): ${error}`);
    }
    return this;
  }

  /**
   * Load configuration from environment variables and merge with existing config
   * Earlier sources take precedence over later sources
   */
  fromEnvironment(): ConfigManager {
    try {
      const envLoader = new ConfigFromEnvironment(this.config as Config);
      const envConfig = envLoader.getConfig() ?? {};
      if(typeof envConfig === 'object' && Object.keys(envConfig).length === 0) {
        console.warn('No valid configuration to load from individual environment variables.');
      }
      else {
        // Merge with precedence: existing config wins over new config
        this.config = this.deepMerge(envConfig, this.config);
      }
        
      this.isValidated = false;
    } catch (error) {
      console.warn(`No valid configuration to load from individual environment variables: ${error}`);
    }
    return this;
  }

  fromJsonString(envVarName: string = 'HURON_PERSON_CONFIG_JSON'): ConfigManager {
    const jsonString = process.env[envVarName];
    if (jsonString) {
      try {
        const config = JSON.parse(jsonString);
        this.config = this.deepMerge(config, this.config);
        this.isValidated = false;
      } catch (error) {
        console.warn(`No valid configuration to load from ${envVarName}: ${error}`);
      }
    }
    else {
      console.log(`No valid configuration to load from ${envVarName}`);
    }
    return this;
  }

  fromSecretManager(secretName?: string, region?: string): ConfigManager {
    if (secretName) {
      const loadPromise = (async () => {
        try {
          const secretsLoader = new ConfigFromSecretsManager(region);
          const secretConfig = await secretsLoader.loadConfig(secretName);
          
          // Merge with precedence: existing config wins over new config
          this.config = this.deepMerge(secretConfig, this.config);
          this.isValidated = false;
        } catch (error) {
          console.warn(`No valid configuration to load from Secrets Manager (${secretName}): ${error}`);
        }
      })();

      this.pendingLoads.push(loadPromise);
    }
    else {
      console.log('No valid configuration to load from Secrets Manager');
    }
    return this;
  }

  fromS3(): ConfigManager {
    // Placeholder for future S3 configuration loading
    // Implement similar to fromFileSystem and fromEnvironment
    console.log('No valid configuration to load from S3');
    return this;
  }

  fromDatabase(): ConfigManager {
    // Placeholder for future database configuration loading
    // Implement similar to fromFileSystem and fromEnvironment
    console.log('No valid configuration to load from database');
    return this;
  }


  /**
   * Get current configuration with validation
   * This is the synchronous version - does not wait for async config sources like Secrets Manager
   * Use getConfigAsync() if you need to load from Secrets Manager
   */
  getConfig(executionMode: ExecutionMode): Config {
    if (Object.keys(this.config).length === 0) {
      throw new Error('No configuration loaded. Use fromFileSystem() or fromEnvironment() first.');
    }

    if (!this.isValidated) {
      const validator = new ConfigValidator(this.config as Config);
      validator.validateConfig(executionMode);
      this.isValidated = true;
    }

    return this.config as Config;
  }

  /**
   * Get current configuration with validation (async version)
   * Awaits any pending asynchronous configuration loads (e.g., from Secrets Manager)
   * Use this when you've called fromSecretManager() in the chain
   */
  async getConfigAsync(executionMode: ExecutionMode): Promise<Config> {
    // Wait for all pending async loads to complete
    if (this.pendingLoads.length > 0) {
      await Promise.all(this.pendingLoads);
      this.pendingLoads = []; // Clear after loading
    }

    if (Object.keys(this.config).length === 0) {
      throw new Error('No configuration loaded. Use fromFileSystem() or fromEnvironment() first.');
    }

    if (!this.isValidated) {
      const validator = new ConfigValidator(this.config as Config);
      validator.validateConfig(executionMode);
      this.isValidated = true;
    }

    return this.config as Config;
  }

  /**
   * Deep merge configuration objects with precedence control
   * @param source - Source config (lower precedence)
   * @param target - Target config (higher precedence)
   * @returns Merged configuration
   */
  private deepMerge(source: any, target: any): any {
    const result = { ...source };
    
    for (const key in target) {
      if (target.hasOwnProperty(key)) {
        if (target[key] !== null && typeof target[key] === 'object' && !Array.isArray(target[key])) {
          // Recursively merge objects
          result[key] = this.deepMerge(source[key] || {}, target[key]);
        } else if (target[key] !== undefined) {
          // Target value takes precedence (overwrites source)
          result[key] = target[key];
        }
      }
    }
    
    return result;
  }
}


async function main() {
  const { SECRET_ARN } = process.env;
  
  const configManager = ConfigManager.getInstance();

  // unset all of the environment variables that begin with DATASOURCE_ or DATATARGET_
  // and leave DATASOURCE_ENDPOINTCONFIG_PEOPLE_API_KEY with the dummy value "dummy_val_from_env"
  Object.keys(process.env).forEach(key => {
    if (key.startsWith('DATASOURCE_') || key.startsWith('DATATARGET_')) {
      delete process.env[key];
    }
    if(key === 'DATASOURCE_ENDPOINTCONFIG_PEOPLE_API_KEY') {
      process.env[key] = 'https://dummy_val_from_env';
    }
  });

  // Set the HURON_PERSON_CONFIG_JSON environment variable with a JSON string that contains a very 
  // small partial of config. { "dataTarget": { "endpointConfig": { "baseUrl": "dummy_val_from_json"} } } 
  process.env.HURON_PERSON_CONFIG_JSON = JSON.stringify({
    dataTarget: {
      endpointConfig: {
        baseUrl: 'https://dummy_val_from_json'
      }
    }
  } as Partial<Config>);

  // This config should have everything that came out of secrets manager, except for the 2 API 
  // endpoint values: baseUrl and apiKey, which should be coming from the environment variables 
  // (with the apiKey taking the dummy value since we set that above)
  const config = await configManager
    .reset()
    .fromEnvironment()                            // ← Then individual overrides
    .fromJsonString('HURON_PERSON_CONFIG_JSON')   // ← Check JSON first
    .fromSecretManager(SECRET_ARN)                // ← Then check Secrets Manager if SECRET_ARN is provided
    .getConfigAsync('people');                    

  console.log('Final merged configuration:', JSON.stringify(config, null, 2));
}

if(require.main === module) {
  main();
}