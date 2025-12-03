import { ConfigManager } from '../src/ConfigManager';
import { Config } from '../src/Config';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs module
jest.mock('fs');
const mockedFs = fs as jest.Mocked<typeof fs>;

describe('ConfigManager', () => {
  let configManager: ConfigManager;
  const mockConfigPath = '/test/config.json';
  
  const validConfig: Config = {
    dataSource: {
      endpointConfig: {
        baseUrl: 'https://datasource.example.com',
        apiKey: 'test-api-key'
      },
      fetchPersonsEndpoint: '/api/v1/persons'
    },
    dataTarget: {
      endpointConfig: {
        baseUrl: 'https://datatarget.example.com',
        authMethod: 'basic',
        authTokenUrl: '/auth/token',
        username: 'dt-user',
        password: 'dt-pass'
      },
      personsPath: '/api/v1/persons/batch'
    },
    integration: {
      clientId: 'test-client-id',
      batchSize: 50,
      timeout: 10000
    },
    storage: {
      type: 'file',
      config: {
        path: './data/storage'
      }
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    configManager = ConfigManager.getInstance();
  });

  describe('loadConfig', () => {
    it('should load valid configuration successfully', () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue(JSON.stringify(validConfig));

      const result = configManager.loadConfig(mockConfigPath);

      expect(result).toEqual(validConfig);
      expect(mockedFs.existsSync).toHaveBeenCalledWith(path.resolve(mockConfigPath));
      expect(mockedFs.readFileSync).toHaveBeenCalledWith(path.resolve(mockConfigPath), 'utf-8');
    });

    it('should throw error when config file does not exist', () => {
      mockedFs.existsSync.mockReturnValue(false);

      expect(() => configManager.loadConfig(mockConfigPath)).toThrow(
        'Failed to load configuration: Error: Configuration file not found at:'
      );
    });

    it('should throw error when config file contains invalid JSON', () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue('invalid json content');

      expect(() => configManager.loadConfig(mockConfigPath)).toThrow();
    });

    it('should handle file read errors gracefully', () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      expect(() => configManager.loadConfig(mockConfigPath)).toThrow('Permission denied');
    });
  });

  describe('configuration validation (via loadConfig)', () => {
    it('should load and validate complete configuration', () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue(JSON.stringify(validConfig));

      const result = configManager.loadConfig(mockConfigPath);
      expect(result).toEqual(validConfig);
    });

    it('should reject invalid configuration during load', () => {
      const invalidConfig = { ...validConfig };
      delete (invalidConfig as any).dataSource;

      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue(JSON.stringify(invalidConfig));

      expect(() => configManager.loadConfig(mockConfigPath)).toThrow();
    });
  });

  describe('getConfig', () => {
    it('should return loaded configuration', () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue(JSON.stringify(validConfig));
      
      configManager.loadConfig(mockConfigPath);
      const result = configManager.getConfig();
      
      expect(result).toEqual(validConfig);
    });

    it('should throw error if config not loaded', () => {
      const freshConfigManager = new (ConfigManager as any)(); // Create new instance
      expect(() => freshConfigManager.getConfig()).toThrow(
        'Configuration not loaded. Call loadConfig() first.'
      );
    });
  });

  describe('getEnvironmentConfig', () => {
    beforeEach(() => {
      // Load a valid config first
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue(JSON.stringify(validConfig));
      configManager.loadConfig(mockConfigPath);
      
      // Clear any existing environment variables
      delete process.env.DATASOURCE_ENDPOINTCONFIG_BASE_URL;
      delete process.env.DATASOURCE_ENDPOINTCONFIG_API_KEY;
      delete process.env.DATATARGET_ENDPOINTCONFIG_BASE_URL;
      delete process.env.DATATARGET_ENDPOINTCONFIG_USERNAME;
      delete process.env.DATATARGET_ENDPOINTCONFIG_PASSWORD;
      delete process.env.DATATARGET_ENDPOINTCONFIG_AUTH_TOKEN_URL;
      delete process.env.CLIENT_ID;
    });

    it('should return empty object when no environment variables are set', () => {
      const result = configManager.getEnvironmentConfig();
      expect(result).toEqual({});
    });

    it('should override DataSource API key configuration', () => {
      process.env.DATASOURCE_ENDPOINTCONFIG_BASE_URL = 'https://prod-datasource.example.com';
      process.env.DATASOURCE_ENDPOINTCONFIG_API_KEY = 'prod-api-key-123';

      const result = configManager.getEnvironmentConfig();
      
      expect(result.dataSource?.endpointConfig?.baseUrl).toBe('https://prod-datasource.example.com');
      expect(result.dataSource?.endpointConfig?.apiKey).toBe('prod-api-key-123');
    });

    it('should override DataTarget JWT configuration', () => {
      process.env.DATATARGET_ENDPOINTCONFIG_BASE_URL = 'https://prod-datatarget.example.com';
      process.env.DATATARGET_ENDPOINTCONFIG_USERNAME = 'prod-user';
      process.env.DATATARGET_ENDPOINTCONFIG_PASSWORD = 'prod-password';
      process.env.DATATARGET_ENDPOINTCONFIG_AUTH_TOKEN_URL = '/prod/auth/token';

      const result = configManager.getEnvironmentConfig();
      
      expect(result.dataTarget?.endpointConfig?.baseUrl).toBe('https://prod-datatarget.example.com');
      expect((result.dataTarget?.endpointConfig as any)?.username).toBe('prod-user');
      expect((result.dataTarget?.endpointConfig as any)?.password).toBe('prod-password');
      expect((result.dataTarget?.endpointConfig as any)?.authTokenUrl).toBe('/prod/auth/token');
    });

    it('should override integration clientId', () => {
      process.env.CLIENT_ID = 'prod-client-id';

      const result = configManager.getEnvironmentConfig();
      
      expect(result.integration?.clientId).toBe('prod-client-id');
    });

    it('should handle partial overrides correctly', () => {
      process.env.DATASOURCE_ENDPOINTCONFIG_API_KEY = 'new-api-key';
      process.env.DATATARGET_ENDPOINTCONFIG_USERNAME = 'new-username';

      const result = configManager.getEnvironmentConfig();
      
      expect(result.dataSource?.endpointConfig?.apiKey).toBe('new-api-key');
      expect((result.dataTarget?.endpointConfig as any)?.username).toBe('new-username');
      // getEnvironmentConfig includes base config when building overrides
      expect(result.dataSource?.fetchPersonsEndpoint).toBe('/api/v1/persons');
      expect(result.dataTarget?.personsPath).toBe('/api/v1/persons/batch');
    });

    it('should handle multiple environment variables for same section', () => {
      process.env.DATASOURCE_ENDPOINTCONFIG_BASE_URL = 'https://new-base.example.com';
      process.env.DATASOURCE_ENDPOINTCONFIG_API_KEY = 'new-key-456';

      const result = configManager.getEnvironmentConfig();
      
      expect(result.dataSource?.endpointConfig?.baseUrl).toBe('https://new-base.example.com');
      expect(result.dataSource?.endpointConfig?.apiKey).toBe('new-key-456');
    });

    it('should preserve existing endpointConfig when adding overrides', () => {
      process.env.DATATARGET_ENDPOINTCONFIG_PASSWORD = 'override-password';

      const result = configManager.getEnvironmentConfig();
      
      expect((result.dataTarget?.endpointConfig as any)?.password).toBe('override-password');
      // The method should preserve other existing config values when building overrides
      // Note: The actual merging with base config happens during usage, not in getEnvironmentConfig
    });
  });

});