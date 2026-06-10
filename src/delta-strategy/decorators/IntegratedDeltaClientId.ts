import { DeltaResult, DeltaStorage, DeltaStrategy, DeltaStrategyParams, FieldSet } from "integration-core";
import { Config } from "../../config/Config";

/**
 * DeltaStrategy wrapper that redirects baseline reads to shared integrated path when 
 * integratedDeltaClientId is configured.
 * 
 * Problem: Various operations perform fetchPreviousData for hash restoration or delta computation,
 * but pass config.integration.clientId which may point to a transient or chunk-specific path.
 * When integratedDeltaClientId is configured, the baseline lives in a shared directory
 * (e.g., delta-storage) that persists across operations.
 * 
 * Solution: Wrap the strategy's storage so fetchPreviousData is redirected to
 * integratedDeltaClientId while updatePreviousData writes remain at the original path.
 * This ensures:
 * - Delta computation reads use integrated baseline (ChunkedDeltaStrategy handles chunked reads).
 * - Post-push hash restoration reads also use integrated baseline (wrapper handles all reads).
 * - Outputs continue writing to their intended paths (chunk-specific or client-specific).
 * 
 * Applied whenever integratedDeltaClientId is present, supporting both:
 * - Chunked processor mode (chunkId + integratedDeltaClientId)
 * - Non-chunked test harnesses (integratedDeltaClientId only)
 */
export class IntegratedDeltaClientIdDeltaStrategy {
  parms: DeltaStrategyParams;

  constructor(private underlyingStrategy: DeltaStrategy, private integratedDeltaClientId: string) {
    this.parms = underlyingStrategy.parms;
  }

  get storage() {
    const { integratedDeltaClientId, underlyingStrategy: { storage: originalStorage } } = this;
    const redirectedStorage = {
      name: originalStorage.name,
      description: originalStorage.description,
      fetchPreviousData: async (params: { clientId: string; limitTo?: any[] }) => {
        const redirectedParams = {
          ...params,
          clientId: integratedDeltaClientId
        };
        console.log(`Redirecting baseline read clientId from ${params.clientId} to ${integratedDeltaClientId}`);
        return originalStorage.fetchPreviousData(redirectedParams as any);
      },
      wouldOverwritePreviousData: async (clientId: string) => {
        return originalStorage.wouldOverwritePreviousData(clientId);
      },
      updatePreviousData: async (params: {
        clientId: string;
        newPreviousData: any[];
        primaryKeyFields?: Set<string>;
        failureCount?: number;
        cleanup?: boolean;
      }) => {
        // Keep chunk-specific writes unchanged.
        return originalStorage.updatePreviousData(params as any);
      }
    };
    return redirectedStorage as DeltaStorage;
  }

  public async computeDelta(params: {
    storage: DeltaStorage;
    currentFieldSets: FieldSet[];
    inputUtils: any;
    clientId: string;
  }): Promise<DeltaResult> {

    return await this.underlyingStrategy.computeDelta(params) as DeltaResult;
  }

  /**
   * Centralizes configuration mutations for shared baseline storage pattern.
   * 
   * Loads integratedDeltaClientId from environment and overrides config.integration.clientId
   * to use the integrated path directly. This ensures all operations (reads and writes) use
   * the same baseline storage location.
   * 
   * **Problem**: When using shared baseline storage:
   * - Multiple sync instances (batch, single, chunked) need to coordinate on same storage path
   * - Hash storage updates must all target the same previous-input.ndjson location
   * - config.integration.clientId may point to transient or instance-specific paths
   * 
   * **Solution**: Override clientId to equal integratedDeltaClientId
   * - Reads: IntegratedDeltaClientIdDeltaStrategy wrapper redirects to integratedDeltaClientId
   * - Writes: updatePreviousData uses config.integration.clientId (which now equals integratedDeltaClientId)
   * - Result: Both read and write operations use the same shared path
   * 
   * **Usage Pattern** (call from harness before creating delta strategy):
   * ```typescript
   * IntegratedDeltaClientIdDeltaStrategy.mutateConfig(config, 'SYNC_PERSON_BATCH_INTEGRATED_DELTA_CLIENT_ID');
   * ```
   * 
   * @param config - Configuration object to mutate (modified in place)
   * @param integratedDeltaClientIdEnvVarName - Environment variable name containing the shared path (e.g., 'delta-storage')
   * @returns The mutated config (same reference as input)
   * @throws Error if integratedDeltaClientId is not configured (neither in env var nor config file)
   */
  public static customizeConfig = (config: Config, integratedDeltaClientIdEnvVarName: string): Config => {
    // Set integrated delta client ID for shared baseline storage if provided
    const integratedDeltaClientId = process.env[integratedDeltaClientIdEnvVarName];
    if (integratedDeltaClientId) {
      config.integratedDeltaClientId = integratedDeltaClientId;
    }

    if(!config.integratedDeltaClientId) {
      throw new Error(`No integratedDeltaClientId provided in configuration. This is required ` +
      `for batch sync to ensure all instances use the same delta storage path for hash ` +
      `storage updates. Please set ${integratedDeltaClientIdEnvVarName} environment ` +
      `variable or integratedDeltaClientId in the config file.`);
    }

    // Override integration.clientId to use full S3 path (following fargate pattern)
    // This avoids keyPrefix conflicts and allows integratedDeltaClientId to work correctly
    config.integration.clientId = config.integratedDeltaClientId;

    return config;    
  }
} 