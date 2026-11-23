/**
 * UpsertDeltaStrategy classifies a person whose existence in the target couldn't be checked as UPDATE.
 * That is safe only because, when the person turns out not to be there, the update fails ("Cannot
 * determine HRN") AND that failure is matched back to the person when hash storage is updated
 * (integration-core's InputUtilsDecorator.restorePreviousHashesForFailures(), called by EndToEnd), so the
 * person isn't recorded as in sync. This pins the second half, which until 2026-11-23 didn't hold: the
 * failure was keyed by id AND sourceIdentifier ("U1|U1") and matched no stored record.
 */
import { BatchPushResult, BatchStatus, CrudOperation, FieldSet, InputUtilsDecorator, Status } from 'integration-core';
import { Config } from '../src/config/Config';
import { HuronPersonDataTarget } from '../src/data-target/PersonDataTarget';
import { ReadPerson } from '../src/data-target/crud/ReadPerson';
import { _fieldDefinitions } from '../src/data-mapper/DataMapper';

jest.mock('../src/data-target/crud/ReadPerson');

const config = {
  landscape: 'test',
  executionMode: 'people',
  dataSource: {},
  dataTarget: {
    endpointConfig: { baseUrl: 'https://datatarget-api.example.com', authMethod: 'basic', loginSvcPath: '/auth/token', username: 'u', password: 'p' },
    personsPath: '/api/v2/persons'
  },
  integration: { clientId: 'test-client', batchSize: 10, timeout: 5000 },
  storage: { type: 'file', config: { path: './test-data' } }
} as unknown as Config;

// As DataMapper maps a person: id and sourceIdentifier both carry the BUID, id first
const mappedPerson = (buid: string): FieldSet => ({ fieldValues: [
  { id: buid }, { sourceIdentifier: buid }, { firstName: 'Pat' }, { lastName: 'Doe' }
] } as FieldSet);

const keyAndHash = (buid: string, hash: string): FieldSet => ({ fieldValues: [{ sourceIdentifier: buid }], hash } as FieldSet);

/** The failure an UPDATE of a person absent from the target returns */
const updateOfAbsentPerson = async (buid: string) => {
  (ReadPerson as jest.MockedClass<typeof ReadPerson>).mockImplementation(() => ({
    readPersonByHailMary: jest.fn().mockResolvedValue([])
  } as any));
  const dataTarget = new HuronPersonDataTarget({ config });
  return dataTarget.pushOne({ data: mappedPerson(buid), crud: CrudOperation.UPDATE });
};

const pushResultWith = (failure: any): BatchPushResult => ({
  successes: [], failures: [failure], skipped: [], status: BatchStatus.FAILURE, message: '', timestamp: new Date()
} as BatchPushResult);

describe('An UPDATE of a person absent from the target stays out of hash storage', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const inputUtils = (currentFieldSets: FieldSet[]) =>
    new InputUtilsDecorator({ fieldDefinitions: _fieldDefinitions as any, fieldSets: currentFieldSets });

  it('a person with no stored record is left out, so a later run creates them', async () => {
    const failure = await updateOfAbsentPerson('U11111111');
    expect(failure.status).toBe(Status.FAILURE);

    const current = [keyAndHash('U11111111', 'new-hash'), keyAndHash('U22222222', 'other-hash')];
    const failureCount = inputUtils([]).restorePreviousHashesForFailures({
      currentKeyAndHashFieldSets: current,
      previousKeyAndHashFieldSets: [],
      pushResult: pushResultWith(failure)
    });

    expect(failureCount).toBe(1);
    expect(current.map(fs => fs.fieldValues[0])).toEqual([{ sourceIdentifier: 'U22222222' }]);
  });

  it('a person with a stored record keeps their previous hash, so a later run tries again', async () => {
    const failure = await updateOfAbsentPerson('U11111111');

    const current = [keyAndHash('U11111111', 'new-hash')];
    inputUtils([]).restorePreviousHashesForFailures({
      currentKeyAndHashFieldSets: current,
      previousKeyAndHashFieldSets: [keyAndHash('U11111111', 'old-hash')],
      pushResult: pushResultWith(failure)
    });

    expect(current[0].hash).toBe('old-hash');
  });
});
