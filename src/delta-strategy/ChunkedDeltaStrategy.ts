import { DeltaResult, DeltaStorage, DeltaStrategy, DeltaStrategyParams, FieldSet } from "integration-core";
import { Config } from "../config/Config";

/**
 * Decorator strategy for chunked processing that separates:
 * - Integrated delta storage (merged previous-input.ndjson from all chunks)
 * - Chunked delta storage (individual chunk delta outputs)
 * 
 * When processing chunks in parallel, each chunk writes its delta to a chunk-specific
 * path (e.g., deltas/person-full/2026-04-08/chunk-0000.ndjson), but ALL chunks read
 * from the same integrated previous-input.ndjson file created by the merger.
 * 
 * This strategy ensures:
 * - Reading: Uses integratedDeltaClientId (e.g., "deltas") to find previous-input.ndjson
 * - Writing: Uses original clientId (e.g., "deltas/person-full/2026-04-08") for chunk outputs
 */
export class ChunkedDeltaStrategy implements DeltaStrategy {
  parms: DeltaStrategyParams;
  private integratedDeltaClientId: string;

  constructor(
    private deltaStrategy: DeltaStrategy,
    private config: Config
  ) {
    this.parms = deltaStrategy.parms;
    
    // Extract integrated delta client ID from config
    // This is the path where previous-input.ndjson exists (created by merger)
    this.integratedDeltaClientId = (config as any).integratedDeltaClientId || config.integration.clientId;
    
    console.log(`ChunkedDeltaStrategy: Reading integrated delta from: ${this.integratedDeltaClientId}`);
    console.log(`ChunkedDeltaStrategy: Writing chunked delta to: ${config.integration.clientId}`);
  }

  get storage(): DeltaStorage {
    // Delegate to wrapped strategy's storage
    return this.deltaStrategy.storage;
  }

  /**
   * Compute delta using integrated clientId for reading previous data,
   * but preserving original clientId for writing chunk-specific deltas.
   * 
   * CRITICAL: In chunked processing, we filter out 'removed' records from the delta result.
   * 
   * Why? Because chunks contain only a SUBSET of the total population:
   * - Current data (chunk): Contains person B only (e.g., 1 out of 10,000 records)
   * - Previous data (shared): Contains persons A, B, C, D... (all 10,000 records from prior run)
   * - Without filtering: Delta would compute person A as "removed" (present in previous, missing in current)
   * - Reality: Person A is NOT removed from source system - it's just in a different chunk!
   * 
   * In chunked mode:
   * - Each chunk processes ONLY the records it contains (additions and updates)
   * - Removals can ONLY be determined by the merger after consolidating ALL chunks
   * - If a person is truly removed from source, it will be absent from ALL chunks
   * - The merger compares the consolidated result against shared previous-input.ndjson
   * 
   * Therefore, we return removed: [] to prevent chunks from incorrectly soft-deleting
   * records that are most likely being processed by other parallel chunks.
   */
  public async computeDelta(params: {
    storage: DeltaStorage;
    currentFieldSets: FieldSet[];
    inputUtils: any;
    clientId: string;
  }): Promise<DeltaResult> {
    const { storage, currentFieldSets, inputUtils, clientId } = params;
    
    // Override clientId when fetching previous data to use integrated delta path
    // This ensures all chunks read from the same previous-input.ndjson file
    const modifiedParams = {
      storage,
      currentFieldSets,
      inputUtils,
      clientId: this.integratedDeltaClientId // ← Use integrated path for reading
    };
    
    // Delegate to wrapped strategy with modified clientId
    const result = await this.deltaStrategy.computeDelta(modifiedParams);
    
    // Filter out removed records - they're not actually removed, just in other chunks
    // Log if any removals were detected so we can track this behavior
    if (result.removed.length > 0) {
      console.log(`ChunkedDeltaStrategy: Filtered out ${result.removed.length} removed record(s) - ` +
        `these records are in other chunks, not actually removed from source system`);
    }
    
    return {
      ...result,
      removed: [] // Always empty in chunked processing
    };
  }
}
