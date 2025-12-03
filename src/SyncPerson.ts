import { CrudOperation, DataTarget, Input } from 'integration-core';
import { Config } from './config/Config';
import { ConfigManager } from './config/ConfigManager';
import { DataMapper } from './DataMapper';
import { BuCdmPersonDataSource } from './data-source/PersonDataSource';
import { HuronPersonDataTarget } from './data-target/PersonDataTarget';
import { AxiosResponseStreamFilter, ResponseProcessor } from './stream/AxiosResponseStreamFilter';

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
  private crudOperation: CrudOperation;

  constructor(params: { buid: string, crudOperation: CrudOperation, configPath?: string }) {
    this.buid = params.buid;
    this.crudOperation = params.crudOperation;
    
    // Load configuration
    const configManager = ConfigManager.getInstance();
    this.config = configManager.reset().fromFileSystem(params.configPath).fromEnvironment().getConfig();

    // Create integration components
    this.dataMapper = new DataMapper();
    let responseFilter: ResponseProcessor | undefined;
    if (this.config.dataSource.fieldsToKeep) {
      responseFilter = new AxiosResponseStreamFilter({ fieldsToKeep: this.config.dataSource.fieldsToKeep });
    }
    this.dataSource = new BuCdmPersonDataSource({ 
      config: this.config, 
      dataMapper: this.dataMapper,
      responseFilter,
      buid: this.buid 
    });

    this.dataTarget = new HuronPersonDataTarget(this.config);
  }

  /**
   * Execute the single person synchronization
   */
  async sync(): Promise<void> {
    try {
      console.log(`Starting Single Person Sync for BUID: ${this.buid}...`);
      console.log(`Client ID: ${this.config.integration.clientId}`);
      
      // Fetch person data from source
      const rawData = await this.dataSource.fetchRaw();
      
      // Bail out if no data found
      if (!rawData || rawData.length === 0) {
        console.log(`No person data found for BUID: ${this.buid}`);
        return;
      }

      // Convert data to integration format
      const input: Input = this.dataSource.convertRawToInput(rawData);
      
      // Bail out if no field sets generated
      if (!input.fieldSets || input.fieldSets.length === 0) {
        console.log(`No valid field sets generated for BUID: ${this.buid}`);
        return;
      }

      // Push the field set to target
      for (const fieldSet of input.fieldSets) {
        const result = await this.dataTarget.pushOne({
          data: fieldSet,
          crud: this.crudOperation
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
    let buid: string | undefined;;
    
    // If no BUID provided via command line, check environment variable
    if (process.argv.length >= 3 && process.argv[2]) {
      buid = process.argv[2];
    } else {
      buid = process.env.SYNC_BUID;
    }
    
    // Exit only if both command line and environment variable are missing
    if (!buid) {
      console.error('Usage: node SinglePersonSync.ts <BUID>');
      console.error('Alternatively, set the SYNC_BUID environment variable');
      process.exit(1);
    }

    // Sync the person and exit
    const sync = new SinglePersonSync({ buid, crudOperation: CrudOperation.CREATE });
    await sync.sync();
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
