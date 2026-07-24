import { CrudOperation, DataSource, DeltaStrategy, FieldSet, Input, InputParser, InputUtilsDecorator, isS3Config, SinglePushResult, Status, TestEnvironment } from 'integration-core';
import { BasicCache, Cache } from './Cache';
import { Config } from './config/Config';
import { ConfigManager } from './config/ConfigManager';
import { DataMapper, getDataMapper, ReverseDataMapper } from './data-mapper/DataMapper';
import { FieldFilter } from './data-mapper/FieldFilter';
import { BuCdmPersonDataSource } from './data-source/PersonDataSource';
import { HuronPerson } from './data-target/crud/Person';
import { ReadPerson } from './data-target/crud/ReadPerson';
import { HuronPersonDataTarget } from './data-target/PersonDataTarget';
import { IntegratedDeltaClientIdDeltaStrategy } from './delta-strategy/decorators/IntegratedDeltaClientId';
import { DeltaStrategyFactory } from './delta-strategy/DeltaStrategyFactory';
import { HashStorageUpdater } from './delta-strategy/merging/HashStorageUpdater';
import { Character, LooneyTunes } from './miscellaneous/LooneyTunes';
import { SourcePerson, SourcePersonParms, TargetPersonParms } from './miscellaneous/SyncEvaluator';
import { AxiosResponseStreamFilter, ResponseProcessor } from './stream/AxiosResponseStreamFilter';
import { getLocalConfig, isEmpty } from './Utils';

/**
 * Base parameters shared by both single and batch person sync operations.
 * Exported to enable composition pattern in BatchPersonSync.
 */
type PersonSyncParams = {
  config: Config;
  cache?: Cache<string, string>;
  dataMapper?: DataMapper;
  preview?: boolean;
  hashStorage?: {
    enabled: boolean;
    deltaStrategy?: DeltaStrategy;
  };
  forceUpdate?: boolean; // Optional flag to force updates even if source and target are in sync
};

type SinglePersonSyncParams = PersonSyncParams & {
  buid: string;
  hrn?: string;
};



/**
 * Single person synchronization between Boston University CDM and Huron systems.
 * Fetches a specific person by BUID, transforms the data, and pushes to Huron.
 */
class SinglePersonSync {
  private dataSource: DataSource;
  private dataTarget: HuronPersonDataTarget;
  private targetPerson: HuronPerson | undefined;
  private targetPersonLookupAttempted = false;
  private pushResult: SinglePushResult;
  private rawPersonData: any[] | undefined;
  private mappedPerson: Input | undefined;
  private logPrefix: string;

  constructor(private instanceParams: SinglePersonSyncParams) {
    const { config, cache, buid, hrn } = instanceParams;
    const dryRun = `${process.env.DRY_RUN}`.trim().toLowerCase() === 'true';
    this.logPrefix = dryRun ? '[DRY RUN]: ' : '';
    let responseFilter: ResponseProcessor | undefined;
    if (config.dataSource.person?.fieldsOfInterest) {
      responseFilter = new AxiosResponseStreamFilter({ fieldsOfInterest: config.dataSource.person.fieldsOfInterest });
    }

    this.dataSource = new BuCdmPersonDataSource({ config, responseFilter, buid: buid });

    this.dataTarget = new HuronPersonDataTarget({ config, cache, hrn });
  }

  private getHrn = async (): Promise<string | undefined> => {
    const { instanceParams: { hrn }, getTargetPerson } = this;
    if(hrn) {
      return hrn;
    }
    const targetPerson = await getTargetPerson();
    if(targetPerson) {
      return targetPerson.hrn;
    }
    return undefined;
  }

  private getFilteredFields = (fieldSet: FieldSet): FieldSet => {
    const { instanceParams: { dataMapper } } = this;
    const { stateMappings, countryMappings, orgMappings } = dataMapper || {};
    
    if (!stateMappings || !countryMappings) {
      throw new Error('DataMapper must have state and country mappings to apply field filtering');
    }
    
    return new FieldFilter({ fieldSet, stateMappings, countryMappings, orgMappings }).filter();
  }

