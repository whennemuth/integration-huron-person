import { CrudOperation, DeltaStrategy, FieldSet, Status, InputUtilsDecorator } from 'integration-core';
import { HashStorageUpdater } from './HashStorageUpdater';
import { PersonSyncParams, SinglePersonSync } from './SyncPerson';
import { ConfigManager } from './config/ConfigManager';
import { getDataMapper } from './data-mapper/DataMapper';
import { BasicCache } from './Cache';
import { DeltaStrategyFactory } from './DeltaStrategyFactory';

type BatchPersonSyncParams = PersonSyncParams & {
  buids: string[];
};

/**
 * Batch person synchronization orchestrator.
 * 
 * Uses composition pattern to coordinate multiple SinglePersonSync operations.
 * This class composes SinglePersonSync instances (has-a relationship) to handle
 * batch operations efficiently, maintaining separation of concerns between
 * single-person and multi-person synchronization logic.
 * 
 * Key responsibilities:
 * - Orchestrate sync operations across multiple BUIDs
 * - Handle errors gracefully, continuing to next person on failure
 * - Perform efficient batch hash storage updates (single read/write cycle)
 */
class BatchPersonSync {
  constructor(private batchParams: BatchPersonSyncParams) {}

  /**
   * Batch updates the hash storage with multiple successful sync results.
   * 
   * Uses HashStorageUpdater utility to perform efficient batch updates,
   * eliminating code duplication with single update logic. This performs a single
   * read-modify-write cycle for all successful syncs, rather than individual updates.
   */
  private updateHashStorageBatch = async (
    successfulSyncs: Map<string, FieldSet>,
    primaryKeyFields: Set<string>
  ): Promise<void> => {
    if (successfulSyncs.size === 0) {
      console.log('No successful syncs to update in hash storage');
      return;
    }

    try {
      const { batchParams: { config, hashStorage } } = this;
      if (!hashStorage?.deltaStrategy) {
        console.warn('Delta strategy not available for hash storage update');
        return;
      }
      const { storage } = hashStorage.deltaStrategy;
      const clientId = config.integration.clientId;

      // Delegate to shared utility (primaryKeyFields passed from syncAll)
      const updateCount = await HashStorageUpdater.updateStorage({
        storage,
        clientId,
        fieldSetsToUpdate: successfulSyncs,
        primaryKeyFields
      });

      console.log(`Successfully updated hash storage with ${updateCount} person record(s)`);
    } catch (error) {
      console.warn(`Failed to update hash storage in batch: ${error}. Syncs to target succeeded, but hash storage was not updated.`);
    }
  };

  /**
   * Execute synchronization for multiple people.
   * 
   * This method uses composition to create and orchestrate SinglePersonSync instances,
   * processing each BUID independently while collecting successful results for
   * optional batch hash storage update.
   * 
   * Error handling: continues to next BUID on individual sync failure.
   */
  public syncAll = async (): Promise<void> => {
    const { batchParams } = this;
    const { buids, hashStorage } = batchParams;
    const successfulSyncs = new Map<string, FieldSet>();
    let primaryKeyFields: Set<string> | undefined;
    
    for (let i = 0; i < buids.length; i++) {
      try {
        // Composition: create SinglePersonSync instance for each person
        const singleSync = new SinglePersonSync({ 
          ...batchParams, 
          buid: buids[i] 
        });
        
        // Perform sync with suppressHashUpdate to prevent individual updates
        // (hash storage will be updated in batch at the end for efficiency)
        await singleSync.sync({ suppressHashUpdate: true });
        
        // If hash storage update is enabled and sync succeeded, collect the result
        if (hashStorage?.enabled === true && singleSync.getPushResult()?.status === Status.SUCCESS) {
          // Re-fetch the mapped person with hashing to get the fieldSet with hash
          const hashedInput = await singleSync.getMappedPerson({ 
            crudOperation: CrudOperation.UPDATE
          });
          if (hashedInput.fieldSets && hashedInput.fieldSets.length > 0) {
            successfulSyncs.set(buids[i], hashedInput.fieldSets[0]);
            
            // Extract primary key fields from first successful sync (all will have same structure)
            if (!primaryKeyFields && hashedInput.fieldDefinitions) {
              const inputUtils = new InputUtilsDecorator(hashedInput);
              primaryKeyFields = inputUtils.getPrimaryKeys();
            }
          }
        }
      } 
      catch (error) {
        // Log and continue to next BUID if not the last one
        if (i < buids.length - 1) {
          console.log(`Moving on to next BUID: ${buids[i + 1]} after failure with BUID: ${buids[i]}`);
        }
        // If it's the last BUID or any other, just continue the loop will handle it
      }
    }

    // Perform batch hash storage update for all successful syncs
    if (hashStorage?.enabled && hashStorage.deltaStrategy && primaryKeyFields) {
      await this.updateHashStorageBatch(successfulSyncs, primaryKeyFields);
    }
  }
}

/**
 * Main entry point for command line execution - batch person sync
 */
async function main() {
  try {
    // Load configuration
    const configManager = ConfigManager.getInstance();
    const config = configManager.reset().fromEnvironment().fromFileSystem().getConfig('person');

    // Instantiate a single DataMapper to be shared across all syncs in this execution.
    const dataMapper = await getDataMapper(config, { orgMap: false, stateMap: true, countryMap: true });

    // Get environment variables for batch sync
    const { SYNC_BUIDS, SYNC_PREVIEW, SYNC_UPDATE_HASH } = process.env;
    const buidsString = SYNC_BUIDS;
    const preview = `${SYNC_PREVIEW}`.trim().toLowerCase() === 'true';
    const updateHashStorage = `${SYNC_UPDATE_HASH}`.trim().toLowerCase() === 'true';

    // Create hash storage config if enabled
    const hashStorage = updateHashStorage ? {
      enabled: true,
      deltaStrategy: DeltaStrategyFactory.createStrategy(config)
    } : undefined;

    if( buidsString === undefined || buidsString.trim() === '' ) {
      console.error('No BUIDs provided for multiple sync. Please set the SYNC_BUIDS environment variable with a comma-separated list of BUIDs.');
      process.exit(1);
    }

    // Disable source person lookup field filtering for this batch sync
    if (config.dataSource.person) {
      delete config.dataSource.person.fieldsOfInterest;
    }

    // Create the token cache
    const cache = config.cache?.enabled ? BasicCache.getInstance(config.cache.path) : undefined;

    // Turn the comma-separated BUIDs into an array
    const buids = buidsString.split(',').map(buid => buid.trim());

    // Use BatchPersonSync for batch operations (composition pattern)
    const batchSync = new BatchPersonSync({ 
      config, buids, cache, dataMapper, preview, hashStorage
    });
    await batchSync.syncAll();
  }
  catch (error) {
    console.error('Multiple Person Sync failed:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main();
}

export { BatchPersonSync, BatchPersonSyncParams };
