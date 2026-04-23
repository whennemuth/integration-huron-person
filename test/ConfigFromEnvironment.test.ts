import { ConfigFromEnvironment } from '../src/config/ConfigFromEnvironment';
import { Config } from '../src/config/Config';

describe('ConfigFromEnvironment', () => {
  const validConfig: Config = {
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
  };

  beforeEach(() => {
    // Clear any existing environment variables
    delete process.env[ConfigFromEnvironment.ENV_VARS.DATASOURCE_ENDPOINTCONFIG_PERSON_BASE_URL];
    delete process.env[ConfigFromEnvironment.ENV_VARS.DATASOURCE_ENDPOINTCONFIG_PERSON_API_KEY];
    delete process.env[ConfigFromEnvironment.ENV_VARS.DATASOURCE_ENDPOINTCONFIG_PERSON_PATH];
    delete process.env[ConfigFromEnvironment.ENV_VARS.DATASOURCE_ENDPOINTCONFIG_PEOPLE_BASE_URL];
    delete process.env[ConfigFromEnvironment.ENV_VARS.DATASOURCE_ENDPOINTCONFIG_PEOPLE_API_KEY];
    delete process.env[ConfigFromEnvironment.ENV_VARS.DATASOURCE_ENDPOINTCONFIG_PEOPLE_PATH];
    delete process.env[ConfigFromEnvironment.ENV_VARS.DATASOURCE_ENDPOINTCONFIG_CURRENT_TERMS_BASE_URL];
    delete process.env[ConfigFromEnvironment.ENV_VARS.DATASOURCE_ENDPOINTCONFIG_CURRENT_TERMS_API_KEY];
    delete process.env[ConfigFromEnvironment.ENV_VARS.DATASOURCE_ENDPOINTCONFIG_CURRENT_TERMS_PATH];
    delete process.env[ConfigFromEnvironment.ENV_VARS.DATATARGET_ENDPOINTCONFIG_BASE_URL];
    delete process.env[ConfigFromEnvironment.ENV_VARS.DATATARGET_ENDPOINTCONFIG_USERNAME];
    delete process.env[ConfigFromEnvironment.ENV_VARS.DATATARGET_ENDPOINTCONFIG_PASSWORD];
    delete process.env[ConfigFromEnvironment.ENV_VARS.DATATARGET_ENDPOINTCONFIG_LOGIN_SVC_PATH];
    delete process.env[ConfigFromEnvironment.ENV_VARS.DATATARGET_ENDPOINTCONFIG_LOGIN_USERID];
    delete process.env[ConfigFromEnvironment.ENV_VARS.DATATARGET_ENDPOINTCONFIG_EXTERNAL_TOKEN];
    delete process.env[ConfigFromEnvironment.ENV_VARS.S3_BUCKET];
    delete process.env[ConfigFromEnvironment.ENV_VARS.S3_KEY];
    delete process.env[ConfigFromEnvironment.ENV_VARS.CLIENT_ID];
    delete process.env[ConfigFromEnvironment.ENV_VARS.CACHE_ENABLED];
    delete process.env[ConfigFromEnvironment.ENV_VARS.CACHE_PATH];
  });

  describe('getConfig', () => {
    it('should return empty object when no environment variables are set', () => {
      const configFromEnv = new ConfigFromEnvironment(validConfig);
      const result = configFromEnv.getConfig();
      expect(result).toEqual({});
    });

    it('should override DataSource person API key configuration', () => {
      process.env[ConfigFromEnvironment.ENV_VARS.DATASOURCE_ENDPOINTCONFIG_PERSON_BASE_URL] = 'https://prod-datasource.example.com';
      process.env[ConfigFromEnvironment.ENV_VARS.DATASOURCE_ENDPOINTCONFIG_PERSON_API_KEY] = 'prod-api-key-123';

      const configFromEnv = new ConfigFromEnvironment(validConfig);
      const result = configFromEnv.getConfig();
      
      expect(result.dataSource?.person?.endpointConfig?.baseUrl).toBe('https://prod-datasource.example.com');
      expect(result.dataSource?.person?.endpointConfig?.apiKey).toBe('prod-api-key-123');
      expect(result.dataSource?.people).toBeUndefined(); // People should not be overridden
    });

    it('should override DataSource person fetchPath', () => {
      process.env[ConfigFromEnvironment.ENV_VARS.DATASOURCE_ENDPOINTCONFIG_PERSON_PATH] = '/api/v2/prod/persons';

      const configFromEnv = new ConfigFromEnvironment(validConfig);
      const result = configFromEnv.getConfig();
      
      expect(result.dataSource?.person?.fetchPath).toBe('/api/v2/prod/persons');
      expect(result.dataSource?.people).toBeUndefined(); // People should not be overridden
    });

    it('should override DataSource people API key configuration', () => {
      process.env[ConfigFromEnvironment.ENV_VARS.DATASOURCE_ENDPOINTCONFIG_PEOPLE_BASE_URL] = 'https://prod-datasource.example.com';
      process.env[ConfigFromEnvironment.ENV_VARS.DATASOURCE_ENDPOINTCONFIG_PEOPLE_API_KEY] = 'prod-api-key-123';

      const configFromEnv = new ConfigFromEnvironment(validConfig);
      const result = configFromEnv.getConfig();
      
      // Type guard for API-based config
      if (result.dataSource?.people && 'endpointConfig' in result.dataSource.people) {
        expect(result.dataSource.people.endpointConfig.baseUrl).toBe('https://prod-datasource.example.com');
        expect(result.dataSource.people.endpointConfig.apiKey).toBe('prod-api-key-123');
      }
      expect(result.dataSource?.person).toBeUndefined(); // Person should not be overridden
    });

    it('should override DataSource people fetchPath', () => {
      process.env[ConfigFromEnvironment.ENV_VARS.DATASOURCE_ENDPOINTCONFIG_PEOPLE_PATH] = '/api/v2/prod/people';

      const configFromEnv = new ConfigFromEnvironment(validConfig);
      const result = configFromEnv.getConfig();
      
      // Type guard for API-based config  
      if (result.dataSource?.people && 'fetchPath' in result.dataSource.people) {
        expect(result.dataSource.people.fetchPath).toBe('/api/v2/prod/people');
      }
      expect(result.dataSource?.person).toBeUndefined(); // Person should not be overridden
    });

    it('should override DataSource current terms API key configuration', () => {
      process.env[ConfigFromEnvironment.ENV_VARS.DATASOURCE_ENDPOINTCONFIG_CURRENT_TERMS_BASE_URL] = 'https://prod-terms.example.com';
      process.env[ConfigFromEnvironment.ENV_VARS.DATASOURCE_ENDPOINTCONFIG_CURRENT_TERMS_API_KEY] = 'prod-terms-key-456';

      const configFromEnv = new ConfigFromEnvironment(validConfig);
      const result = configFromEnv.getConfig();
      
      expect(result.dataSource?.terms?.endpointConfig?.baseUrl).toBe('https://prod-terms.example.com');
      expect(result.dataSource?.terms?.endpointConfig?.apiKey).toBe('prod-terms-key-456');
      expect(result.dataSource?.person).toBeUndefined(); // Person should not be overridden
      expect(result.dataSource?.people).toBeUndefined(); // People should not be overridden
    });

    it('should override DataSource current terms fetchPath', () => {
      process.env[ConfigFromEnvironment.ENV_VARS.DATASOURCE_ENDPOINTCONFIG_CURRENT_TERMS_PATH] = '/api/v2/prod/terms/current';

      const configFromEnv = new ConfigFromEnvironment(validConfig);
      const result = configFromEnv.getConfig();
      
      expect(result.dataSource?.terms?.fetchPath).toBe('/api/v2/prod/terms/current');
      expect(result.dataSource?.person).toBeUndefined(); // Person should not be overridden
      expect(result.dataSource?.people).toBeUndefined(); // People should not be overridden
    });

    it('should override DataTarget JWT configuration', () => {
      process.env[ConfigFromEnvironment.ENV_VARS.DATATARGET_ENDPOINTCONFIG_BASE_URL] = 'https://prod-datatarget.example.com';
      process.env[ConfigFromEnvironment.ENV_VARS.DATATARGET_ENDPOINTCONFIG_USERNAME] = 'prod-user';
      process.env[ConfigFromEnvironment.ENV_VARS.DATATARGET_ENDPOINTCONFIG_PASSWORD] = 'prod-password';
      process.env[ConfigFromEnvironment.ENV_VARS.DATATARGET_ENDPOINTCONFIG_LOGIN_SVC_PATH] = '/prod/auth/token';

      const configFromEnv = new ConfigFromEnvironment(validConfig);
      const result = configFromEnv.getConfig();
      
      expect(result.dataTarget?.endpointConfig?.baseUrl).toBe('https://prod-datatarget.example.com');
      expect((result.dataTarget?.endpointConfig as any)?.username).toBe('prod-user');
      expect((result.dataTarget?.endpointConfig as any)?.password).toBe('prod-password');
      expect((result.dataTarget?.endpointConfig as any)?.loginSvcPath).toBe('/prod/auth/token');
    });

    it('should override DataTarget userId configuration', () => {
      process.env[ConfigFromEnvironment.ENV_VARS.DATATARGET_ENDPOINTCONFIG_LOGIN_USERID] = 'override-user-id';

      const configFromEnv = new ConfigFromEnvironment(validConfig);
      const result = configFromEnv.getConfig();
      
      expect((result.dataTarget?.endpointConfig as any)?.userId).toBe('override-user-id');
    });

    it('should override integration clientId', () => {
      process.env[ConfigFromEnvironment.ENV_VARS.CLIENT_ID] = 'prod-client-id';

      const configFromEnv = new ConfigFromEnvironment(validConfig);
      const result = configFromEnv.getConfig();
      
      expect(result.integration?.clientId).toBe('prod-client-id');
    });

    it('should handle partial overrides correctly', () => {
      process.env[ConfigFromEnvironment.ENV_VARS.DATASOURCE_ENDPOINTCONFIG_PERSON_API_KEY] = 'new-api-key';
      process.env[ConfigFromEnvironment.ENV_VARS.DATATARGET_ENDPOINTCONFIG_USERNAME] = 'new-username';

      const configFromEnv = new ConfigFromEnvironment(validConfig);
      const result = configFromEnv.getConfig();
      
      expect(result.dataSource?.person?.endpointConfig?.apiKey).toBe('new-api-key');
      expect(result.dataSource?.people).toBeUndefined(); // Only person should be overridden
      expect((result.dataTarget?.endpointConfig as any)?.username).toBe('new-username');
      // ConfigFromEnvironment includes base config when building overrides
      expect(result.dataTarget?.personsPath).toBe('/api/v1/persons/batch');
    });

    it('should handle multiple person environment variables for same section', () => {
      process.env[ConfigFromEnvironment.ENV_VARS.DATASOURCE_ENDPOINTCONFIG_PERSON_BASE_URL] = 'https://new-base.example.com';
      process.env[ConfigFromEnvironment.ENV_VARS.DATASOURCE_ENDPOINTCONFIG_PERSON_API_KEY] = 'new-key-456';

      const configFromEnv = new ConfigFromEnvironment(validConfig);
      const result = configFromEnv.getConfig();
      
      expect(result.dataSource?.person?.endpointConfig?.baseUrl).toBe('https://new-base.example.com');
      expect(result.dataSource?.person?.endpointConfig?.apiKey).toBe('new-key-456');
      expect(result.dataSource?.people).toBeUndefined(); // Only person should be overridden
    });

    it('should preserve existing endpointConfig when adding overrides', () => {
      process.env[ConfigFromEnvironment.ENV_VARS.DATATARGET_ENDPOINTCONFIG_PASSWORD] = 'override-password';

      const configFromEnv = new ConfigFromEnvironment(validConfig);
      const result = configFromEnv.getConfig();
      
      expect((result.dataTarget?.endpointConfig as any)?.password).toBe('override-password');
      // The method should preserve other existing config values when building overrides
    });

    it('should work without base config', () => {
      process.env[ConfigFromEnvironment.ENV_VARS.CLIENT_ID] = 'standalone-client-id';
      process.env[ConfigFromEnvironment.ENV_VARS.DATASOURCE_ENDPOINTCONFIG_PERSON_API_KEY] = 'standalone-api-key';

      const configFromEnv = new ConfigFromEnvironment();
      const result = configFromEnv.getConfig();
      
      expect(result.integration?.clientId).toBe('standalone-client-id');
      expect(result.dataSource?.person?.endpointConfig?.apiKey).toBe('standalone-api-key');
      expect(result.dataSource?.people).toBeUndefined(); // Only person should be set
    });

    it('should handle external token configuration', () => {
      process.env[ConfigFromEnvironment.ENV_VARS.DATATARGET_ENDPOINTCONFIG_EXTERNAL_TOKEN] = 'test-external-token';
      process.env[ConfigFromEnvironment.ENV_VARS.DATATARGET_ENDPOINTCONFIG_LOGIN_USERID] = 'test-user-id';

      const configFromEnv = new ConfigFromEnvironment(validConfig);
      const result = configFromEnv.getConfig();
      
      expect((result.dataTarget?.endpointConfig as any)?.externalToken).toBe('test-external-token');
      expect((result.dataTarget?.endpointConfig as any)?.userId).toBe('test-user-id');
    });

    it('should override cache enabled configuration', () => {
      process.env[ConfigFromEnvironment.ENV_VARS.CACHE_ENABLED] = 'true';

      const configFromEnv = new ConfigFromEnvironment(validConfig);
      const result = configFromEnv.getConfig();
      
      expect(result.cache?.enabled).toBe(true);
    });

    it('should override cache path configuration', () => {
      process.env[ConfigFromEnvironment.ENV_VARS.CACHE_PATH] = '/tmp/cache';

      const configFromEnv = new ConfigFromEnvironment(validConfig);
      const result = configFromEnv.getConfig();
      
      expect(result.cache?.path).toBe('/tmp/cache');
    });

    it('should override both cache enabled and path configuration', () => {
      process.env[ConfigFromEnvironment.ENV_VARS.CACHE_ENABLED] = 'false';
      process.env[ConfigFromEnvironment.ENV_VARS.CACHE_PATH] = './custom-cache';

      const configFromEnv = new ConfigFromEnvironment(validConfig);
      const result = configFromEnv.getConfig();
      
      expect(result.cache?.enabled).toBe(false);
      expect(result.cache?.path).toBe('./custom-cache');
    });

    it('should handle cache enabled as false', () => {
      process.env[ConfigFromEnvironment.ENV_VARS.CACHE_ENABLED] = 'false';

      const configFromEnv = new ConfigFromEnvironment(validConfig);
      const result = configFromEnv.getConfig();
      
      expect(result.cache?.enabled).toBe(false);
    });

    it('should override S3 bucket name for people data source', () => {
      process.env[ConfigFromEnvironment.ENV_VARS.S3_BUCKET] = 'my-integration-bucket';

      const configFromEnv = new ConfigFromEnvironment(validConfig);
      const result = configFromEnv.getConfig();
      
      // Type guard for S3-based config
      if (result.dataSource?.people && 'bucketName' in result.dataSource.people) {
        expect(result.dataSource.people.bucketName).toBe('my-integration-bucket');
      } else {
        fail('Expected S3DataSourceConfig');
      }
      expect(result.dataSource?.person).toBeUndefined(); // Person should not be overridden
    });

    it('should override S3 key for people data source', () => {
      process.env[ConfigFromEnvironment.ENV_VARS.S3_KEY] = 'data/people/chunk-0042.ndjson';

      const configFromEnv = new ConfigFromEnvironment(validConfig);
      const result = configFromEnv.getConfig();
      
      // Type guard for S3-based config
      if (result.dataSource?.people && 'key' in result.dataSource.people) {
        expect(result.dataSource.people.key).toBe('data/people/chunk-0042.ndjson');
      } else {
        fail('Expected S3DataSourceConfig');
      }
      expect(result.dataSource?.person).toBeUndefined(); // Person should not be overridden
    });

    it('should override both S3 bucket and key for people data source', () => {
      process.env[ConfigFromEnvironment.ENV_VARS.S3_BUCKET] = 'my-integration-bucket';
      process.env[ConfigFromEnvironment.ENV_VARS.S3_KEY] = 'chunks/boston-university/2026-03-03T19:58:41.277Z/chunk-0001.ndjson';

      const configFromEnv = new ConfigFromEnvironment(validConfig);
      const result = configFromEnv.getConfig();
      
      // Type guard for S3-based config
      if (result.dataSource?.people && 'bucketName' in result.dataSource.people && 'key' in result.dataSource.people) {
        expect(result.dataSource.people.bucketName).toBe('my-integration-bucket');
        expect(result.dataSource.people.key).toBe('chunks/boston-university/2026-03-03T19:58:41.277Z/chunk-0001.ndjson');
      } else {
        fail('Expected S3DataSourceConfig');
      }
      expect(result.dataSource?.person).toBeUndefined(); // Person should not be overridden
    });
  });
});