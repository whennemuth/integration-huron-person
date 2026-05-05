import { DeltaResult, DeltaStorage, DeltaStrategy, DeltaStrategyParams, FieldSet, Input, InputUtilsDecorator } from "integration-core";
import { Config } from "../config/Config";
import { ReadPerson } from "../data-target/crud/ReadPerson";
import { HuronPerson } from "../data-target/crud/Person";
import { ConfigManager } from "../config/ConfigManager";
import { getDataMapper } from "../data-mapper/DataMapper";
import { BasicCache } from "../Cache";
import { SinglePersonSync } from "../SyncPerson";
import { DeltaStrategyFactory } from "./DeltaStrategyFactory";

/**
 * Delta strategy implementation for upsert operations. Unlike traditional delta strategies that
 * determine creates, updates, and deletes based on comparison of the incoming person data with 
 * the previous state (file containing key + hash records from prior sync operations), the upsert 
 * delta strategy determines this information "on the fly". That is, it attempts to look up each
 * person in the target system to determine whether it should be created or updated. 
 * 
 * You would typically use this strategy if:
 *   1) It is your first sync ever yet there may already be people in the target system. 
 *   2) The record previous state has been lost or become corrupted or inaccurate somehow.
 * 
 * This will mean the maximum in API calls to the target system API and entails a lengthy 
 * operation duration. It is recommended to run this strategy with a high degree of parallelism 
 * (e.g. via the processor in this project) and not to use it for regular sync runs. Once the 
 * initial sync is complete, you should switch to a more traditional delta strategy that relies on 
 * the previous state file for determining creates, updates, and deletes.
 */
export class UpsertDeltaStrategy implements DeltaStrategy {
  parms: DeltaStrategyParams;
  private readPerson: ReadPerson;

  constructor(
    private deltaStrategy: DeltaStrategy,
    private config: Config,
    private lookupPersonInTargetSystemCache?: (person: FieldSet | string) => Promise<any> // Optional function for looking up person in target system (used by UpsertDeltaStrategy)
  ) {
    this.parms = deltaStrategy.parms;
    this.readPerson = new ReadPerson(config);
  }

  get storage(): DeltaStorage {
    // Delegate to wrapped strategy's storage
    return this.deltaStrategy.storage;
  }

  /**
   * Compute delta by querying target system for each person.
   * This overrides the wrapped strategy's computeDelta to determine add/update/remove
   * based on existence in target system rather than previous delta storage.
   */
  public async computeDelta(params: {
    storage: DeltaStorage;
    currentFieldSets: FieldSet[];
    inputUtils: any;
    clientId: string;
  }): Promise<DeltaResult> {
    const { currentFieldSets } = params;
    
    const added: FieldSet[] = [];
    const updated: FieldSet[] = [];
    const removed: FieldSet[] = []; // In bulk reset mode, we don't identify removed records

    console.log(`UpsertDeltaStrategy: Querying target system for ${currentFieldSets.length} person(s)...`);

    // Query target system for each person to determine if they exist
    for (const person of currentFieldSets) {
      try {
        let existingPerson:any;
        if (this.lookupPersonInTargetSystemCache) {
          const sourceIdentifier = await this.lookupPersonInTargetSystemCache(person);
          if (sourceIdentifier) {
            console.log(`  → Found sourceIdentifier ${sourceIdentifier} in cache for person.`);
            existingPerson = { sourceIdentifier};
          }
        }

        if( ! existingPerson) {
          console.log(`  → SourceIdentifier not found in cache for person, querying target system directly...`);
          existingPerson = await this.lookupPersonInTargetSystem(person);
        }
        
        if (existingPerson) {
          // Person exists - should be updated
          updated.push(person);
          console.log(`  → Person ${this.getPersonIdentifier(person)} exists in target (will UPDATE)`);
        } else {
          // Person doesn't exist - should be added
          added.push(person);
          console.log(`  → Person ${this.getPersonIdentifier(person)} not found in target (will CREATE)`);
        }
      } catch (error) {
        // If lookup fails (e.g., API error), treat as new person to be safe
        console.warn(`  → Failed to lookup person ${this.getPersonIdentifier(person)}, treating as new:`, error);
        added.push(person);
      }
    }

    console.log(`UpsertDeltaStrategy: Delta computed - Added: ${added.length}, Updated: ${updated.length}, Removed: ${removed.length}`);

    return {
      added,
      updated,
      removed
    };
  }