  public getMappedPerson = async (params: { rawData?: any[], crudOperation?: CrudOperation }): Promise<Input> => {
    if( this.mappedPerson ) {
      return this.mappedPerson;
    }
    const { instanceParams: { dataMapper, buid, hashStorage }, getHrn, getFilteredFields } = this;
    let { rawData, crudOperation } = params;
    try { 

      // Fetch person data from source if not provided
      if (rawData === undefined) {
        console.log(`SOURCE CHECK: Looking up raw person data for BUID: ${buid} from source...`);
        rawData = await this.dataSource.fetchRaw();
      }
      
      // Bail out if no data found
      if (!rawData || rawData.length === 0) {
        console.log(`Did not find ${buid} in source`);
        return { } as Input;
      }
      else {
        console.log(`Found ${buid} in source`);
        this.rawPersonData = rawData;
      }

      // Convert data to integration format
      const personHrn = await getHrn();
      const unparsedInput: Input = dataMapper!.getMappedData({ rawData, personHrn, crudOperation: crudOperation });

      // Bail out if there are critical validation errors
      if (dataMapper!.criticalValidationErrorMessage) {
        console.error(`Critical validation error for BUID: ${buid}: ${dataMapper!.criticalValidationErrorMessage}`);
        // console.log(`Person data that caused the error: ${dataMapper!.personAsJson}`);
        return { } as Input;
      }
      
      // Bail out if no field sets generated
      if (!unparsedInput.fieldSets || unparsedInput.fieldSets.length === 0) {
        console.log(`No valid field sets generated for BUID: ${buid}`);
        return { } as Input;
      }

      // Apply hash if hash storage is enabled (for hash storage updates)
      if (hashStorage?.enabled) {
        const input = new InputParser({ 
          _input: unparsedInput, 
          fieldFilter: (fs) => getFilteredFields(fs)
        }).parse();
        this.mappedPerson = input;
        return input;
      }

      this.mappedPerson = unparsedInput;
      return unparsedInput;
    } catch (error) {
      console.error(`Single Person Sync failed for BUID: ${buid}:`, error);
      this.mappedPerson = undefined;
      throw error;
    }
  }

  public getMappingError = (): string | undefined => {
    const { dataMapper } = this.instanceParams;
    const { criticalValidationErrorMessage, infoValidationErrorMessage} = dataMapper || {};
    if(criticalValidationErrorMessage) {
      return criticalValidationErrorMessage;
    }
    if(infoValidationErrorMessage) {
      return infoValidationErrorMessage;
    }
    return undefined;
  }

  public clearMappingMessages = (): void => {
    const { dataMapper } = this.instanceParams;
    dataMapper?.clearMessages();
  }
  
  private getTargetPerson = async (): Promise<HuronPerson | undefined> => {
    if(this.targetPerson || this.targetPersonLookupAttempted) {
      return this.targetPerson;
    }

    const { instanceParams: {buid, config } } = this;
    const reader = new ReadPerson({ config });
    console.log(`TARGET CHECK: Looking up person with BUID ${buid} in target as "sourceIdentifier"...`);
    const personData = await reader.readPersonBySourceIdentifier(buid) ?? [];
    const targetPerson = personData.length > 0 ? personData[0] : undefined;
    if (targetPerson) {
      console.log(`Found ${buid} in target (indicates a patch)`);
    }
    else {
      console.log(`Did not find ${buid} in target (indicates a create)`);
    }
    this.targetPersonLookupAttempted = true;
    this.targetPerson = targetPerson;
    return this.targetPerson;
  }

  /**
   * Deactivate the person in the target system if they exist, by setting active=false. 
   * This is used when there is no data to push for an existing person, which we interpret 
   * as a delete operation. Since the target system does not support hard deletes, we 
   * perform a soft delete by deactivating the person record instead.
   */
  private deactivateTargetPersonIfExists = async (): Promise<void> => {
    const targetPerson = await this.getTargetPerson();
    const { instanceParams: { config, buid, cache }, logPrefix } = this;
    if(targetPerson) {
      if(targetPerson.active === false) {
        console.log(`No-op: need to deactivate ${buid} in target system, but already inactive.`);
        return;
      }
      console.log(`Deactivating ${buid} in target system...`);
      const deactivator = new HuronPersonDataTarget({ config, cache, hrn: targetPerson.hrn });
      const result = await deactivator.pushOne({
        data: {
          fieldValues: [
            { hrn: targetPerson.hrn },
            { sourceIdentifier: buid },
          ]
        },
        crud: CrudOperation.DELETE
      });
      this.pushResult = result;
      console.log(`${logPrefix}Deactivation push result for ${buid}:`, result.status, result.message);
    }
    else {
      console.log(`No-op: need to deactivate ${buid} in target system, but person does not exist.`);
    }
  }

