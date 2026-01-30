import { CrudOperation, DataTarget, Input } from 'integration-core';
import { Config } from './config/Config';
import { ConfigManager } from './config/ConfigManager';
import { DataMapper } from './data-mapper/DataMapper';
import { BuCdmPersonDataSource } from './data-source/PersonDataSource';
import { HuronPersonDataTarget } from './data-target/PersonDataTarget';
import { AxiosResponseStreamFilter, ResponseProcessor } from './stream/AxiosResponseStreamFilter';
import { Cache } from './Cache';
import { isEmpty } from './utils/Utils';
import { Character, LooneyTunes } from '../test/LooneyTunes';

/**
 * Single person synchronization between Boston University CRM and Huron systems.
 * Fetches a specific person by BUID, transforms the data, and pushes to Huron.
 */
class SinglePersonSync {
  private config: Config;
  private dataSource: BuCdmPersonDataSource;
  private dataTarget: DataTarget;
  private dataMapper: DataMapper;
  private buid: string;

  constructor(private params: { 
    buid: string, 
    config: Config, 
    cache?: Cache<string, string>,
    preview?: boolean
  }) {

    const { config, cache, buid } = params;
    this.config = config;
    this.buid = buid;

    // Create integration components
    this.dataMapper = new DataMapper();
    let responseFilter: ResponseProcessor | undefined;
    if (this.config.dataSource.fieldsOfInterest) {
      responseFilter = new AxiosResponseStreamFilter({ fieldsOfInterest: this.config.dataSource.fieldsOfInterest });
    }
    this.dataSource = new BuCdmPersonDataSource({ 
      config: this.config, 
      dataMapper: this.dataMapper,
      responseFilter,
      buid: this.buid 
    });

    this.dataTarget = new HuronPersonDataTarget(this.config, cache);
  }

  async getMappedPerson(rawData?: any[]): Promise<Input> {
    try { 

      // Fetch person data from source if not provided
      if (rawData === undefined) {
        rawData = await this.dataSource.fetchRaw();
      }
      
      // Bail out if no data found
      if (!rawData || rawData.length === 0) {
        console.log(`No person data found for BUID: ${this.buid}`);
        return { } as Input;
      }

      // Convert data to integration format
      const input: Input = this.dataMapper.getMappedData(rawData);
      
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

  /**
   * Execute the single person synchronization
   */
  async sync(params: { crudOperation?: CrudOperation, rawData?: any[] }): Promise<void> {
    try {
      console.log(`Starting Single Person Sync for BUID: ${this.buid}...`);
      console.log(`Client ID: ${this.config.integration.clientId}`);

      let { crudOperation = CrudOperation.CREATE, rawData } = params;
      
      // Get the person data mapped to integration format
      const input = await this.getMappedPerson(rawData);

      // Bail out if no data to push
      if(isEmpty(input)) {
        console.log(`No data to push for BUID: ${this.buid}, exiting sync.`);
        return;
      }

      // Push the field set to target
      for (const fieldSet of input.fieldSets) {
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
}

/**
 * Main entry point for command line execution
 */
async function main() {
  try {
    let buid: string | undefined;
    let crudOperation: string | undefined;
    let rawData: any[] | undefined;

    // Load configuration
    const configManager = ConfigManager.getInstance();
    const config = configManager.reset().fromEnvironment().fromFileSystem().getConfig();

     // Disable source person lookup field filtering for this single sync
    delete config.dataSource.fieldsOfInterest;
    
    // If no BUID provided via command line, check environment variable
    if (process.argv.length >= 3 && process.argv[2]) {
      buid = process.argv[2];
    } else {
      buid = process.env.SYNC_BUID;
    }

    // If no crud operation provided via command line, check environment variable
    if (process.argv.length >= 4 && process.argv[3]) {
      crudOperation = process.argv[3].toLowerCase();
    } else {
      const { SYNC_CRUD = CrudOperation.CREATE } = process.env;
      crudOperation = SYNC_CRUD.toLowerCase();
    }
    
    // Make sure crudOperation is a valid CrudOperation member.
    if (!Object.values(CrudOperation).includes(crudOperation as CrudOperation)) {
      console.error(`Invalid CRUD operation: ${crudOperation}. Must be one of: ${Object.values(CrudOperation).join(', ')}`);
      process.exit(1);
    }
    
    // Exit only if both command line and environment variable are missing
    if (!buid ) {
      if( crudOperation !== CrudOperation.CREATE ) {
        console.error('Usage: node SinglePersonSync.ts <BUID> <CRUD_OPERATION>');
        console.error('Alternatively, set the SYNC_BUID and/or the SYNC_CRUD environment variable');
        process.exit(1);
      }
      else {
        rawData = new LooneyTunes(Character.BugsBunny).getRandomCdmPersonData();
        buid = rawData[0].personid;
      }
    }

    // Assert buid is now a string (guaranteed by the above logic)
    buid = buid!;

    // Sync (create) the person and exit
    const sync = new SinglePersonSync({ config, buid });
    await sync.sync({ crudOperation: crudOperation as CrudOperation, rawData });
    process.exit(0);

  } catch (error) {
    console.error('Single Person Sync failed:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main();
}

export { SinglePersonSync };
