import 'aws-sdk-client-mock-jest';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { CrudOperation, FieldSet, Status } from 'integration-core';
import { MockPersonDataTarget } from '../src/data-target/MockPersonDataTarget';
import { Config } from '../src/config/Config';

const dynamoMock = mockClient(DynamoDBClient);

describe('MockPersonDataTarget', () => {
  const mockConfig = {
    storage: { type: 'dynamodb', config: { region: 'us-east-1' } }
  } as unknown as Config;

  const tableName = 'test-mock-target-person-table';

  const createMockPerson = (fieldValues: Record<string, any>[]): FieldSet => ({
    fieldValues
  });

  beforeEach(() => {
    dynamoMock.reset();
  });

  describe('constructor', () => {
    it('throws if no tableName and no DYNAMODB_MOCK_TARGET_PERSON_TABLE_NAME env var', () => {
      delete process.env.DYNAMODB_MOCK_TARGET_PERSON_TABLE_NAME;
      expect(() => new MockPersonDataTarget({ config: mockConfig })).toThrow(
        /requires tableName or DYNAMODB_MOCK_TARGET_PERSON_TABLE_NAME/
      );
    });
  });

  describe('getPersonByBuid', () => {
    it('returns { sourceIdentifier } when the person exists', async () => {
      dynamoMock.on(GetItemCommand).resolves({
        Item: marshall({ personId: 'U12345678', data: {}, createdAt: 'x', lastModified: 'x', syncRunId: 'x' })
      });

      const target = new MockPersonDataTarget({ config: mockConfig, tableName });
      const result = await target.getPersonByBuid('U12345678');

      expect(result).toEqual({ sourceIdentifier: 'U12345678' });
    });

    it('returns undefined when the person does not exist', async () => {
      dynamoMock.on(GetItemCommand).resolves({ Item: undefined });

      const target = new MockPersonDataTarget({ config: mockConfig, tableName });
      const result = await target.getPersonByBuid('U00000000');

      expect(result).toBeUndefined();
    });

    it('still returns the person when they have been soft-deleted (deactivated)', async () => {
      dynamoMock.on(GetItemCommand).resolves({
        Item: marshall({
          personId: 'U12345678', data: {}, createdAt: 'x', lastModified: 'x', syncRunId: 'x',
          deactivated: true, deactivatedAt: '2026-01-01T00:00:00.000Z'
        })
      });

      const target = new MockPersonDataTarget({ config: mockConfig, tableName });
      const result = await target.getPersonByBuid('U12345678');

      expect(result).toEqual({ sourceIdentifier: 'U12345678' });
    });
  });

  describe('pushOne - person ID extraction', () => {
    it('extracts the ID from a sourceIdentifier field (actual DataMapper output shape)', async () => {
      dynamoMock.on(PutItemCommand).resolves({});

      const target = new MockPersonDataTarget({ config: mockConfig, tableName });
      const person = createMockPerson([{ sourceIdentifier: 'U12345678' }, { firstName: 'Jane' }]);

      const result = await target.pushOne({ data: person, crud: CrudOperation.CREATE });

      expect(result.status).toBe(Status.SUCCESS);
      expect(result.primaryKey).toEqual([{ personId: 'U12345678' }]);
    });

    it('falls back to buid/personId/BUID/id fields when sourceIdentifier is absent', async () => {
      dynamoMock.on(PutItemCommand).resolves({});

      const target = new MockPersonDataTarget({ config: mockConfig, tableName });
      const person = createMockPerson([{ buid: 'U99999999' }]);

      const result = await target.pushOne({ data: person, crud: CrudOperation.CREATE });

      expect(result.primaryKey).toEqual([{ personId: 'U99999999' }]);
    });

    it('throws when no recognizable ID field is present', async () => {
      const target = new MockPersonDataTarget({ config: mockConfig, tableName });
      const person = createMockPerson([{ firstName: 'NoId' }]);

      await expect(target.pushOne({ data: person, crud: CrudOperation.CREATE }))
        .rejects.toThrow(/Cannot find person ID/);
    });

    it('succeeds when a mapped field is present but undefined (e.g. middleName absent from DataMapper output)', async () => {
      dynamoMock.on(PutItemCommand).resolves({});

      const target = new MockPersonDataTarget({ config: mockConfig, tableName });
      const person = createMockPerson([{ sourceIdentifier: 'U12345678' }, { middleName: undefined }]);

      const result = await target.pushOne({ data: person, crud: CrudOperation.CREATE });

      expect(result.status).toBe(Status.SUCCESS);
    });
  });

  describe('pushOne - DELETE (soft-delete)', () => {
    it('marks the record deactivated instead of removing it', async () => {
      dynamoMock.on(GetItemCommand).resolves({
        Item: marshall({ personId: 'U12345678', data: { firstName: 'Jane' }, createdAt: '2020-01-01T00:00:00.000Z', lastModified: 'x', syncRunId: 'x' })
      });
      dynamoMock.on(PutItemCommand).resolves({});

      const target = new MockPersonDataTarget({ config: mockConfig, tableName });
      const person = createMockPerson([{ sourceIdentifier: 'U12345678' }]);

      const result = await target.pushOne({ data: person, crud: CrudOperation.DELETE });

      expect(result.status).toBe(Status.SUCCESS);
      expect(dynamoMock).toHaveReceivedCommandTimes(PutItemCommand, 1);
      const putCall = dynamoMock.commandCalls(PutItemCommand)[0];
      const putItem = putCall.args[0].input.Item as Record<string, any>;
      expect(putItem.deactivated.BOOL).toBe(true);
      expect(putItem.deactivatedAt.S).toBeTruthy();
      expect(putItem.createdAt.S).toBe('2020-01-01T00:00:00.000Z');
      // Data is preserved, not wiped out
      expect(putItem.data.M.firstName.S).toBe('Jane');
      // ...but reads as inactive, mirroring Huron's PATCH active=false
      expect(putItem.data.M.__active.BOOL).toBe(false);
    });

    it('creates a deactivated record even if the person never previously existed', async () => {
      dynamoMock.on(GetItemCommand).resolves({ Item: undefined });
      dynamoMock.on(PutItemCommand).resolves({});

      const target = new MockPersonDataTarget({ config: mockConfig, tableName });
      const person = createMockPerson([{ sourceIdentifier: 'U00000001' }]);

      const result = await target.pushOne({ data: person, crud: CrudOperation.DELETE });

      expect(result.status).toBe(Status.SUCCESS);
      const putCall = dynamoMock.commandCalls(PutItemCommand)[0];
      const putItem = putCall.args[0].input.Item as Record<string, any>;
      expect(putItem.deactivated.BOOL).toBe(true);
    });
  });

  describe('pushOne - validateOnly mode', () => {
    it('logs the operation but does not write to DynamoDB', async () => {
      const target = new MockPersonDataTarget({ config: mockConfig, tableName, validateOnly: true });
      const person = createMockPerson([{ sourceIdentifier: 'U12345678' }]);

      const result = await target.pushOne({ data: person, crud: CrudOperation.CREATE });

      expect(result.status).toBe(Status.SUCCESS);
      expect(result.message).toMatch(/Validation only/);
      expect(dynamoMock).not.toHaveReceivedCommand(PutItemCommand);
    });
  });

  describe('pushAll', () => {
    it('delegates to pushOne for each added/updated/removed record and actually persists them', async () => {
      dynamoMock.on(GetItemCommand).resolves({ Item: undefined });
      dynamoMock.on(PutItemCommand).resolves({});

      const target = new MockPersonDataTarget({ config: mockConfig, tableName });
      const added = createMockPerson([{ sourceIdentifier: 'U00000001' }]);
      const updated = createMockPerson([{ sourceIdentifier: 'U00000002' }]);
      const removed = createMockPerson([{ sourceIdentifier: 'U00000003' }]);

      const result = await target.pushAll({ added: [added], updated: [updated], removed: [removed] });

      expect(result.successes).toHaveLength(3);
      expect(result.failures).toHaveLength(0);
      expect(dynamoMock).toHaveReceivedCommandTimes(PutItemCommand, 3);
    });
  });
});