  private activateTargetPersonIfExists = async (): Promise<void> => {
    const targetPerson = await this.getTargetPerson();
    const { instanceParams: { config, buid, cache }, logPrefix } = this;
    if(targetPerson) {
      if(targetPerson.active === true) {
        console.log(`No-op: need to activate ${buid} in target system, but already active.`);
        return;
      }
      console.log(`Activating ${buid} in target system...`);
      const activator = new HuronPersonDataTarget({ config, cache, hrn: targetPerson.hrn });
      const result = await activator.pushOne({
        data: {
          fieldValues: [
            { hrn: targetPerson.hrn },
            { sourceIdentifier: buid },
            { active: true }
          ]
        },
        crud: CrudOperation.UPDATE
      });
      this.pushResult = result;
      console.log(`${logPrefix}Activation push result for ${buid}:`, result.status, result.message);
    }
    else {
      console.log(`No-op: need to activate ${buid} in target system, but person does not exist.`);
    }

  }

  public getPushResult = (): SinglePushResult => {
    return this.pushResult;
  }

  /**
   * Updates the hash storage for this person in storage.
   * 
   * Uses HashStorageUpdater utility to perform the update operation,
   * eliminating code duplication with batch update logic.
   */
  private updateHashStorage = async (input: Input): Promise<void> => {
    const { instanceParams: { config, buid }, logPrefix } = this;
    
    try {
      const deltaStrategy = DeltaStrategyFactory.createStrategy({ config });
      const { storage } = deltaStrategy;
      const clientId = config.integration.clientId;

      // Get primary key fields from the input's field definitions
      const inputUtils = new InputUtilsDecorator(input);
      const primaryKeyFields = inputUtils.getPrimaryKeys();

      // Get the field set to update
      const newFieldSet = input.fieldSets[0];

      // Create a map with single entry for the utility
      const fieldSetsToUpdate = new Map<string, FieldSet>();
      fieldSetsToUpdate.set(buid, newFieldSet);

      // Delegate to shared utility
      await HashStorageUpdater.updateStorage({
        storage,
        clientId,
        fieldSetsToUpdate,
        primaryKeyFields
      });

      // Log success with primary key value
      const primaryKeyValue = HashStorageUpdater.getPrimaryKeyValue(newFieldSet, primaryKeyFields);

      console.log(`${this.logPrefix}Hash storage updated successfully for person ${primaryKeyValue}`);
    } catch (error) {
      console.warn(`${this.logPrefix}Failed to update hash storage: ${error}. Sync to target was successful, but hash storage was not updated.`);
    }
  }

