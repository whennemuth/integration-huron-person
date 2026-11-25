import { CrudOperation, DataSource, DeltaStrategy, DynamoDBConfig, DynamoDBDeltaStorage, FieldSet, Input, InputParser, InputUtilsDecorator, isDeletedHash, SinglePushResult, Status, TestEnvironment } from 'integration-core';
import { BasicCache, Cache } from './Cache';
import { Config } from './config/Config';
import { ConfigManager } from './config/ConfigManager';
import { isDynamoDbStorage, prepareStorageConfig } from './config/StorageOverrides';
import { _fieldDefinitions, DataMapper, getDataMapper } from './data-mapper/DataMapper';
import { FieldFilter } from './data-mapper/FieldFilter';
import { ReverseDataMapper } from './data-mapper/ReverseDataMapper';
import { BuCdmPersonDataSource } from './data-source/PersonDataSource';
import { HuronPerson } from './data-target/crud/Person';
import { ReadPerson } from './data-target/crud/ReadPerson';
import { HuronPersonDataTarget } from './data-target/PersonDataTarget';
import { HashStorageUpdater } from './delta-storage/HashStorageUpdater';
import { IntegratedDeltaClientIdDeltaStrategy } from './delta-strategy/decorators/IntegratedDeltaClientId';
import { DeltaStrategyFactory } from './delta-strategy/DeltaStrategyFactory';
import { PreviousStateSource, previousStateSourceFromEnvironment } from './delta-strategy/PreviousStateSource';
import { Character, LooneyTunes } from './miscellaneous/LooneyTunes';
import { SourcePerson, SourcePersonParms, TargetPersonParms } from './delta-storage/SyncEvaluator';
import { AxiosResponseStreamFilter, ResponseProcessor } from './stream/AxiosResponseStreamFilter';
import { getLocalConfig, isEmpty } from './Utils';

/**
 * Base parameters shared by both single and batch person sync operations.
 * Exported to enable composition pattern in BatchPersonSync.
 */
type PersonSyncParams = {
  config: Config;
  cache?: Cache<string, string>;
  dataMapper?: DataMapper;
  preview?: boolean;
  hashStorage?: {
    enabled: boolean;
    deltaStrategy?: DeltaStrategy;
    /**
     * Where the person's previous state comes from. `storage` or `storage-then-target` (the same for one person):
     * the hash in storage, when there is one, decides whether the person is already in sync, instead of comparing
     * with the target (DynamoDB storage only). `target` (the default): compare with the target.
     */
    previousStateSource?: PreviousStateSource;
  };
  forceUpdate?: boolean; // Optional flag to force updates even if source and target are in sync
};

type SinglePersonSyncParams = PersonSyncParams & {
  buid: string;
  hrn?: string;
};

/**
 * Names of the primary key field(s) of a mapped person (sourceIdentifier), for keying hash storage
 * records when there is no mapped person to read them from (e.g. a person gone from the source).
 */
const personPrimaryKeyFields = (): Set<string> => new Set(
  _fieldDefinitions.filter(fd => 'isPrimaryKey' in fd && fd.isPrimaryKey).map(fd => fd.name)
);



/**
 * Single person synchronization between Boston University CDM and Huron systems.
 * Fetches a specific person by BUID, transforms the data, and pushes to Huron.
 */
class SinglePersonSync {
  private dataSource: DataSource;
  private dataTarget: HuronPersonDataTarget;
  private targetPerson: HuronPerson | undefined;
  private targetPersonLookupAttempted = false;
  private pushResult: SinglePushResult;
  private rawPersonData: any[] | undefined;
  private sourceFetched = false;
  /** The DEACTIVATE: skip reason of a person the data mapper found ineligible for the target (see mapPerson) */
  private deactivationReason: string | undefined;
  private mappedPerson: Input | undefined;
  private logPrefix: string;
  private dryRun: boolean;
  private deactivated = false;

  constructor(private instanceParams: SinglePersonSyncParams) {
    const { config, cache, buid, hrn } = instanceParams;
    this.dryRun = `${process.env.DRY_RUN}`.trim().toLowerCase() === 'true';
    this.logPrefix = this.dryRun ? '[DRY RUN]: ' : '';
    let responseFilter: ResponseProcessor | undefined;
    if (config.dataSource.person?.fieldsOfInterest) {
      responseFilter = new AxiosResponseStreamFilter({ fieldsOfInterest: config.dataSource.person.fieldsOfInterest });
    }

    this.dataSource = new BuCdmPersonDataSource({ config, responseFilter, buid: buid });

    this.dataTarget = new HuronPersonDataTarget({ config, cache, hrn });
  }

