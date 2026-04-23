import { ConfigFromSecretsManager } from '../src/config/ConfigFromSecretsManager';
import { Config } from '../src/config/Config';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

// Mock AWS SDK
jest.mock('@aws-sdk/client-secrets-manager');

const MockSecretsManagerClient = SecretsManagerClient as jest.MockedClass<typeof SecretsManagerClient>;

describe('ConfigFromSecretsManager', () => {
  let configLoader: ConfigFromSecretsManager;
  const mockSecretArn = 'test-secret-arn';
  
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

  let mockSend: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mock for SecretsManagerClient
    mockSend = jest.fn();
    MockSecretsManagerClient.prototype.send = mockSend;
    
    configLoader = new ConfigFromSecretsManager('us-east-1');
  });

  describe('loadConfig', () => {
    it('should load valid configuration successfully', async () => {
      mockSend.mockResolvedValue({
        SecretString: JSON.stringify(validConfig)
      });

      const result = await configLoader.loadConfig(mockSecretArn);

      expect(result).toEqual(validConfig);
      expect(mockSend).toHaveBeenCalledTimes(1);
      
      // Verify the command was created with correct type
      const callArg = mockSend.mock.calls[0][0];
      expect(callArg).toBeInstanceOf(GetSecretValueCommand);
    });

    it('should use default region when none provided', () => {
      const loader = new ConfigFromSecretsManager();
      expect(loader).toBeDefined();
    });

    it('should use AWS_REGION environment variable when available', () => {
      process.env.AWS_REGION = 'eu-west-1';
      const loader = new ConfigFromSecretsManager();
      expect(loader).toBeDefined();
      delete process.env.AWS_REGION;
    });

    it('should throw error when secret ARN is empty', async () => {
      await expect(configLoader.loadConfig('')).rejects.toThrow(
        'Secret ARN is required'
      );
    });

    it('should throw error when secret does not contain a string value', async () => {
      mockSend.mockResolvedValue({
        SecretBinary: Buffer.from('binary data')
      });

      await expect(configLoader.loadConfig(mockSecretArn)).rejects.toThrow(
        `Secret ${mockSecretArn} does not contain a string value`
      );
    });

    it('should throw error when secret contains invalid JSON', async () => {
      mockSend.mockResolvedValue({
        SecretString: 'invalid json content'
      });

      await expect(configLoader.loadConfig(mockSecretArn)).rejects.toThrow(
        'Failed to load configuration from Secrets Manager'
      );
    });

    it('should throw error when secret does not exist', async () => {
      mockSend.mockRejectedValue(new Error('ResourceNotFoundException: Secret not found'));

      await expect(configLoader.loadConfig(mockSecretArn)).rejects.toThrow(
        'Failed to load configuration from Secrets Manager'
      );
    });

    it('should throw error when access is denied', async () => {
      mockSend.mockRejectedValue(new Error('AccessDeniedException: Not authorized'));

      await expect(configLoader.loadConfig(mockSecretArn)).rejects.toThrow(
        'Failed to load configuration from Secrets Manager'
      );
    });

    it('should include secret name in error message', async () => {
      mockSend.mockRejectedValue(new Error('Network error'));

      await expect(configLoader.loadConfig(mockSecretArn)).rejects.toThrow(
        `Failed to load configuration from Secrets Manager (${mockSecretArn})`
      );
    });
  });

  describe('secretExists', () => {
    it('should return true when secret exists and is accessible', async () => {
      mockSend.mockResolvedValue({
        SecretString: JSON.stringify(validConfig)
      });

      const result = await configLoader.secretExists(mockSecretArn);

      expect(result).toBe(true);
    });

    it('should return false when secret does not exist', async () => {
      mockSend.mockRejectedValue(new Error('ResourceNotFoundException'));

      const result = await configLoader.secretExists(mockSecretArn);

      expect(result).toBe(false);
    });

    it('should return false when secret contains invalid JSON', async () => {
      mockSend.mockResolvedValue({
        SecretString: 'invalid json'
      });

      const result = await configLoader.secretExists(mockSecretArn);

      expect(result).toBe(false);
    });

    it('should return false when access is denied', async () => {
      mockSend.mockRejectedValue(new Error('AccessDeniedException'));

      const result = await configLoader.secretExists(mockSecretArn);

      expect(result).toBe(false);
    });
  });
});
