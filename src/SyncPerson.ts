import { CrudOperation, DataSource, DataTarget, DeltaStrategy, FieldSet, Input, InputParser, InputUtilsDecorator, SinglePushResult, Status } from 'integration-core';
import { Character, LooneyTunes } from './miscellaneous/LooneyTunes';
import { BasicCache, Cache } from './Cache';
import { Config } from './config/Config';
import { ConfigManager } from './config/ConfigManager';
import { DataMapper, getDataMapper, ReverseDataMapper } from './data-mapper/DataMapper';
import { FieldFilter } from './data-mapper/FieldFilter';
import { BuCdmPersonDataSource } from './data-source/PersonDataSource';
import { HuronPerson } from './data-target/crud/Person';
import { ReadPerson } from './data-target/crud/ReadPerson';
import { HuronPersonDataTarget } from './data-target/PersonDataTarget';
import { DeltaStrategyFactory } from './delta-strategy/DeltaStrategyFactory';
import { HashStorageUpdater } from './delta-strategy/merging/HashStorageUpdater';
import { SourcePerson, SourcePersonParms, TargetPersonParms } from './miscellaneous/SyncEvaluator';
import { AxiosResponseStreamFilter, ResponseProcessor } from './stream/AxiosResponseStreamFilter';
import { isEmpty } from './Utils';

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
  private dataTarget: DataTarget;
  private targetPerson: HuronPerson | undefined;
  private pushResult: SinglePushResult;
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

  private getHrn = (): string | undefined => {
    const { instanceParams: { hrn }, targetPerson } = this;
    if(targetPerson) {
      return targetPerson.hrn;
    }
    if(hrn) {
      return hrn;
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
      }

      // Convert data to integration format
      const unparsedInput: Input = dataMapper!.getMappedData({ rawData, personHrn: getHrn(), crudOperation: crudOperation });

      // Bail out if there are critical validation errors
      if (dataMapper!.criticalValidationErrorMessage) {
        console.error(`Critical validation error for BUID: ${buid}: ${dataMapper!.criticalValidationErrorMessage}`);
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

  private getTargetPerson = async (buid: string, config: Config): Promise<HuronPerson | undefined> => {
    const reader = new ReadPerson(config);
    console.log(`TARGET CHECK: Looking up person with BUID ${buid} in target as "id"...`);
    const personData = await reader.readPersonById(buid) ?? [];
    const targetPerson = personData.length > 0 ? personData[0] : undefined;
    if (targetPerson) {
      console.log(`Found ${buid} in target (indicates a patch)`);
    }
    else {
      console.log(`Did not find ${buid} in target (indicates a create)`);
    }
    return targetPerson;
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
  public sync = async (params?: { crudOperation?: CrudOperation, rawData?: any[], suppressHashUpdate?: boolean }): Promise<void> => {
    const { instanceParams: { config, buid, hashStorage }, getHrn, instanceParams, logPrefix } = this;
    try {

      const line = '----------------------------------------------------------------------------------';
      console.log(`\n${line}\n        Syncing ${buid} \n${line}`);

      console.log(`Client ID: ${config.integration.clientId}`);

      const { preview } = instanceParams;
      let { crudOperation, rawData, suppressHashUpdate } = params || {};

      if( ! crudOperation ) {
        if( ! getHrn() ) {
          this.targetPerson = await this.getTargetPerson(buid, config);
        }        
        crudOperation = getHrn() ? CrudOperation.UPDATE : CrudOperation.CREATE;
      }
      
      // Get the person data mapped to integration format
      // Apply hashing if hash storage is enabled
      const input = await this.getMappedPerson({ rawData, crudOperation });      

      // Bail out if no data to push
      if(isEmpty(input)) {
        console.log(`No data to push for BUID: ${buid}, exiting sync.`);
        return;
      }

      // Validate single person sync has exactly one field set
      if (!input.fieldSets || input.fieldSets.length === 0) {
        console.log(`No field sets found for BUID: ${buid}, exiting sync.`);
        return;
      }
      if (input.fieldSets.length > 1) {
        console.warn(`Expected exactly 1 field set for single person sync, but found ${input.fieldSets.length} for BUID: ${buid}. Only processing the first one.`);
      }

      // Check if source and target are already in sync (UPDATE operations only)
      let skipPush = false;
      if (crudOperation === CrudOperation.UPDATE && hashStorage?.enabled && !preview) {
        console.log(`Checking if source and target are already in sync for BUID: ${buid}...`);
        try {
          const sourcePersonParams: SourcePersonParms = {
            config,
            buid,
            sourceDataMapper: this.instanceParams.dataMapper!
          };
          const targetPersonParams: TargetPersonParms = {
            config,
            buid,
            targetDataMapper: new ReverseDataMapper()
          };
          const sourcePerson = new SourcePerson(sourcePersonParams);
          const inSync = await sourcePerson.isInSyncWith(targetPersonParams);
          
          // if (inSync) {
          //   skipPush = true;
          //   console.log(`Source and target are already in sync for BUID: ${buid}. Skipping push to target.`);
          //   console.log(`Hash storage will still be updated to ensure consistency.`);
          //   // NOTE: Currently, hash storage updates will occur even when source/target are in sync.
          //   // This handles cases where the hash storage record may be missing or out of date.
          //   // In the future, once the system is fully mature, we expect that ANY person found in
          //   // the target system will ALWAYS have a corresponding record in hash storage. At that point,
          //   // this update could be optimized to only occur when the hash storage is actually missing.
          // } else {
          //   console.log(`Source and target are out of sync for BUID: ${buid}. Proceeding with update.`);
          // }
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
          primaryKey: input.fieldSets[0].fieldValues.filter(fv => {
            const key = Object.keys(fv)[0];
            return input.fieldDefinitions?.find(fd => fd.name === key && fd.isPrimaryKey);
          }),
          crud: crudOperation!
        };
        console.log(`${this.logPrefix}Push result for ${buid}:`, this.pushResult.status, this.pushResult.message);
      } else {
        const result = await this.dataTarget.pushOne({
          data: input.fieldSets[0],
          crud: crudOperation
        });
        this.pushResult = result;
        console.log(`${logPrefix}Push result for ${buid}:`, result.status, result.message);
      }

      // Update hash storage if enabled and sync was successful (including when push was skipped)
      // Skip individual update if suppressHashUpdate is true (used in batch operations)
      if (hashStorage?.enabled && this.pushResult?.status === Status.SUCCESS && !suppressHashUpdate) {
        await this.updateHashStorage(input);
      }
      
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

  try {
    // Load configuration
    const configManager = ConfigManager.getInstance();
    const config = configManager.reset().fromEnvironment().fromFileSystem().getConfig('person');

    // Instantiate a single DataMapper to be shared across all syncs in this execution.
    const dataMapper = await getDataMapper(config, { orgMap: false, stateMap: true, countryMap: true });

    // Get environment variables for single person sync
    let { SYNC_BUID, SYNC_CRUD, SYNC_PREVIEW, SYNC_UPDATE_HASH } = process.env;
    let buid = SYNC_BUID;
    let crudOperation = SYNC_CRUD;
    const preview = `${SYNC_PREVIEW}`.trim().toLowerCase() === 'true';
    const updateHashStorage = `${SYNC_UPDATE_HASH}`.trim().toLowerCase() === 'true';

    // Create hash storage config if enabled
    const hashStorage = updateHashStorage ? {
      enabled: true,
      deltaStrategy: DeltaStrategyFactory.createStrategy({ config })
    } : undefined;

    // Disable source person lookup field filtering for this single sync
    if (config.dataSource.person) {
      delete config.dataSource.person.fieldsOfInterest;
    }
    
    if ( ! buid ) {
      if( crudOperation === CrudOperation.CREATE || crudOperation === undefined ) {
        crudOperation = CrudOperation.CREATE;
        rawData = new LooneyTunes(Character.DaffyDuck).getRandomCdmPersonData();
        buid = rawData[0].personid;
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
  main();
}

export { PersonSyncParams, SinglePersonSync, SinglePersonSyncParams };

