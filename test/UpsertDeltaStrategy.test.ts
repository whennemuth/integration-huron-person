import { UpsertDeltaStrategy } from '../src/delta-strategy/decorators/Upsert';
import { ReadPerson } from '../src/data-target/crud/ReadPerson';
import { Config } from '../src/config/Config';
import { DeltaStrategy, DeltaStorage, FieldSet } from 'integration-core';

// Mock ReadPerson
jest.mock('../src/data-target/crud/ReadPerson');

describe('UpsertDeltaStrategy', () => {
  let mockDeltaStrategy: jest.Mocked<DeltaStrategy>;
  let mockConfig: Config;
  let mockReadPerson: jest.Mocked<ReadPerson>;
  let mockStorage: jest.Mocked<DeltaStorage>;

  const createMockPerson = (sourceIdentifier: string, firstName: string = 'John', lastName: string = 'Doe'): FieldSet => ({
    fieldValues: [
      { sourceIdentifier },
      { firstName },
      { lastName },
      { email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com` }
    ]
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock config
    mockConfig = {
      executionMode: 'people',
      dataSource: {
        person: {
          endpointConfig: {
            baseUrl: 'https://datasource.example.com',
            apiKey: 'test-api-key'
          },
          fetchPath: '/api/v1/persons'
        },
        people: {
          endpointConfig: {
            baseUrl: 'https://datasource.example.com',
            apiKey: 'test-api-key'
          },
          fetchPath: '/api/v1/persons'
        },
        idpName: 'test-idp'
      },
      dataTarget: {
        endpointConfig: {
          baseUrl: 'https://datatarget.example.com',
          authMethod: 'basic',
          loginSvcPath: '/auth/token',
          username: 'dt-user',
          password: 'dt-pass'
        },
        personsPath: '/api/v1/persons/batch',
        organizationsPath: '/api/v1/organizations'
      },
      integration: {
        clientId: 'test-client',
        batchSize: 10,
        timeout: 5000
      },
      storage: {
        type: 'file',
        config: {
          path: './test-data'
        }
      }
    } as Config;

    // Mock storage
    mockStorage = {
      readCurrentInput: jest.fn(),
      readPreviousInput: jest.fn(),
      writeCurrentInput: jest.fn(),
      writeDelta: jest.fn(),
      getStorageAdapter: jest.fn()
    } as any;

    // Mock wrapped delta strategy
    mockDeltaStrategy = {
      parms: {
        clientId: 'test-client',
        config: {}
      },
      storage: mockStorage,
      computeDelta: jest.fn()
    } as any;

    // Mock ReadPerson
    mockReadPerson = {
      readPersonBySourceIdentifier: jest.fn()
    } as any;
    (ReadPerson as jest.Mock).mockImplementation(() => mockReadPerson);
  });

  describe('Constructor', () => {
    it('should create instance without cache function', () => {
      const strategy = new UpsertDeltaStrategy(mockDeltaStrategy, mockConfig);
      expect(strategy).toBeDefined();
      expect(strategy.parms).toBe(mockDeltaStrategy.parms);
      expect(strategy.storage).toBe(mockStorage);
    });

    it('should create instance with cache function', () => {
      const mockCacheLookup = jest.fn();
      const strategy = new UpsertDeltaStrategy(mockDeltaStrategy, mockConfig, mockCacheLookup);
      expect(strategy).toBeDefined();
    });
  });

  describe('computeDelta - WITHOUT cache', () => {
    let strategy: UpsertDeltaStrategy;

    beforeEach(() => {
      strategy = new UpsertDeltaStrategy(mockDeltaStrategy, mockConfig);
    });

    it('should identify new persons (not in target system)', async () => {
      const persons = [
        createMockPerson('SRC001', 'John', 'Doe'),
        createMockPerson('SRC002', 'Jane', 'Smith')
      ];

      // Mock ReadPerson to return empty results (person not found)
      mockReadPerson.readPersonBySourceIdentifier.mockResolvedValue([]);

      const result = await strategy.computeDelta({
        storage: mockStorage,
        currentFieldSets: persons,
        inputUtils: {},
        clientId: 'test-client'
      });

      expect(result.added).toHaveLength(2);
      expect(result.updated).toHaveLength(0);
      expect(result.removed).toHaveLength(0);
      expect(mockReadPerson.readPersonBySourceIdentifier).toHaveBeenCalledTimes(2);
      expect(mockReadPerson.readPersonBySourceIdentifier).toHaveBeenCalledWith('SRC001', ['hrn', 'id', 'sourceIdentifier']);
      expect(mockReadPerson.readPersonBySourceIdentifier).toHaveBeenCalledWith('SRC002', ['hrn', 'id', 'sourceIdentifier']);
    });

    it('should identify existing persons (in target system)', async () => {
      const persons = [
        createMockPerson('SRC001', 'John', 'Doe'),
        createMockPerson('SRC002', 'Jane', 'Smith')
      ];

      // Mock ReadPerson to return existing persons
      mockReadPerson.readPersonBySourceIdentifier
        .mockResolvedValueOnce([{ hrn: 'HRN001', id: 'ID001', sourceIdentifier: 'SRC001' } as any])
        .mockResolvedValueOnce([{ hrn: 'HRN002', id: 'ID002', sourceIdentifier: 'SRC002' } as any]);

      const result = await strategy.computeDelta({
        storage: mockStorage,
        currentFieldSets: persons,
        inputUtils: {},
        clientId: 'test-client'
      });

      expect(result.added).toHaveLength(0);
      expect(result.updated).toHaveLength(2);
      expect(result.removed).toHaveLength(0);
      expect(mockReadPerson.readPersonBySourceIdentifier).toHaveBeenCalledTimes(2);
    });

    it('should handle mix of new and existing persons', async () => {
      const persons = [
        createMockPerson('SRC001', 'John', 'Doe'),
        createMockPerson('SRC002', 'Jane', 'Smith'),
        createMockPerson('SRC003', 'Bob', 'Johnson')
      ];

      // SRC001 exists, SRC002 doesn't exist, SRC003 exists
      mockReadPerson.readPersonBySourceIdentifier
        .mockResolvedValueOnce([{ hrn: 'HRN001', id: 'ID001', sourceIdentifier: 'SRC001' } as any])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ hrn: 'HRN003', id: 'ID003', sourceIdentifier: 'SRC003' } as any]);

      const result = await strategy.computeDelta({
        storage: mockStorage,
        currentFieldSets: persons,
        inputUtils: {},
        clientId: 'test-client'
      });

      expect(result.added).toHaveLength(1);
      expect(result.updated).toHaveLength(2);
      expect(result.removed).toHaveLength(0);
      expect(result.added[0]).toBe(persons[1]); // SRC002
      expect(result.updated).toContain(persons[0]); // SRC001
      expect(result.updated).toContain(persons[2]); // SRC003
    });

    it('should treat lookup errors as new persons for safety', async () => {
      const persons = [createMockPerson('SRC001', 'John', 'Doe')];

      // Mock API error
      mockReadPerson.readPersonBySourceIdentifier.mockRejectedValue(new Error('API connection failed'));

      const result = await strategy.computeDelta({
        storage: mockStorage,
        currentFieldSets: persons,
        inputUtils: {},
        clientId: 'test-client'
      });

      expect(result.added).toHaveLength(1);
      expect(result.updated).toHaveLength(0);
      expect(result.removed).toHaveLength(0);
    });

    it('should handle 404 errors as person not found', async () => {
      const persons = [createMockPerson('SRC001', 'John', 'Doe')];

      mockReadPerson.readPersonBySourceIdentifier.mockRejectedValue(new Error('404 Not Found'));

      const result = await strategy.computeDelta({
        storage: mockStorage,
        currentFieldSets: persons,
        inputUtils: {},
        clientId: 'test-client'
      });

      expect(result.added).toHaveLength(1);
      expect(result.updated).toHaveLength(0);
    });

    it('should handle persons without sourceIdentifier', async () => {
      const persons = [
        {
          fieldValues: [
            { firstName: 'John' },
            { lastName: 'Doe' },
            { email: 'john.doe@example.com' }
          ]
        } as FieldSet
      ];

      const result = await strategy.computeDelta({
        storage: mockStorage,
        currentFieldSets: persons,
        inputUtils: {},
        clientId: 'test-client'
      });

      // Should treat as new person since no identifier to lookup
      expect(result.added).toHaveLength(1);
      expect(result.updated).toHaveLength(0);
      expect(mockReadPerson.readPersonBySourceIdentifier).not.toHaveBeenCalled();
    });

    it('should handle empty person list', async () => {
      const result = await strategy.computeDelta({
        storage: mockStorage,
        currentFieldSets: [],
        inputUtils: {},
        clientId: 'test-client'
      });

      expect(result.added).toHaveLength(0);
      expect(result.updated).toHaveLength(0);
      expect(result.removed).toHaveLength(0);
      expect(mockReadPerson.readPersonBySourceIdentifier).not.toHaveBeenCalled();
    });
  });

  describe('computeDelta - WITH cache', () => {
    let strategy: UpsertDeltaStrategy;
    let mockCacheLookup: jest.Mock;

    beforeEach(() => {
      mockCacheLookup = jest.fn();
      strategy = new UpsertDeltaStrategy(mockDeltaStrategy, mockConfig, mockCacheLookup);
    });

    it('should use cache when person found in cache', async () => {
      const persons = [
        createMockPerson('SRC001', 'John', 'Doe'),
        createMockPerson('SRC002', 'Jane', 'Smith')
      ];

      // Mock cache returning sourceIdentifier for both persons
      mockCacheLookup
        .mockResolvedValueOnce('SRC001')
        .mockResolvedValueOnce('SRC002');

      const result = await strategy.computeDelta({
        storage: mockStorage,
        currentFieldSets: persons,
        inputUtils: {},
        clientId: 'test-client'
      });

      // Both should be treated as existing (updated)
      expect(result.added).toHaveLength(0);
      expect(result.updated).toHaveLength(2);
      expect(result.removed).toHaveLength(0);
      
      // Cache should be called for both persons
      expect(mockCacheLookup).toHaveBeenCalledTimes(2);
      expect(mockCacheLookup).toHaveBeenCalledWith(persons[0]);
      expect(mockCacheLookup).toHaveBeenCalledWith(persons[1]);
      
      // ReadPerson API should NOT be called since cache hit
      expect(mockReadPerson.readPersonBySourceIdentifier).not.toHaveBeenCalled();
    });

    it('should fall back to API when cache returns null/undefined', async () => {
      const persons = [
        createMockPerson('SRC001', 'John', 'Doe'),
        createMockPerson('SRC002', 'Jane', 'Smith')
      ];

      // Cache misses for both
      mockCacheLookup
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(undefined);

      // API lookups - one exists, one doesn't
      mockReadPerson.readPersonBySourceIdentifier
        .mockResolvedValueOnce([{ hrn: 'HRN001', id: 'ID001', sourceIdentifier: 'SRC001' } as any])
        .mockResolvedValueOnce([]);

      const result = await strategy.computeDelta({
        storage: mockStorage,
        currentFieldSets: persons,
        inputUtils: {},
        clientId: 'test-client'
      });

      expect(result.added).toHaveLength(1); // SRC002
      expect(result.updated).toHaveLength(1); // SRC001
      expect(result.removed).toHaveLength(0);
      
      // Cache should be checked first
      expect(mockCacheLookup).toHaveBeenCalledTimes(2);
      
      // API should be called after cache miss
      expect(mockReadPerson.readPersonBySourceIdentifier).toHaveBeenCalledTimes(2);
    });

    it('should handle mixed cache hits and misses', async () => {
      const persons = [
        createMockPerson('SRC001', 'John', 'Doe'),
        createMockPerson('SRC002', 'Jane', 'Smith'),
        createMockPerson('SRC003', 'Bob', 'Johnson')
      ];

      // SRC001: cache hit, SRC002: cache miss (API says exists), SRC003: cache miss (API says new)
      mockCacheLookup
        .mockResolvedValueOnce('SRC001') // Cache hit
        .mockResolvedValueOnce(null)     // Cache miss
        .mockResolvedValueOnce(null);    // Cache miss

      mockReadPerson.readPersonBySourceIdentifier
        .mockResolvedValueOnce([{ hrn: 'HRN002', id: 'ID002', sourceIdentifier: 'SRC002' } as any])
        .mockResolvedValueOnce([]);

      const result = await strategy.computeDelta({
        storage: mockStorage,
        currentFieldSets: persons,
        inputUtils: {},
        clientId: 'test-client'
      });

      expect(result.added).toHaveLength(1); // SRC003
      expect(result.updated).toHaveLength(2); // SRC001, SRC002
      expect(result.removed).toHaveLength(0);
      
      // Cache checked for all 3
      expect(mockCacheLookup).toHaveBeenCalledTimes(3);
      
      // API only called for cache misses (2 times)
      expect(mockReadPerson.readPersonBySourceIdentifier).toHaveBeenCalledTimes(2);
    });

    it('should handle cache lookup errors gracefully', async () => {
      const persons = [createMockPerson('SRC001', 'John', 'Doe')];

      // Cache lookup throws error
      mockCacheLookup.mockRejectedValue(new Error('Cache connection failed'));

      // API lookup should not be called - error is caught and person treated as new
      mockReadPerson.readPersonBySourceIdentifier.mockResolvedValue([]);

      const result = await strategy.computeDelta({
        storage: mockStorage,
        currentFieldSets: persons,
        inputUtils: {},
        clientId: 'test-client'
      });

      // Should treat cache error as lookup failure and person as new (for safety)
      expect(result.added).toHaveLength(1);
      expect(result.updated).toHaveLength(0);
      expect(mockCacheLookup).toHaveBeenCalled();
      // API should NOT be called because the entire try block failed
      expect(mockReadPerson.readPersonBySourceIdentifier).not.toHaveBeenCalled();
    });

    it('should handle cache returning empty string', async () => {
      const persons = [createMockPerson('SRC001', 'John', 'Doe')];

      // Cache returns empty string (treated as not found)
      mockCacheLookup.mockResolvedValue('');

      mockReadPerson.readPersonBySourceIdentifier.mockResolvedValue([]);

      const result = await strategy.computeDelta({
        storage: mockStorage,
        currentFieldSets: persons,
        inputUtils: {},
        clientId: 'test-client'
      });

      expect(result.added).toHaveLength(1);
      expect(mockCacheLookup).toHaveBeenCalled();
      expect(mockReadPerson.readPersonBySourceIdentifier).toHaveBeenCalled();
    });

    it('should use cache for high-volume bulk reset scenario', async () => {
      // Simulate bulk reset with many persons
      const persons = Array.from({ length: 100 }, (_, i) => 
        createMockPerson(`SRC${String(i).padStart(3, '0')}`, 'Person', `${i}`)
      );

      // All persons found in cache
      mockCacheLookup.mockImplementation(async (person: FieldSet) => {
        const sourceId = person.fieldValues.find(fv => 'sourceIdentifier' in fv)?.sourceIdentifier;
        return sourceId as string;
      });

      const result = await strategy.computeDelta({
        storage: mockStorage,
        currentFieldSets: persons,
        inputUtils: {},
        clientId: 'test-client'
      });

      // All should be updates (exist in target)
      expect(result.added).toHaveLength(0);
      expect(result.updated).toHaveLength(100);
      expect(result.removed).toHaveLength(0);
      
      // Cache should be called 100 times
      expect(mockCacheLookup).toHaveBeenCalledTimes(100);
      
      // CRITICAL: API should NOT be called at all - this is the performance benefit!
      expect(mockReadPerson.readPersonBySourceIdentifier).not.toHaveBeenCalled();
    });

    it('should optimize performance with partial cache hits in bulk reset', async () => {
      const persons = Array.from({ length: 50 }, (_, i) => 
        createMockPerson(`SRC${String(i).padStart(3, '0')}`, 'Person', `${i}`)
      );

      // 80% cache hit rate (40 hits, 10 misses)
      mockCacheLookup.mockImplementation(async (person: FieldSet) => {
        const sourceId = person.fieldValues.find(fv => 'sourceIdentifier' in fv)?.sourceIdentifier;
        const index = parseInt((sourceId as string).substring(3));
        return index < 40 ? sourceId : null; // First 40 in cache
      });

      // For cache misses, half exist, half don't
      mockReadPerson.readPersonBySourceIdentifier.mockImplementation(async (sourceId: string) => {
        const index = parseInt(sourceId.substring(3));
        return index % 2 === 0 
          ? [{ hrn: `HRN${index}`, id: `ID${index}`, sourceIdentifier: sourceId } as any]
          : [];
      });

      const result = await strategy.computeDelta({
        storage: mockStorage,
        currentFieldSets: persons,
        inputUtils: {},
        clientId: 'test-client'
      });

      expect(result.added).toHaveLength(5); // Cache miss + API says new
      expect(result.updated).toHaveLength(45); // 40 cache hits + 5 cache miss/API says exists
      expect(result.removed).toHaveLength(0);
      
      // Cache checked for all 50
      expect(mockCacheLookup).toHaveBeenCalledTimes(50);
      
      // API only called for 10 cache misses (80% reduction in API calls!)
      expect(mockReadPerson.readPersonBySourceIdentifier).toHaveBeenCalledTimes(10);
    });
  });

  describe('Storage delegation', () => {
    it('should delegate storage property to wrapped strategy', () => {
      const strategy = new UpsertDeltaStrategy(mockDeltaStrategy, mockConfig);
      expect(strategy.storage).toBe(mockStorage);
    });
  });
});
