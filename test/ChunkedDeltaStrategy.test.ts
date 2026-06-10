import { ChunkedDeltaStrategy } from '../src/delta-strategy/decorators/Chunked';
import { DeltaResult, DeltaStorage, DeltaStrategy, FieldSet } from 'integration-core';
import { Config } from '../src/config/Config';

/**
 * Tests for ChunkedDeltaStrategy
 * 
 * Critical behavior: In chunked processing mode, the strategy must filter out 'removed' records
 * from delta results because missing records aren't actually removed from the source system -
 * they're just being processed by other parallel chunks.
 */
describe('ChunkedDeltaStrategy', () => {
  let mockWrappedStrategy: jest.Mocked<DeltaStrategy>;
  let mockStorage: jest.Mocked<DeltaStorage>;
  let mockConfig: Config;
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    // Mock wrapped delta strategy
    mockWrappedStrategy = {
      parms: {
        clientId: 'chunked-client-id',
        config: {}
      },
      storage: {} as DeltaStorage,
      computeDelta: jest.fn()
    } as any;

    // Mock storage
    mockStorage = {
      name: 'MockStorage',
      description: 'Mock storage for testing',
      fetchPreviousData: jest.fn(),
      wouldOverwritePreviousData: jest.fn().mockResolvedValue(true),
      updatePreviousData: jest.fn()
    } as any;

    // Mock config with integratedDeltaClientId
    mockConfig = {
      executionMode: 'people',
      dataSource: {
        person: {
          endpointConfig: {
            baseUrl: 'https://api.example.com',
            apiKey: 'test-key'
          },
          fetchPath: '/persons'
        },
        people: {
          endpointConfig: {
            baseUrl: 'https://api.example.com',
            apiKey: 'test-key'
          },
          fetchPath: '/persons'
        },
        idpName: 'test-idp'
      },
      dataTarget: {
        endpointConfig: {
          baseUrl: 'https://target.example.com',
          authMethod: 'basic',
          loginSvcPath: '/auth/token',
          username: 'user',
          password: 'pass'
        },
        personsPath: '/api/v1/persons/batch',
        organizationsPath: '/api/v1/organizations'
      },
      integration: {
        clientId: 'deltas/person-full/2026-05-01T14:39:29.727Z',
        batchSize: 10,
        timeout: 5000
      },
      storage: {
        type: 'file',
        config: {
          bucketName: 'test-bucket',
          keyPrefix: ''
        }
      },
      integratedDeltaClientId: 'delta-storage'
    } as any;

    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe('constructor', () => {
    it('should extract integratedDeltaClientId from config', () => {
      const strategy = new ChunkedDeltaStrategy(mockWrappedStrategy, mockConfig);
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        'ChunkedDeltaStrategy: Reading integrated delta from: delta-storage'
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        'ChunkedDeltaStrategy: Writing chunked delta to: deltas/person-full/2026-05-01T14:39:29.727Z'
      );
    });

    it('should fall back to clientId if integratedDeltaClientId not provided', () => {
      const configWithoutIntegrated = {
        ...mockConfig,
        integratedDeltaClientId: undefined
      };
      delete (configWithoutIntegrated as any).integratedDeltaClientId;

      const strategy = new ChunkedDeltaStrategy(mockWrappedStrategy, configWithoutIntegrated as Config);
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        'ChunkedDeltaStrategy: Reading integrated delta from: deltas/person-full/2026-05-01T14:39:29.727Z'
      );
    });
  });

  describe('computeDelta', () => {
    it('should filter out removed records from delta result', async () => {
      const currentFieldSets: FieldSet[] = [
        {
          hash: 'hash-person-b',
          fieldValues: [
            { sourceIdentifier: 'U00000002' },
            { firstName: 'Bob' },
            { lastName: 'Smith' }
          ]
        }
      ];

      const addedRecords: FieldSet[] = [];
      const updatedRecords: FieldSet[] = [currentFieldSets[0]];
      const removedRecords: FieldSet[] = [
        {
          hash: 'hash-person-a',
          fieldValues: [
            { sourceIdentifier: 'U00000001' },
            { firstName: 'Alice' },
            { lastName: 'Johnson' }
          ]
        }
      ];

      // Mock wrapped strategy to return delta with removals
      const mockDeltaResult: DeltaResult = {
        added: addedRecords,
        updated: updatedRecords,
        removed: removedRecords
      };
      mockWrappedStrategy.computeDelta.mockResolvedValue(mockDeltaResult);

      const strategy = new ChunkedDeltaStrategy(mockWrappedStrategy, mockConfig);
      const inputUtils = { getPrimaryKeys: () => new Set(['sourceIdentifier']) };

      const result = await strategy.computeDelta({
        storage: mockStorage,
        currentFieldSets,
        inputUtils,
        clientId: 'deltas/person-full/2026-05-01T14:39:29.727Z'
      });

      // Verify wrapped strategy was called with integratedDeltaClientId
      expect(mockWrappedStrategy.computeDelta).toHaveBeenCalledWith({
        storage: mockStorage,
        currentFieldSets,
        inputUtils,
        clientId: 'delta-storage' // integratedDeltaClientId, not the chunked clientId
      });

      // Verify removals were filtered out
      expect(result.removed).toEqual([]);
      expect(result.added).toEqual(addedRecords);
      expect(result.updated).toEqual(updatedRecords);

      // Verify logging occurred
      expect(consoleLogSpy).toHaveBeenCalledWith(
        'ChunkedDeltaStrategy: Filtered out 1 removed record(s) - ' +
        'these records are in other chunks, not actually removed from source system'
      );
    });

    it('should not log when there are no removed records to filter', async () => {
      const currentFieldSets: FieldSet[] = [
        {
          hash: 'hash-new-person',
          fieldValues: [
            { sourceIdentifier: 'U00000003' },
            { firstName: 'Charlie' },
            { lastName: 'Brown' }
          ]
        }
      ];

      // Mock wrapped strategy to return delta without removals
      const mockDeltaResult: DeltaResult = {
        added: currentFieldSets,
        updated: [],
        removed: [] // No removals
      };
      mockWrappedStrategy.computeDelta.mockResolvedValue(mockDeltaResult);

      const strategy = new ChunkedDeltaStrategy(mockWrappedStrategy, mockConfig);
      const inputUtils = { getPrimaryKeys: () => new Set(['sourceIdentifier']) };

      await strategy.computeDelta({
        storage: mockStorage,
        currentFieldSets,
        inputUtils,
        clientId: 'deltas/person-full/2026-05-01T14:39:29.727Z'
      });

      // Verify no filtering log message
      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Filtered out')
      );
    });

    it('should handle multiple removed records correctly', async () => {
      const currentFieldSets: FieldSet[] = [
        {
          hash: 'hash-person-c',
          fieldValues: [
            { sourceIdentifier: 'U00000003' },
            { firstName: 'Charlie' }
          ]
        }
      ];

      // Simulate scenario where chunk has 1 person but shared file has 5 persons
      const removedRecords: FieldSet[] = [
        { hash: 'hash-a', fieldValues: [{ sourceIdentifier: 'U00000001' }] },
        { hash: 'hash-b', fieldValues: [{ sourceIdentifier: 'U00000002' }] },
        { hash: 'hash-d', fieldValues: [{ sourceIdentifier: 'U00000004' }] },
        { hash: 'hash-e', fieldValues: [{ sourceIdentifier: 'U00000005' }] }
      ];

      const mockDeltaResult: DeltaResult = {
        added: [],
        updated: currentFieldSets,
        removed: removedRecords
      };
      mockWrappedStrategy.computeDelta.mockResolvedValue(mockDeltaResult);

      const strategy = new ChunkedDeltaStrategy(mockWrappedStrategy, mockConfig);
      const inputUtils = { getPrimaryKeys: () => new Set(['sourceIdentifier']) };

      const result = await strategy.computeDelta({
        storage: mockStorage,
        currentFieldSets,
        inputUtils,
        clientId: 'deltas/person-full/2026-05-01T14:39:29.727Z'
      });

      // All 4 removals should be filtered out
      expect(result.removed).toEqual([]);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        'ChunkedDeltaStrategy: Filtered out 4 removed record(s) - ' +
        'these records are in other chunks, not actually removed from source system'
      );
    });

    it('should preserve added and updated records exactly as returned by wrapped strategy', async () => {
      const addedRecords: FieldSet[] = [
        {
          hash: 'hash-new-1',
          fieldValues: [{ sourceIdentifier: 'U00000010' }, { firstName: 'New' }]
        },
        {
          hash: 'hash-new-2',
          fieldValues: [{ sourceIdentifier: 'U00000011' }, { firstName: 'Another' }]
        }
      ];

      const updatedRecords: FieldSet[] = [
        {
          hash: 'hash-updated-1',
          fieldValues: [{ sourceIdentifier: 'U00000020' }, { firstName: 'Updated' }]
        }
      ];

      const mockDeltaResult: DeltaResult = {
        added: addedRecords,
        updated: updatedRecords,
        removed: [{ hash: 'hash-removed', fieldValues: [{ sourceIdentifier: 'U99999999' }] }]
      };
      mockWrappedStrategy.computeDelta.mockResolvedValue(mockDeltaResult);

      const strategy = new ChunkedDeltaStrategy(mockWrappedStrategy, mockConfig);
      const inputUtils = { getPrimaryKeys: () => new Set(['sourceIdentifier']) };

      const result = await strategy.computeDelta({
        storage: mockStorage,
        currentFieldSets: [...addedRecords, ...updatedRecords],
        inputUtils,
        clientId: 'deltas/person-full/2026-05-01T14:39:29.727Z'
      });

      // Added and updated should be preserved exactly
      expect(result.added).toBe(addedRecords); // Same reference
      expect(result.updated).toBe(updatedRecords); // Same reference
      expect(result.removed).toEqual([]); // Filtered out
    });
  });

  describe('storage', () => {
    it('should delegate storage access to wrapped strategy', () => {
      const strategy = new ChunkedDeltaStrategy(mockWrappedStrategy, mockConfig);
      
      const storage = strategy.storage;
      
      expect(storage).toBe(mockWrappedStrategy.storage);
    });
  });

  describe('parms', () => {
    it('should expose wrapped strategy parameters', () => {
      const strategy = new ChunkedDeltaStrategy(mockWrappedStrategy, mockConfig);
      
      expect(strategy.parms).toBe(mockWrappedStrategy.parms);
    });
  });
});
