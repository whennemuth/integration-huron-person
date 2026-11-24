import { FieldSet } from 'integration-core';
import { Config } from '../config/Config';
import { HuronPerson } from '../data-target/crud/Person';
import { ReadPerson } from '../data-target/crud/ReadPerson';

/** Whether a person is in the target: found, not found, or unknown because the lookup failed */
export type TargetExistence = 'exists' | 'absent' | 'unknown';

/**
 * Looks a person up in the target to decide whether a push should create or update them. Shared by the delta
 * strategies that ask the target rather than (or as well as) the stored hashes: UpsertDeltaStrategy (`target`, every
 * person) and StorageThenTargetDeltaStrategy (`storage-then-target`, only the people with no stored hash), so both
 * follow the same rules:
 * - The cache (lookupPersonInTargetSystemCache), when given, is only a short cut: a person it doesn't hold, or any
 *   error reading it, falls through to a direct lookup in the target.
 * - A direct lookup that fails leaves existence `unknown`. Callers classify such a person as UPDATE, never CREATE: the
 *   update path looks the person up again to find their HRN (HuronPersonDataTargetUpdate), so a person who exists is
 *   updated, and one who doesn't fails ("Cannot determine HRN") as a push failure, which keeps their hash out of hash
 *   storage so a later run creates them. A wrongly guessed CREATE would instead be rejected as a duplicate (409) at
 *   best, or create a second record for the person at worst.
 */
export class PersonTargetLookup {
  private readPerson: ReadPerson;

  constructor(
    config: Config,
    private lookupPersonInTargetSystemCache?: (person: FieldSet | string) => Promise<any>
  ) {
    this.readPerson = new ReadPerson({ config });
  }

  /** Whether the person is in the target, logging how it was decided */
  public async existenceOf(person: FieldSet): Promise<TargetExistence> {
    if (this.lookupPersonInTargetSystemCache) {
      try {
        const sourceIdentifier = await this.lookupPersonInTargetSystemCache(person);
        if (sourceIdentifier) {
          console.log(`  → Found sourceIdentifier ${sourceIdentifier} in cache for person.`);
          return 'exists';
        }
      } catch (error) {
        console.warn(`  → Cache lookup failed for person ${PersonTargetLookup.identifierOf(person)}, querying target system directly:`, error);
      }
      console.log(`  → SourceIdentifier not found in cache for person, querying target system directly...`);
    }

    try {
      return await this.lookupPersonInTargetSystem(person) ? 'exists' : 'absent';
    } catch (error) {
      console.warn(`  → Failed to look up person ${PersonTargetLookup.identifierOf(person)} in the target; existence ` +
        `unknown, so will UPDATE (the update re-checks the target, and fails if the person is not there):`, error);
      return 'unknown';
    }
  }

  /**
   * Lookup a person in the target system by sourceIdentifier.
   * Returns the person if found, undefined if not found.
   */
  private async lookupPersonInTargetSystem(person: FieldSet): Promise<HuronPerson | undefined> {
    const sourceIdentifier = PersonTargetLookup.sourceIdentifierOf(person);

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
  public static sourceIdentifierOf(person: FieldSet): string | undefined {
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

  /** A human-readable identifier for logging */
  public static identifierOf(person: FieldSet): string {
    return PersonTargetLookup.sourceIdentifierOf(person) || '(unknown)';
  }
}
