import { DeltaStrategyFactory } from '../src/delta-strategy/DeltaStrategyFactory';
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
    executionMode: 'people',
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

      const result = DeltaStrategyFactory.createStrategy({ config: mockConfig });

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

      expect(() => DeltaStrategyFactory.createStrategy({ config: mockConfig })).toThrow('Strategy creation failed');
    });

    it('should create strategy instances each time', () => {
      const mockStrategy1 = { name: 'MockDeltaStrategy1' };
      const mockStrategy2 = { name: 'MockDeltaStrategy2' };
      const mockCreateFileStrategy = jest.fn()
        .mockReturnValueOnce(mockStrategy1)
        .mockReturnValueOnce(mockStrategy2);
      require('integration-core').DeltaStrategyForFileSystem = mockCreateFileStrategy;

      // Call twice
      const result1 = DeltaStrategyFactory.createStrategy({ config: mockConfig });
      const result2 = DeltaStrategyFactory.createStrategy({ config: mockConfig });

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

      DeltaStrategyFactory.createStrategy({ config: fileConfig });

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

      DeltaStrategyFactory.createStrategy({ config: dbConfig });

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

      DeltaStrategyFactory.createStrategy({ config: s3Config });

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

      expect(() => DeltaStrategyFactory.createStrategy({ config: invalidConfig })).toThrow();
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

        expect(() => DeltaStrategyFactory.createStrategy({ config: invalidFileConfig }))
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

        expect(() => DeltaStrategyFactory.createStrategy({ config: invalidFileConfig }))
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

        expect(() => DeltaStrategyFactory.createStrategy({ config: validFileConfig })).not.toThrow();
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

        expect(() => DeltaStrategyFactory.createStrategy({ config: invalidDbConfig }))
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

        expect(() => DeltaStrategyFactory.createStrategy({ config: invalidDbConfig }))
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

        expect(() => DeltaStrategyFactory.createStrategy({ config: validDbConfig })).not.toThrow();
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

        expect(() => DeltaStrategyFactory.createStrategy({ config: invalidS3Config }))
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

        expect(() => DeltaStrategyFactory.createStrategy({ config: invalidS3Config }))
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

        expect(() => DeltaStrategyFactory.createStrategy({ config: validS3Config })).not.toThrow();
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

        expect(() => DeltaStrategyFactory.createStrategy({ config: unsupportedConfig }))
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

        expect(() => DeltaStrategyFactory.createStrategy({ config: mismatchConfig }))
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

        expect(() => DeltaStrategyFactory.createStrategy({ config: mismatchConfig }))
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

        expect(() => DeltaStrategyFactory.createStrategy({ config: mismatchConfig }))
          .toThrow('Invalid file storage configuration');
      });
    });
  });

  describe('lookupPersonInTargetSystemCache parameter', () => {
    let mockStrategy: any;
    let mockCreateFileStrategy: jest.Mock;

    beforeEach(() => {
      mockStrategy = {
        name: 'MockDeltaStrategy',
        parms: { clientId: 'test', config: {} },
        storage: {
          readCurrentInput: jest.fn(),
          readPreviousInput: jest.fn(),
          writeCurrentInput: jest.fn(),
          writeDelta: jest.fn()
        },
        computeDelta: jest.fn()
      };
      mockCreateFileStrategy = jest.fn().mockReturnValue(mockStrategy);
      require('integration-core').DeltaStrategyForFileSystem = mockCreateFileStrategy;
    });

    it('should pass cache function to UpsertDeltaStrategy when bulkReset is true', () => {
      const mockCacheLookup = jest.fn();
      
      const result = DeltaStrategyFactory.createStrategy({
        config: mockConfig,
        bulkReset: true,
        lookupPersonInTargetSystemCache: mockCacheLookup
      });

      // Result should be wrapped in UpsertDeltaStrategy
      expect(result).toBeDefined();
      expect(result.constructor.name).toBe('UpsertDeltaStrategy');
    });

    it('should NOT wrap with UpsertDeltaStrategy when bulkReset is false', () => {
      const mockCacheLookup = jest.fn();
      
      const result = DeltaStrategyFactory.createStrategy({
        config: mockConfig,
        bulkReset: false,
        lookupPersonInTargetSystemCache: mockCacheLookup
      });

      // Result should be the base strategy, not wrapped
      expect(result).toBe(mockStrategy);
      expect(result.constructor.name).not.toBe('UpsertDeltaStrategy');
    });

    it('should create UpsertDeltaStrategy without cache function when only bulkReset is true', () => {
      const result = DeltaStrategyFactory.createStrategy({
        config: mockConfig,
        bulkReset: true
        // No lookupPersonInTargetSystemCache provided
      });

      // Should still wrap with UpsertDeltaStrategy (cache is optional)
      expect(result).toBeDefined();
      expect(result.constructor.name).toBe('UpsertDeltaStrategy');
    });

    it('should ignore cache function when bulkReset is false', () => {
      const mockCacheLookup = jest.fn();
      
      const result = DeltaStrategyFactory.createStrategy({
        config: mockConfig,
        bulkReset: false,
        lookupPersonInTargetSystemCache: mockCacheLookup
      });

      // Cache function should be ignored since bulkReset is false
      expect(result).toBe(mockStrategy);
    });

    it('should accept async cache function', () => {
      const mockCacheLookup = jest.fn().mockResolvedValue('SRC001');
      
      const result = DeltaStrategyFactory.createStrategy({
        config: mockConfig,
        bulkReset: true,
        lookupPersonInTargetSystemCache: mockCacheLookup
      });

      expect(result).toBeDefined();
      expect(result.constructor.name).toBe('UpsertDeltaStrategy');
    });

    it('should handle cache function that returns null', () => {
      const mockCacheLookup = jest.fn().mockResolvedValue(null);
      
      const result = DeltaStrategyFactory.createStrategy({
        config: mockConfig,
        bulkReset: true,
        lookupPersonInTargetSystemCache: mockCacheLookup
      });

      expect(result).toBeDefined();
      expect(result.constructor.name).toBe('UpsertDeltaStrategy');
    });

    it('should handle cache function that accepts FieldSet', () => {
      const mockCacheLookup = jest.fn().mockImplementation(async (person: any) => {
        if (typeof person === 'object' && person.fieldValues) {
          return 'SRC001';
        }
        return null;
      });
      
      const result = DeltaStrategyFactory.createStrategy({
        config: mockConfig,
        bulkReset: true,
        lookupPersonInTargetSystemCache: mockCacheLookup
      });

      expect(result).toBeDefined();
    });

    it('should handle cache function that accepts string', () => {
      const mockCacheLookup = jest.fn().mockImplementation(async (person: any) => {
        if (typeof person === 'string') {
          return person;
        }
        return null;
      });
      
      const result = DeltaStrategyFactory.createStrategy({
        config: mockConfig,
        bulkReset: true,
        lookupPersonInTargetSystemCache: mockCacheLookup
      });

      expect(result).toBeDefined();
    });
  });

  describe('bulkReset wrapping with chunkId', () => {
    let mockStrategy: any;
    let mockCreateFileStrategy: jest.Mock;

    beforeEach(() => {
      mockStrategy = {
        name: 'MockDeltaStrategy',
        parms: { clientId: 'test', config: {} },
        storage: {
          readCurrentInput: jest.fn(),
          readPreviousInput: jest.fn(),
          writeCurrentInput: jest.fn(),
          writeDelta: jest.fn()
        },
        computeDelta: jest.fn()
      };
      mockCreateFileStrategy = jest.fn().mockReturnValue(mockStrategy);
      require('integration-core').DeltaStrategyForFileSystem = mockCreateFileStrategy;
    });

    it('should wrap with ChunkedDeltaStrategy first, then UpsertDeltaStrategy', () => {
      const configWithIntegratedClient = {
        ...mockConfig,
        integratedDeltaClientId: 'shared-client'
      } as any;

      const result = DeltaStrategyFactory.createStrategy({
        config: configWithIntegratedClient,
        chunkId: 'chunk-001',
        bulkReset: true
      });

      // Should be wrapped with UpsertDeltaStrategy (outer wrapper)
      expect(result).toBeDefined();
      expect(result.constructor.name).toBe('UpsertDeltaStrategy');
    });

    it('should only wrap with UpsertDeltaStrategy when chunkId provided without integratedDeltaClientId', () => {
      const result = DeltaStrategyFactory.createStrategy({
        config: mockConfig,
        chunkId: 'chunk-001',
        bulkReset: true
      });

      expect(result).toBeDefined();
      expect(result.constructor.name).toBe('UpsertDeltaStrategy');
    });
  });
});