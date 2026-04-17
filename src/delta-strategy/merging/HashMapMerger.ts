import { FieldSet } from 'integration-core';

/**
 * Represents a key-hash pair extracted from a FieldSet for merging operations.
 * The key is derived from primary key fields, and the hash represents the record state.
 */
export interface KeyHashPair {
  /** Composite key from primary key field values (e.g., "U12345678" or "U12345678|2024") */
  key: string;
  
  /** SHA-256 hash of the complete record */
  hash: string;
  
  /** Optional: Original FieldSet for reconstruction after merge */
  fieldSet?: FieldSet;
}

/**
 * Result of a merge operation with statistics
 */
export interface MergeResult {
  /** Final merged records */
  merged: KeyHashPair[];
  
  /** Statistics about the merge operation */
  stats: {
    /** Records retained from baseline (unchanged) */
    retained: number;
    
    /** New records added from incremental */
    added: number;
    
    /** Records updated (different hash) */
    updated: number;
    
    /** Records unchanged (same hash in both) */
    unchanged: number;
    
    /** Total records in final result */
    total: number;
  };
}

/**
 * Utility for merging incremental/partial person data into a baseline state.
 * 
 * **Purpose:** Handle scenarios where source API returns only changed records (incremental)
 * rather than full population, ensuring no data loss when updating previous-input.ndjson.
 * 
 * **Merge Logic:**
 * - Keys only in baseline: Retained (records not touched by incremental update)
 * - Keys only in incremental: Added (new records)
 * - Keys in both, different hash: Updated (changed records)
 * - Keys in both, same hash: No change (redundant, but kept)
 * 
 * **Use Cases:**
 * 1. Non-chunked integration: Merge incremental API response into stored baseline
 * 2. Chunked integration: Merge consolidated chunks into integrated previous-input.ndjson
 * 
 * **Example:**
 * ```typescript
 * const merger = new HashMapMerger();
 * const baseline = await loadExistingPreviousInput(); // 10,000 records
 * const incremental = await loadNewData(); // 100 changed records
 * const result = merger.merge(baseline, incremental);
 * // result.merged contains ~10,000 records (baseline + updates)
 * // result.stats shows: retained: 9900, updated: 100, added: 0
 * ```
 */
export class HashMapMerger {
  
  /**
   * Merges incremental data into baseline state
   * 
   * @param baseline - Existing full state (e.g., previous-input.ndjson contents)
   * @param incremental - New/changed data only (e.g., from API or consolidated chunks)
   * @returns Merged result with statistics
   * 
   * @throws Error if duplicate keys found within baseline or incremental
   */
  public merge(baseline: KeyHashPair[], incremental: KeyHashPair[]): MergeResult {
    // Validate inputs
    this.validateNoDuplicates(baseline, 'baseline');
    this.validateNoDuplicates(incremental, 'incremental');
    
    // Build maps for efficient lookup
    const baselineMap = new Map<string, KeyHashPair>();
    const incrementalMap = new Map<string, KeyHashPair>();
    
    baseline.forEach(pair => baselineMap.set(pair.key, pair));
    incremental.forEach(pair => incrementalMap.set(pair.key, pair));
    
    // Track statistics
    let retained = 0;
    let added = 0;
    let updated = 0;
    let unchanged = 0;
    
    // Result will contain all unique keys
    const resultMap = new Map<string, KeyHashPair>();
    
    // Process all baseline records
    for (const [key, baselinePair] of baselineMap) {
      const incrementalPair = incrementalMap.get(key);
      
      if (!incrementalPair) {
        // Key only in baseline - retain unchanged
        resultMap.set(key, baselinePair);
        retained++;
      } else {
        // Key in both - check if hash changed
        if (baselinePair.hash !== incrementalPair.hash) {
          // Hash changed - use incremental (updated record)
          resultMap.set(key, incrementalPair);
          updated++;
        } else {
          // Hash same - no actual change, but keep it
          resultMap.set(key, incrementalPair); // or baselinePair, doesn't matter
          unchanged++;
        }
      }
    }
    
    // Process incremental records not in baseline (new records)
    for (const [key, incrementalPair] of incrementalMap) {
      if (!baselineMap.has(key)) {
        resultMap.set(key, incrementalPair);
        added++;
      }
    }
    
    const merged = Array.from(resultMap.values());
    
    return {
      merged,
      stats: {
        retained,
        added,
        updated,
        unchanged,
        total: merged.length
      }
    };
  }
  
  /**
   * Validates that no duplicate keys exist in the input array
   * @throws Error if duplicates found
   */
  private validateNoDuplicates(pairs: KeyHashPair[], name: string): void {
    const keys = new Set<string>();
    const duplicates: string[] = [];
    
    for (const pair of pairs) {
      if (keys.has(pair.key)) {
        duplicates.push(pair.key);
      }
      keys.add(pair.key);
    }
    
    if (duplicates.length > 0) {
      throw new Error(
        `Duplicate keys found in ${name}: ${duplicates.slice(0, 5).join(', ')}` +
        (duplicates.length > 5 ? ` (and ${duplicates.length - 5} more)` : '')
      );
    }
  }
  
  /**
   * Converts FieldSet array to KeyHashPair array by extracting primary key fields
   * @param fieldSets - Array of FieldSets from integration-core
   * @param primaryKeyFields - Set of field names that constitute the primary key
   * @returns Array of KeyHashPair objects
   */
  public static fieldSetsToKeyHashPairs(
    fieldSets: FieldSet[], 
    primaryKeyFields: Set<string>
  ): KeyHashPair[] {
    return fieldSets.map(fs => {
      // Extract primary key values in sorted order for consistent key generation
      const pkFields = Array.from(primaryKeyFields).sort();
      const keyValues = pkFields.map(pkField => {
        const field = fs.fieldValues.find(fv => Object.keys(fv)[0] === pkField);
        if (!field) {
          throw new Error(`Primary key field '${pkField}' not found in FieldSet`);
        }
        return field[pkField];
      });
      
      // Create composite key (e.g., "U12345678" or "U12345678|2024" for compound keys)
      const key = keyValues.join('|');
      
      return {
        key,
        hash: fs.hash!,
        fieldSet: fs
      };
    });
  }
  
  /**
   * Converts KeyHashPair array back to FieldSet array
   * @param pairs - Array of KeyHashPair objects with fieldSet property populated
   * @returns Array of FieldSets
   */
  public static keyHashPairsToFieldSets(pairs: KeyHashPair[]): FieldSet[] {
    return pairs.map(pair => {
      if (!pair.fieldSet) {
        throw new Error('KeyHashPair missing fieldSet property - cannot convert to FieldSet');
      }
      return pair.fieldSet;
    });
  }
}