  private getHrn = async (): Promise<string | undefined> => {
    const { instanceParams: { hrn }, getTargetPerson } = this;
    if(hrn) {
      return hrn;
    }
    const targetPerson = await getTargetPerson();
    if(targetPerson) {
      return targetPerson.hrn;
    }
    return undefined;
  }

  private getFilteredFields = (fieldSet: FieldSet): FieldSet => {
    const { instanceParams: { dataMapper } } = this;
    const { stateMappings, countryMappings, orgMappings } = dataMapper || {};
    
    if (!stateMappings || !countryMappings) {
      throw new Error('DataMapper must have state and country mappings to apply field filtering');
    }
    
    return new FieldFilter({ fieldSet, stateMappings, countryMappings, orgMappings }).filter();
  }

  /**
   * The person mapped to integration format, with the HRN they have in the target, and hashed when hash
   * storage is enabled. Cached once mapped.
   * @returns the mapped person, or an empty Input when the source has no data for them or they could not be
   *   mapped (see mapPerson)
   */
  public getMappedPerson = async (params: { rawData?: any[], crudOperation?: CrudOperation }): Promise<Input> => {
    if( this.mappedPerson ) {
      return this.mappedPerson;
    }
    const { instanceParams: { buid }, getHrn, mapPerson } = this;
    const { rawData, crudOperation } = params;
    try {
      const input = await mapPerson({ rawData, crudOperation, hrnOf: getHrn });
      if ( ! isEmpty(input)) {
        this.mappedPerson = input;
      }
      return input;
    } catch (error) {
      console.error(`Single Person Sync failed for BUID: ${buid}:`, error);
      this.mappedPerson = undefined;
      throw error;
    }
  }

  /**
   * Maps the person to integration format, hashed when hash storage is enabled. Not cached (getMappedPerson()
   * caches), but the person is fetched from the source at most once.
   * @param params.rawData - the person's source data, instead of fetching it
   * @param params.hrnOf - resolves the person's HRN in the target, once the source is known to have them.
   *   Omitted, the person is mapped without one: enough to compare hashes, which leave out the HRN.
   * @returns the mapped person, or an empty Input when the source has no data for them or they could not be
   *   mapped. A person the data mapper finds ineligible for the target also maps to an empty Input (they fail
   *   validation), with their DEACTIVATE: skip reason kept in deactivationReason.
   */
  private mapPerson = async (params: { rawData?: any[], crudOperation?: CrudOperation, hrnOf?: () => Promise<string | undefined> }): Promise<Input> => {
    const { instanceParams: { dataMapper, buid, hashStorage }, getFilteredFields } = this;
    let { rawData, crudOperation, hrnOf } = params;

    // Fetch person data from source if not provided, or already fetched
    if (rawData === undefined && this.sourceFetched) {
      rawData = this.rawPersonData ?? [];
    }
    if (rawData === undefined) {
      console.log(`SOURCE CHECK: Looking up raw person data for BUID: ${buid} from source...`);
      rawData = await this.dataSource.fetchRaw();
      this.sourceFetched = true;
    }

    // Bail out if no data found
    if (!rawData || rawData.length === 0) {
      console.log(`Did not find ${buid} in source`);
      return { } as Input;
    }
    if (rawData !== this.rawPersonData) {
      console.log(`Found ${buid} in source`);
      this.rawPersonData = rawData;
    }

    // Convert data to integration format
    this.deactivationReason = undefined;
    const personHrn = hrnOf ? await hrnOf() : undefined;
    const unparsedInput: Input = dataMapper!.getMappedData({ rawData, personHrn, crudOperation: crudOperation });

    // Bail out if there are critical validation errors, keeping the skip reason of an ineligible person
    if (dataMapper!.criticalValidationErrorMessage) {
      console.error(`Critical validation error for BUID: ${buid}: ${dataMapper!.criticalValidationErrorMessage}`);
      const skipReason = `${unparsedInput.fieldSets?.[0]?.fieldValues.find(fv => '__skipReason' in fv)?.__skipReason ?? ''}`;
      this.deactivationReason = skipReason.toUpperCase().startsWith('DEACTIVATE') ? skipReason : undefined;
      return { } as Input;
    }

    // Bail out if no field sets generated
    if (!unparsedInput.fieldSets || unparsedInput.fieldSets.length === 0) {
      console.log(`No valid field sets generated for BUID: ${buid}`);
      return { } as Input;
    }

    // Apply hash if hash storage is enabled (for hash storage updates)
    if (hashStorage?.enabled) {
      return new InputParser({
        _input: unparsedInput,
        fieldFilter: (fs) => getFilteredFields(fs)
      }).parse();
    }
    return unparsedInput;
  }

