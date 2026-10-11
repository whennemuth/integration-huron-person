import { DeltaStorage, FieldSet, isDeletedHash, toDeletedHash } from 'integration-core';

export type HashStorageUpdaterParams = {
  storage: DeltaStorage;
  clientId: string;
  fieldSetsToUpdate: Map<string, FieldSet>;
  primaryKeyFields: Set<string>;
  /**
   * Primary key values of persons soft-deleted (deactivated) in the target, whose stored baseline
   * hash gets the DELETED: marker (see integration-core's DeletedHashMarker). Applied in the same
   * read-modify-write as fieldSetsToUpdate. Not supported with incremental storage, which marks
   * deletions through its own API (e.g. DynamoDBDeltaStorage.markDeleted()).
   */
  personIdsToMarkDeleted?: Set<string>;
  /**
   * True for storage that classifies and writes individual records itself (DynamoDB), so that only
   * fieldSetsToUpdate is written - the whole baseline is neither read nor rewritten.
   */
  incremental?: boolean;
};

/**
 * Utility class for updating hash storage with field sets.
 *
 * This utility encapsulates the common logic for updating hash storage,
 * eliminating code duplication between single and batch person sync operations.
 *
 * The update process for baseline file storage (S3/file):
 * 1. Fetches all currently stored data
 * 2. Matches new/updated records by primary key
 * 3. Replaces matched records with new versions
 * 4. Adds new records not found in storage
 * 5. Marks the stored hashes of persons in personIdsToMarkDeleted as deleted
 * 6. Writes the complete updated dataset back to storage
 *
 * This implements an efficient read-modify-write cycle that works for both
 * single record updates and batch updates.
 *
 * For incremental storage (DynamoDB), only the given records are written, and the storage itself
 * classifies each as NEW, UPDATED or UNCHANGED against what it has stored.
 */
export class HashStorageUpdater {

  constructor(private params: HashStorageUpdaterParams) { }

  /**
   * Update hash storage with one or more field sets, and mark any personIdsToMarkDeleted.
   *
   * @returns Count of records updated (marked deletions are not counted)
   */
  public async updateStorage(): Promise<number> {
    const { storage, clientId, fieldSetsToUpdate, primaryKeyFields, incremental } = this.params;
    const personIdsToMarkDeleted = this.params.personIdsToMarkDeleted ?? new Set<string>();

    if (fieldSetsToUpdate.size === 0 && personIdsToMarkDeleted.size === 0) {
      console.log('No field sets to update in hash storage');
      return 0;
    }

    if (incremental) {
      if (personIdsToMarkDeleted.size > 0) {
        throw new Error('personIdsToMarkDeleted is not supported for incremental storage - use the storage\'s own deletion marking');
      }
      await storage.updatePreviousData({
        clientId,
        newPreviousData: Array.from(fieldSetsToUpdate.values()).map(this.prune),
        primaryKeyFields
      });
      return fieldSetsToUpdate.size;
    }

    // Fetch all stored data
    const allStoredData = await storage.fetchPreviousData({ clientId });

    // Track which identifiers were updated vs added
    const identifiersUpdated = new Set<string>();

    // Update existing records by matching primary keys
    const updateStore = allStoredData.map(existingFs => {
      const existingPkKey = this.getPrimaryKeyValue(existingFs);

      // Check if we have an updated version of this record
      for (const [identifier, newFieldSet] of fieldSetsToUpdate.entries()) {
        if (existingPkKey === this.getPrimaryKeyValue(newFieldSet)) {
          identifiersUpdated.add(identifier);
          return newFieldSet;
        }
      }
      return existingFs;
    });

    // Add new records that weren't found in existing data
    for (const [identifier, fieldSet] of fieldSetsToUpdate.entries()) {
      if (!identifiersUpdated.has(identifier)) {
        updateStore.push(fieldSet);
      }
    }

    // Mark soft-deleted persons. Persons with no stored record have nothing to mark.
    let markedCount = 0;
    const markedStore = updateStore.map(fs => {
      if (!fs.hash || isDeletedHash(fs.hash) || !personIdsToMarkDeleted.has(this.getPrimaryKeyValue(fs))) {
        return fs;
      }
      markedCount++;
      return { ...fs, hash: toDeletedHash(fs.hash) };
    });
    if (personIdsToMarkDeleted.size > 0) {
      console.log(`Marking ${markedCount} of ${personIdsToMarkDeleted.size} person(s) as deleted in hash storage`);
    }

    if (fieldSetsToUpdate.size === 0 && markedCount === 0) {
      return 0; // Nothing changed - skip rewriting the baseline
    }

    // Write back to storage with pruned data (only PK fields + hash)
    await storage.updatePreviousData({
      clientId,
      newPreviousData: markedStore.map(this.prune),
      primaryKeyFields
    });

    return fieldSetsToUpdate.size;
  }

  /**
   * Prune a field set to contain only primary key fields and hash.
   * This follows the same pattern as InputUtilsDecorator.getKeyAndHashFieldSets()
   */
  private prune = (fs: FieldSet): FieldSet => {
    const { primaryKeyFields } = this.params;
    const primaryKeyFieldValues = fs.fieldValues.filter(fv => {
      const fieldName = Object.keys(fv)[0];
      return primaryKeyFields.has(fieldName);
    });
    return {
      fieldValues: primaryKeyFieldValues,
      hash: fs.hash,
      validationMessages: fs.validationMessages
    };
  }

  /**
   * Get the primary key value(s) from a field set, for matching and logging.
   *
   * @param fieldSet - The field set to extract primary key value from
   * @returns Primary key value as a string (composite keys are joined)
   */
  public getPrimaryKeyValue(fieldSet: FieldSet): string {
    const { primaryKeyFields } = this.params;
    const pkFieldsArray = Array.from(primaryKeyFields);
    const pkValues = pkFieldsArray.map((pkField: string) => {
      const field = fieldSet.fieldValues.find(fv => Object.keys(fv)[0] === pkField);
      return field ? String(Object.values(field)[0]) : '';
    });
    return pkValues.join('|');
  }
}
