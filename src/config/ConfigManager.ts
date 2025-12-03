import { Config } from './Config';
import { ConfigValidator } from './ConfigValidator';
import { ConfigFromEnvironment } from './ConfigFromEnvironment';
import { ConfigFromFileSystem } from './ConfigFromFileSystem';
import { from } from 'stream-json/Parser';

/**
 * Configuration manager with fluent interface for chaining configuration sources
 */
export class ConfigManager {
  private static instance: ConfigManager;
  private config: Partial<Config> = {};
  private isValidated: boolean = false;

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
    return this;
  }

  /**
   * Load configuration from file system and merge with existing config
   * Earlier sources take precedence over later sources
   */
  fromFileSystem(configPath: string = './config.json'): ConfigManager {
    try {
      const fileSystemLoader = new ConfigFromFileSystem();
      const fileConfig = fileSystemLoader.loadConfig(configPath);
      
      // Merge with precedence: existing config wins over new config
      this.config = this.deepMerge(fileConfig, this.config);
      this.isValidated = false;
      
      return this;
    } catch (error) {
      throw new Error(`Failed to load configuration from file system: ${error}`);
    }
  }

  /**
   * Load configuration from environment variables and merge with existing config
   * Earlier sources take precedence over later sources
   */
  fromEnvironment(): ConfigManager {
    try {
      const envLoader = new ConfigFromEnvironment(this.config as Config);
      const envConfig = envLoader.getConfig();
      
      // Merge with precedence: existing config wins over new config
      this.config = this.deepMerge(envConfig, this.config);
      this.isValidated = false;
      
      return this;
    } catch (error) {
      throw new Error(`Failed to load configuration from environment: ${error}`);
    }
  }

  fromS3(): ConfigManager {
    // Placeholder for future S3 configuration loading
    // Implement similar to fromFileSystem and fromEnvironment
    return this;
  }

  fromDatabase(): ConfigManager {
    // Placeholder for future database configuration loading
    // Implement similar to fromFileSystem and fromEnvironment
    return this;
  }

  fromSecretManager(): ConfigManager {
    // Placeholder for future secret manager configuration loading
    // Implement similar to fromFileSystem and fromEnvironment
    return this;
  }

  /**
   * Get current configuration with validation
   */
  getConfig(): Config {
    if (Object.keys(this.config).length === 0) {
      throw new Error('No configuration loaded. Use fromFileSystem() or fromEnvironment() first.');
    }

    if (!this.isValidated) {
      const validator = new ConfigValidator(this.config as Config);
      validator.validateConfig();
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