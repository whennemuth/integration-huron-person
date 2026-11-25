/**
 * Tests that person history records each person's change as the push made it (PushedChanges,
 * PushedChangeTypesStorage, PushedChangeTypesDeltaStrategy), including through integration-core's
 * DynamoDBDeltaStorage, whose DynamoDB client is stood in for.
 */
import { CrudOperation, DeltaStorage, DeltaStrategy, DynamoDBDeltaStorage, FieldSet } from 'integration-core';
import { PushedChangeTypesDeltaStrategy, PushedChangeTypesStorage } from '../src/delta-strategy/decorators/PushedChangeTypes';
import { PushedChanges } from '../src/delta-strategy/PushedChanges';
import { HuronPersonIntegration } from '../src/SyncPeople';

const KEY = new Set(['sourceIdentifier']);

/** A full person record, as pushed */
const person = (sourceIdentifier: string): FieldSet => ({
  fieldValues: [{ firstName: 'First' }, { sourceIdentifier }, { email: `${sourceIdentifier}@example.edu` }]
});

/** A person reduced to their key and hash, as the baseline update receives them */
const keyAndHash = (sourceIdentifier: string, hash: string): FieldSet => ({ fieldValues: [{ sourceIdentifier }], hash });

const pushed = (...pushes: [string, CrudOperation][]) => {
  const pushedChanges = new PushedChanges();
  pushes.forEach(([id, crud]) => pushedChanges.recordSuccess(person(id), crud));
  return pushedChanges;
};

const fakeStorage = (stored: Record<string, string> = {}) => ({
  name: 'fake', description: 'fake storage',
  fetchPreviousData: jest.fn(async ({ limitTo = [] }: { limitTo?: FieldSet[] }) => limitTo
    .map(fieldSet => fieldSet.fieldValues[0].sourceIdentifier as string)
    .filter(id => id in stored)
    .map(id => keyAndHash(id, stored[id]))),
  wouldOverwritePreviousData: jest.fn().mockResolvedValue(true),
  updatePreviousData: jest.fn().mockResolvedValue(undefined)
});

describe('PushedChanges', () => {
  it('records creates as NEW and updates as UPDATED, by primary key, and not deletes', () => {
    const pushedChanges = pushed(['U1', CrudOperation.CREATE], ['U2', CrudOperation.UPDATE], ['U3', CrudOperation.DELETE]);
    expect(pushedChanges.size).toBe(2);
    expect(pushedChanges.changeTypes(KEY)).toEqual(new Map([['U1', 'NEW'], ['U2', 'UPDATED']]));
  });

  it("finds a FieldSet's primary key by name, or without names its first field", () => {
    expect(PushedChanges.primaryKeyOf(person('U1'), KEY)).toEqual({ field: 'sourceIdentifier', value: 'U1' });
    expect(PushedChanges.primaryKeyOf(keyAndHash('U1', 'h'))).toEqual({ field: 'sourceIdentifier', value: 'U1' });
    expect(PushedChanges.primaryKeyOf({ fieldValues: [{ firstName: 'First' }] }, KEY)).toBeUndefined();
    expect(PushedChanges.primaryKeyOf({ fieldValues: [{ sourceIdentifier: '' }] }, KEY)).toBeUndefined();
  });
});