  public getMappingError = (): string | undefined => {
    const { dataMapper } = this.instanceParams;
    const { criticalValidationErrorMessage, infoValidationErrorMessage} = dataMapper || {};
    if(criticalValidationErrorMessage) {
      return criticalValidationErrorMessage;
    }
    if(infoValidationErrorMessage) {
      return infoValidationErrorMessage;
    }
    return undefined;
  }

  public clearMappingMessages = (): void => {
    const { dataMapper } = this.instanceParams;
    dataMapper?.clearMessages();
  }
  
  private getTargetPerson = async (): Promise<HuronPerson | undefined> => {
    if(this.targetPerson || this.targetPersonLookupAttempted) {
      return this.targetPerson;
    }

    const { instanceParams: {buid, config } } = this;
    const reader = new ReadPerson({ config });
    console.log(`TARGET CHECK: Looking up person with BUID ${buid} in target as "sourceIdentifier"...`);
    const personData = await reader.readPersonBySourceIdentifier(buid) ?? [];
    const targetPerson = personData.length > 0 ? personData[0] : undefined;
    if (targetPerson) {
      console.log(`Found ${buid} in target (indicates a patch)`);
    }
    else {
      console.log(`Did not find ${buid} in target (indicates a create)`);
    }
    this.targetPersonLookupAttempted = true;
    this.targetPerson = targetPerson;
    return this.targetPerson;
  }

  /**
   * Deactivate the person in the target system if they exist, by setting active=false. 
   * This is used when there is no data to push for an existing person, which we interpret 
   * as a delete operation. Since the target system does not support hard deletes, we 
   * perform a soft delete by deactivating the person record instead.
   */
  private deactivateTargetPersonIfExists = async (): Promise<void> => {
    const targetPerson = await this.getTargetPerson();
    const { instanceParams: { config, buid, cache, preview }, logPrefix } = this;
    if(targetPerson) {
      if(targetPerson.active === false) {
        console.log(`No-op: need to deactivate ${buid} in target system, but already inactive.`);
        this.deactivated = true;
        return;
      }
      if(preview) {
        console.log(`Preview mode enabled - skipping deactivation of ${buid} in target system.`);
        return;
      }
      console.log(`Deactivating ${buid} in target system...`);
      const deactivator = new HuronPersonDataTarget({ config, cache, hrn: targetPerson.hrn });
      const result = await deactivator.pushOne({
        data: {
          fieldValues: [
            { hrn: targetPerson.hrn },
            { sourceIdentifier: buid },
          ]
        },
        crud: CrudOperation.DELETE
      });
      this.pushResult = result;
      this.deactivated = result.status === Status.SUCCESS;
      console.log(`${logPrefix}Deactivation push result for ${buid}:`, result.status, result.message);
    }
    else {
      console.log(`No-op: need to deactivate ${buid} in target system, but person does not exist.`);
      this.deactivated = true;
    }
  }

  private activateTargetPersonIfExists = async (): Promise<void> => {
    const targetPerson = await this.getTargetPerson();
    const { instanceParams: { config, buid, cache }, logPrefix } = this;
    if(targetPerson) {
      if(targetPerson.active === true) {
        console.log(`No-op: need to activate ${buid} in target system, but already active.`);
        return;
      }
      console.log(`Activating ${buid} in target system...`);
      const activator = new HuronPersonDataTarget({ config, cache, hrn: targetPerson.hrn });
      const result = await activator.pushOne({
        data: {
          fieldValues: [
            { hrn: targetPerson.hrn },
            { sourceIdentifier: buid },
            { active: true }
          ]
        },
        crud: CrudOperation.UPDATE
      });
      this.pushResult = result;
      console.log(`${logPrefix}Activation push result for ${buid}:`, result.status, result.message);
    }
    else {
      console.log(`No-op: need to activate ${buid} in target system, but person does not exist.`);
    }

  }

  public getPushResult = (): SinglePushResult => {
    return this.pushResult;
  }

