import { DeltaResult, DeltaStorage, DeltaStrategy, DeltaStrategyParams, FieldSet, Input, InputUtilsDecorator, TestEnvironment } from 'integration-core';
import { Config } from "../../config/Config";
import { PersonTargetLookup } from "../PersonTargetLookup";
import { ConfigManager } from "../../config/ConfigManager";
import { getDataMapper } from "../../data-mapper/DataMapper";
import { BasicCache } from "../../Cache";
import { SinglePersonSync } from "../../SyncPerson";
import { DeltaStrategyFactory } from "../DeltaStrategyFactory";

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
  private targetLookup: PersonTargetLookup;

  constructor(
    private deltaStrategy: DeltaStrategy,
    config: Config,
    lookupPersonInTargetSystemCache?: (person: FieldSet | string) => Promise<any> // Optional function for looking up person in target system (used by UpsertDeltaStrategy)
  ) {
    this.parms = deltaStrategy.parms;
    this.targetLookup = new PersonTargetLookup(config, lookupPersonInTargetSystemCache);
  }

  get storage(): DeltaStorage {
    // Delegate to wrapped strategy's storage
    return this.deltaStrategy.storage;
  }

  /**
   * Compute delta by querying target system for each person.
   * This overrides the wrapped strategy's computeDelta to determine add/update/remove
   * based on existence in target system rather than previous delta storage.
   * A person whose existence is unknown (the lookup failed) is updated, never created (PersonTargetLookup).
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
      const existence = await this.targetLookup.existenceOf(person);
      if (existence === 'absent') {
        // Person doesn't exist - should be added
        added.push(person);
        console.log(`  → Person ${PersonTargetLookup.identifierOf(person)} not found in target (will CREATE)`);
      } else {
        // Person exists, or might: should be updated
        updated.push(person);
        if (existence === 'exists') {
          console.log(`  → Person ${PersonTargetLookup.identifierOf(person)} exists in target (will UPDATE)`);
        }
      }
    }

    console.log(`UpsertDeltaStrategy: Delta computed - Added: ${added.length}, Updated: ${updated.length}, Removed: ${removed.length}`);

    return {
      added,
      updated,
      removed
    };
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
  const testEnvironment = TestEnvironment('UPSERT_DELTA_STRATEGY');

  [
    'SECRET_ARN',
    'SYNC_BUID'
  ].forEach(testEnvironment.getVarOrEmptyString);
  main();
}