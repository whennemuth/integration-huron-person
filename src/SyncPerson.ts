import { CrudOperation, DataSource, DataTarget, Input } from 'integration-core';
import { Character, LooneyTunes } from '../test/LooneyTunes';
import { BasicCache, Cache } from './Cache';
import { Config } from './config/Config';
import { ConfigManager } from './config/ConfigManager';
import { DataMapper, getDataMapper } from './data-mapper/DataMapper';
import { BuCdmPersonDataSource } from './data-source/PersonDataSource';
import { HuronPerson } from './data-target/crud/Person';
import { ReadPerson } from './data-target/crud/ReadPerson';
import { HuronPersonDataTarget } from './data-target/PersonDataTarget';
import { AxiosResponseStreamFilter, ResponseProcessor } from './stream/AxiosResponseStreamFilter';
import { isEmpty } from './Utils';

type PersonSyncParams = {
  config: Config;
  cache?: Cache<string, string>;
  dataMapper?: DataMapper;
  preview?: boolean;
};

type SinglePersonSyncParams = PersonSyncParams & {
  buid: string;
};

type SinglePersonSyncAllParams = PersonSyncParams & {
  buids: string[];
};

/**
 * Single person synchronization between Boston University CRM and Huron systems.
 * Fetches a specific person by BUID, transforms the data, and pushes to Huron.
 */
class SinglePersonSync {
  private config: Config;
  private dataSource: DataSource;
  private dataTarget: DataTarget;
  private dataMapper: DataMapper | undefined;
  private buid: string;
  private targetPerson: HuronPerson | undefined;

  constructor(private params: SinglePersonSyncParams) {
    const { config, cache, buid, dataMapper } = params;
    this.config = config;
    this.buid = buid;
    this.dataMapper = dataMapper;

    let responseFilter: ResponseProcessor | undefined;
    if (this.config.dataSource.person?.fieldsOfInterest) {
      responseFilter = new AxiosResponseStreamFilter({ fieldsOfInterest: this.config.dataSource.person.fieldsOfInterest });
    }
    this.dataSource = new BuCdmPersonDataSource({ 
      config: this.config, 
      responseFilter,
      buid: this.buid 
    });

    this.dataTarget = new HuronPersonDataTarget(this.config, cache);
  }

