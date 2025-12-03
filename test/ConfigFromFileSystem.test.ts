import { ConfigFromFileSystem } from '../src/config/ConfigFromFileSystem';
import { Config } from '../src/config/Config';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs module
jest.mock('fs');
const mockedFs = fs as jest.Mocked<typeof fs>;

describe('ConfigFromFileSystem', () => {
  let configLoader: ConfigFromFileSystem;
  const mockConfigPath = '/test/config.json';
  
  const validConfig: Config = {
    dataSource: {
      endpointConfig: {
        baseUrl: 'https://datasource.example.com',
        apiKey: 'test-api-key'
      },
      fetchPersonsPath: '/api/v1/persons'
    },
    dataTarget: {
      endpointConfig: {
        baseUrl: 'https://datatarget.example.com',
        authMethod: 'basic',
        loginSvcPath: '/auth/token',
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
    configLoader = new ConfigFromFileSystem();
  });

  describe('loadConfig', () => {
    it('should load valid configuration successfully', () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue(JSON.stringify(validConfig));

      const result = configLoader.loadConfig(mockConfigPath);

      expect(result).toEqual(validConfig);
      expect(mockedFs.existsSync).toHaveBeenCalledWith(path.resolve(mockConfigPath));
      expect(mockedFs.readFileSync).toHaveBeenCalledWith(path.resolve(mockConfigPath), 'utf-8');
    });

    it('should use default config path when none provided', () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue(JSON.stringify(validConfig));

      const result = configLoader.loadConfig();

      expect(result).toEqual(validConfig);
      expect(mockedFs.existsSync).toHaveBeenCalledWith(path.resolve('./config.json'));
      expect(mockedFs.readFileSync).toHaveBeenCalledWith(path.resolve('./config.json'), 'utf-8');
    });

    it('should throw error when config file does not exist', () => {
      mockedFs.existsSync.mockReturnValue(false);

      expect(() => configLoader.loadConfig(mockConfigPath)).toThrow(
        'Configuration file not found at:'
      );
      expect(mockedFs.existsSync).toHaveBeenCalledWith(path.resolve(mockConfigPath));
    });

    it('should throw error when config file contains invalid JSON', () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue('invalid json content');

      expect(() => configLoader.loadConfig(mockConfigPath)).toThrow(
        'Failed to load configuration from file system:'
      );
    });

    it('should handle file read errors gracefully', () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      expect(() => configLoader.loadConfig(mockConfigPath)).toThrow(
        'Failed to load configuration from file system: Error: Permission denied'
      );
    });

    it('should handle empty file gracefully', () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue('');

      expect(() => configLoader.loadConfig(mockConfigPath)).toThrow(
        'Failed to load configuration from file system:'
      );
    });

    it('should handle malformed JSON gracefully', () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue('{ "incomplete": json }');

      expect(() => configLoader.loadConfig(mockConfigPath)).toThrow(
        'Failed to load configuration from file system:'
      );
    });

    it('should load configuration with different file paths', () => {
      const altPath = '/custom/path/myconfig.json';
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue(JSON.stringify(validConfig));

      const result = configLoader.loadConfig(altPath);

      expect(result).toEqual(validConfig);
      expect(mockedFs.existsSync).toHaveBeenCalledWith(path.resolve(altPath));
      expect(mockedFs.readFileSync).toHaveBeenCalledWith(path.resolve(altPath), 'utf-8');
    });

    it('should handle relative paths correctly', () => {
      const relativePath = '../config/app.json';
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue(JSON.stringify(validConfig));

      const result = configLoader.loadConfig(relativePath);

      expect(result).toEqual(validConfig);
      expect(mockedFs.existsSync).toHaveBeenCalledWith(path.resolve(relativePath));
    });
  });

  describe('configFileExists', () => {
    it('should return true when file exists', () => {
      mockedFs.existsSync.mockReturnValue(true);

      const result = configLoader.configFileExists(mockConfigPath);

      expect(result).toBe(true);
      expect(mockedFs.existsSync).toHaveBeenCalledWith(path.resolve(mockConfigPath));
    });

    it('should return false when file does not exist', () => {
      mockedFs.existsSync.mockReturnValue(false);

      const result = configLoader.configFileExists(mockConfigPath);

      expect(result).toBe(false);
      expect(mockedFs.existsSync).toHaveBeenCalledWith(path.resolve(mockConfigPath));
    });

    it('should handle different file paths', () => {
      const customPath = '/custom/config.json';
      mockedFs.existsSync.mockReturnValue(true);

      const result = configLoader.configFileExists(customPath);

      expect(result).toBe(true);
      expect(mockedFs.existsSync).toHaveBeenCalledWith(path.resolve(customPath));
    });
  });

  describe('error handling', () => {
    it('should preserve file not found error messages', () => {
      mockedFs.existsSync.mockReturnValue(false);

      expect(() => configLoader.loadConfig(mockConfigPath)).toThrow(
        `Configuration file not found at: ${path.resolve(mockConfigPath)}`
      );
    });

    it('should wrap other errors with contextual message', () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockImplementation(() => {
        throw new Error('Disk error');
      });

      expect(() => configLoader.loadConfig(mockConfigPath)).toThrow(
        'Failed to load configuration from file system: Error: Disk error'
      );
    });
  });
});