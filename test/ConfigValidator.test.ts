import { ConfigValidator } from '../src/config/ConfigValidator';
import { Config } from '../src/config/Config';

describe('ConfigValidator', () => {
  const getValidConfig = (): Config => ({
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
  });

  describe('isValid', () => {
    it('should return true for valid configuration', () => {
      const validator = new ConfigValidator(getValidConfig());
      expect(validator.isValid()).toBe(true);
    });

    it('should return false for invalid configuration', () => {
      const invalidConfig = getValidConfig();
      delete (invalidConfig as any).dataSource;
      
      const validator = new ConfigValidator(invalidConfig);
      expect(validator.isValid()).toBe(false);
    });
  });

  describe('validateConfig', () => {
    it('should validate complete configuration successfully', () => {
      const validator = new ConfigValidator(getValidConfig());
      expect(() => validator.validateConfig()).not.toThrow();
    });

    describe('dataSource validation', () => {
      it('should throw error when dataSource is missing', () => {
        const config = getValidConfig();
        delete (config as any).dataSource;
        
        const validator = new ConfigValidator(config);
        expect(() => validator.validateConfig()).toThrow('Missing required configuration field: dataSource.endpointConfig.baseUrl');
      });

      it('should throw error when dataSource baseUrl is missing', () => {
        const config = getValidConfig();
        delete (config.dataSource.endpointConfig as any).baseUrl;
        
        const validator = new ConfigValidator(config);
        expect(() => validator.validateConfig()).toThrow('Missing required configuration field: dataSource.endpointConfig.baseUrl');
      });

      it('should throw error when dataSource apiKey is missing', () => {
        const config = getValidConfig();
        delete (config.dataSource.endpointConfig as any).apiKey;
        
        const validator = new ConfigValidator(config);
        expect(() => validator.validateConfig()).toThrow('Missing required configuration field: dataSource.endpointConfig.apiKey');
      });

      it('should throw error when fetchPersonsPath is missing', () => {
        const config = getValidConfig();
        delete (config.dataSource as any).fetchPersonsPath;
        
        const validator = new ConfigValidator(config);
        expect(() => validator.validateConfig()).toThrow('Missing required configuration field: dataSource.fetchPersonsPath');
      });

      it('should throw error for invalid dataSource baseUrl', () => {
        const config = getValidConfig();
        config.dataSource.endpointConfig.baseUrl = 'invalid-url';
        
        const validator = new ConfigValidator(config);
        expect(() => validator.validateConfig()).toThrow('Invalid baseUrl in dataSource or dataTarget endpointConfig');
      });
    });

    describe('dataTarget validation', () => {
      it('should throw error when dataTarget is missing', () => {
        const config = getValidConfig();
        delete (config as any).dataTarget;
        
        const validator = new ConfigValidator(config);
        expect(() => validator.validateConfig()).toThrow('Missing required configuration field: dataTarget.endpointConfig.baseUrl');
      });

      it('should throw error when dataTarget baseUrl is missing', () => {
        const config = getValidConfig();
        delete (config.dataTarget.endpointConfig as any).baseUrl;
        
        const validator = new ConfigValidator(config);
        expect(() => validator.validateConfig()).toThrow('Missing required configuration field: dataTarget.endpointConfig.baseUrl');
      });

      it('should throw error when authMethod is missing', () => {
        const config = getValidConfig();
        delete (config.dataTarget.endpointConfig as any).authMethod;
        
        const validator = new ConfigValidator(config);
        expect(() => validator.validateConfig()).toThrow('Missing required configuration field: dataTarget.endpointConfig.authMethod');
      });

      it('should throw error for invalid authMethod', () => {
        const config = getValidConfig();
        (config.dataTarget.endpointConfig as any).authMethod = 'invalid';
        
        const validator = new ConfigValidator(config);
        expect(() => validator.validateConfig()).toThrow('Invalid authMethod: invalid. Must be \'basic\' or \'externalToken\'');
      });

      it('should throw error when personsPath is missing', () => {
        const config = getValidConfig();
        delete (config.dataTarget as any).personsPath;
        
        const validator = new ConfigValidator(config);
        expect(() => validator.validateConfig()).toThrow('Missing required configuration field: dataTarget.personsPath');
      });

      it('should throw error for invalid dataTarget baseUrl', () => {
        const config = getValidConfig();
        config.dataTarget.endpointConfig.baseUrl = 'invalid-url';
        
        const validator = new ConfigValidator(config);
        expect(() => validator.validateConfig()).toThrow('Invalid baseUrl in dataSource or dataTarget endpointConfig');
      });

      describe('basic auth validation', () => {
        it('should validate basic auth configuration successfully', () => {
          const config = getValidConfig();
          config.dataTarget.endpointConfig = {
            baseUrl: 'https://datatarget.example.com',
            authMethod: 'basic',
            loginSvcPath: '/auth/token',
            username: 'test-user',
            password: 'test-pass'
          };
          
          const validator = new ConfigValidator(config);
          expect(() => validator.validateConfig()).not.toThrow();
        });

        it('should throw error when loginSvcPath is missing for basic auth', () => {
          const config = getValidConfig();
          config.dataTarget.endpointConfig = {
            baseUrl: 'https://datatarget.example.com',
            authMethod: 'basic',
            username: 'test-user',
            password: 'test-pass'
          } as any;
          
          const validator = new ConfigValidator(config);
          expect(() => validator.validateConfig()).toThrow('Missing required configuration field: dataTarget.endpointConfig.loginSvcPath');
        });

        it('should throw error when username is missing for basic auth', () => {
          const config = getValidConfig();
          config.dataTarget.endpointConfig = {
            baseUrl: 'https://datatarget.example.com',
            authMethod: 'basic',
            loginSvcPath: '/auth/token',
            password: 'test-pass'
          } as any;
          
          const validator = new ConfigValidator(config);
          expect(() => validator.validateConfig()).toThrow('Missing required configuration field: dataTarget.endpointConfig.username');
        });

        it('should throw error when password is missing for basic auth', () => {
          const config = getValidConfig();
          config.dataTarget.endpointConfig = {
            baseUrl: 'https://datatarget.example.com',
            authMethod: 'basic',
            loginSvcPath: '/auth/token',
            username: 'test-user'
          } as any;
          
          const validator = new ConfigValidator(config);
          expect(() => validator.validateConfig()).toThrow('Missing required configuration field: dataTarget.endpointConfig.password');
        });
      });

      describe('externalToken auth validation', () => {
        it('should validate externalToken auth configuration successfully', () => {
          const config = getValidConfig();
          config.dataTarget.endpointConfig = {
            baseUrl: 'https://datatarget.example.com',
            authMethod: 'externalToken',
            externalToken: 'test-token',
            userId: 'test-user-id'
          };
          
          const validator = new ConfigValidator(config);
          expect(() => validator.validateConfig()).not.toThrow();
        });

        it('should throw error when externalToken is missing for externalToken auth', () => {
          const config = getValidConfig();
          config.dataTarget.endpointConfig = {
            baseUrl: 'https://datatarget.example.com',
            authMethod: 'externalToken',
            userId: 'test-user-id'
          } as any;
          
          const validator = new ConfigValidator(config);
          expect(() => validator.validateConfig()).toThrow('Missing required configuration field: dataTarget.endpointConfig.externalToken');
        });

        it('should throw error when userId is missing for externalToken auth', () => {
          const config = getValidConfig();
          config.dataTarget.endpointConfig = {
            baseUrl: 'https://datatarget.example.com',
            authMethod: 'externalToken',
            externalToken: 'test-token'
          } as any;
          
          const validator = new ConfigValidator(config);
          expect(() => validator.validateConfig()).toThrow('Missing required configuration field: dataTarget.endpointConfig.userId');
        });
      });
    });

    describe('integration validation', () => {
      it('should throw error when integration is missing', () => {
        const config = getValidConfig();
        delete (config as any).integration;
        
        const validator = new ConfigValidator(config);
        expect(() => validator.validateConfig()).toThrow('Missing required configuration field: integration.clientId');
      });

      it('should throw error when clientId is missing', () => {
        const config = getValidConfig();
        delete (config.integration as any).clientId;
        
        const validator = new ConfigValidator(config);
        expect(() => validator.validateConfig()).toThrow('Missing required configuration field: integration.clientId');
      });
    });

    describe('storage validation', () => {
      it('should throw error when storage is missing', () => {
        const config = getValidConfig();
        delete (config as any).storage;
        
        const validator = new ConfigValidator(config);
        expect(() => validator.validateConfig()).toThrow('Missing required configuration field: storage.type');
      });

      it('should throw error when storage type is missing', () => {
        const config = getValidConfig();
        delete (config.storage as any).type;
        
        const validator = new ConfigValidator(config);
        expect(() => validator.validateConfig()).toThrow('Missing required configuration field: storage.type');
      });

      it('should throw error when storage config is missing', () => {
        const config = getValidConfig();
        delete (config.storage as any).config;
        
        const validator = new ConfigValidator(config);
        expect(() => validator.validateConfig()).toThrow('Missing required configuration field: storage.config');
      });

      describe('file storage validation', () => {
        it('should validate file storage configuration successfully', () => {
          const config = getValidConfig();
          config.storage = {
            type: 'file',
            config: {
              path: './data/storage'
            }
          };
          
          const validator = new ConfigValidator(config);
          expect(() => validator.validateConfig()).not.toThrow();
        });

        it('should throw error when file storage path is missing', () => {
          const config = getValidConfig();
          config.storage = {
            type: 'file',
            config: {} as any
          };
          
          const validator = new ConfigValidator(config);
          expect(() => validator.validateConfig()).toThrow('File storage requires path configuration');
        });
      });

      describe('database storage validation', () => {
        it('should validate sqlite database storage configuration successfully', () => {
          const config = getValidConfig();
          config.storage = {
            type: 'database',
            config: {
              type: 'sqlite',
              filename: 'test.db'
            }
          };
          
          const validator = new ConfigValidator(config);
          expect(() => validator.validateConfig()).not.toThrow();
        });

        it('should validate postgresql database storage configuration successfully', () => {
          const config = getValidConfig();
          config.storage = {
            type: 'database',
            config: {
              type: 'postgresql',
              host: 'localhost',
              port: 5432,
              database: 'testdb'
            }
          };
          
          const validator = new ConfigValidator(config);
          expect(() => validator.validateConfig()).not.toThrow();
        });

        it('should throw error when database type is missing', () => {
          const config = getValidConfig();
          config.storage = {
            type: 'database',
            config: {
              host: 'localhost'
            } as any
          };
          
          const validator = new ConfigValidator(config);
          expect(() => validator.validateConfig()).toThrow('Database storage requires type configuration');
        });

        it('should throw error when sqlite filename and database are both missing', () => {
          const config = getValidConfig();
          config.storage = {
            type: 'database',
            config: {
              type: 'sqlite'
            }
          };
          
          const validator = new ConfigValidator(config);
          expect(() => validator.validateConfig()).toThrow('SQLite requires filename or database configuration');
        });

        it('should throw error when non-sqlite database host is missing', () => {
          const config = getValidConfig();
          config.storage = {
            type: 'database',
            config: {
              type: 'postgresql',
              database: 'testdb'
            }
          };
          
          const validator = new ConfigValidator(config);
          expect(() => validator.validateConfig()).toThrow('Non-SQLite databases require host configuration');
        });
      });

      describe('s3 storage validation', () => {
        it('should validate s3 storage configuration successfully', () => {
          const config = getValidConfig();
          config.storage = {
            type: 's3',
            config: {
              bucketName: 'test-bucket',
              region: 'us-east-1'
            }
          };
          
          const validator = new ConfigValidator(config);
          expect(() => validator.validateConfig()).not.toThrow();
        });

        it('should throw error when s3 bucketName is missing', () => {
          const config = getValidConfig();
          config.storage = {
            type: 's3',
            config: {
              region: 'us-east-1'
            } as any
          };
          
          const validator = new ConfigValidator(config);
          expect(() => validator.validateConfig()).toThrow('S3 storage requires bucketName configuration');
        });
      });

      it('should throw error for unsupported storage type', () => {
        const config = getValidConfig();
        (config as any).storage = {
          type: 'unsupported',
          config: {}
        };
        
        const validator = new ConfigValidator(config);
        expect(() => validator.validateConfig()).toThrow('Unsupported storage type: unsupported');
      });
    });
  });
});