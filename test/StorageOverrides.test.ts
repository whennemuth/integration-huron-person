import { DynamoDBConfig, S3Config } from 'integration-core';
import { Config } from '../src/config/Config';
import { DEFAULT_CURRENT_STATE_GSI_NAME, isDynamoDbStorage, prepareStorageConfig } from '../src/config/StorageOverrides';

describe('StorageOverrides', () => {
  const ENV_KEYS = [
    'PREVIOUS_STORAGE_TYPE',
    'DYNAMODB_PERSON_CURRENT_STATE_TABLE_NAME',
    'DYNAMODB_PERSON_HISTORY_TABLE_NAME',
    'REGION',
    'DELTA_STORAGE_BUCKET'
  ];
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    ENV_KEYS.forEach(key => {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    });
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    ENV_KEYS.forEach(key => {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    });
    jest.restoreAllMocks();
  });

  const setDynamoEnv = () => {
    process.env.DYNAMODB_PERSON_CURRENT_STATE_TABLE_NAME = 'person-current-state';
    process.env.DYNAMODB_PERSON_HISTORY_TABLE_NAME = 'person-history';
    process.env.REGION = 'us-east-2';
  };

  const s3Config = (): Config => ({
    storage: { type: 's3', config: { bucketName: 'chunks-bucket', region: 'us-east-2' } as S3Config }
  } as Config);

  describe('prepareStorageConfig', () => {
    it('switches a loaded S3 config to DynamoDB and stamps a syncRunId and GSI name', () => {
      setDynamoEnv();
      process.env.PREVIOUS_STORAGE_TYPE = 'dynamodb';
      const config = prepareStorageConfig(s3Config());

      expect(isDynamoDbStorage(config)).toBe(true);
      const dynamoConfig = config.storage.config as DynamoDBConfig;
      expect(dynamoConfig).toEqual(expect.objectContaining({
        region: 'us-east-2',
        personCurrentStateTableName: 'person-current-state',
        personHistoryTableName: 'person-history',
        currentStateGSIName: DEFAULT_CURRENT_STATE_GSI_NAME
      }));
      expect(new Date(dynamoConfig.syncRunId!).toISOString()).toBe(dynamoConfig.syncRunId);
    });

    it('keeps a syncRunId that is already configured', () => {
      setDynamoEnv();
      process.env.PREVIOUS_STORAGE_TYPE = 'dynamodb';
      const config = s3Config();
      (config.storage.config as any).syncRunId = '2026-01-01T00:00:00.000Z';

      prepareStorageConfig(config);
      expect((config.storage.config as DynamoDBConfig).syncRunId).toBe('2026-01-01T00:00:00.000Z');
    });

    it('applies storage variables to a config loaded without them, keeping its other storage settings', () => {
      setDynamoEnv();
      const config = prepareStorageConfig(s3Config());
      expect(config.storage.type).toBe('s3');
      expect(config.storage.config).toEqual(expect.objectContaining({
        bucketName: 'chunks-bucket', personCurrentStateTableName: 'person-current-state'
      }));
    });

    it('rejects an unknown PREVIOUS_STORAGE_TYPE', () => {
      process.env.PREVIOUS_STORAGE_TYPE = 'redis';
      expect(() => prepareStorageConfig(s3Config())).toThrow('Invalid PREVIOUS_STORAGE_TYPE: redis');
    });

    it('throws when DynamoDB storage lacks table names', () => {
      process.env.PREVIOUS_STORAGE_TYPE = 'dynamodb';
      expect(() => prepareStorageConfig(s3Config())).toThrow('DynamoDB storage requires');
    });

    it('applies DELTA_STORAGE_BUCKET to S3 storage', () => {
      process.env.DELTA_STORAGE_BUCKET = 'other-bucket';
      const config = prepareStorageConfig(s3Config());
      expect((config.storage.config as S3Config).bucketName).toBe('other-bucket');
    });

    it('leaves S3 storage unchanged when no variables are set', () => {
      expect(prepareStorageConfig(s3Config())).toEqual(s3Config());
    });
  });
});
