import * as fs from 'fs';
import * as path from 'path';
import { Config } from './Config';

/**
 * Configuration loader for reading configuration from file system
 */
export class ConfigFromFileSystem {
  
  constructor() {}

  /**
   * Load configuration from a JSON file
   * @param configPath - Path to the configuration file (defaults to './config.json')
   * @returns Parsed configuration object
   * @throws Error if file doesn't exist, can't be read, or contains invalid JSON
   */
  loadConfig(configPath: string = './config.json'): Config {
    try {
      const absolutePath = path.resolve(configPath);
      
      if (!fs.existsSync(absolutePath)) {
        throw new Error(`Configuration file not found at: ${absolutePath}`);
      }

      const configContent = fs.readFileSync(absolutePath, 'utf-8');
      const parsedConfig = JSON.parse(configContent) as Config;
      
      console.log(`Configuration loaded successfully from: ${absolutePath}`);

      const { 
        dataTarget: { endpointConfig: { externalToken } = {} } = {} as any, 
        dataSource: { 
          person: { endpointConfig: { apiKey: personApiKey } = {} } = {},
          people: { endpointConfig: { apiKey: peopleApiKey }  = {} } = {} as any,
          terms: { endpointConfig: { apiKey: termsApiKey } = {} } = {},
        } = {} 
      } = parsedConfig;

      // Remove placeholder values so that they can be overridden by other config sources (env vars, secrets manager) without accidentally retaining the placeholder string
      if (externalToken && /external/i.test(externalToken) && /token/i.test(externalToken)) {
        delete (parsedConfig as any).dataTarget.endpointConfig.externalToken;
      }
      if (personApiKey && /api[-_]?key/i.test(personApiKey)) {
        delete (parsedConfig as any).dataSource.person.endpointConfig.apiKey;
      }
      if (peopleApiKey && /api[-_]?key/i.test(peopleApiKey)) {
        delete (parsedConfig as any).dataSource.people.endpointConfig.apiKey;
      }
      if (termsApiKey && /api[-_]?key/i.test(termsApiKey)) {
        delete (parsedConfig as any).dataSource.terms.endpointConfig.apiKey;
      }
      return parsedConfig;
    } catch (error) {
      if (error instanceof Error && error.message.includes('Configuration file not found')) {
        throw error; // Re-throw file not found errors as-is
      }
      throw new Error(`Failed to load configuration from file system: ${error}`);
    }
  }

  /**
   * Check if a configuration file exists at the specified path
   * @param configPath - Path to the configuration file
   * @returns True if file exists, false otherwise
   */
  configFileExists(configPath: string): boolean {
    const absolutePath = path.resolve(configPath);
    return fs.existsSync(absolutePath);
  }
}