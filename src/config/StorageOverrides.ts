import { DynamoDBConfig, isS3Config } from 'integration-core';
import { Config } from './Config';
import { ConfigFromEnvironment } from './ConfigFromEnvironment';

/** GSI on PersonCurrentState keyed by syncRunId (the name importing infrastructure projects give it) */
export const DEFAULT_CURRENT_STATE_GSI_NAME = 'syncRunId-personId-index';

export const isDynamoDbStorage = (config: Config): boolean => config.storage?.type === 'dynamodb';

/**
 * Finalizes the storage configuration of a loaded config, for callers that sync individual persons
 * outside a bulk sync pipeline (which builds its own DynamoDB storage config):
 * - Re-applies the storage environment variables (ConfigFromEnvironment.getStorageOverrides()), for
 *   configs that were loaded by a caller without .fromEnvironment({ storage: true }).
 * - DynamoDB storage: checks the required settings, defaults the GSI name, and stamps a syncRunId
 *   (ISO timestamp) so every record written during this run carries the same one.
 * - S3 storage: applies the DELTA_STORAGE_BUCKET override.
 *
 * Mutates and returns the config. Call it once per run, before creating any delta strategy (which
 * copies storage.config).
 */
export const prepareStorageConfig = (config: Config): Config => {
  const overrides = ConfigFromEnvironment.getStorageOverrides();
  if (overrides) {
    config.storage = {
      type: overrides.type ?? config.storage.type,
      config: { ...config.storage.config, ...overrides.config }
    } as Config['storage'];
  }

  if (isDynamoDbStorage(config)) {
    const dynamoConfig = config.storage.config as DynamoDBConfig;
    const { region, personCurrentStateTableName, personHistoryTableName } = dynamoConfig;
    if (!region || !personCurrentStateTableName || !personHistoryTableName) {
      throw new Error('DynamoDB storage requires region, personCurrentStateTableName and personHistoryTableName ' +
        '(set REGION, DYNAMODB_PERSON_CURRENT_STATE_TABLE_NAME and DYNAMODB_PERSON_HISTORY_TABLE_NAME)');
    }
    dynamoConfig.currentStateGSIName ??= DEFAULT_CURRENT_STATE_GSI_NAME;
    dynamoConfig.syncRunId ??= new Date().toISOString();
    console.log(`Using DynamoDB delta storage: ${JSON.stringify({ region, personCurrentStateTableName, personHistoryTableName, syncRunId: dynamoConfig.syncRunId })}`);
    return config;
  }

  const bucketName = `${process.env.DELTA_STORAGE_BUCKET ?? ''}`.trim();
  if (bucketName && isS3Config(config.storage.config)) {
    console.log(`Using custom delta storage bucket from environment variable: ${bucketName}`);
    config.storage.config.bucketName = bucketName;
  }
  return config;
}