  /**
   * True if this sync found no data to push and left the person inactive (or absent) in the target:
   * deactivated now, already inactive, or not in the target at all.
   */
  public wasDeactivated = (): boolean => {
    return this.deactivated;
  }

  /**
   * The hash storage to read and write: the storage of the delta strategy this sync was given
   * (hashStorage.deltaStrategy), or one created from the config if none was given.
   */
  private getHashStorage = () => {
    const { instanceParams: { config, hashStorage } } = this;
    return (hashStorage?.deltaStrategy ?? DeltaStrategyFactory.createStrategy({ config })).storage;
  }

  /**
   * Updates the hash storage for this person in storage.
   * 
   * Uses HashStorageUpdater utility to perform the update operation,
   * eliminating code duplication with batch update logic.
   */
  private updateHashStorage = async (input: Input): Promise<void> => {
    const { instanceParams: { config, buid }, logPrefix, getHashStorage } = this;
    
    try {
      const storage = getHashStorage();
      const clientId = config.integration.clientId;
      const incremental = isDynamoDbStorage(config);

      // Get primary key fields from the input's field definitions
      const inputUtils = new InputUtilsDecorator(input);
      const primaryKeyFields = inputUtils.getPrimaryKeys();

      // Get the field set to update
      const newFieldSet = input.fieldSets[0];

      // Create a map with single entry for the utility
      const fieldSetsToUpdate = new Map<string, FieldSet>();
      fieldSetsToUpdate.set(buid, newFieldSet);

      // Delegate to shared utility
      const hashStorageUpdater = new HashStorageUpdater({
        storage,
        clientId,
        fieldSetsToUpdate,
        primaryKeyFields,
        incremental
      });
      const changedCount = await hashStorageUpdater.updateStorage();

      // Log the outcome with primary key value. Incremental storage writes the record only if it is
      // new or changed (it logs its own NEW/UPDATED/UNCHANGED counts), so don't claim an update there.
      const primaryKeyValue = hashStorageUpdater.getPrimaryKeyValue(newFieldSet);
      if (incremental) {
        console.log(`${this.logPrefix}Hash storage checked for person ${primaryKeyValue} (written only if new or changed)`);
      }
      else if (changedCount > 0) {
        console.log(`${this.logPrefix}Hash storage updated successfully for person ${primaryKeyValue}`);
      }
      else {
        console.log(`${this.logPrefix}Hash storage unchanged for person ${primaryKeyValue} - baseline not rewritten`);
      }
    } catch (error) {
      console.warn(`${this.logPrefix}Failed to update hash storage: ${error}. Sync to target was successful, but hash storage was not updated.`);
    }
  }

  /**
   * Records in hash storage that this person was soft-deleted in the target, the same way bulk sync
   * deferred delete handling does, so later bulk syncs don't select them for deletion again and
   * classify them UPDATED (reactivating them) if they reappear in the source:
   * - DynamoDB: DynamoDBDeltaStorage.markDeleted() (DELETED:-prefixed hash + deletedAt in
   *   PersonCurrentState, DELETED record in PersonHistory). Built directly from the storage config,
   *   because strategy storage wrappers only expose the DeltaStorage interface - so DRY_RUN is
   *   honored here.
   * - S3/file: the stored baseline hash gets the DELETED: prefix (via HashStorageUpdater).
   * - Database: not supported, skipped.
   *
   * Only applies when hash storage is enabled, outside preview mode, and the deactivation succeeded
   * (or the person was already inactive or absent in the target).
   */
  private markDeletedInStorage = async (): Promise<void> => {
    const { instanceParams: { config, buid, hashStorage, preview }, logPrefix, dryRun } = this;
    if (!hashStorage?.enabled || preview || !this.deactivated) {
      return;
    }

    try {
      if (isDynamoDbStorage(config)) {
        if (dryRun) {
          console.log(`${logPrefix}Would mark ${buid} as deleted in DynamoDB hash storage`);
          return;
        }
        const storage = new DynamoDBDeltaStorage(config.storage.config as DynamoDBConfig);
        const { marked } = await storage.markDeleted({ personIds: [buid] });
        console.log(marked.length > 0
          ? `Marked ${buid} as deleted in hash storage`
          : `No-op: ${buid} has no hash storage record to mark as deleted, or is already marked`);
        return;
      }

      if (config.storage.type === 'database') {
        console.log(`Marking deleted persons is not supported for database hash storage - skipping for ${buid}`);
        return;
      }

      const storage = this.getHashStorage();
      await new HashStorageUpdater({
        storage,
        clientId: config.integration.clientId,
        fieldSetsToUpdate: new Map(),
        primaryKeyFields: personPrimaryKeyFields(),
        personIdsToMarkDeleted: new Set([buid])
      }).updateStorage();
    } catch (error) {
      console.warn(`${logPrefix}Failed to mark ${buid} as deleted in hash storage: ${error}. Deactivation in target was successful, but hash storage was not updated.`);
    }
  }

