import { Config, ExecutionMode } from './Config';
import { ConfigFromEnvironment } from './ConfigFromEnvironment';
import { ConfigFromFileSystem } from './ConfigFromFileSystem';
import { ConfigFromSecretsManager } from './ConfigFromSecretsManager';
import { ConfigValidator } from './ConfigValidator';

/**
 * Represents a queued configuration operation
 */
interface ConfigOperation {
  type: 'partial' | 'filesystem' | 'environment' | 'json' | 'secretmanager';
  params: any;
}

/**
 * Configuration manager with fluent interface for chaining configuration sources
 */
export class ConfigManager {
  private static instance: ConfigManager;
  private config: Partial<Config> = {};
  private isValidated: boolean = false;
  private operations: ConfigOperation[] = [];
  private operationsExecuted: boolean = false;

  private constructor(private ignoreValidation: boolean=false) {}

  /**
   * Get singleton instance of ConfigManager
   */
  static getInstance(ignoreValidation: boolean=false): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager(ignoreValidation);
    }
    return ConfigManager.instance;
  }

  /**
   * Reset the configuration manager to start fresh
   */
  reset(): ConfigManager {
    this.config = {};
    this.isValidated = false;
    this.operations = [];
    this.operationsExecuted = false;
    return this;
  }

  fromPartial(partial?: Partial<Config>): ConfigManager {
    this.operations.push({ type: 'partial', params: { partial } });
    this.operationsExecuted = false;
    return this;
  }

  /**
   * Load configuration from file system and merge with existing config
   * Earlier sources take precedence over later sources
   */
  fromFileSystem(configPath?: string): ConfigManager {
    this.operations.push({ type: 'filesystem', params: { configPath } });
    this.operationsExecuted = false;
    return this;
  }

  /**
   * Load configuration from environment variables and merge with existing config
   * Earlier sources take precedence over later sources
   */
  fromEnvironment(): ConfigManager {
    this.operations.push({ type: 'environment', params: {} });
    this.operationsExecuted = false;
    return this;
  }

  fromJsonString(envVarName: string = 'HURON_PERSON_CONFIG_JSON'): ConfigManager {
    this.operations.push({ type: 'json', params: { envVarName } });
    this.operationsExecuted = false;
    return this;
  }

  fromSecretManager(secretName?: string, region?: string): ConfigManager {
    this.operations.push({ type: 'secretmanager', params: { secretName, region } });
    this.operationsExecuted = false;
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
   * Execute all queued configuration operations in order
   * This ensures proper precedence - first operation has highest priority
   */
  private async executeOperations(): Promise<void> {
    if (this.operationsExecuted) {
      return; // Already executed
    }

    for (const operation of this.operations) {
      switch (operation.type) {
        case 'partial':
          await this.executePartial(operation.params.partial);
          break;
        case 'filesystem':
          await this.executeFileSystem(operation.params.configPath);
          break;
        case 'environment':
          await this.executeEnvironment();
          break;
        case 'json':
          await this.executeJsonString(operation.params.envVarName);
          break;
        case 'secretmanager':
          await this.executeSecretManager(operation.params.secretName, operation.params.region);
          break;
      }
    }

    this.operationsExecuted = true;
  }

  /**
   * Execute partial config merge
   */
  private async executePartial(partial?: Partial<Config>): Promise<void> {
    if (!partial) {
      console.log('No valid configuration to load from partial config');
      return;
    }
    try {
      this.config = this.deepMerge(partial, this.config);
      this.isValidated = false;
    } catch (error) {
      console.warn(`No valid configuration to load from partial config: ${error}`);
    }
  }

  /**
   * Execute file system config load
   */
  private async executeFileSystem(configPath?: string): Promise<void> {
    if (!configPath) {
      console.warn('No valid configuration to load from file system');
      return;
    }
    try {
      const fileSystemLoader = new ConfigFromFileSystem();
      const fileConfig = fileSystemLoader.loadConfig(configPath);

      // Merge with precedence: existing config wins over new config
      this.config = this.deepMerge(fileConfig, this.config);
      console.log(`Merged configuration from file system (${configPath}).`);
      this.isValidated = false;
    } catch (error) {
      console.warn(`No valid configuration to load from file system (${configPath}): ${error}`);
    }
  }

  /**
   * Execute environment config load
   */
  private async executeEnvironment(): Promise<void> {
    try {
      const envLoader = new ConfigFromEnvironment(this.config as Config);
      const envConfig = envLoader.getConfig() ?? {};
      if (typeof envConfig === 'object' && Object.keys(envConfig).length === 0) {
        console.warn('No valid configuration to load from individual environment variables.');
      } else {
        // Merge with precedence: existing config wins over new config
        this.config = this.deepMerge(envConfig, this.config);
        console.log('Merged individual environment variables into configuration.');
      }

      this.isValidated = false;
    } catch (error) {
      console.warn(`No valid configuration to load from individual environment variables: ${error}`);
    }
  }

  /**
   * Execute JSON string config load
   */
  private async executeJsonString(envVarName: string): Promise<void> {
    const jsonString = process.env[envVarName];
    if (jsonString) {
      try {
        const config = JSON.parse(jsonString);
        this.config = this.deepMerge(config, this.config);
        console.log(`Merged configuration from ${envVarName} environment variable.`);
        this.isValidated = false;
      } catch (error) {
        console.warn(`No valid configuration to load from ${envVarName}: ${error}`);
      }
    } else {
      console.log(`No valid configuration to load from ${envVarName}`);
    }
  }

  /**
   * Execute Secrets Manager config load
   */
  private async executeSecretManager(secretName?: string, region?: string): Promise<void> {
    if (!secretName) {
      console.log('No valid configuration to load from Secrets Manager');
      return;
    }
    try {
      const secretsLoader = new ConfigFromSecretsManager(region);
      const secretConfig = await secretsLoader.loadConfig(secretName);

      // Merge with precedence: existing config wins over new config
      this.config = this.deepMerge(secretConfig, this.config);
      console.log(`Merged configuration from Secrets Manager (${secretName}).`);
      this.isValidated = false;
    } catch (error) {
      console.warn(`No valid configuration to load from Secrets Manager (${secretName}): ${error}`);
    }
  }

  /**
   * Get current configuration with validation
   * This is the synchronous version - use only if no async sources (like Secrets Manager) are used
   * Use getConfigAsync() if you've called fromSecretManager() in the chain
   */
  getConfig(executionMode: ExecutionMode): Config {
    // Execute operations synchronously (will throw if any async operations are queued)
    if (this.operations.some(op => op.type === 'secretmanager')) {
      throw new Error(
        'Cannot use getConfig() when fromSecretManager() is in the chain. Use getConfigAsync() instead.'
      );
    }

    // Execute operations if not already done
    if (!this.operationsExecuted) {
      // We can safely execute synchronously since we verified no async operations
      this.operations.forEach(operation => {
        switch (operation.type) {
          case 'partial':
            this.executePartialSync(operation.params.partial);
            break;
          case 'filesystem':
            this.executeFileSystemSync(operation.params.configPath);
            break;
          case 'environment':
            this.executeEnvironmentSync();
            break;
          case 'json':
            this.executeJsonStringSync(operation.params.envVarName);
            break;
        }
      });
      this.operationsExecuted = true;
    }

    if (Object.keys(this.config).length === 0) {
      throw new Error('No configuration loaded. Use fromFileSystem() or fromEnvironment() first.');
    }

    if (!this.isValidated) {
      const validator = new ConfigValidator(this.config as Config);
      if (!this.ignoreValidation) {
        validator.validateConfig(executionMode);
      }
      this.isValidated = true;
    }

    this.config.executionMode = executionMode;
    return this.config as Config;
  }

  /**
   * Get current configuration with validation (async version)
   * Awaits any pending asynchronous configuration loads (e.g., from Secrets Manager)
   * Use this when you've called fromSecretManager() in the chain
   */
  async getConfigAsync(executionMode: ExecutionMode): Promise<Config> {
    // Execute all operations in order
    await this.executeOperations();

    if (Object.keys(this.config).length === 0) {
      throw new Error('No configuration loaded. Use fromFileSystem() or fromEnvironment() first.');
    }

    if (!this.isValidated) {
      const validator = new ConfigValidator(this.config as Config);
      if (!this.ignoreValidation) {
        validator.validateConfig(executionMode);
      }
      this.isValidated = true;
    }

    this.config.executionMode = executionMode;
    return this.config as Config;
  }

  /**
   * Synchronous versions of execute methods for getConfig()
   */
  private executePartialSync(partial?: Partial<Config>): void {
    if (!partial) {
      console.log('No valid configuration to load from partial config');
      return;
    }
    try {
      this.config = this.deepMerge(partial, this.config);
      this.isValidated = false;
    } catch (error) {
      console.warn(`No valid configuration to load from partial config: ${error}`);
    }
  }

  private executeFileSystemSync(configPath?: string): void {
    if (!configPath) {
      console.warn('No valid configuration to load from file system');
      return;
    }
    try {
      const fileSystemLoader = new ConfigFromFileSystem();
      const fileConfig = fileSystemLoader.loadConfig(configPath);

      this.config = this.deepMerge(fileConfig, this.config);
      console.log(`Merged configuration from file system (${configPath}).`);
      this.isValidated = false;
    } catch (error) {
      console.warn(`No valid configuration to load from file system (${configPath}): ${error}`);
    }
  }

  private executeEnvironmentSync(): void {
    try {
      const envLoader = new ConfigFromEnvironment(this.config as Config);
      const envConfig = envLoader.getConfig() ?? {};
      if (typeof envConfig === 'object' && Object.keys(envConfig).length === 0) {
        console.warn('No valid configuration to load from individual environment variables.');
      } else {
        this.config = this.deepMerge(envConfig, this.config);
        console.log('Merged individual environment variables into configuration.');
      }

      this.isValidated = false;
    } catch (error) {
      console.warn(`No valid configuration to load from individual environment variables: ${error}`);
    }
  }

  private executeJsonStringSync(envVarName: string): void {
    const jsonString = process.env[envVarName];
    if (jsonString) {
      try {
        const config = JSON.parse(jsonString);
        this.config = this.deepMerge(config, this.config);
        console.log(`Merged configuration from ${envVarName} environment variable.`);
        this.isValidated = false;
      } catch (error) {
        console.warn(`No valid configuration to load from ${envVarName}: ${error}`);
      }
    } else {
      console.log(`No valid configuration to load from ${envVarName}`);
    }
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