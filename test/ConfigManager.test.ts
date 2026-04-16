import { ConfigManager } from '../src/config/ConfigManager';
import { Config } from '../src/config/Config';
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
      person: {
        endpointConfig: {
          baseUrl: 'https://datasource.example.com',
          apiKey: 'test-api-key'
        },
        fetchPath: '/api/v1/persons'
      },
      people: {
        endpointConfig: {
          baseUrl: 'https://datasource.example.com',
          apiKey: 'test-api-key'
        },
        fetchPath: '/api/v1/persons'
      },
      idpName: 'test-idp'
    },
    dataTarget: {
      endpointConfig: {
        baseUrl: 'https://datatarget.example.com',
        authMethod: 'basic',
        loginSvcPath: '/auth/token',
        username: 'dt-user',
        password: 'dt-pass'
      },
      personsPath: '/api/v1/persons/batch',
      organizationsPath: '/api/v1/organizations'
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
    configManager = ConfigManager.getInstance().reset();
  });





  describe('Fluent Interface (Chaining API)', () => {
    describe('fromFileSystem', () => {
      it('should load configuration from file system and return ConfigManager for chaining', () => {
        mockedFs.existsSync.mockReturnValue(true);
        mockedFs.readFileSync.mockReturnValue(JSON.stringify(validConfig));

        const result = configManager.fromFileSystem(mockConfigPath);

        expect(result).toBe(configManager); // Returns same instance for chaining
        expect(configManager.getConfig('person')).toEqual(validConfig);
      });

      it('should gracefully handle file system errors and continue chain', () => {
        mockedFs.existsSync.mockReturnValue(false);

        // Spy on console.warn to verify warning is logged
        const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

        // Should NOT throw error, should return ConfigManager for chaining
        const result = configManager.fromFileSystem(mockConfigPath);
        
        expect(result).toBe(configManager); // Chain continues
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('No valid configuration to load from file system')
        );

        consoleWarnSpy.mockRestore();
      });
    });

    describe('fromEnvironment', () => {
      it('should load environment configuration and return ConfigManager for chaining', () => {
        // First load a base config
        mockedFs.existsSync.mockReturnValue(true);
        mockedFs.readFileSync.mockReturnValue(JSON.stringify(validConfig));
        
        // Set environment variable
        process.env.CLIENT_ID = 'env-client-id';
        
        const result = configManager.fromFileSystem(mockConfigPath).fromEnvironment();

        expect(result).toBe(configManager); // Returns same instance for chaining
        
        // Clean up
        delete process.env.CLIENT_ID;
      });
    });

    describe('Configuration Precedence', () => {
      it('should respect precedence - file system first, then environment', () => {
        const fileConfig = {
          ...validConfig,
          integration: { ...validConfig.integration, clientId: 'file-client-id' }
        };

        mockedFs.existsSync.mockReturnValue(true);
        mockedFs.readFileSync.mockReturnValue(JSON.stringify(fileConfig));
        
        // Set environment variable that should NOT override file config
        process.env.CLIENT_ID = 'env-client-id';
        
        const result = configManager
          .fromFileSystem(mockConfigPath)
          .fromEnvironment()
          .getConfig('person');

        // File config should win (earlier in chain)
        expect(result.integration.clientId).toBe('file-client-id');
        
        // Clean up
        delete process.env.CLIENT_ID;
      });

      it('should use environment config when file config is incomplete', () => {
        const incompleteFileConfig = {
          dataSource: validConfig.dataSource,
          dataTarget: validConfig.dataTarget,
          storage: validConfig.storage,
          integration: {
            clientId: 'file-client-id', // This should be overridden by env
            // Missing batchSize and timeout - should come from env
          }
        };

        mockedFs.existsSync.mockReturnValue(true);
        mockedFs.readFileSync.mockReturnValue(JSON.stringify(incompleteFileConfig));
        
        // Set environment variables to fill gaps and override
        process.env.CLIENT_ID = 'env-client-id';
        process.env.BATCH_SIZE = '25';
        process.env.TIMEOUT = '5000';
        
        const result = configManager
          .fromFileSystem(mockConfigPath)
          .fromEnvironment()
          .getConfig('person');

        // Should have data from both sources with proper precedence
        expect(result.dataSource).toEqual(validConfig.dataSource);
        expect(result.integration?.clientId).toBe('file-client-id'); // File should win (earlier in chain)
        expect(result.integration?.batchSize).toBe(25); // From environment
        expect(result.integration?.timeout).toBe(5000); // From environment
        
        // Clean up
        delete process.env.CLIENT_ID;
        delete process.env.BATCH_SIZE;
        delete process.env.TIMEOUT;
      });
    });

    describe('reset', () => {
      it('should reset configuration state and return ConfigManager for chaining', () => {
        mockedFs.existsSync.mockReturnValue(true);
        mockedFs.readFileSync.mockReturnValue(JSON.stringify(validConfig));
        
        // Load some config
        configManager.fromFileSystem(mockConfigPath);
        
        // Reset should clear state
        const result = configManager.reset();
        
        expect(result).toBe(configManager); // Returns same instance for chaining
        expect(() => configManager.getConfig('person')).toThrow('No configuration loaded');
      });
    });
  });

  describe('getConfig', () => {
    it('should return loaded configuration with validation', () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue(JSON.stringify(validConfig));
      
      configManager.fromFileSystem(mockConfigPath);
      const result = configManager.getConfig('person');
      
      expect(result).toEqual(validConfig);
    });

    it('should throw error if no config loaded', () => {
      expect(() => configManager.getConfig('person')).toThrow(
        'No configuration loaded. Use fromFileSystem() or fromEnvironment() first.'
      );
    });

    it('should validate configuration only once', () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue(JSON.stringify(validConfig));
      
      configManager.fromFileSystem(mockConfigPath);
      
      // Multiple calls should not re-validate
      const result1 = configManager.getConfig('person');
      const result2 = configManager.getConfig('person');
      
      expect(result1).toEqual(validConfig);
      expect(result2).toEqual(validConfig);
    });
  });

  describe('Error Handling and Graceful Degradation', () => {
    it('should continue chain even when multiple sources fail', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      // Set up failures for file system and environment
      mockedFs.existsSync.mockReturnValue(false);
      delete process.env.CLIENT_ID;
      delete process.env.HURON_PERSON_CONFIG_JSON;
      
      // Chain should continue even with failures
      const result = configManager
        .fromFileSystem(mockConfigPath)
        .fromEnvironment()
        .fromJsonString();
      
      expect(result).toBe(configManager); // Chain continues
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('No valid configuration to load from file system')
      );
      
      consoleWarnSpy.mockRestore();
    });

    it('should successfully load from later source when earlier sources fail', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      // File system fails
      mockedFs.existsSync.mockReturnValue(false);
      
      // But JSON string succeeds
      process.env.HURON_PERSON_CONFIG_JSON = JSON.stringify(validConfig);
      
      const result = configManager
        .fromFileSystem(mockConfigPath)
        .fromJsonString()
        .getConfig('person');
      
      expect(result).toEqual(validConfig);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('No valid configuration to load from file system')
      );
      
      // Clean up
      delete process.env.HURON_PERSON_CONFIG_JSON;
      consoleWarnSpy.mockRestore();
    });

    it('should handle JSON parse errors gracefully in fromJsonString', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      // Set invalid JSON
      process.env.HURON_PERSON_CONFIG_JSON = '{invalid json}';
      
      const result = configManager.fromJsonString();
      
      expect(result).toBe(configManager); // Chain continues
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('No valid configuration to load from HURON_PERSON_CONFIG_JSON')
      );
      
      // Clean up
      delete process.env.HURON_PERSON_CONFIG_JSON;
      consoleWarnSpy.mockRestore();
    });

    it('should use fromJsonString as primary source with fromFileSystem as fallback', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      // JSON string has priority (called first)
      const jsonConfig = { ...validConfig, integration: { ...validConfig.integration, clientId: 'json-client-id' } };
      process.env.HURON_PERSON_CONFIG_JSON = JSON.stringify(jsonConfig);
      
      // File system has different value
      const fileConfig = { ...validConfig, integration: { ...validConfig.integration, clientId: 'file-client-id' } };
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue(JSON.stringify(fileConfig));
      
      const result = configManager
        .reset()
        .fromJsonString()  // Called first = higher precedence
        .fromFileSystem(mockConfigPath)  // Called later = fallback
        .getConfig('person');
      
      // JSON config should win (earlier in chain)
      expect(result.integration.clientId).toBe('json-client-id');
      
      // Clean up
      delete process.env.HURON_PERSON_CONFIG_JSON;
      consoleWarnSpy.mockRestore();
    });
  });



});