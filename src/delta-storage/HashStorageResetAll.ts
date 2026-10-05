import { Input, TestEnvironment } from "integration-core";
import { Config } from "../config/Config";
import { ConfigManager } from "../config/ConfigManager";
import { _fieldDefinitions, DataMapper, getDataMapper } from "../data-mapper/DataMapper";
import { ReverseDataMapper } from "../data-mapper/ReverseDataMapper";
import { ReadPeople } from "../data-target/crud/ReadPeople";
import { getLocalConfig } from "../Utils";
import { HashStorageReset as HashStorageResetForS3 } from "./HashStorageResetForS3";
import { HashStorageReset as HashStorageResetForFile } from "./HashStorageResetForFile";
import { HashStorageReset as HashStorageResetForDb } from "./HashStorageResetForDb";
import { HashStorageReset as HashStorageResetForDynamoDB } from "./HashStorageResetForDynamoDb";
import { SourcePerson } from "./SyncEvaluator";
import { AbstractHashStorageReset } from "./AbstractHashStorage";

export type HashStorageResetAllParms = {
  config: Config,
  sourceDataMapper: DataMapper,
  targetDataMapper: ReverseDataMapper
};
/**
 * This class "resets" the hash values stored in the hash storage file for every person in
 * the target system to reflect the current state of their records in the target system.
 * 
 * This is useful in scenarios where the hash storage file may have become out of sync with the
 * target system, and we want to ensure that the hash values accurately represent the current
 * state of each person's record.
 */
export class HashStorageResetAll {

  constructor(private params: HashStorageResetAllParms) { }

  public resetAllHashStorage = async (): Promise<void> => {
    const { config, config: { storage: { type: previousStorageType } = {} } = {} } = this.params;
    const targetPersonData: Input[] = await this.getAllTargetPersons();
    let updater: AbstractHashStorageReset;
    switch (previousStorageType) {
      case 's3':
        updater = HashStorageResetForS3.instanceFromData(config, targetPersonData);
        break;
      case 'file':
        updater = HashStorageResetForFile.instanceFromData(config, targetPersonData);
        break;
      case 'database':
        updater = HashStorageResetForDb.instanceFromData(config, targetPersonData);
        break;
      case 'dynamodb':
        updater = HashStorageResetForDynamoDB.instanceFromData(config, targetPersonData);
        break;
      default:
        throw new Error(`Unsupported storage type: ${previousStorageType}`);
    }
    await updater.updateHashStorage();
  }

  /**
   * Fetch all persons from the target system and convert them to Input format with hashing.
   * This method:
   * 1. Fetches all people from target API using paginated requests
   * 2. Maps each person through ReverseDataMapper to get Input format
   * 3. Applies field filtering to match source data mapper mappings
   * 4. Parses with InputParser to generate hashes
   * 
   * @returns Promise resolving to array of Input objects with hashes
   */
  private getAllTargetPersons = async (): Promise<Input[]> => {
    const { config, sourceDataMapper, targetDataMapper } = this.params;
    
    console.log('Fetching all people from target system...');
    
    // Include only those fields relevant for hashing
    const includeFields = _fieldDefinitions.map((fd) => {
      return [ '__arrayFieldOperations', 'roles' ].includes(fd.name) ? '' : fd.name;
    }).filter((f) => f !== '');

    // Fetch all people from target using paginated API
    const reader = new ReadPeople({ config, includeInactive: true });
    const allPeople = (await reader.readAllPeopleNonTokenized({ 
      pagination: { pageSize: 500 }, includeFields
    })).filter(p => /^U\d{7,}$/.test(p.sourceIdentifier! || p.id!)); // Filter for valid sourceIdentifier or id
    
    console.log(`Retrieved ${allPeople.length} people from target system`);
    console.log('Converting to Input format and generating hashes...');
    
    // Convert each person to Input format with filtering and hashing
    const inputArray: Input[] = [];
    let processedCount = 0;
    
    for (const person of allPeople) {
      try {
        const parsedInput = new SourcePerson({
          config, sourceDataMapper
        }).getInput(targetDataMapper, person);        

        inputArray.push(parsedInput!);
        processedCount++;
        
        // Log progress every 100 people
        if (processedCount % 100 === 0) {
          console.log(`Processed ${processedCount}/${allPeople.length} people`);
        }
      } catch (error) {
        console.error(`Error processing person ${person.sourceIdentifier || person.id}:`, error);
        // Continue processing remaining people
      }
    }
    
    console.log(`Successfully processed ${inputArray.length} of ${allPeople.length} people`);
    return inputArray;
  }
}

/**
 * Test harness for HashStorageResetAll
 * 
 * This harness resets the hash storage for ALL people in the target system by:
 * 1. Fetching all people from the target API
 * 2. Converting each to hashed Input format with proper field filtering
 * 3. Batch updating the hash storage file
 * 
 * Usage:
 *   npx ts-node src/delta-storage/HashStorageResetAll.ts
 * 
 * Required environment variables:
 *   - HASH_STORAGE_RESET_ALL_INTEGRATED_DELTA_CLIENT_ID
 *   - HASH_STORAGE_RESET_ALL_DELTA_STORAGE_BUCKET
 * 
 * Optional:
 *   - HASH_STORAGE_RESET_ALL_HURON_PERSON_CONFIG_PATH
 */
if (require.main === module) {
  const testEnvironment = TestEnvironment('HASH_STORAGE_RESET_ALL');

  [
    'INTEGRATED_DELTA_CLIENT_ID',
    'DELTA_STORAGE_BUCKET'
  ].forEach(testEnvironment.getVar);

  [
    'HURON_PERSON_CONFIG_PATH'
  ].forEach(testEnvironment.getVarOrEmptyString);

  (async () => {
    try {
      console.log('Starting hash storage reset for all people...');
      console.log('WARNING: This will reset hash storage for ALL people in the target system');
      
      const { HURON_PERSON_CONFIG_PATH } = process.env;
      
      const localConfigPath = HURON_PERSON_CONFIG_PATH || getLocalConfig();
      const config = ConfigManager.getInstance()
        .fromEnvironment()
        .fromFileSystem(localConfigPath)
        .getConfig('person');

      // Initialize data mappers with full mappings for proper field filtering
      console.log('Initializing data mappers...');
      const sourceDataMapper = await getDataMapper(config, { 
        orgMap: true, 
        stateMap: true, 
        countryMap: true 
      });

      const targetDataMapper = new ReverseDataMapper();

      const params: HashStorageResetAllParms = {
        config,
        sourceDataMapper,
        targetDataMapper
      };

      // Execute the reset
      const resetAll = new HashStorageResetAll(params);
      await resetAll.resetAllHashStorage();

      console.log('Hash storage reset completed successfully for all people');
    } catch (error) {
      console.error('Hash storage reset failed:', error);
      process.exit(1);
    }
  })();
}