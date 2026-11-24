/**
 * StorageThenTargetDeltaStrategy (src/delta-strategy/decorators/StorageThenTarget.ts), previousStateSource
 * `storage-then-target`: the stored hashes decide what changed, then only the people with no stored hash are looked up
 * in the target, directly (no person cache). One found there is updated rather than created; one whose lookup fails is
 * updated, never created (PersonTargetLookup's rule, shared with UpsertDeltaStrategy).
 */
import { DeltaStorage, DeltaStrategy, FieldSet } from 'integration-core';
import { Config } from '../src/config/Config';
import { ReadPerson } from '../src/data-target/crud/ReadPerson';
import { StorageThenTargetDeltaStrategy } from '../src/delta-strategy/decorators/StorageThenTarget';

jest.mock('../src/data-target/crud/ReadPerson');

const person = (sourceIdentifier: string): FieldSet => ({ fieldValues: [{ sourceIdentifier }, { firstName: 'Pat' }] });
const ids = (fieldSets: FieldSet[] = []) => fieldSets.map(fs => fs.fieldValues[0].sourceIdentifier);
const config = { integration: { clientId: 'test-client' }, storage: { type: 'dynamodb', config: {} } } as unknown as Config;
const params = { storage: {} as DeltaStorage, currentFieldSets: [], inputUtils: {}, clientId: 'test-client' };

describe('StorageThenTargetDeltaStrategy', () => {
  let readPersonBySourceIdentifier: jest.Mock;
  let base: jest.Mocked<DeltaStrategy>;

  /** The storage-based delta the wrapped strategy computes */
  const fromStorage = (added: string[], updated: string[] = [], removed: string[] = []) =>
    base.computeDelta.mockResolvedValue({ added: added.map(person), updated: updated.map(person), removed: removed.map(person) });

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    readPersonBySourceIdentifier = jest.fn();
    (ReadPerson as jest.Mock).mockImplementation(() => ({ readPersonBySourceIdentifier }));
    base = { parms: { clientId: 'test-client', config: {} }, storage: { name: 'base storage' }, computeDelta: jest.fn() } as any;
  });
  afterEach(() => jest.restoreAllMocks());

  it('looks up only the people with no stored hash, moving those found in the target to updated', async () => {
    fromStorage(['U1', 'U2'], ['U3'], ['U4']);
    readPersonBySourceIdentifier.mockImplementation(async (id: string) => id === 'U1' ? [{ hrn: 'hrn:1', sourceIdentifier: 'U1' }] : []);

    const delta = await new StorageThenTargetDeltaStrategy(base, config).computeDelta(params);

    expect(ids(delta.added)).toEqual(['U2']);
    expect(ids(delta.updated)).toEqual(['U3', 'U1']);
    expect(ids(delta.removed)).toEqual(['U4']);
    expect(readPersonBySourceIdentifier.mock.calls.map(([id]) => id)).toEqual(['U1', 'U2']);
  });

  it('updates, never creates, a person whose lookup fails', async () => {
    fromStorage(['U1', 'U2']);
    readPersonBySourceIdentifier.mockImplementation(async (id: string) => {
      if (id === 'U1') throw new Error('500 Internal Server Error');
      return [];
    });

    const delta = await new StorageThenTargetDeltaStrategy(base, config).computeDelta(params);

    expect(ids(delta.added)).toEqual(['U2']);
    expect(ids(delta.updated)).toEqual(['U1']);
  });

  it('creates a person whose lookup answers "not found" (404)', async () => {
    fromStorage(['U1']);
    readPersonBySourceIdentifier.mockRejectedValue(new Error('404 Not Found'));

    const delta = await new StorageThenTargetDeltaStrategy(base, config).computeDelta(params);

    expect(ids(delta.added)).toEqual(['U1']);
    expect(ids(delta.updated)).toEqual([]);
  });

  it('looks no one up when storage has a hash for everyone, returning the storage delta as it is', async () => {
    fromStorage([], ['U3'], ['U4']);

    const delta = await new StorageThenTargetDeltaStrategy(base, config).computeDelta(params);

    expect(readPersonBySourceIdentifier).not.toHaveBeenCalled();
    expect(ids(delta.updated)).toEqual(['U3']);
    expect(ids(delta.removed)).toEqual(['U4']);
  });

  it('computes the storage delta with the params it was given, and serves the wrapped storage', async () => {
    fromStorage([]);
    const strategy = new StorageThenTargetDeltaStrategy(base, config);

    await strategy.computeDelta(params);

    expect(base.computeDelta).toHaveBeenCalledWith(params);
    expect(strategy.storage).toBe(base.storage);
    expect(strategy.parms).toBe(base.parms);
  });
});