  /**
   * Execute the single person synchronization
   * @param params - Optional parameters
   * @param params.crudOperation - The CRUD operation to perform
   * @param params.rawData - Raw data to use instead of fetching
   * @param params.suppressHashUpdate - If true, skip individual hash storage update (used in batch operations)
   */
  public sync = async (params?: { 
    crudOperation?: CrudOperation,
    rawData?: any[], 
    suppressHashUpdate?: boolean,
    forceUpdate?: boolean
  }): Promise<void> => {
    const { instanceParams: { config, buid, hashStorage }, getHrn, instanceParams, logPrefix } = this;
    try {

      const line = '----------------------------------------------------------------------------------';
      console.log(`\n${line}\n        Syncing ${buid} \n${line}`);

      console.log(`Client ID: ${config.integration.clientId}`);

      const { preview } = instanceParams;
      let { crudOperation, rawData, suppressHashUpdate, forceUpdate=false } = params || {};

      if( ! crudOperation ) {
        const hrn = await getHrn();       
        crudOperation = hrn ? CrudOperation.UPDATE : CrudOperation.CREATE;
      }
      
      /**
       * Get the person data mapped to integration format and Apply hashing if hash storage 
       * is enabled 
       */
      const mappedPerson: Input = await this.getMappedPerson({ rawData, crudOperation });
      const cdmPerson = this.rawPersonData; // Set in getMappedPerson 

      /**
       * Update hash storage if enabled and sync was successful (including when push was skipped)
       * Skip individual update if suppressHashUpdate is true (used in batch operations)
       */
      const processHashStorage = async () => {
        if (hashStorage?.enabled && this.pushResult?.status === Status.SUCCESS && !suppressHashUpdate) {
          await this.updateHashStorage(mappedPerson);
        }
      }

      // Bail out if no data to push
      if(isEmpty(mappedPerson)) {
        console.log(`No valid data to push for BUID: ${buid}.`);
        await this.deactivateTargetPersonIfExists();
        return;
      }

      // Validate single person sync has exactly one field set
      if (!mappedPerson.fieldSets || mappedPerson.fieldSets.length === 0) {
        console.log(`No field sets found for BUID: ${buid}.`);
        await this.deactivateTargetPersonIfExists();
        return;
      }

      if (mappedPerson.fieldSets.length > 1) {
        console.warn(`Expected exactly 1 field set for single person sync, but found ${mappedPerson.fieldSets.length} for BUID: ${buid}. Only processing the first one.`);
      }

      /**
       * Determines whether the sync state should be assessed for the current person.
       * @returns true if sync state should be assessed, false otherwise.
       */
      const mustAssessSyncedState = (): boolean => {
        // Only assess sync state for UPDATE operations 
        if(crudOperation != CrudOperation.UPDATE) {
          return false;
        }        
        // Only assess sync state if hash storage is enabled (to avoid unnecessary API calls)
        if(!hashStorage?.enabled) {
          return false;
        }
        // Only assess sync state if forceUpdate is not set (to allow bypassing sync check 
        // which could cancel the update if inSync found to be true - ie: for role updates)
        if(forceUpdate) {
          return false;
        }
        if(preview) {
          console.log(`Preview mode enabled - skipping sync state assessment for BUID: ${buid}.`);
          return false;
        }
        console.log(`Checking if source and target are already in sync for BUID: ${buid}...`);
        return true;
      };

      // Check if source and target are already in sync (UPDATE operations only)
      let skipPush = false;
      if (mustAssessSyncedState()) {
        try {
          const sourcePersonParams: SourcePersonParms = {
            config,
            buid,
            cdmPerson,
            sourceDataMapper: this.instanceParams.dataMapper!
          };

          const huronPerson = await this.getTargetPerson();

          const targetPersonParams: TargetPersonParms = {
            config,
            buid,
            huronPerson,
            targetDataMapper: new ReverseDataMapper()
          };

          const sourcePerson = new SourcePerson(sourcePersonParams);
          const inSync = await sourcePerson.isInSyncWith(targetPersonParams);

          if (inSync) {
            console.log(`Source and target are already in sync for BUID: ${buid}.`);
            if(huronPerson && !huronPerson.active) {
              console.log(`For some reason, in-sync person is currently inactive in target. Attempting to activate...`);
              await this.activateTargetPersonIfExists();
            }
            skipPush = true;
            console.log(`Hash storage will still be updated to ensure consistency.`);
            // NOTE: Currently, hash storage updates will occur even when source/target are in sync.
            // This handles cases where the hash storage record may be missing or out of date.
            // In the future, once the system is fully mature, we expect that ANY person found in
            // the target system will ALWAYS have a corresponding record in hash storage. At that point,
            // this update could be optimized to only occur when the hash storage is actually missing.
          }
          else if (!huronPerson) {
            crudOperation = CrudOperation.CREATE;
            console.log(`Person with BUID: ${buid} does not exist in target, changing operation to ${CrudOperation.CREATE}.`);
          }          

        } catch (error) {
          console.warn(`Error checking sync status for BUID: ${buid}:`, error);
          console.log(`Proceeding with update to be safe.`);
        }
      }

      // Push the field set to target (unless skipped due to already being in sync)
      if(preview) {
        console.log(`Preview mode enabled - skipping push to target for BUID: ${buid}.`);
      } else if (skipPush) {
        // Source and target are already in sync - set success result without actual push
        this.pushResult = {
          status: Status.SUCCESS,
          message: 'Sync skipped - source and target already in sync',
          timestamp: new Date(),
          primaryKey: mappedPerson.fieldSets[0].fieldValues.filter(fv => {
            const key = Object.keys(fv)[0];
            return mappedPerson.fieldDefinitions?.find(fd => fd.name === key && fd.isPrimaryKey);
          }),
          crud: crudOperation!
        };
        console.log(`${this.logPrefix}Push result for ${buid}:`, this.pushResult.status, this.pushResult.message);
      } else {
        const result = await this.dataTarget.pushOne({
          data: mappedPerson.fieldSets[0],
          crud: crudOperation
        });
        this.pushResult = result;
        console.log(`${logPrefix}Push result for ${buid}:`, result.status, result.message);
      }

      await processHashStorage();
      
      console.log(`${logPrefix}Single Person Sync completed successfully for BUID: ${buid}`);
    } catch (error) {
      console.error(`${logPrefix}Single Person Sync failed for BUID: ${buid}:`, error);
      throw error;
    }
  }
}




