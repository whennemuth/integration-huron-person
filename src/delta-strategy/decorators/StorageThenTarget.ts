import { DeltaResult, DeltaStorage, DeltaStrategy, DeltaStrategyParams, FieldSet } from 'integration-core';
import { Config } from '../../config/Config';
import { PersonTargetLookup } from '../PersonTargetLookup';

/**
 * Delta strategy for previousStateSource `storage-then-target`: the stored hashes decide what changed, as for
 * `storage`, and then only the people with no stored hash (classified as added) are looked up in the target.
 *
 * With stored hashes alone, a person missing from storage is created without a lookup. If they are in the target
 * anyway (a lost or partial baseline, or a person created by other means), the create fails, the failure keeps them
 * out of storage, and every later run tries the same create again until a bulk reset. Looking up just those people
 * (usually a handful per run, e.g. new hires) classifies them correctly:
 * - found in the target: moved to updated, so they are updated rather than created;
 * - not found: left as added (created);
 * - the lookup failed: moved to updated, never created (PersonTargetLookup's rule, as for UpsertDeltaStrategy).
 * People whose stored hash matches (unchanged) or differs (updated), and the removed, are left as they are, with no
 * lookups.
 *
 * The lookups are direct (no person cache): too few, in a normal run, to be worth a full-population cache. When
 * storage has been badly lost, a bulk reset (`target`) is the better tool.
 */
export class StorageThenTargetDeltaStrategy implements DeltaStrategy {
  parms: DeltaStrategyParams;
  private targetLookup: PersonTargetLookup;

  constructor(private deltaStrategy: DeltaStrategy, config: Config) {
    this.parms = deltaStrategy.parms;
    this.targetLookup = new PersonTargetLookup(config);
  }

  get storage(): DeltaStorage {
    return this.deltaStrategy.storage;
  }

  public async computeDelta(params: {
    storage: DeltaStorage;
    currentFieldSets: FieldSet[];
    inputUtils: any;
    clientId: string;
  }): Promise<DeltaResult> {
    const fromStorage: DeltaResult = await this.deltaStrategy.computeDelta(params);
    const { added: missingFromStorage, updated = [], removed } = fromStorage;

    if (missingFromStorage.length === 0) {
      return fromStorage;
    }

    console.log(`StorageThenTargetDeltaStrategy: ${missingFromStorage.length} person(s) with no stored hash; ` +
      `looking them up in the target...`);
    const added: FieldSet[] = [];
    const inTarget: FieldSet[] = [];
    for (const person of missingFromStorage) {
      const existence = await this.targetLookup.existenceOf(person);
      if (existence === 'absent') {
        added.push(person);
        console.log(`  → Person ${PersonTargetLookup.identifierOf(person)} not found in target (will CREATE)`);
      } else {
        inTarget.push(person);
        if (existence === 'exists') {
          console.log(`  → Person ${PersonTargetLookup.identifierOf(person)} has no stored hash but exists in target (will UPDATE)`);
        }
      }
    }

    console.log(`StorageThenTargetDeltaStrategy: of ${missingFromStorage.length} with no stored hash, ` +
      `${added.length} will be created and ${inTarget.length} updated instead`);

    return { ...fromStorage, added, updated: [...updated, ...inTarget], removed };
  }
}