  /**
   * Lookup a person in the target system by sourceIdentifier.
   * Returns the person if found, undefined if not found.
   */
  private async lookupPersonInTargetSystem(person: FieldSet): Promise<HuronPerson | undefined> {
    const sourceIdentifier = this.getSourceIdentifier(person);
    
    if (!sourceIdentifier) {
      console.warn('Person has no sourceIdentifier, cannot lookup in target system');
      return undefined;
    }

    try {
      // Query target system by sourceIdentifier
      const results = await this.readPerson.readPersonBySourceIdentifier(
        sourceIdentifier,
        ['hrn', 'id', 'sourceIdentifier'] // Only fetch minimal fields for existence check
      );
      
      return results.length > 0 ? results[0] : undefined;
    } catch (error: any) {
      // If error is 404 or "not found", treat as person not existing
      if (error.message?.includes('404') || error.message?.toLowerCase().includes('not found')) {
        return undefined;
      }
      // Other errors should bubble up
      throw error;
    }
  }

  /**
   * Extract sourceIdentifier from a FieldSet.
   * Tries multiple common field names.
   */
  private getSourceIdentifier(person: FieldSet): string | undefined {
    // FieldSet has fieldValues array of Field objects (each Field is { [key: string]: FieldValue })
    const fields = person.fieldValues;
    
    // Try various common field names
    const fieldNames = ['sourceIdentifier', 'source_identifier', 'id'];
    for (const fieldName of fieldNames) {
      const field = fields.find(fv => Object.keys(fv)[0] === fieldName);
      if (field) {
        return Object.values(field)[0] as string;
      }
    }
    
    return undefined;
  }

  /**
   * Get a human-readable identifier for logging
   */
  private getPersonIdentifier(person: FieldSet): string {
    return this.getSourceIdentifier(person) || '(unknown)';
  }
}

/**
 * This is just to demonstrate the delta strategy in action with a single person sync, without 
 * needing to set up the full processor and S3 infrastructure. In a real sync run, the input would 
 * come from the ndjson chunk file and contain multiple people. We will pretend it came from a line 
 * in the chunk ndjson file for this demonstration.
 */
async function main() {

  /**
   * Get input data from the source system, This will be the ndjson chunk file line for this demonstration.
   */
  const getInput = async (config: Config): Promise<Input> => {
    // Instantiate a single DataMapper.
    const dataMapper = await getDataMapper(config, { orgMap: false, stateMap: true, countryMap: true });

    let { SYNC_BUID } = process.env;
    let buid = SYNC_BUID!;

    // Disable source person lookup field filtering for this single sync
    if (config.dataSource.person) {
      delete config.dataSource.person.fieldsOfInterest;
    }
    
    // Create the token cache
    const cache = BasicCache.getInstance(config);
    
    // Use SinglePersonSync to get mapped person data
    const sync = new SinglePersonSync({ config, buid, cache, dataMapper });    
    const input = await sync.getMappedPerson({});
    return input;
  }

  try {    
    // Load configuration
    const configManager = ConfigManager.getInstance();
    const config = await configManager
      .reset()
      .fromSecretManager(process.env.SECRET_ARN) // Load from Secrets Manager first if SECRET_ARN is provided
      .fromEnvironment()
      .fromFileSystem()
      .getConfigAsync('person');

    const { integration: { clientId = 'unknown-client' } = {}} = config;

    const input = await getInput(config);

    const deltaStrategy = DeltaStrategyFactory.createStrategy({ config });

    const upsertStrategy = new UpsertDeltaStrategy(deltaStrategy, config);

    const deltaResult = await upsertStrategy.computeDelta({
      storage: upsertStrategy.storage,
      currentFieldSets: input.fieldSets || [],
      inputUtils: new InputUtilsDecorator(input),
      clientId
    });

    console.log('Delta Result:', JSON.stringify(deltaResult, null, 2));

  } catch (error) {
    console.error('Integration failed:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main();
}