describe('PushedChangeTypesStorage', () => {
  it("gives each pushed person the push's change type, and an update the stored hash as its previous hash", async () => {
    const storage = fakeStorage({ U2: 'stored-U2', U3: 'stored-U3' });
    const pushedStorage = new PushedChangeTypesStorage(storage, pushed(['U1', CrudOperation.CREATE], ['U2', CrudOperation.UPDATE], ['U4', CrudOperation.UPDATE]));

    await pushedStorage.updatePreviousData({
      clientId: 'c', primaryKeyFields: KEY, failureCount: 0,
      newPreviousData: [keyAndHash('U1', 'h1'), keyAndHash('U2', 'h2'), keyAndHash('U3', 'h3'), keyAndHash('U4', 'h4')]
    });

    // Only the updates' stored hashes are looked up
    expect(storage.fetchPreviousData).toHaveBeenCalledWith({
      clientId: 'c', limitTo: [{ fieldValues: [{ sourceIdentifier: 'U2' }] }, { fieldValues: [{ sourceIdentifier: 'U4' }] }]
    });
    expect(storage.updatePreviousData).toHaveBeenCalledWith({
      clientId: 'c', primaryKeyFields: KEY, failureCount: 0,
      newPreviousData: [
        { fieldValues: [{ sourceIdentifier: 'U1' }, { changeType: 'NEW' }], hash: 'h1' },
        { fieldValues: [{ sourceIdentifier: 'U2' }, { changeType: 'UPDATED' }, { previousHash: 'stored-U2' }], hash: 'h2' },
        // Not pushed (unchanged, or its push failed): left for storage to classify
        keyAndHash('U3', 'h3'),
        // Updated in the target, but not in the baseline: no previous hash
        { fieldValues: [{ sourceIdentifier: 'U4' }, { changeType: 'UPDATED' }], hash: 'h4' }
      ]
    });
  });

  it('gives an update of a person marked deleted the change type REACTIVATED, and their unmarked last hash', async () => {
    const storage = fakeStorage({ U1: 'DELETED:stored-U1' });
    const pushedStorage = new PushedChangeTypesStorage(storage, pushed(['U1', CrudOperation.UPDATE]));

    await pushedStorage.updatePreviousData({ clientId: 'c', primaryKeyFields: KEY, newPreviousData: [keyAndHash('U1', 'h1')] });

    expect(storage.updatePreviousData).toHaveBeenCalledWith(expect.objectContaining({
      newPreviousData: [{ fieldValues: [{ sourceIdentifier: 'U1' }, { changeType: 'REACTIVATED' }, { previousHash: 'stored-U1' }], hash: 'h1' }]
    }));
  });

  it('passes the baseline update on as it is when nothing was pushed, without a lookup', async () => {
    const storage = fakeStorage();
    const params = { clientId: 'c', newPreviousData: [keyAndHash('U1', 'h1')], primaryKeyFields: KEY };
    await new PushedChangeTypesStorage(storage, new PushedChanges()).updatePreviousData(params);
    expect(storage.updatePreviousData).toHaveBeenCalledWith(params);
    expect(storage.fetchPreviousData).not.toHaveBeenCalled();
  });

  it('delegates everything else to the storage it wraps', async () => {
    const storage = fakeStorage({ U1: 'h' });
    const pushedStorage = new PushedChangeTypesStorage(storage, new PushedChanges());
    expect([pushedStorage.name, pushedStorage.description]).toEqual(['fake', 'fake storage']);
    expect(await pushedStorage.fetchPreviousData({ clientId: 'c', limitTo: [keyAndHash('U1', 'x')] })).toEqual([keyAndHash('U1', 'h')]);
    expect(await pushedStorage.wouldOverwritePreviousData('c')).toBe(true);
  });
});

describe('PushedChangeTypesDeltaStrategy', () => {
  it("serves the wrapping storage, and the underlying strategy's delta and parameters", async () => {
    const storage = fakeStorage();
    const delta = { added: [person('U1')], updated: [], removed: [] };
    const underlying = { parms: { clientId: 'c' }, storage, computeDelta: jest.fn().mockResolvedValue(delta) } as unknown as DeltaStrategy;
    const strategy = new PushedChangeTypesDeltaStrategy(underlying, new PushedChanges());

    expect(strategy.storage).toBeInstanceOf(PushedChangeTypesStorage);
    expect(strategy.parms).toBe(underlying.parms);
    const params = { storage: strategy.storage, currentFieldSets: [], inputUtils: {} as any, clientId: 'c' };
    expect(await strategy.computeDelta(params)).toBe(delta);
  });
});

describe('HuronPersonIntegration.recordingPushedChanges', () => {
  it('wraps the strategy for DynamoDB storage only', () => {
    const underlying = { parms: {}, storage: fakeStorage(), computeDelta: jest.fn() } as unknown as DeltaStrategy;
    const pushedChanges = new PushedChanges();
    expect(HuronPersonIntegration.recordingPushedChanges(underlying, 'dynamodb', pushedChanges)).toBeInstanceOf(PushedChangeTypesDeltaStrategy);
    for (const type of ['s3', 'file', 'database', undefined]) {
      expect(HuronPersonIntegration.recordingPushedChanges(underlying, type, pushedChanges)).toBe(underlying);
    }
  });
});