  /**
   * Whether the hash stored for the person can decide that they are already in sync, so that the target is
   * not read at all: hash storage is enabled and trusted (hashStorage.previousStateSource is storage or
   * storage-then-target, the same for one person: with no stored hash, the target is compared anyway), it is
   * DynamoDB storage (other storage would have to read the whole baseline for one person), the sync is not a
   * forced update or a preview, and it is not a supplied CREATE.
   */
  private mayTrustStoredHash = (params: { crudOperation?: CrudOperation, forceUpdate: boolean }): boolean => {
    const { instanceParams: { config, hashStorage, preview } } = this;
    const { crudOperation, forceUpdate } = params;
    const { enabled, deltaStrategy, previousStateSource = 'target' } = hashStorage ?? {};
    if (!enabled || !deltaStrategy || previousStateSource === 'target' || !isDynamoDbStorage(config)) {
      return false;
    }
    if (forceUpdate || preview) {
      return false;
    }
    return crudOperation === undefined || crudOperation === CrudOperation.UPDATE;
  }

  /**
   * Compares the person's source hash with the hash stored for them (see mayTrustStoredHash).
   *
   * @returns 'in-sync' or 'out-of-sync', or 'unavailable' when stored state is not usable (no stored
   *   record, a DELETED: marked hash, or a read error) - the caller then compares with the target instead.
   */
  private compareWithStoredHash = async (mappedPerson: Input): Promise<'in-sync' | 'out-of-sync' | 'unavailable'> => {
    const { instanceParams: { config, buid, hashStorage } } = this;
    const deltaStrategy = hashStorage!.deltaStrategy!;

    try {
      const primaryKeyFields = new InputUtilsDecorator(mappedPerson).getPrimaryKeys();
      const [sourceFieldSet] = mappedPerson.fieldSets;
      const keyFieldSet: FieldSet = {
        fieldValues: sourceFieldSet.fieldValues.filter(fv => primaryKeyFields.has(Object.keys(fv)[0]))
      };
      const [stored] = await deltaStrategy.storage.fetchPreviousData({
        clientId: config.integration.clientId,
        limitTo: [keyFieldSet]
      });

      if (!stored?.hash) {
        console.log(`No hash in storage for BUID: ${buid} - comparing with target instead.`);
        return 'unavailable';
      }
      if (isDeletedHash(stored.hash)) {
        console.log(`BUID: ${buid} is marked deleted in storage - comparing with target instead.`);
        return 'unavailable';
      }
      return stored.hash === sourceFieldSet.hash ? 'in-sync' : 'out-of-sync';
    } catch (error) {
      console.warn(`Error reading hash storage for BUID: ${buid} - comparing with target instead:`, error);
      return 'unavailable';
    }
  }

  /**
   * A successful result for a person whose push is skipped because they are already in sync
   */
  private inSyncResult = (person: Input, crud: CrudOperation): SinglePushResult => ({
    status: Status.SUCCESS,
    message: 'Sync skipped - source and target already in sync',
    timestamp: new Date(),
    primaryKey: person.fieldSets[0].fieldValues.filter(fv => {
      const key = Object.keys(fv)[0];
      return person.fieldDefinitions?.find(fd => fd.name === key && fd.isPrimaryKey);
    }),
    crud
  });

