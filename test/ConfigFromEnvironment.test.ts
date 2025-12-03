import { ConfigFromEnvironment } from '../src/config/ConfigFromEnvironment';
import { Config } from '../src/config/Config';

describe('ConfigFromEnvironment', () => {
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
    // Clear any existing environment variables
    delete process.env.DATASOURCE_ENDPOINTCONFIG_BASE_URL;
    delete process.env.DATASOURCE_ENDPOINTCONFIG_API_KEY;
    delete process.env.DATASOURCE_ENDPOINT_PERSON_PATH;
    delete process.env.DATATARGET_ENDPOINTCONFIG_BASE_URL;
    delete process.env.DATATARGET_ENDPOINTCONFIG_USERNAME;
    delete process.env.DATATARGET_ENDPOINTCONFIG_PASSWORD;
    delete process.env.DATATARGET_ENDPOINTCONFIG_LOGIN_SVC_PATH;
    delete process.env.DATATARGET_ENDPOINTCONFIG_LOGIN_USERID;
    delete process.env.DATATARGET_ENDPOINTCONFIG_EXTERNAL_TOKEN;
    delete process.env.CLIENT_ID;
  });

  describe('getConfig', () => {
    it('should return empty object when no environment variables are set', () => {
      const configFromEnv = new ConfigFromEnvironment(validConfig);
      const result = configFromEnv.getConfig();
      expect(result).toEqual({});
    });

    it('should override DataSource API key configuration', () => {
      process.env.DATASOURCE_ENDPOINTCONFIG_BASE_URL = 'https://prod-datasource.example.com';
      process.env.DATASOURCE_ENDPOINTCONFIG_API_KEY = 'prod-api-key-123';

      const configFromEnv = new ConfigFromEnvironment(validConfig);
      const result = configFromEnv.getConfig();
      
      expect(result.dataSource?.endpointConfig?.baseUrl).toBe('https://prod-datasource.example.com');
      expect(result.dataSource?.endpointConfig?.apiKey).toBe('prod-api-key-123');
    });

    it('should override DataSource fetchPersonsPath', () => {
      process.env.DATASOURCE_ENDPOINT_PERSON_PATH = '/api/v2/prod/persons';

      const configFromEnv = new ConfigFromEnvironment(validConfig);
      const result = configFromEnv.getConfig();
      
      expect(result.dataSource?.fetchPersonsPath).toBe('/api/v2/prod/persons');
    });

    it('should override DataTarget JWT configuration', () => {
      process.env.DATATARGET_ENDPOINTCONFIG_BASE_URL = 'https://prod-datatarget.example.com';
      process.env.DATATARGET_ENDPOINTCONFIG_USERNAME = 'prod-user';
      process.env.DATATARGET_ENDPOINTCONFIG_PASSWORD = 'prod-password';
      process.env.DATATARGET_ENDPOINTCONFIG_LOGIN_SVC_PATH = '/prod/auth/token';

      const configFromEnv = new ConfigFromEnvironment(validConfig);
      const result = configFromEnv.getConfig();
      
      expect(result.dataTarget?.endpointConfig?.baseUrl).toBe('https://prod-datatarget.example.com');
      expect((result.dataTarget?.endpointConfig as any)?.username).toBe('prod-user');
      expect((result.dataTarget?.endpointConfig as any)?.password).toBe('prod-password');
      expect((result.dataTarget?.endpointConfig as any)?.loginSvcPath).toBe('/prod/auth/token');
    });

    it('should override DataTarget userId configuration', () => {
      process.env.DATATARGET_ENDPOINTCONFIG_LOGIN_USERID = 'override-user-id';

      const configFromEnv = new ConfigFromEnvironment(validConfig);
      const result = configFromEnv.getConfig();
      
      expect((result.dataTarget?.endpointConfig as any)?.userId).toBe('override-user-id');
    });

    it('should override integration clientId', () => {
      process.env.CLIENT_ID = 'prod-client-id';

      const configFromEnv = new ConfigFromEnvironment(validConfig);
      const result = configFromEnv.getConfig();
      
      expect(result.integration?.clientId).toBe('prod-client-id');
    });

    it('should handle partial overrides correctly', () => {
      process.env.DATASOURCE_ENDPOINTCONFIG_API_KEY = 'new-api-key';
      process.env.DATATARGET_ENDPOINTCONFIG_USERNAME = 'new-username';

      const configFromEnv = new ConfigFromEnvironment(validConfig);
      const result = configFromEnv.getConfig();
      
      expect(result.dataSource?.endpointConfig?.apiKey).toBe('new-api-key');
      expect((result.dataTarget?.endpointConfig as any)?.username).toBe('new-username');
      // ConfigFromEnvironment includes base config when building overrides
      expect(result.dataSource?.fetchPersonsPath).toBe('/api/v1/persons');
      expect(result.dataTarget?.personsPath).toBe('/api/v1/persons/batch');
    });

    it('should handle multiple environment variables for same section', () => {
      process.env.DATASOURCE_ENDPOINTCONFIG_BASE_URL = 'https://new-base.example.com';
      process.env.DATASOURCE_ENDPOINTCONFIG_API_KEY = 'new-key-456';

      const configFromEnv = new ConfigFromEnvironment(validConfig);
      const result = configFromEnv.getConfig();
      
      expect(result.dataSource?.endpointConfig?.baseUrl).toBe('https://new-base.example.com');
      expect(result.dataSource?.endpointConfig?.apiKey).toBe('new-key-456');
    });

    it('should preserve existing endpointConfig when adding overrides', () => {
      process.env.DATATARGET_ENDPOINTCONFIG_PASSWORD = 'override-password';

      const configFromEnv = new ConfigFromEnvironment(validConfig);
      const result = configFromEnv.getConfig();
      
      expect((result.dataTarget?.endpointConfig as any)?.password).toBe('override-password');
      // The method should preserve other existing config values when building overrides
    });

    it('should work without base config', () => {
      process.env.CLIENT_ID = 'standalone-client-id';
      process.env.DATASOURCE_ENDPOINTCONFIG_API_KEY = 'standalone-api-key';

      const configFromEnv = new ConfigFromEnvironment();
      const result = configFromEnv.getConfig();
      
      expect(result.integration?.clientId).toBe('standalone-client-id');
      expect(result.dataSource?.endpointConfig?.apiKey).toBe('standalone-api-key');
    });

    it('should handle external token configuration', () => {
      process.env.DATATARGET_ENDPOINTCONFIG_EXTERNAL_TOKEN = 'test-external-token';
      process.env.DATATARGET_ENDPOINTCONFIG_LOGIN_USERID = 'test-user-id';

      const configFromEnv = new ConfigFromEnvironment(validConfig);
      const result = configFromEnv.getConfig();
      
      expect((result.dataTarget?.endpointConfig as any)?.externalToken).toBe('test-external-token');
      expect((result.dataTarget?.endpointConfig as any)?.userId).toBe('test-user-id');
    });
  });
});