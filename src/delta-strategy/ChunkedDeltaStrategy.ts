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
    return this.deltaStrategy.computeDelta(modifiedParams);
  }
}