  /**
   * Execute the single person synchronization
   * @param params - Optional parameters
   * @param params.crudOperation - The CRUD operation to perform
   * @param params.rawData - Raw data to use instead of fetching
   * @param params.suppressHashUpdate - If true, skip individual hash storage update (used in batch operations)
   * @param params.forceUpdate - If true, push even if source and target are in sync (no in-sync check)
   */
  public sync = async (params?: {
    crudOperation?: CrudOperation,
    rawData?: any[],
    suppressHashUpdate?: boolean,
    forceUpdate?: boolean
  }): Promise<void> => {
    const { instanceParams: { config, buid, hashStorage }, getHrn, instanceParams, logPrefix } = this;
    try {

      const line = '----------------------------------------------------------------------------------';
      console.log(`\n${line}\n        Syncing ${buid} \n${line}`);

      console.log(`Client ID: ${config.integration.clientId}`);

      const { preview } = instanceParams;
      let { crudOperation, rawData, suppressHashUpdate, forceUpdate=false } = params || {};

      /**
       * When the stored hash can be trusted, compare it first: a match settles the person without reading the
       * target. The hash leaves out the HRN and userId (the only field the CRUD operation affects), so the person
       * is mapped without them for this.
       */
      let storedHashComparison: 'in-sync' | 'out-of-sync' | 'unavailable' = 'unavailable';
      if (this.mayTrustStoredHash({ crudOperation, forceUpdate })) {
        const unresolvedPerson = await this.mapPerson({ rawData, crudOperation: crudOperation ?? CrudOperation.UPDATE });
        if ( ! isEmpty(unresolvedPerson) && unresolvedPerson.fieldSets?.length) {
          storedHashComparison = await this.compareWithStoredHash(unresolvedPerson);
        }
        if (storedHashComparison === 'in-sync') {
          // The hash is not written again (it matches), and the target is not read, so not checked for whether the
          // person is active there: a change made in the target directly waits for a sync that compares with it
          console.log(`Source matches the hash in storage for BUID: ${buid} - already in sync, so the target is not read and hash storage is left as is.`);
          this.pushResult = this.inSyncResult(unresolvedPerson, CrudOperation.UPDATE);
          console.log(`${logPrefix}No push for ${buid}: source and target already in sync`);
          console.log(`${logPrefix}Single Person Sync completed successfully for BUID: ${buid}`);
          return;
        }
      }

      if( ! crudOperation ) {
        const hrn = await getHrn();
        crudOperation = hrn ? CrudOperation.UPDATE : CrudOperation.CREATE;
      }
      else if (crudOperation === CrudOperation.UPDATE && ! await getHrn()) {
        // A supplied UPDATE cannot succeed for a person who is not in the target
        crudOperation = CrudOperation.CREATE;
        console.log(`Person with BUID: ${buid} does not exist in target, changing operation to ${CrudOperation.CREATE}.`);
      }

      /**
       * Get the person data mapped to integration format and Apply hashing if hash storage
       * is enabled
       */
      const mappedPerson: Input = await this.getMappedPerson({ rawData, crudOperation });
      const cdmPerson = this.rawPersonData; // Set in getMappedPerson

      /**
       * Update hash storage if enabled and sync was successful (including when push was skipped)
       * Skip individual update if suppressHashUpdate is true (used in batch operations)
       */
      const processHashStorage = async () => {
        if (hashStorage?.enabled && this.pushResult?.status === Status.SUCCESS && !suppressHashUpdate) {
          await this.updateHashStorage(mappedPerson);
        }
      }

      /**
       * Deactivate the person in the target, and record that in hash storage. Skip the hash storage
       * update if suppressHashUpdate is true (batch operations collect deactivations instead).
       */
      const deactivate = async () => {
        await this.deactivateTargetPersonIfExists();
        if (!suppressHashUpdate) {
          await this.markDeletedInStorage();
        }
      }

      // Bail out if no data to push: deactivate a person gone from the source, or one the data mapper finds
      // ineligible for the target. A person who is in the source but could not be mapped is left as they are.
      if(isEmpty(mappedPerson) || !mappedPerson.fieldSets?.length) {
        if (this.rawPersonData && !this.deactivationReason) {
          const reason = this.instanceParams.dataMapper?.criticalValidationErrorMessage ?? 'no field set was produced';
          this.pushResult = {
            status: Status.FAILURE,
            message: `Mapping failed for BUID: ${buid}: ${reason}`,
            timestamp: new Date(),
            primaryKey: [],
            crud: crudOperation
          };
          console.warn(`${logPrefix}Single Person Sync failed for BUID: ${buid}: the source has the person, but they could not be mapped (${reason}). Not pushed, and not deactivated.`);
          return;
        }
        console.log(this.deactivationReason
          ? `No valid data to push for BUID: ${buid} (${this.deactivationReason}).`
          : `No valid data to push for BUID: ${buid}.`);
        await deactivate();
        return;
      }

      if (mappedPerson.fieldSets.length > 1) {
        console.warn(`Expected exactly 1 field set for single person sync, but found ${mappedPerson.fieldSets.length} for BUID: ${buid}. Only processing the first one.`);
      }

      /**
       * Determines whether to compare the person with the target before pushing.
       * @returns true if sync state should be assessed, false otherwise.
       */
      const mustAssessSyncedState = (): boolean => {
        // Only assess sync state for UPDATE operations
        if(crudOperation != CrudOperation.UPDATE) {
          return false;
        }
        // Only assess sync state if hash storage is enabled (to avoid unnecessary API calls)
        if(!hashStorage?.enabled) {
          return false;
        }
        // Only assess sync state if forceUpdate is not set (to allow bypassing sync check
        // which could cancel the update if inSync found to be true - ie: for role updates)
        if(forceUpdate) {
          return false;
        }
        if(preview) {
          console.log(`Preview mode enabled - skipping sync state assessment for BUID: ${buid}.`);
          return false;
        }
        // The stored hash already showed the person is out of sync
        if(storedHashComparison === 'out-of-sync') {
          console.log(`Source differs from the hash in storage for BUID: ${buid} - pushing without comparing with target.`);
          return false;
        }
        console.log(`Checking if source and target are already in sync for BUID: ${buid}...`);
        return true;
      };

      // Check if source and target are already in sync (UPDATE operations only), by comparing with the target
      let skipPush = false;
      if (mustAssessSyncedState()) {
        try {
          const sourcePersonParams: SourcePersonParms = {
            config,
            buid,
            cdmPerson,
            sourceDataMapper: this.instanceParams.dataMapper!
          };

          const huronPerson = await this.getTargetPerson();

          const targetPersonParams: TargetPersonParms = {
            config,
            buid,
            huronPerson,
            targetDataMapper: new ReverseDataMapper()
          };

          const sourcePerson = new SourcePerson(sourcePersonParams);
          const inSync = await sourcePerson.isInSyncWith(targetPersonParams);

          if (inSync) {
            console.log(`Source and target are already in sync for BUID: ${buid}.`);
            if(huronPerson && !huronPerson.active) {
              console.log(`For some reason, in-sync person is currently inactive in target. Attempting to activate...`);
              await this.activateTargetPersonIfExists();
            }
            skipPush = true;
            console.log(`Hash storage will still be checked, and written if its record is missing or stale.`);
            // NOTE: Currently, hash storage updates will occur even when source/target are in sync.
            // This handles cases where the hash storage record may be missing or out of date.
            // In the future, once the system is fully mature, we expect that ANY person found in
            // the target system will ALWAYS have a corresponding record in hash storage. At that point,
            // this update could be optimized to only occur when the hash storage is actually missing.
          }
          else if (!huronPerson) {
            crudOperation = CrudOperation.CREATE;
            console.log(`Person with BUID: ${buid} does not exist in target, changing operation to ${CrudOperation.CREATE}.`);
          }

        } catch (error) {
          console.warn(`Error checking sync status for BUID: ${buid}:`, error);
          console.log(`Proceeding with update to be safe.`);
        }
      }

      // Push the field set to target (unless skipped due to already being in sync)
      if(preview) {
        console.log(`Preview mode enabled - skipping push to target for BUID: ${buid}.`);
      } else if (skipPush) {
        // Source and target are already in sync - set success result without actual push
        this.pushResult = this.inSyncResult(mappedPerson, crudOperation!);
        console.log(`${this.logPrefix}No push for ${buid}: source and target already in sync`);
      } else {
        const result = await this.dataTarget.pushOne({
          data: mappedPerson.fieldSets[0],
          crud: crudOperation
        });
        this.pushResult = result;
        console.log(`${logPrefix}Push result for ${buid}:`, result.status, result.message);
      }

      await processHashStorage();

      if (this.pushResult?.status === Status.FAILURE) {
        console.warn(`${logPrefix}Single Person Sync completed with a failed push for BUID: ${buid}: ${this.pushResult.message}`);
      }
      else {
        console.log(`${logPrefix}Single Person Sync completed successfully for BUID: ${buid}`);
      }
    } catch (error) {
      console.error(`${logPrefix}Single Person Sync failed for BUID: ${buid}:`, error);
      throw error;
    }
  }
}




