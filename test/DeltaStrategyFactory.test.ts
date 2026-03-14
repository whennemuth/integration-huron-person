import { DeltaStrategyFactory } from '../src/DeltaStrategyFactory';
import { Config } from '../src/config/Config';

// Mock integration-core
jest.mock('integration-core', () => ({
  DeltaStrategyFactory: {
    create: jest.fn()
  },
  isDatabaseConfig: jest.fn((config: any) => {
    return config?.type === 'postgresql' || config?.type === 'mysql';
  }),
  isS3Config: jest.fn((config: any) => {
    return config?.bucketName !== undefined;
  })
}));

describe('DeltaStrategyFactory', () => {
  const mockConfig: Config = {
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
      }
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
          person: {
            ...mockConfig.dataSource.person!,
            endpointConfig: {
              ...mockConfig.dataSource.person!.endpointConfig,
              baseUrl: '' // Invalid empty URL
            }
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

  describe('configuration validation', () => {
    describe('file storage validation', () => {
      it('should throw error when file config is missing path', () => {
        const invalidFileConfig = {
          ...mockConfig,
          storage: {
            type: 'file' as const,
            config: {} as any // Missing path
          }
        };

        expect(() => DeltaStrategyFactory.createStrategy(invalidFileConfig))
          .toThrow('Invalid file storage configuration');
      });

      it('should throw error when file config has empty path', () => {
        const invalidFileConfig = {
          ...mockConfig,
          storage: {
            type: 'file' as const,
            config: {
              path: '' // Empty path
            }
          }
        };

        expect(() => DeltaStrategyFactory.createStrategy(invalidFileConfig))
          .toThrow('Invalid file storage configuration');
      });

      it('should accept valid file config', () => {
        const validFileConfig = {
          ...mockConfig,
          storage: {
            type: 'file' as const,
            config: {
              path: './valid-path'
            }
          }
        };

        const mockStrategy = { name: 'MockDeltaStrategy' };
        const mockCreateFileStrategy = jest.fn().mockReturnValue(mockStrategy);
        require('integration-core').DeltaStrategyForFileSystem = mockCreateFileStrategy;

        expect(() => DeltaStrategyFactory.createStrategy(validFileConfig)).not.toThrow();
      });
    });

    describe('database storage validation', () => {
      it('should throw error when database config is invalid', () => {
        const invalidDbConfig = {
          ...mockConfig,
          storage: {
            type: 'database' as const,
            config: {
              // Missing required database fields
              host: 'localhost'
            } as any
          }
        };

        // Mock isDatabaseConfig to return false for invalid config
        require('integration-core').isDatabaseConfig = jest.fn().mockReturnValue(false);

        expect(() => DeltaStrategyFactory.createStrategy(invalidDbConfig))
          .toThrow('Invalid database configuration');
      });

      it('should throw error when database config is missing type', () => {
        const invalidDbConfig = {
          ...mockConfig,
          storage: {
            type: 'database' as const,
            config: {
              host: 'localhost',
              port: 5432,
              username: 'user',
              password: 'pass',
              database: 'db'
              // Missing type field
            } as any
          }
        };

        // Mock isDatabaseConfig to return false for invalid config
        require('integration-core').isDatabaseConfig = jest.fn().mockReturnValue(false);

        expect(() => DeltaStrategyFactory.createStrategy(invalidDbConfig))
          .toThrow('Invalid database configuration');
      });

      it('should accept valid database config', () => {
        const validDbConfig = {
          ...mockConfig,
          storage: {
            type: 'database' as const,
            config: {
              type: 'postgresql' as const,
              host: 'localhost',
              port: 5432,
              username: 'user',
              password: 'pass',
              database: 'db'
            }
          }
        };

        const mockStrategy = { name: 'MockDeltaStrategy' };
        const mockCreateDbStrategy = jest.fn().mockReturnValue(mockStrategy);
        require('integration-core').DeltaStrategyForDatabase = mockCreateDbStrategy;
        require('integration-core').isDatabaseConfig = jest.fn().mockReturnValue(true);

        expect(() => DeltaStrategyFactory.createStrategy(validDbConfig)).not.toThrow();
      });
    });

    describe('S3 storage validation', () => {
      it('should throw error when S3 config is invalid', () => {
        const invalidS3Config = {
          ...mockConfig,
          storage: {
            type: 's3' as const,
            config: {
              // Missing required S3 fields
              region: 'us-west-2'
            } as any
          }
        };

        // Mock isS3Config to return false for invalid config
        require('integration-core').isS3Config = jest.fn().mockReturnValue(false);

        expect(() => DeltaStrategyFactory.createStrategy(invalidS3Config))
          .toThrow('Invalid S3 configuration');
      });

      it('should throw error when S3 config is missing bucketName', () => {
        const invalidS3Config = {
          ...mockConfig,
          storage: {
            type: 's3' as const,
            config: {
              keyPrefix: 'data/',
              region: 'us-west-2'
              // Missing bucketName
            } as any
          }
        };

        // Mock isS3Config to return false for invalid config
        require('integration-core').isS3Config = jest.fn().mockReturnValue(false);

        expect(() => DeltaStrategyFactory.createStrategy(invalidS3Config))
          .toThrow('Invalid S3 configuration');
      });

      it('should accept valid S3 config', () => {
        const validS3Config = {
          ...mockConfig,
          storage: {
            type: 's3' as const,
            config: {
              bucketName: 'test-bucket',
              keyPrefix: 'data/',
              region: 'us-west-2'
            }
          }
        };

        const mockStrategy = { name: 'MockDeltaStrategy' };
        const mockCreateS3Strategy = jest.fn().mockReturnValue(mockStrategy);
        require('integration-core').DeltaStrategyForS3Bucket = mockCreateS3Strategy;
        require('integration-core').isS3Config = jest.fn().mockReturnValue(true);

        expect(() => DeltaStrategyFactory.createStrategy(validS3Config)).not.toThrow();
      });
    });

    describe('unsupported storage type', () => {
      it('should throw error for unsupported storage type', () => {
        const unsupportedConfig = {
          ...mockConfig,
          storage: {
            type: 'redis' as any,
            config: { path: './test' } as any
          }
        };

        expect(() => DeltaStrategyFactory.createStrategy(unsupportedConfig))
          .toThrow('Unsupported storage type: redis');
      });
    });

    describe('type mismatch validation', () => {
      it('should reject file config when type is database', () => {
        const mismatchConfig = {
          ...mockConfig,
          storage: {
            type: 'database' as const,
            config: {
              path: './some-path' // File config for database type
            } as any
          }
        };

        // Mock isDatabaseConfig to return false because it's a file config
        require('integration-core').isDatabaseConfig = jest.fn().mockReturnValue(false);

        expect(() => DeltaStrategyFactory.createStrategy(mismatchConfig))
          .toThrow('Invalid database configuration');
      });

      it('should reject database config when type is file', () => {
        const mismatchConfig = {
          ...mockConfig,
          storage: {
            type: 'file' as const,
            config: {
              type: 'postgresql',
              host: 'localhost',
              port: 5432,
              username: 'user',
              password: 'pass',
              database: 'db'
            } as any
          }
        };

        expect(() => DeltaStrategyFactory.createStrategy(mismatchConfig))
          .toThrow('Invalid file storage configuration');
      });

      it('should reject S3 config when type is file', () => {
        const mismatchConfig = {
          ...mockConfig,
          storage: {
            type: 'file' as const,
            config: {
              bucketName: 'test-bucket',
              region: 'us-west-2'
            } as any
          }
        };

        expect(() => DeltaStrategyFactory.createStrategy(mismatchConfig))
          .toThrow('Invalid file storage configuration');
      });
    });
  });
});