/**
 * Main entry point for command line execution - single person sync
 */
async function main() {
  let rawData: any[] | undefined;
  const { HURON_PERSON_CONFIG_PATH } = process.env;

  try {
    // Load configuration
    const configManager = ConfigManager.getInstance();
    const localConfigPath = HURON_PERSON_CONFIG_PATH || getLocalConfig();
    const config = configManager.reset().fromEnvironment().fromFileSystem(localConfigPath).getConfig('person');

    // Instantiate a single DataMapper to be shared across all syncs in this execution.
    const dataMapper = await getDataMapper(config, { orgMap: true, stateMap: true, countryMap: true });

    // Get environment variables for single person sync
    let { SYNC_BUID, SYNC_CRUD, SYNC_PREVIEW, SYNC_UPDATE_HASH, DELTA_STORAGE_BUCKET } = process.env;
    let buid = SYNC_BUID;
    let crudOperation = SYNC_CRUD;
    const preview = `${SYNC_PREVIEW}`.trim().toLowerCase() === 'true';
    const updateHashStorage = `${SYNC_UPDATE_HASH}`.trim().toLowerCase() === 'true';

    if(DELTA_STORAGE_BUCKET && isS3Config(config.storage.config)) {
      console.log(`Using custom delta storage bucket from environment variable: ${DELTA_STORAGE_BUCKET}`);
      config.storage.config.bucketName = DELTA_STORAGE_BUCKET;
    }

    IntegratedDeltaClientIdDeltaStrategy.customizeConfig(
      config, 
      'SYNC_PERSON_INTEGRATED_DELTA_CLIENT_ID'
    ); 

    // Create hash storage config if enabled
    const hashStorage = updateHashStorage ? {
      enabled: true,
      deltaStrategy: DeltaStrategyFactory.createStrategy({ 
        config, 
        ignoreRemovals: true,
        trustPreviousStorage: false // default 
      })
    } : undefined;

    // Disable source person lookup field filtering for this single sync
    if (config.dataSource.person) {
      delete config.dataSource.person.fieldsOfInterest;
    }
    
    if ( ! buid ) {
      if( crudOperation === CrudOperation.CREATE || crudOperation === undefined ) {
        crudOperation = CrudOperation.CREATE;
        rawData = new LooneyTunes(Character.DaffyDuck).getRandomCdmPersonData();
        buid = rawData![0].personid;      
      }
      else {
        // Exit only if both command line and environment variable are missing
        console.error('Usage: node SinglePersonSync.ts <BUID> <CRUD_OPERATION>');
        console.error('Alternatively, set the SYNC_BUID and/or the SYNC_CRUD environment variable');
        process.exit(1);
      }
    }

    // Assert buid is now a string (guaranteed by the above logic)
    buid = buid!;

    // Create the token cache
    const cache = BasicCache.getInstance(config);

    // Sync (create/update) the person and exit
    const sync = new SinglePersonSync({ 
      config, buid, cache, dataMapper, preview, hashStorage
    });

    await sync.sync({ crudOperation: crudOperation as CrudOperation, rawData });
  } 
  catch (error) {
    const dryRun = `${process.env.DRY_RUN}`.trim().toLowerCase() === 'true';
    console.error(`${dryRun ? '[DRY RUN]: ' : ''}Single Person Sync failed:`, error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  const testEnvironment = TestEnvironment('SYNC_PERSON');

  [
    'DRY_RUN',
    'SYNC_BUID',
    'SYNC_CRUD',
    'SYNC_PREVIEW',
    'SYNC_UPDATE_HASH',
    'INTEGRATED_DELTA_CLIENT_ID',
    'DELTA_STORAGE_BUCKET'
  ].forEach(testEnvironment.getVarOrEmptyString);
  main();
}

export { PersonSyncParams, SinglePersonSync, SinglePersonSyncParams };

