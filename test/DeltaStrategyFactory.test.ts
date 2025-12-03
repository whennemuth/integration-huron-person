import { DeltaStrategyFactory } from '../src/DeltaStrategyFactory';
import { Config } from '../src/config/Config';

// Mock integration-core
jest.mock('integration-core', () => ({
  DeltaStrategyFactory: {
    create: jest.fn()
  }
}));

describe('DeltaStrategyFactory', () => {
  const mockConfig: Config = {
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
      clientId: 'test-client',
      batchSize: 10,
      timeout: 5000
    },
    storage: {
      type: 'file',
      config: {
        path: './test-data'
      }
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createStrategy', () => {
    it('should create delta strategy with correct parameters', () => {
      const mockStrategy = { name: 'MockDeltaStrategy' };
      const mockCreateFileStrategy = jest.fn().mockReturnValue(mockStrategy);
      require('integration-core').DeltaStrategyForFileSystem = mockCreateFileStrategy;

      const result = DeltaStrategyFactory.createStrategy(mockConfig);

      expect(mockCreateFileStrategy).toHaveBeenCalledWith({
        clientId: mockConfig.integration.clientId,
        config: mockConfig.storage.config
      });
      expect(result).toBe(mockStrategy);
    });

    it('should propagate errors from core factory', () => {
      const error = new Error('Strategy creation failed');
      const mockCreateFileStrategy = jest.fn().mockImplementation(() => { throw error; });
      require('integration-core').DeltaStrategyForFileSystem = mockCreateFileStrategy;

      expect(() => DeltaStrategyFactory.createStrategy(mockConfig)).toThrow('Strategy creation failed');
    });

    it('should create strategy instances each time', () => {
      const mockStrategy1 = { name: 'MockDeltaStrategy1' };
      const mockStrategy2 = { name: 'MockDeltaStrategy2' };
      const mockCreateFileStrategy = jest.fn()
        .mockReturnValueOnce(mockStrategy1)
        .mockReturnValueOnce(mockStrategy2);
      require('integration-core').DeltaStrategyForFileSystem = mockCreateFileStrategy;

      // Call twice
      const result1 = DeltaStrategyFactory.createStrategy(mockConfig);
      const result2 = DeltaStrategyFactory.createStrategy(mockConfig);

      expect(mockCreateFileStrategy).toHaveBeenCalledTimes(2);
      expect(result1).toBe(mockStrategy1);
      expect(result2).toBe(mockStrategy2);
    });
  });

  describe('storage configuration handling', () => {
    it('should handle file storage configuration', () => {
      const fileConfig = {
        ...mockConfig,
        storage: {
          type: 'file' as const,
          config: {
            path: './custom-file-path'
          }
        }
      };

      const mockStrategy = { name: 'MockDeltaStrategy' };
      const mockCreateFileStrategy = jest.fn().mockReturnValue(mockStrategy);
      require('integration-core').DeltaStrategyForFileSystem = mockCreateFileStrategy;

      DeltaStrategyFactory.createStrategy(fileConfig);

      expect(mockCreateFileStrategy).toHaveBeenCalledWith({
        clientId: fileConfig.integration.clientId,
        config: fileConfig.storage.config
      });
    });

    it('should handle database storage configuration', () => {
      const dbConfig = {
        ...mockConfig,
        storage: {
          type: 'database' as const,
          config: {
            type: 'postgresql' as const,
            host: 'localhost',
            port: 5432,
            username: 'db_user',
            password: 'db_pass',
            database: 'test_db'
          }
        }
      };

      const mockStrategy = { name: 'MockDeltaStrategy' };
      const mockCreateDbStrategy = jest.fn().mockReturnValue(mockStrategy);
      require('integration-core').DeltaStrategyForDatabase = mockCreateDbStrategy;

      DeltaStrategyFactory.createStrategy(dbConfig);

      expect(mockCreateDbStrategy).toHaveBeenCalledWith({
        clientId: dbConfig.integration.clientId,
        config: dbConfig.storage.config
      });
    });

    it('should handle S3 storage configuration', () => {
      const s3Config = {
        ...mockConfig,
        storage: {
          type: 's3' as const,
          config: {
            bucketName: 'test-bucket',
            keyPrefix: 'huron-data/',
            region: 'us-west-2'
          }
        }
      };

      const mockStrategy = { name: 'MockDeltaStrategy' };
      const mockCreateS3Strategy = jest.fn().mockReturnValue(mockStrategy);
      require('integration-core').DeltaStrategyForS3Bucket = mockCreateS3Strategy;

      DeltaStrategyFactory.createStrategy(s3Config);

      expect(mockCreateS3Strategy).toHaveBeenCalledWith({
        clientId: s3Config.integration.clientId,
        config: s3Config.storage.config
      });
    });
  });

  describe('error handling', () => {
    it('should handle invalid configuration gracefully', () => {
      const invalidConfig = {
        ...mockConfig,
        dataSource: {
          ...mockConfig.dataSource,
          endpointConfig: {
            ...mockConfig.dataSource.endpointConfig,
            baseUrl: '' // Invalid empty URL
          }
        }
      };

      // This might throw during DataSource construction or during strategy creation
      // depending on validation implementation
      const error = new Error('Invalid configuration');
      const mockCreateFileStrategy = jest.fn().mockImplementation(() => { throw error; });
      require('integration-core').DeltaStrategyForFileSystem = mockCreateFileStrategy;

      expect(() => DeltaStrategyFactory.createStrategy(invalidConfig)).toThrow();
    });
  });
});