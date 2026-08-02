import { FieldSet, Input, InputUtilsDecorator, TestEnvironment } from "integration-core";
import { Config } from "../config/Config";
import { ConfigManager } from "../config/ConfigManager";
import { getDataMapper } from "../data-mapper/DataMapper";
import { ReverseDataMapper } from "../data-mapper/ReverseDataMapper";
import { DeltaStrategyFactory } from "../delta-strategy/DeltaStrategyFactory";
import { SourcePerson, SourcePersonParms, TargetPersonParms } from "./SyncEvaluator";
import { getLocalConfig } from "../Utils";
import { HashStorageUpdater } from "./HashStorageUpdater";

export type HashStorageResetParms = {
  sourcePersonParms: SourcePersonParms
  targetPersonParms: TargetPersonParms
};

/**
 * This class resets the hash value stored in the hash storage file for a specific person to reflect
 * the current state of their record in the target system.
 */
export class HashStorageReset {
  private targetPersonData: Input[] = [];
  private config: Config;

  /**
   * Perform an API lookup against the target system to retrieve the current state of a 
   * specific person's record.
   * @param hashStorageResetParms The parameters required to perform the lookup.
   * @returns A promise that resolves to an instance of HashStorageReset.
   */
  public static instanceFromLookup = async (hashStorageResetParms: HashStorageResetParms): Promise<HashStorageReset> => {
    // Lookup the target person data.
    const { sourcePersonParms, targetPersonParms } = hashStorageResetParms;
    const syncEvaluator = new SourcePerson(sourcePersonParms);
    let data = await syncEvaluator.getInputFromTarget(targetPersonParms);

    // Create an instance from the looked-up data.
    const instance = new HashStorageReset();
    const { sourcePersonParms: { config: srcConfig }, targetPersonParms: { config: targetConfig } } = hashStorageResetParms;
    const config = srcConfig || targetConfig;
    return HashStorageReset.instanceFromData(config, data ? [data] : []);
  }

  /**
   * Create an instance of HashStorageReset from the provided data.
   * @param config The configuration object.
   * @param targetPersonData The current state of the target person's record.
   * @returns An instance of HashStorageReset.
   */
  public static instanceFromData = (config:Config, targetPersonData: Input[]): HashStorageReset => {
    const instance = new HashStorageReset();
    instance.config = config;
    if (targetPersonData) {
      instance.targetPersonData = targetPersonData;
    }
    return instance;
  }

  constructor() { }

  public updateHashStorage = async (): Promise<void> => {
    let {
      config, config: { integratedDeltaClientId } = {}, targetPersonData
    } = this;

    if(!targetPersonData || targetPersonData.length === 0) {
      throw new Error('No target person data found, skipping hash storage reset');
    }

    if(!integratedDeltaClientId) {
      throw new Error('No integratedDeltaClientId found in config, cannot update hash storage');
    }

    const deltaStrategy = DeltaStrategyFactory.createStrategy({ config });
    const { storage } = deltaStrategy;
    const fieldSetsToUpdate = new Map<string, FieldSet>();
    const primaryKeyFields: Set<string> = new Set<string>();

    for (const personData of targetPersonData) {
      const { fieldSets = [] } = personData;
      
      const sidObj = fieldSets[0]?.fieldValues.find(fld => fld.sourceIdentifier);
      if(!sidObj || !sidObj.sourceIdentifier) {
        throw new Error('No BUID provided, cannot update hash storage');
      }

      const buid = sidObj.sourceIdentifier as string;
      if(!/^U\d{7,}$/.test(buid)) {
        console.warn(`BUID ${buid} does not match expected format. skipping hash storage reset for this person.`);
      }

      fieldSetsToUpdate.set(buid, fieldSets[0]);
      
      const inputUtils = new InputUtilsDecorator(personData);
      if(primaryKeyFields.size === 0) {
        // Get the first person's primary key fields to use for all updates. 
        // Their sample should be the same as the rest of the people in the batch.
        inputUtils.getPrimaryKeys().forEach(pk => primaryKeyFields.add(pk));
      }
    }
    
    const hashStorageUpdater = new HashStorageUpdater({ 
      storage, clientId: integratedDeltaClientId, fieldSetsToUpdate, primaryKeyFields
    });

    await hashStorageUpdater.updateStorage();
  }
}

/**
 * Test harness for HashStorageReset
 * 
 * This harness resets the hash storage for a specific person by fetching their current
 * state from the target system and updating the stored hash to match.
 * 
 * Usage:
 *   npx ts-node src/delta-storage/HashStorageReset.ts
 * 
 * Required environment variables:
 *   - HASH_STORAGE_RESET_HURON_PERSON_SOURCE_ID or HASH_STORAGE_RESET_HURON_PERSON_HRN
 *   - HASH_STORAGE_RESET_INTEGRATED_DELTA_CLIENT_ID
 *   - HASH_STORAGE_RESET_DELTA_STORAGE_BUCKET
 */
if (require.main === module) {
  const testEnvironment = TestEnvironment('HASH_STORAGE_RESET');

  [
    'INTEGRATED_DELTA_CLIENT_ID',
    'DELTA_STORAGE_BUCKET'
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
    INTEGRATED_DELTA_CLIENT_ID: clientId
  } = process.env;
  
  if (!hrn && !buid) {
    console.error('Please provide either HURON_PERSON_HRN or HURON_PERSON_SOURCE_ID environment variable');
    process.exit(1);
  }

  (async () => {
    try {
      console.log('Starting hash storage reset...');
      console.log(`Target person: ${buid ? `BUID=${buid}` : `HRN=${hrn}`}`);

      const localConfigPath = HURON_PERSON_CONFIG_PATH || getLocalConfig();
      const config = ConfigManager.getInstance()
        .fromEnvironment()
        .fromFileSystem(localConfigPath)
        .getConfig('person');

      if (clientId && config.integratedDeltaClientId !== clientId) {
        config.integratedDeltaClientId = clientId;
      }

      const sourceDataMapper = await getDataMapper(config, { 
        orgMap: true, stateMap: true, countryMap: true 
      });

      const targetDataMapper = new ReverseDataMapper();

      const sourcePersonParms: SourcePersonParms = { config, buid, sourceDataMapper };
      
      const targetPersonParms: TargetPersonParms = { config, buid, hrn, targetDataMapper };

      const hashStorageResetParms: HashStorageResetParms = { 
        sourcePersonParms, targetPersonParms
      };

      // Create instance by looking up target person data
      const resetInstance = await HashStorageReset.instanceFromLookup(
        hashStorageResetParms
      );

      // Update hash storage with current target state
      await resetInstance.updateHashStorage();

      console.log('Hash storage reset completed successfully');
    } catch (error) {
      console.error('Hash storage reset failed:', error);
      process.exit(1);
    }
  })();
}

