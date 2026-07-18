import { ConfigValidator } from '../src/config/ConfigValidator';
import { Config } from '../src/config/Config';

describe('ConfigValidator', () => {
  const getValidConfig = (): Config => ({
    landscape: 'test',
    executionMode: 'person',
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
  });

  describe('isValid', () => {
    it('should return true for valid configuration', () => {
      const validator = new ConfigValidator(getValidConfig());
      expect(validator.isValid('person')).toBe(true);
    });

    it('should return false for invalid configuration', () => {
      const invalidConfig = getValidConfig();
      delete (invalidConfig as any).dataSource;
      
      const validator = new ConfigValidator(invalidConfig);
      expect(validator.isValid('person')).toBe(false);
    });
  });

  describe('validateConfig', () => {
    it('should validate complete configuration successfully', () => {
      const validator = new ConfigValidator(getValidConfig());
      expect(() => validator.validateConfig('person')).not.toThrow();
    });

    describe('dataSource validation', () => {
      it('should throw error when dataSource is missing', () => {
        const config = getValidConfig();
        delete (config as any).dataSource;
        
        const validator = new ConfigValidator(config);
        expect(() => validator.validateConfig('person')).toThrow('Missing required configuration field: dataSource.person.endpointConfig.baseUrl');
      });

      it('should throw error when dataSource person baseUrl is missing', () => {
        const config = getValidConfig();
        delete (config.dataSource as any).person.endpointConfig.baseUrl;
        
        const validator = new ConfigValidator(config);
        expect(() => validator.validateConfig('person')).toThrow('Missing required configuration field: dataSource.person.endpointConfig.baseUrl');
      });

      it('should throw error when dataSource person apiKey is missing', () => {
        const config = getValidConfig();
        delete (config.dataSource as any).person.endpointConfig.apiKey;
        
        const validator = new ConfigValidator(config);
        expect(() => validator.validateConfig('person')).toThrow('Missing required configuration field: dataSource.person.endpointConfig.apiKey');
      });

      it('should throw error when dataSource people baseUrl is missing', () => {
        const config = getValidConfig();
        delete (config.dataSource as any).people.endpointConfig.baseUrl;
        
        const validator = new ConfigValidator(config);
        expect(() => validator.validateConfig('people')).toThrow('Missing required configuration field: dataSource.people.endpointConfig.baseUrl');
      });

      it('should throw error when dataSource people apiKey is missing', () => {
        const config = getValidConfig();
        delete (config.dataSource as any).people.endpointConfig.apiKey;
        
        const validator = new ConfigValidator(config);
        expect(() => validator.validateConfig('people')).toThrow('Missing required configuration field: dataSource.people.endpointConfig.apiKey');
      });

      it('should throw error when person fetchPath is missing', () => {
        const config = getValidConfig();
        delete (config.dataSource.person as any).fetchPath;
        
        const validator = new ConfigValidator(config);
        expect(() => validator.validateConfig('person')).toThrow('Missing required configuration field: dataSource.person.fetchPath');
      });

      it('should throw error when people fetchPath is missing', () => {
        const config = getValidConfig();
        delete (config.dataSource.people as any).fetchPath;
        
        const validator = new ConfigValidator(config);
        expect(() => validator.validateConfig('people')).toThrow('Missing required configuration field: dataSource.people.fetchPath');
      });

      it('should throw error for invalid dataSource person baseUrl', () => {
        const config = getValidConfig();
        config.dataSource.person!.endpointConfig.baseUrl = 'invalid-url';
        
        const validator = new ConfigValidator(config);
        expect(() => validator.validateConfig('person')).toThrow('Invalid baseUrl in dataSource or dataTarget endpointConfig');
      });

      it('should throw error for invalid dataSource people baseUrl', () => {
        const config = getValidConfig();
        // Type guard: ensure we're working with API-based config
        if (config.dataSource.people && 'endpointConfig' in config.dataSource.people) {
          config.dataSource.people.endpointConfig.baseUrl = 'invalid-url';
        }
        
        const validator = new ConfigValidator(config);
        expect(() => validator.validateConfig('people')).toThrow('Invalid baseUrl in dataSource or dataTarget endpointConfig');
      });

      it('should throw error when dataSource terms baseUrl is missing', () => {
        const config = getValidConfig();
        config.dataSource.terms = {
          endpointConfig: {
            apiKey: 'test-api-key'
          } as any,
          fetchPath: '/api/terms/current'
        };
        
        const validator = new ConfigValidator(config);
        expect(() => validator.validateConfig('terms')).toThrow('Missing required configuration field: dataSource.terms.endpointConfig.baseUrl');
      });

      it('should throw error when dataSource terms apiKey is missing', () => {
        const config = getValidConfig();
        config.dataSource.terms = {
          endpointConfig: {
            baseUrl: 'https://datasource.example.com'
          } as any,
          fetchPath: '/api/terms/current'
        };
        
        const validator = new ConfigValidator(config);
        expect(() => validator.validateConfig('terms')).toThrow('Missing required configuration field: dataSource.terms.endpointConfig.apiKey');
      });

      it('should throw error when terms fetchPath is missing', () => {
        const config = getValidConfig();
        config.dataSource.terms = {
          endpointConfig: {
            baseUrl: 'https://datasource.example.com',
            apiKey: 'test-api-key'
          }
        } as any;
        
        const validator = new ConfigValidator(config);
        expect(() => validator.validateConfig('terms')).toThrow('Missing required configuration field: dataSource.terms.fetchPath');
      });

      it('should throw error for invalid dataSource terms baseUrl', () => {
        const config = getValidConfig();
        config.dataSource.terms = {
          endpointConfig: {
            baseUrl: 'invalid-url',
            apiKey: 'test-api-key'
          },
          fetchPath: '/api/terms/current'
        };
        
        const validator = new ConfigValidator(config);
        expect(() => validator.validateConfig('terms')).toThrow('Invalid baseUrl in dataSource or dataTarget endpointConfig');
      });
    });

    describe('execution mode validation', () => {
      it('should validate person mode without requiring people or terms fields', () => {
        const config = getValidConfig();
        // Remove people and terms fields - should still be valid for person mode
        delete (config.dataSource as any).people;
        delete (config.dataSource as any).terms;
        
        const validator = new ConfigValidator(config);
        expect(() => validator.validateConfig('person')).not.toThrow();
      });

      it('should validate people mode without requiring person or terms fields', () => {
        const config = getValidConfig();
        // Remove person and terms fields - should still be valid for people mode
        delete (config.dataSource as any).person;
        delete (config.dataSource as any).terms;
        
        const validator = new ConfigValidator(config);
        expect(() => validator.validateConfig('people')).not.toThrow();
      });

      it('should validate terms mode without requiring person or people fields', () => {
        const config = getValidConfig();
        // Remove person and people, add terms
        delete (config.dataSource as any).person;
        delete (config.dataSource as any).people;
        config.dataSource.terms = {
          endpointConfig: {
            baseUrl: 'https://datasource.example.com',
            apiKey: 'test-api-key'
          },
          fetchPath: '/api/terms/current'
        };
        
        const validator = new ConfigValidator(config);
        expect(() => validator.validateConfig('terms')).not.toThrow();
      });

      it('should validate none mode without requiring any dataSource fields', () => {
        const config = getValidConfig();
        // Remove all dataSource fields - should be valid for none mode
        delete (config.dataSource as any).person;
        delete (config.dataSource as any).people;
        delete (config.dataSource as any).terms;
        
        const validator = new ConfigValidator(config);
        expect(() => validator.validateConfig('none')).not.toThrow();
      });

      it('should fail person mode when person fields are missing', () => {
        const config = getValidConfig();
        delete (config.dataSource as any).person;
        
        const validator = new ConfigValidator(config);
        expect(() => validator.validateConfig('person')).toThrow('Missing required configuration field: dataSource.person.endpointConfig.baseUrl');
      });

      it('should fail people mode when people fields are missing', () => {
        const config = getValidConfig();
        delete (config.dataSource as any).people;
        
        const validator = new ConfigValidator(config);
        expect(() => validator.validateConfig('people')).toThrow('Missing required configuration field: dataSource.people.endpointConfig.baseUrl');
      });

      it('should fail terms mode when terms fields are missing', () => {
        const config = getValidConfig();
        // Don't add terms field
        
        const validator = new ConfigValidator(config);
        expect(() => validator.validateConfig('terms')).toThrow('Missing required configuration field: dataSource.terms.endpointConfig.baseUrl');
      });

      it('should use isValid method returning true for valid none mode', () => {
        const config = getValidConfig();
        delete (config.dataSource as any).person;
        delete (config.dataSource as any).people;
        delete (config.dataSource as any).terms;
        
        const validator = new ConfigValidator(config);
        expect(validator.isValid('none')).toBe(true);
      });

      it('should use isValid method returning false for invalid terms mode', () => {
        const config = getValidConfig();
        // Missing terms configuration
        
        const validator = new ConfigValidator(config);
        expect(validator.isValid('terms')).toBe(false);
      });
    });

    describe('dataTarget validation', () => {
      it('should throw error when dataTarget is missing', () => {
        const config = getValidConfig();
        delete (config as any).dataTarget;
        
        const validator = new ConfigValidator(config);
        expect(() => validator.validateConfig('person')).toThrow('Missing required configuration field: dataTarget.endpointConfig.baseUrl');
      });

      it('should throw error when dataTarget baseUrl is missing', () => {
        const config = getValidConfig();
        delete (config.dataTarget.endpointConfig as any).baseUrl;
        
        const validator = new ConfigValidator(config);
        expect(() => validator.validateConfig('person')).toThrow('Missing required configuration field: dataTarget.endpointConfig.baseUrl');
      });

      it('should throw error when authMethod is missing', () => {
        const config = getValidConfig();
        delete (config.dataTarget.endpointConfig as any).authMethod;
        
        const validator = new ConfigValidator(config);
        expect(() => validator.validateConfig('person')).toThrow('Missing required configuration field: dataTarget.endpointConfig.authMethod');
      });

      it('should throw error for invalid authMethod', () => {
        const config = getValidConfig();
        (config.dataTarget.endpointConfig as any).authMethod = 'invalid';
        
        const validator = new ConfigValidator(config);
        expect(() => validator.validateConfig('person')).toThrow('Invalid authMethod: invalid. Must be \'basic\' or \'externalToken\'');
      });

      it('should throw error when personsPath is missing', () => {
        const config = getValidConfig();
        delete (config.dataTarget as any).personsPath;
        
        const validator = new ConfigValidator(config);
        expect(() => validator.validateConfig('person')).toThrow('Missing required configuration field: dataTarget.personsPath');
      });

      it('should throw error when organizationsPath is missing', () => {
        const config = getValidConfig();
        delete (config.dataTarget as any).organizationsPath;
        
        const validator = new ConfigValidator(config);
        expect(() => validator.validateConfig('person')).toThrow('Missing required configuration field: dataTarget.organizationsPath');
      });

      it('should throw error for invalid dataTarget baseUrl', () => {
        const config = getValidConfig();
        config.dataTarget.endpointConfig.baseUrl = 'invalid-url';
        
        const validator = new ConfigValidator(config);
        expect(() => validator.validateConfig('person')).toThrow('Invalid baseUrl in dataSource or dataTarget endpointConfig');
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
          expect(() => validator.validateConfig('person')).not.toThrow();
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
          expect(() => validator.validateConfig('person')).toThrow('Missing required configuration field: dataTarget.endpointConfig.loginSvcPath');
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
          expect(() => validator.validateConfig('person')).toThrow('Missing required configuration field: dataTarget.endpointConfig.username');
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
          expect(() => validator.validateConfig('person')).toThrow('Missing required configuration field: dataTarget.endpointConfig.password');
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
          expect(() => validator.validateConfig('person')).not.toThrow();
        });

        it('should throw error when externalToken is missing for externalToken auth', () => {
          const config = getValidConfig();
          config.dataTarget.endpointConfig = {
            baseUrl: 'https://datatarget.example.com',
            authMethod: 'externalToken',
            userId: 'test-user-id'
          } as any;
          
          const validator = new ConfigValidator(config);
          expect(() => validator.validateConfig('person')).toThrow('Missing required configuration field: dataTarget.endpointConfig.externalToken');
        });

        it('should throw error when userId is missing for externalToken auth', () => {
          const config = getValidConfig();
          config.dataTarget.endpointConfig = {
            baseUrl: 'https://datatarget.example.com',
            authMethod: 'externalToken',
            externalToken: 'test-token'
          } as any;
          
          const validator = new ConfigValidator(config);
          expect(() => validator.validateConfig('person')).toThrow('Missing required configuration field: dataTarget.endpointConfig.userId');
        });
      });
    });

    describe('integration validation', () => {
      it('should throw error when integration is missing', () => {
        const config = getValidConfig();
        delete (config as any).integration;
        
        const validator = new ConfigValidator(config);
        expect(() => validator.validateConfig('person')).toThrow('Missing required configuration field: integration.clientId');
      });

      it('should throw error when clientId is missing', () => {
        const config = getValidConfig();
        delete (config.integration as any).clientId;
        
        const validator = new ConfigValidator(config);
        expect(() => validator.validateConfig('person')).toThrow('Missing required configuration field: integration.clientId');
      });
    });

    describe('storage validation', () => {
      it('should throw error when storage is missing', () => {
        const config = getValidConfig();
        delete (config as any).storage;
        
        const validator = new ConfigValidator(config);
        expect(() => validator.validateConfig('person')).toThrow('Missing required configuration field: storage.type');
      });

      it('should throw error when storage type is missing', () => {
        const config = getValidConfig();
        delete (config.storage as any).type;
        
        const validator = new ConfigValidator(config);
        expect(() => validator.validateConfig('person')).toThrow('Missing required configuration field: storage.type');
      });

      it('should throw error when storage config is missing', () => {
        const config = getValidConfig();
        delete (config.storage as any).config;
        
        const validator = new ConfigValidator(config);
        expect(() => validator.validateConfig('person')).toThrow('Missing required configuration field: storage.config');
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
          expect(() => validator.validateConfig('person')).not.toThrow();
        });

        it('should throw error when file storage path is missing', () => {
          const config = getValidConfig();
          config.storage = {
            type: 'file',
            config: {} as any
          };
          
          const validator = new ConfigValidator(config);
          expect(() => validator.validateConfig('person')).toThrow('File storage requires path configuration');
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
          expect(() => validator.validateConfig('person')).not.toThrow();
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
          expect(() => validator.validateConfig('person')).not.toThrow();
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
          expect(() => validator.validateConfig('person')).toThrow('Database storage requires type configuration');
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
          expect(() => validator.validateConfig('person')).toThrow('SQLite requires filename or database configuration');
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
          expect(() => validator.validateConfig('person')).toThrow('Non-SQLite databases require host configuration');
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
          expect(() => validator.validateConfig('person')).not.toThrow();
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
          expect(() => validator.validateConfig('person')).toThrow('S3 storage requires bucketName configuration');
        });
      });

      it('should throw error for unsupported storage type', () => {
        const config = getValidConfig();
        (config as any).storage = {
          type: 'unsupported',
          config: {}
        };
        
        const validator = new ConfigValidator(config);
        expect(() => validator.validateConfig('person')).toThrow('Unsupported storage type: unsupported');
      });
    });

    describe('S3 CSV configuration validation', () => {
      describe('statesCsvS3Config validation', () => {
        it('should validate valid statesCsvS3Config successfully', () => {
          const config = getValidConfig();
          config.dataSource.statesCsvS3Config = {
            bucketName: 'test-bucket',
            key: 'data/states.csv',
            region: 'us-east-1'
          };
          
          const validator = new ConfigValidator(config);
          expect(() => validator.validateConfig('person')).not.toThrow();
        });

        it('should validate when statesCsvS3Config is not provided (optional)', () => {
          const config = getValidConfig();
          // statesCsvS3Config not provided - should be valid
          
          const validator = new ConfigValidator(config);
          expect(() => validator.validateConfig('person')).not.toThrow();
        });

        it('should throw error when statesCsvS3Config bucketName is missing', () => {
          const config = getValidConfig();
          config.dataSource.statesCsvS3Config = {
            key: 'data/states.csv',
            region: 'us-east-1'
          } as any;
          
          const validator = new ConfigValidator(config);
          expect(() => validator.validateConfig('person')).toThrow('statesCsvS3Config requires bucketName');
        });

        it('should throw error when statesCsvS3Config key is missing', () => {
          const config = getValidConfig();
          config.dataSource.statesCsvS3Config = {
            bucketName: 'test-bucket',
            region: 'us-east-1'
          } as any;
          
          const validator = new ConfigValidator(config);
          expect(() => validator.validateConfig('person')).toThrow('statesCsvS3Config requires key (full S3 object path)');
        });

        it('should throw error when statesCsvS3Config region is missing', () => {
          const config = getValidConfig();
          config.dataSource.statesCsvS3Config = {
            bucketName: 'test-bucket',
            key: 'data/states.csv'
          } as any;
          
          const validator = new ConfigValidator(config);
          expect(() => validator.validateConfig('person')).toThrow('statesCsvS3Config requires region');
        });
      });

      describe('countriesCsvS3Config validation', () => {
        it('should validate valid countriesCsvS3Config successfully', () => {
          const config = getValidConfig();
          config.dataSource.countriesCsvS3Config = {
            bucketName: 'test-bucket',
            key: 'data/countries.csv',
            region: 'us-east-1'
          };
          
          const validator = new ConfigValidator(config);
          expect(() => validator.validateConfig('person')).not.toThrow();
        });

        it('should validate when countriesCsvS3Config is not provided (optional)', () => {
          const config = getValidConfig();
          // countriesCsvS3Config not provided - should be valid
          
          const validator = new ConfigValidator(config);
          expect(() => validator.validateConfig('person')).not.toThrow();
        });

        it('should throw error when countriesCsvS3Config bucketName is missing', () => {
          const config = getValidConfig();
          config.dataSource.countriesCsvS3Config = {
            key: 'data/countries.csv',
            region: 'us-east-1'
          } as any;
          
          const validator = new ConfigValidator(config);
          expect(() => validator.validateConfig('person')).toThrow('countriesCsvS3Config requires bucketName');
        });

        it('should throw error when countriesCsvS3Config key is missing', () => {
          const config = getValidConfig();
          config.dataSource.countriesCsvS3Config = {
            bucketName: 'test-bucket',
            region: 'us-east-1'
          } as any;
          
          const validator = new ConfigValidator(config);
          expect(() => validator.validateConfig('person')).toThrow('countriesCsvS3Config requires key (full S3 object path)');
        });

        it('should throw error when countriesCsvS3Config region is missing', () => {
          const config = getValidConfig();
          config.dataSource.countriesCsvS3Config = {
            bucketName: 'test-bucket',
            key: 'data/countries.csv'
          } as any;
          
          const validator = new ConfigValidator(config);
          expect(() => validator.validateConfig('person')).toThrow('countriesCsvS3Config requires region');
        });
      });

      it('should validate when both S3 CSV configs are provided', () => {
        const config = getValidConfig();
        config.dataSource.statesCsvS3Config = {
          bucketName: 'test-bucket',
          key: 'data/states.csv',
          region: 'us-east-1'
        };
        config.dataSource.countriesCsvS3Config = {
          bucketName: 'test-bucket',
          key: 'data/countries.csv',
          region: 'us-east-1'
        };
        
        const validator = new ConfigValidator(config);
        expect(() => validator.validateConfig('person')).not.toThrow();
      });
    });
  });
});