describe('through DynamoDBDeltaStorage', () => {
  /** DynamoDBDeltaStorage over a stand-in client: a stored baseline, and the items it writes */
  const dynamoStorage = (stored: Record<string, string>) => {
    const storage = new DynamoDBDeltaStorage({
      region: 'us-east-1', personCurrentStateTableName: 'current', personHistoryTableName: 'history', syncRunId: 'run-1'
    } as any);
    const written: Record<string, any[]> = { current: [], history: [] };
    (storage as any).client = {
      send: jest.fn(async (command: any) => {
        const { RequestItems } = command.input;
        const [table] = Object.keys(RequestItems);
        if (RequestItems[table].Keys) {
          const items = RequestItems[table].Keys
            .filter(({ personId }: any) => personId in stored)
            .map(({ personId }: any) => ({ personId, hash: stored[personId] }));
          return { Responses: { [table]: items } };
        }
        written[table].push(...RequestItems[table].map((request: any) => request.PutRequest.Item));
        return {};
      })
    };
    return { storage: storage as unknown as DeltaStorage, written };
  };

  it("writes person history from the push, where comparing hashes with the baseline would disagree", async () => {
    // A bulk reset: the delta came from the target, not the baseline
    const { storage, written } = dynamoStorage({ U2: 'h2', U3: 'old-h3', U5: 'h5' });
    const pushedStorage = new PushedChangeTypesStorage(storage, pushed(
      ['U1', CrudOperation.UPDATE], // in the target, not the baseline: hashes would say NEW
      ['U2', CrudOperation.CREATE], // created, though the baseline has its hash: hashes would say UNCHANGED (nothing written)
      ['U3', CrudOperation.CREATE] // created, though the baseline has an older hash: hashes would say UPDATED
    ));

    await pushedStorage.updatePreviousData({
      clientId: 'c', primaryKeyFields: KEY,
      newPreviousData: [keyAndHash('U1', 'h1'), keyAndHash('U2', 'h2'), keyAndHash('U3', 'h3'), keyAndHash('U4', 'h4'), keyAndHash('U5', 'h5')]
    });

    const history = Object.fromEntries(written.history.map(item => [item.personId, item]));
    expect(history.U1).toMatchObject({ syncRunId: 'run-1', changeType: 'UPDATED', hash: 'h1' });
    expect(history.U1.previousHash).toBeUndefined();
    expect(history.U2).toMatchObject({ changeType: 'NEW', hash: 'h2' });
    expect(history.U3).toMatchObject({ changeType: 'NEW', hash: 'h3' });
    // Not pushed: classified by storage as before (no stored hash is NEW; the same hash is not written)
    expect(history.U4).toMatchObject({ changeType: 'NEW' });
    expect(history.U5).toBeUndefined();
    expect(written.current.map(item => item.personId).sort()).toEqual(['U1', 'U2', 'U3', 'U4']);
  });

  it("gives an update of a person in the baseline their stored hash as its previous hash", async () => {
    const { storage, written } = dynamoStorage({ U1: 'old-h1' });
    await new PushedChangeTypesStorage(storage, pushed(['U1', CrudOperation.UPDATE])).updatePreviousData({
      clientId: 'c', primaryKeyFields: KEY, newPreviousData: [keyAndHash('U1', 'h1')]
    });
    expect(written.history).toEqual([expect.objectContaining({ personId: 'U1', changeType: 'UPDATED', hash: 'h1', previousHash: 'old-h1' })]);
  });

  it('records the reactivation of a person marked deleted, with no DELETED: marker in history, and clears the marker', async () => {
    const { storage, written } = dynamoStorage({ U1: 'DELETED:old-h1' });
    await new PushedChangeTypesStorage(storage, pushed(['U1', CrudOperation.UPDATE])).updatePreviousData({
      clientId: 'c', primaryKeyFields: KEY, newPreviousData: [keyAndHash('U1', 'h1')]
    });
    expect(written.history).toEqual([expect.objectContaining({ personId: 'U1', changeType: 'REACTIVATED', hash: 'h1', previousHash: 'old-h1' })]);
    expect(written.current).toEqual([expect.objectContaining({ personId: 'U1', hash: 'h1' })]);
  });
});
