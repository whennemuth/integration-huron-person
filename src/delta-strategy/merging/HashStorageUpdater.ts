import { DeltaStorage, FieldSet, InputUtilsDecorator } from 'integration-core';

/**
 * Utility class for updating hash storage with field sets.
 * 
 * This utility encapsulates the common logic for updating hash storage,
 * eliminating code duplication between single and batch person sync operations.
 * 
 * The update process:
 * 1. Fetches all currently stored data
 * 2. Matches new/updated records by primary key
 * 3. Replaces matched records with new versions
 * 4. Adds new records not found in storage
 * 5. Writes the complete updated dataset back to storage
 * 
 * This implements an efficient read-modify-write cycle that works for both
 * single record updates and batch updates.
 */
export class HashStorageUpdater {
  /**
   * Update hash storage with one or more field sets.
   * 
   * @param params.storage - The delta storage to update
   * @param params.clientId - Client identifier for the storage
   * @param params.fieldSetsToUpdate - Map of identifier to FieldSet to update
   * @param params.primaryKeyFields - Set of primary key field names
   * @returns Count of records updated
   */
  static async updateStorage(params: {
    storage: DeltaStorage;
    clientId: string;
    fieldSetsToUpdate: Map<string, FieldSet>;
    primaryKeyFields: Set<string>;
  }): Promise<number> {
    const { storage, clientId, fieldSetsToUpdate, primaryKeyFields } = params;

    if (fieldSetsToUpdate.size === 0) {
      console.log('No field sets to update in hash storage');
      return 0;
    }

    // Fetch all stored data
    const allStoredData = await storage.fetchPreviousData({ clientId });

    // Convert primary key fields to array for easier processing
    const pkFieldsArray = Array.from(primaryKeyFields);

    // Track which identifiers were updated vs added
    const identifiersUpdated = new Set<string>();

    // Update existing records by matching primary keys
    const updateStore = allStoredData.map(existingFs => {
      const existingPkValues = pkFieldsArray.map((pkField: string) => {
        const field = existingFs.fieldValues.find(fv => Object.keys(fv)[0] === pkField);
        return field ? Object.values(field)[0] : '';
      });
      const existingPkKey = existingPkValues.join('|');

      // Check if we have an updated version of this record
      for (const [identifier, newFieldSet] of fieldSetsToUpdate.entries()) {
        const newPkValues = pkFieldsArray.map((pkField: string) => {
          const field = newFieldSet.fieldValues.find(fv => Object.keys(fv)[0] === pkField);
          return field ? Object.values(field)[0] : '';
        });
        const newPkKey = newPkValues.join('|');

        if (existingPkKey === newPkKey) {
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

    // Prune the field sets to contain only primary key fields and hash
    // This follows the same pattern as InputUtilsDecorator.getKeyAndHashFieldSets()
    const prunedFieldSets = updateStore.map(fs => {
      const primaryKeyFieldValues = fs.fieldValues.filter(fv => {
        const fieldName = Object.keys(fv)[0];
        return primaryKeyFields.has(fieldName);
      });
      return { 
        fieldValues: primaryKeyFieldValues, 
        hash: fs.hash, 
        validationMessages: fs.validationMessages 
      };
    });

    // Write back to storage with pruned data (only PK fields + hash)
    await storage.updatePreviousData({
      clientId,
      newPreviousData: prunedFieldSets,
      primaryKeyFields
    });

    return fieldSetsToUpdate.size;
  }

  /**
   * Get the primary key value(s) from a field set for logging purposes.
   * 
   * @param fieldSet - The field set to extract primary key value from
   * @param primaryKeyFields - The primary key field names
   * @returns Primary key value as a string (composite keys are joined)
   */
  static getPrimaryKeyValue(fieldSet: FieldSet, primaryKeyFields: Set<string>): string {
    const pkFieldsArray = Array.from(primaryKeyFields);
    const pkValues = pkFieldsArray.map((pkField: string) => {
      const field = fieldSet.fieldValues.find(fv => Object.keys(fv)[0] === pkField);
      return field ? String(Object.values(field)[0]) : '';
    });
    return pkValues.join('|');
  }
}