  public getMappedPerson = async (rawData?: any[]): Promise<Input> => {
    try { 

      // Fetch person data from source if not provided
      if (rawData === undefined) {
        console.log(`SOURCE CHECK: Looking up raw person data for BUID: ${this.buid} from source...`);
        rawData = await this.dataSource.fetchRaw();
      }
      
      // Bail out if no data found
      if (!rawData || rawData.length === 0) {
        console.log(`Did not find ${this.buid} in source`);
        return { } as Input;
      }
      else {
        console.log(`Found ${this.buid} in source`);
      }

      // Convert data to integration format
      const input: Input = this.dataMapper!.getMappedData(rawData, this.targetPerson?.hrn);

      // Bail out if there are critical validation errors
      if (this.dataMapper!.criticalValidationErrorMessage) {
        console.error(`Critical validation error for BUID: ${this.buid}: ${this.dataMapper!.criticalValidationErrorMessage}`);
        return { } as Input;
      }
      
      // Bail out if no field sets generated
      if (!input.fieldSets || input.fieldSets.length === 0) {
        console.log(`No valid field sets generated for BUID: ${this.buid}`);
        return { } as Input;
      }

      return input;
    } catch (error) {
      console.error(`Single Person Sync failed for BUID: ${this.buid}:`, error);
      throw error;
    }
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

  /**
   * Execute the single person synchronization
   */
  public sync = async (params: { crudOperation?: CrudOperation, rawData?: any[] }): Promise<void> => {
    try {

      const line = '----------------------------------------------------------------------------------';
      console.log(`\n${line}\n        Syncing ${this.buid} \n${line}`);

      console.log(`Client ID: ${this.config.integration.clientId}`);

      const { preview } = this.params;
      let { crudOperation, rawData } = params;

      if( ! crudOperation ) {
        this.targetPerson = await this.getTargetPerson(this.buid, this.config);
        crudOperation = this.targetPerson ? CrudOperation.UPDATE : CrudOperation.CREATE;
      }
      
      // Get the person data mapped to integration format
      const input = await this.getMappedPerson(rawData);      

      // Bail out if no data to push
      if(isEmpty(input)) {
        console.log(`No data to push for BUID: ${this.buid}, exiting sync.`);
        return;
      }

      // Push the field set to target
      for (const fieldSet of input.fieldSets) {
        if(preview) {
          console.log(`Preview mode enabled - skipping push to target for BUID: ${this.buid}.`);
          continue;
        }
        const result = await this.dataTarget.pushOne({
          data: fieldSet,
          crud: crudOperation
        });
        console.log(`Push result for ${this.buid}:`, result.status, result.message);
      }
      
      console.log(`Single Person Sync completed successfully for BUID: ${this.buid}`);
    } catch (error) {
      console.error(`Single Person Sync failed for BUID: ${this.buid}:`, error);
      throw error;
    }
  }

  /**
   * Repeat execution of the single person synchronization for multiple BUIDs, with 
   * error handling to continue on failure to next BUID.
   * @param params 
   * @returns 
   */
  public static syncAll = async (params: SinglePersonSyncAllParams) => {
    const { buids } = params;
    
    for (let i=0; i<buids.length; i++) {
      try {
        const singleSync = new SinglePersonSync({ ...params, buid: buids[i] });
        await singleSync.sync({ });
      } 
      catch (error) {
        if(i == buids.length - 1) {
          return;
        }
        console.log(`Moving on to next BUID: ${buids[i+1]} after failure with BUID: ${buids[i]}`);
      }
    }
  }
}


/**
 * Main entry point for command line execution
 */
async function main() {
  
  const syncOne = async (params: { buid:string, crudOperation?: string, preview?: boolean }) => {
    let rawData: any[] | undefined;

    try {
      let { buid, crudOperation, preview } = params;

      // Disable source person lookup field filtering for this single sync
      if (config.dataSource.person) {
        delete config.dataSource.person.fieldsOfInterest;
      }
      
      if ( ! buid ) {
        if( crudOperation === CrudOperation.CREATE || crudOperation === undefined ) {
          crudOperation = CrudOperation.CREATE;
          rawData = new LooneyTunes(Character.DaffyDuck).getRandomCdmPersonData();
          buid = rawData[0].personid;      }
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
      const cache = config.cache?.enabled ? BasicCache.getInstance(config.cache.path) : undefined;

      // Sync (create/update) the person and exit
      const sync = new SinglePersonSync({ 
        config, buid, cache, dataMapper, preview 
      });

      await sync.sync({ crudOperation: crudOperation as CrudOperation, rawData });
    } 
    catch (error) {
      console.error('Single Person Sync failed:', error);
      process.exit(1);
    }
  }

  const syncMultiple = async (buidsString: string, preview?: boolean) => {
    try {
      if( buidsString === undefined || buidsString.trim() === '' ) {
        console.error('No BUIDs provided for multiple sync. Please set the SYNC_BUIDS environment variable with a comma-separated list of BUIDs.');
        process.exit(1);
      }

      // Disable source person lookup field filtering for this single sync
      if (config.dataSource.person) {
        delete config.dataSource.person.fieldsOfInterest;
      }

      // Create the token cache
      const cache = config.cache?.enabled ? BasicCache.getInstance(config.cache.path) : undefined;

      // Turn the comma-separated BUIDs into an array
      const buids = buidsString.split(',').map(buid => buid.trim());

      await SinglePersonSync.syncAll({ 
        config, buids, cache, dataMapper, preview 
      });
    }
    catch (error) {
      console.error('Multiple Person Sync failed:', error);
      process.exit(1);
    }
  }



  // Load configuration
  const configManager = ConfigManager.getInstance();
  const config = configManager.reset().fromEnvironment().fromFileSystem().getConfig('person');

  // Instantiate a single DataMapper to be shared across all syncs in this execution.
  const dataMapper = await getDataMapper(config);

  // Determine whether to sync one or multiple people based on SYNC_TASK environment variable
  const { 
    SYNC_TASK,
    SYNC_BUID, 
    SYNC_CRUD,
    SYNC_BUIDS,
    SYNC_PREVIEW
  } = process.env;

  const preview = () => `${SYNC_PREVIEW}`.trim().toLowerCase() === 'true';

  // Perform the requested sync task
  switch (SYNC_TASK) {
    case 'one':
      await syncOne({ buid: SYNC_BUID!, crudOperation: SYNC_CRUD, preview: preview() });
      break;
    case 'all':
      await syncMultiple( SYNC_BUIDS!, preview() );
      break;
    default:
      console.error('Please set SYNC_TASK environment variable to either "one" or "all"');
      process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main();
}

export { SinglePersonSync, SinglePersonSyncParams, SinglePersonSyncAllParams };

