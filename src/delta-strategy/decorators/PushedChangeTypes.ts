import { DeltaResult, DeltaStorage, DeltaStrategy, DeltaStrategyParams, FieldSet, InputUtilsDecorator } from 'integration-core';
import { PushedChanges, PushedChangeType } from '../PushedChanges';

/**
 * Delta storage that, when the baseline is updated after the push, gives each person the push changed their
 * change type as the push made it (NEW for a create, UPDATED for an update), and an update the person's stored
 * hash as its previous hash. DynamoDB delta storage writes a record's own changeType/previousHash to person
 * history in place of the one it would classify by comparing hashes (see PushedChanges for why they differ).
 * Records the push didn't change, or failed to change, are passed on as they are.
 *
 * For DynamoDB storage only: other storages would keep the extra fields in their baseline.
 */
export class PushedChangeTypesStorage implements DeltaStorage {

  constructor(private readonly storage: DeltaStorage, private readonly pushedChanges: PushedChanges) { }

  get name(): string {
    return this.storage.name;
  }

  get description(): string {
    return this.storage.description;
  }

  fetchPreviousData(params: { clientId: string, limitTo?: FieldSet[] }): Promise<FieldSet[]> {
    return this.storage.fetchPreviousData(params);
  }

  wouldOverwritePreviousData(clientId: string): Promise<boolean> {
    return this.storage.wouldOverwritePreviousData(clientId);
  }

  async updatePreviousData(params: {
    clientId: string,
    newPreviousData: FieldSet[],
    primaryKeyFields?: Set<string>,
    failureCount?: number,
    cleanup?: boolean
  }): Promise<any> {
    const { clientId, newPreviousData, primaryKeyFields } = params;
    if (this.pushedChanges.size === 0 || !newPreviousData || newPreviousData.length === 0) {
      return this.storage.updatePreviousData(params);
    }
    const changeTypes = this.pushedChanges.changeTypes(primaryKeyFields);
    const previousHashes = await this.storedHashesOfUpdates({ clientId, newPreviousData, primaryKeyFields, changeTypes });
    const annotated = newPreviousData.map(fieldSet => {
      const key = PushedChanges.primaryKeyOf(fieldSet, primaryKeyFields);
      const changeType = key ? changeTypes.get(key.value) : undefined;
      if (!key || !changeType) {
        return fieldSet;
      }
      const previousHash = changeType === 'UPDATED' ? previousHashes.get(key.value) : undefined;
      return {
        ...fieldSet,
        fieldValues: [...fieldSet.fieldValues, { changeType }, ...(previousHash ? [{ previousHash }] : [])]
      };
    });
    return this.storage.updatePreviousData({ ...params, newPreviousData: annotated });
  }

  /**
   * The stored hashes of the people the push updated, by primary key value. Storage looks a person's stored
   * hash up only when it classifies them itself, so an update's previous hash is looked up here.
   */
  private async storedHashesOfUpdates(params: {
    clientId: string, newPreviousData: FieldSet[], primaryKeyFields?: Set<string>, changeTypes: Map<string, PushedChangeType>
  }): Promise<Map<string, string>> {
    const { clientId, newPreviousData, primaryKeyFields, changeTypes } = params;
    const limitTo: FieldSet[] = newPreviousData.flatMap(fieldSet => {
      const key = PushedChanges.primaryKeyOf(fieldSet, primaryKeyFields);
      return key && changeTypes.get(key.value) === 'UPDATED' ? [{ fieldValues: [{ [key.field]: key.value }] }] : [];
    });
    if (limitTo.length === 0) {
      return new Map();
    }
    const stored = await this.storage.fetchPreviousData({ clientId, limitTo });
    const hashes = new Map<string, string>();
    for (const fieldSet of stored) {
      const key = PushedChanges.primaryKeyOf(fieldSet, primaryKeyFields);
      if (key && fieldSet.hash) {
        hashes.set(key.value, fieldSet.hash);
      }
    }
    return hashes;
  }
}

/**
 * A decorator strategy whose storage records in person history the change each push made, rather than the
 * change comparing hashes with the stored baseline suggests (PushedChangeTypesStorage). The delta itself is
 * the underlying strategy's.
 */
export class PushedChangeTypesDeltaStrategy implements DeltaStrategy {
  parms: DeltaStrategyParams;
  private readonly pushedChangeTypesStorage: PushedChangeTypesStorage;

  constructor(private readonly underlyingStrategy: DeltaStrategy, pushedChanges: PushedChanges) {
    this.parms = underlyingStrategy.parms;
    this.pushedChangeTypesStorage = new PushedChangeTypesStorage(underlyingStrategy.storage, pushedChanges);
  }

  get storage(): DeltaStorage {
    return this.pushedChangeTypesStorage;
  }

  public async computeDelta(parms: {
    storage: DeltaStorage;
    currentFieldSets: any[];
    inputUtils: InputUtilsDecorator;
    clientId: string;
  }): Promise<DeltaResult> {
    return this.underlyingStrategy.computeDelta(parms);
  }
}