/**
 * Main entry point for command line execution - single person sync
 */
async function main() {
  let rawData: any[] | undefined;
  const { HURON_PERSON_CONFIG_PATH } = process.env;

  try {
    // Load configuration
    const configManager = ConfigManager.getInstance();
    const localConfigPath = HURON_PERSON_CONFIG_PATH || getLocalConfig();
    const config = configManager.reset()
      .fromEnvironment({ storage: true })
      .fromFileSystem(localConfigPath)
      .getConfig('person');
    prepareStorageConfig(config);

    // Instantiate a single DataMapper to be shared across all syncs in this execution.
    // Use the same static map usage as the bulk sync pipeline, so hashes computed here match its hashes.
    const dataMapper = await getDataMapper(config, config.preLoadedMaps ?? { orgMap: false, stateMap: true, countryMap: true });

    // Get environment variables for single person sync
    let { SYNC_BUID, SYNC_CRUD, SYNC_PREVIEW, SYNC_UPDATE_HASH, SYNC_PREVIOUS_STATE_SOURCE } = process.env;
    let buid = SYNC_BUID;
    let crudOperation = SYNC_CRUD;
    const preview = `${SYNC_PREVIEW}`.trim().toLowerCase() === 'true';
    const updateHashStorage = `${SYNC_UPDATE_HASH}`.trim().toLowerCase() === 'true';
    const previousStateSource = previousStateSourceFromEnvironment(SYNC_PREVIOUS_STATE_SOURCE, 'SYNC_PREVIOUS_STATE_SOURCE');
    if (previousStateSource !== 'target' && !updateHashStorage) {
      // Deliberate: a manual run reads stored hashes only if it also writes them (the hash storage this creates)
      console.warn(`SYNC_PREVIOUS_STATE_SOURCE=${previousStateSource} has no effect without SYNC_UPDATE_HASH=true: hash storage is neither read nor written, and persons are pushed without an in-sync check.`);
    }

    // DynamoDB storage is keyed by person, not by a clientId path, so needs no integrated delta client ID
    if ( ! isDynamoDbStorage(config)) {
      IntegratedDeltaClientIdDeltaStrategy.customizeConfig(
        config, 
        'SYNC_PERSON_INTEGRATED_DELTA_CLIENT_ID'
      ); 
    }

    // Create hash storage config if enabled
    const hashStorage = updateHashStorage ? {
      enabled: true,
      deltaStrategy: DeltaStrategyFactory.createStrategy({
        config,
        ignoreRemovals: true,
        previousStateSource
      }),
      previousStateSource
    } : undefined;

    // Disable source person lookup field filtering for this single sync
    if (config.dataSource.person) {
      delete config.dataSource.person.fieldsOfInterest;
    }
    
    if ( ! buid ) {
      if( crudOperation === CrudOperation.CREATE || crudOperation === undefined ) {
        crudOperation = CrudOperation.CREATE;
        rawData = new LooneyTunes(Character.DaffyDuck).getRandomCdmPersonData();
        buid = rawData![0].personid;      
      }
      else {
        // Exit only if both command line and environment variable are missing
        console.error('Usage: node SinglePersonSync.ts <BUID> <CRUD_OPERATION>');
        console.error('Alternatively, set the SYNC_BUID and/or the SYNC_CRUD environment variable');
        process.exit(1);
      }
    }

    // Assert buid is now a string (guaranteed by the above logic)
    buid = buid!;

    // Create the token cache
    const cache = BasicCache.getInstance(config);

    // Sync (create/update) the person and exit
    const sync = new SinglePersonSync({ 
      config, buid, cache, dataMapper, preview, hashStorage
    });

    await sync.sync({ crudOperation: crudOperation as CrudOperation, rawData });
  } 
  catch (error) {
    const dryRun = `${process.env.DRY_RUN}`.trim().toLowerCase() === 'true';
    console.error(`${dryRun ? '[DRY RUN]: ' : ''}Single Person Sync failed:`, error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  const testEnvironment = TestEnvironment('SYNC_PERSON');

  [
    'DRY_RUN',
    'SYNC_BUID',
    'SYNC_CRUD',
    'SYNC_PREVIEW',
    'SYNC_UPDATE_HASH',
    'SYNC_PREVIOUS_STATE_SOURCE',
    'INTEGRATED_DELTA_CLIENT_ID',
    'DELTA_STORAGE_BUCKET',
    'PREVIOUS_STORAGE_TYPE',
    'DYNAMODB_PERSON_CURRENT_STATE_TABLE_NAME',
    'DYNAMODB_PERSON_HISTORY_TABLE_NAME',
    'REGION'
  ].forEach(testEnvironment.getVarOrEmptyString);
  main();
}

export { personPrimaryKeyFields, PersonSyncParams, SinglePersonSync, SinglePersonSyncParams };

