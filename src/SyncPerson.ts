import { CrudOperation, DataSource, DataTarget, Input } from 'integration-core';
import { Config } from './config/Config';
import { ConfigManager } from './config/ConfigManager';
import { DataMapper } from './data-mapper/DataMapper';
import { BuCdmPersonDataSource } from './data-source/PersonDataSource';
import { BuCdmCurrentTermsDataSource } from './data-source/CurrentTermsDataSource';
import { Term } from './data-source/CurrentTermsDataSource';
import { HuronPersonDataTarget } from './data-target/PersonDataTarget';
import { AxiosResponseStreamFilter, ResponseProcessor } from './stream/AxiosResponseStreamFilter';
import { BasicCache, Cache } from './Cache';
import { isEmpty } from './Utils';
import { Character, LooneyTunes } from '../test/LooneyTunes';
import { ReadPerson } from './data-target/crud/ReadPerson';
import { HuronPerson } from './data-target/crud/Person';

type PersonSyncParams = {
  config: Config;
  cache?: Cache<string, string>;
  orgHrn?: (sourceOrgId: string) => string | undefined;
  preview?: boolean;
  currentTerms?: Term[]; // Optional for backward compatibility, will be fetched if not provided
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
  private currentTerms: Term[] | undefined;
  private orgHrn: ((sourceOrgId: string) => string | undefined) | undefined;

  private constructor(private params: SinglePersonSyncParams) {
    const { config, cache, buid, orgHrn, currentTerms } = params;
    this.config = config;
    this.buid = buid;
    this.orgHrn = orgHrn;
    this.currentTerms = currentTerms;

    // DataMapper will be initialized in ensureInitialized()
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

  /**
   * Static factory method to create SinglePersonSync with currentTerms fetched
   */
  public static async create(params: SinglePersonSyncParams): Promise<SinglePersonSync> {
    const instance = new SinglePersonSync(params);
    await instance.ensureInitialized();
    return instance;
  }

  /**
   * Ensure DataMapper is initialized with currentTerms
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.dataMapper) {
      if (!this.currentTerms) {
        console.log('Fetching current terms for person sync...');
        const termsDataSource = new BuCdmCurrentTermsDataSource({ config: this.config });
        this.currentTerms = await termsDataSource.fetchRaw();
        console.log(`Fetched ${this.currentTerms.length} current term(s)`);
      }
      this.dataMapper = new DataMapper({ 
        currentTerms: this.currentTerms,
        orgHrn: this.orgHrn
      });
    }
  }

  private getMappedPerson = async (rawData?: any[]): Promise<Input> => {
    try { 
      // Ensure DataMapper is initialized
      await this.ensureInitialized();

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
    const { buids, preview, config, currentTerms } = params;
    
    // Fetch current terms once if not already provided
    let sharedCurrentTerms = currentTerms;
    if (!sharedCurrentTerms) {
      console.log('Fetching current terms for batch sync...');
      const termsDataSource = new BuCdmCurrentTermsDataSource({ config });
      sharedCurrentTerms = await termsDataSource.fetchRaw();
      console.log(`Fetched ${sharedCurrentTerms.length} current term(s) to be shared across all syncs`);
    }
    
    for (let i=0; i<buids.length; i++) {
      try {
        const singleSync = await SinglePersonSync.create({ 
          config: params.config, 
          cache: params.cache, 
          orgHrn: params.orgHrn, 
          preview,
          buid: buids[i],
          currentTerms: sharedCurrentTerms
        });
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
      const sync = await SinglePersonSync.create({ config, buid, cache, orgHrn, preview });
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

      await SinglePersonSync.syncAll({ config, buids, cache, orgHrn, preview });
    }
    catch (error) {
      console.error('Multiple Person Sync failed:', error);
      process.exit(1);
    }
  }

  // Load configuration
  const configManager = ConfigManager.getInstance();
  const config = configManager.reset().fromEnvironment().fromFileSystem().getConfig('person');

  // Create a custom hrn expression that goes to a map for the actual hrn given a source org id key
  const orgs = await import('./data-mapper/OrgMap.json');
  const orgHrn = (sourceOrgId: string) => orgs.map.find((entry: any) => {
    return entry.id === sourceOrgId;
  })?.hrn;

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
      await syncMultiple(SYNC_BUIDS!, preview());
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

export { SinglePersonSync, SinglePersonSyncParams };
