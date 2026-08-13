import { DeltaStorage, FieldSet, Input } from "integration-core";
import { Config } from "../config/Config";
import { DataMapper } from "../data-mapper/DataMapper";
import { ReverseDataMapper } from "../data-mapper/ReverseDataMapper";
import { SourcePerson, SourcePersonParms, TargetPersonParms } from "./SyncEvaluator";
import { HashStorageReset as HashStorageResetForDb } from "./HashStorageResetForDb";
import { HashStorageReset as HashStorageResetForDynamoDB } from "./HashStorageResetForDynamoDb";
import { HashStorageReset as HashStorageResetForFile } from "./HashStorageResetForFile";
import { HashStorageReset as HashStorageResetForS3 } from "./HashStorageResetForS3";

export type HashStorageUpdaterParams = {
  storage: DeltaStorage;
  clientId: string;
  fieldSetsToUpdate: Map<string, FieldSet>;
  primaryKeyFields: Set<string>;
};

export type HashStorageResetParms = {
  sourcePersonParms: SourcePersonParms
  targetPersonParms: TargetPersonParms
};

export type HashStorageResetAllParms = {
  config: Config,
  sourceDataMapper: DataMapper,
  targetDataMapper: ReverseDataMapper
};

export abstract class AbstractHashStorageUpdater {
  constructor(private params: HashStorageUpdaterParams) { }

  public abstract updateStorage(): Promise<number>;

  /**
   * Get the primary key value(s) from a field set for logging purposes.
   * 
   * @param fieldSet - The field set to extract primary key value from
   * @param primaryKeyFields - The primary key field names
   * @returns Primary key value as a string (composite keys are joined)
   */
  public getPrimaryKeyValue(fieldSet: FieldSet): string {
    const { primaryKeyFields } = this.params;
    const pkFieldsArray = Array.from(primaryKeyFields);
    const pkValues = pkFieldsArray.map((pkField: string) => {
      const field = fieldSet.fieldValues.find(fv => Object.keys(fv)[0] === pkField);
      return field ? String(Object.values(field)[0]) : '';
    });
    return pkValues.join('|');
  }
}

export abstract class AbstractHashStorageReset {
  targetPersonData: Input[] = [];
  config: Config;

  constructor() { }

  public abstract updateHashStorage(): Promise<void>;
  
    /**
     * Perform an API lookup against the target system to retrieve the current state of a 
     * specific person's record.
     * @param hashStorageResetParms The parameters required to perform the lookup.
     * @returns A promise that resolves to an instance of HashStorageReset.
     */
    public static instanceFromLookup = async (hashStorageResetParms: HashStorageResetParms): Promise<AbstractHashStorageReset> => {
      // Lookup the target person data.
      const { sourcePersonParms, targetPersonParms } = hashStorageResetParms;
      const syncEvaluator = new SourcePerson(sourcePersonParms);
      let data = await syncEvaluator.getInputFromTarget(targetPersonParms);
  
      // Create an instance from the looked-up data.
      const { sourcePersonParms: { config: srcConfig }, targetPersonParms: { config: targetConfig } } = hashStorageResetParms;
      const config = srcConfig || targetConfig;
      return AbstractHashStorageReset.instanceFromData(config, data ? [data] : []);
    }
  
    /**
     * Create an instance of HashStorageReset from the provided data.
     * @param config The configuration object.
     * @param targetPersonData The current state of the target person's record.
     * @returns An instance of HashStorageReset.
     */
    public static instanceFromData = (config:Config, targetPersonData: Input[]): AbstractHashStorageReset => {
      let instance: AbstractHashStorageReset;
      switch (config.storage.type) {
        case 'file':
          instance = new HashStorageResetForFile();
          break;
        case 'database':
          instance = new HashStorageResetForDb();
          break;
        case 's3':
          instance = new HashStorageResetForS3();
          break;
        case 'dynamodb':
          instance = new HashStorageResetForDynamoDB();
          break;
        default:
          throw new Error(`Unsupported storage type: ${config.storage.type}`);
      }
      instance.config = config;
      if (targetPersonData) {
        instance.targetPersonData = targetPersonData;
      }
      return instance;
    }
  
}

export abstract class AbstractHashStorageResetAll {
  constructor(private params: HashStorageResetAllParms) { }

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
  abstract getAllTargetPersons(): Promise<Input[]>;

  public resetAllHashStorage = async (): Promise<void> => {
    const { config } = this.params;
    const targetPersonData: Input[] = await this.getAllTargetPersons();
    const updater = AbstractHashStorageReset.instanceFromData(config, targetPersonData);
    await updater.updateHashStorage();
  }
}