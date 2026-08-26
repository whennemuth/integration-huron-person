import { FieldSet, InputUtilsDecorator, TestEnvironment } from "integration-core";
import { DeltaStrategyFactory } from "../delta-strategy/DeltaStrategyFactory";
import { AbstractHashStorageReset } from "./AbstractHashStorage";
import { HashStorageUpdater } from "./HashStorageUpdater";
import { ConfigManager } from "../config/ConfigManager";
import { getLocalConfig } from "../Utils";
import { getDataMapper } from "../data-mapper/DataMapper";
import { ReverseDataMapper } from "../data-mapper/ReverseDataMapper";
import { SourcePersonParms, TargetPersonParms } from "./SyncEvaluator";

/**
 * DynamoDB-based hash storage reset implementation.
 * 
 * Resets the hash value stored in PersonCurrentState DynamoDB table for a specific person
 * to reflect the current state of their record in the target system.
 * 
 * Unlike S3 implementation which updates mini-delta files, this directly writes to
 * PersonCurrentState table using batch operations.
 */
export class HashStorageReset extends AbstractHashStorageReset {
  constructor() {
    super();
  }
  
  public async updateHashStorage(): Promise<void> {
    let {
      config, config: { integratedDeltaClientId } = {}, targetPersonData
    } = this;

    if(!targetPersonData || targetPersonData.length === 0) {
      throw new Error('No target person data found, skipping hash storage reset');
    }

    if(!integratedDeltaClientId) {
      throw new Error('No integratedDeltaClientId found in config, cannot update hash storage');
    }

    // Create DynamoDB delta strategy
    const deltaStrategy = DeltaStrategyFactory.createStrategy({ config });
    const { storage } = deltaStrategy;
    const fieldSetsToUpdate = new Map<string, FieldSet>();
    const primaryKeyFields: Set<string> = new Set<string>();

    // Process target person data to extract FieldSets
    for (const personData of targetPersonData) {
      const { fieldSets = [] } = personData;
      
      const sidObj = fieldSets[0]?.fieldValues.find(fld => fld.sourceIdentifier);
      if(!sidObj || !sidObj.sourceIdentifier) {
        throw new Error('No BUID provided, cannot update hash storage');
      }

      const buid = sidObj.sourceIdentifier as string;
      if(!/^U\d{7,}$/.test(buid)) {
        console.warn(`BUID ${buid} does not match expected format. skipping hash storage reset for this person.`);
        continue;
      }

      fieldSetsToUpdate.set(buid, fieldSets[0]);
      
      const inputUtils = new InputUtilsDecorator(personData);
      if(primaryKeyFields.size === 0) {
        // Get the first person's primary key fields to use for all updates. 
        // Their sample should be the same as the rest of the people in the batch.
        inputUtils.getPrimaryKeys().forEach(pk => primaryKeyFields.add(pk));
      }
    }
    
    // Use HashStorageUpdater to write to DynamoDB via storage.updatePreviousData()
    const hashStorageUpdater = new HashStorageUpdater({ 
      storage, clientId: integratedDeltaClientId, fieldSetsToUpdate, primaryKeyFields
    });

    await hashStorageUpdater.updateStorage();
  }
}


/**
 * Test harness for DynamoDB HashStorageReset
 * 
 * This harness resets the hash storage for a specific person by fetching their current
 * state from the target system and updating PersonCurrentState DynamoDB table to match.
 * 
 * Usage:
 *   npx ts-node src/delta-storage/HashStorageResetForDynamoDb.ts
 * 
 * Required environment variables:
 *   - HASH_STORAGE_RESET_DYNAMODB_HURON_PERSON_SOURCE_ID or HASH_STORAGE_RESET_DYNAMODB_HURON_PERSON_HRN
 *   - HASH_STORAGE_RESET_DYNAMODB_INTEGRATED_DELTA_CLIENT_ID
 *   - HASH_STORAGE_RESET_DYNAMODB_PERSON_CURRENT_STATE_TABLE_NAME
 *   - HASH_STORAGE_RESET_DYNAMODB_PERSON_HISTORY_TABLE_NAME
 *   - HASH_STORAGE_RESET_DYNAMODB_REGION
 */
if (require.main === module) {
  (async () => {
    const testEnvironment = TestEnvironment('HASH_STORAGE_RESET_DYNAMODB');

    [
      'INTEGRATED_DELTA_CLIENT_ID',
      'DYNAMODB_PERSON_CURRENT_STATE_TABLE_NAME',
      'DYNAMODB_PERSON_HISTORY_TABLE_NAME',
      'REGION'
    ].forEach(testEnvironment.getVar);

    [
      'HURON_PERSON_CONFIG_PATH',
      'HURON_PERSON_SOURCE_ID',
      'HURON_PERSON_HRN'
    ].forEach(testEnvironment.getVarOrEmptyString);

    const { 
      HURON_PERSON_HRN: hrn, 
      HURON_PERSON_SOURCE_ID: buid, 
      HURON_PERSON_CONFIG_PATH,
      INTEGRATED_DELTA_CLIENT_ID: clientId,
      DYNAMODB_PERSON_CURRENT_STATE_TABLE_NAME: personCurrentStateTableName,
      DYNAMODB_PERSON_HISTORY_TABLE_NAME: personHistoryTableName,
      REGION: region
    } = process.env;

    if (!hrn && !buid) {
      console.error('Please provide either HURON_PERSON_HRN or HURON_PERSON_SOURCE_ID environment variable');
      process.exit(1);
    }

    try {
      console.log('Starting DynamoDB hash storage reset...');
      console.log(`Target person: ${buid ? `BUID=${buid}` : `HRN=${hrn}`}`);

      const localConfigPath = HURON_PERSON_CONFIG_PATH || getLocalConfig();
      const config = ConfigManager.getInstance()
        .fromEnvironment()
        .fromFileSystem(localConfigPath)
        .getConfig('person');

      // Override storage config for DynamoDB
      config.storage = {
        type: 'dynamodb',
        config: {
          region: region!,
          personCurrentStateTableName: personCurrentStateTableName!,
          personHistoryTableName: personHistoryTableName!
        }
      };

      if (clientId && config.integratedDeltaClientId !== clientId) {
        config.integratedDeltaClientId = clientId;
      }

      const sourceDataMapper = await getDataMapper(config, { 
        orgMap: true, stateMap: true, countryMap: true 
      });

      const targetDataMapper = new ReverseDataMapper();

      const sourcePersonParms: SourcePersonParms = { config, buid, sourceDataMapper };
      
      const targetPersonParms: TargetPersonParms = { config, buid, hrn, targetDataMapper };

      const hashStorageResetParms = { 
        sourcePersonParms, targetPersonParms
      };

      // Create instance by looking up target person data
      const resetInstance = await HashStorageReset.instanceFromLookup(
        hashStorageResetParms
      );

      // Update hash storage in DynamoDB
      await resetInstance.updateHashStorage();

      console.log('✅ DynamoDB hash storage reset completed successfully');
    } catch (error) {
      console.error('❌ DynamoDB hash storage reset failed:', error);
      process.exit(1);
    }
  })();
}