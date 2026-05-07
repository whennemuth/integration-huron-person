import { DeltaResult, DeltaStorage, DeltaStrategy, DeltaStrategyParams, FieldSet, InputUtilsDecorator, FileConfig } from 'integration-core';
import { IgnoreRemovalsDeltaStrategy } from '../src/delta-strategy/IgnoreRemovalsDeltaStrategy';

describe('IgnoreRemovalsDeltaStrategy', () => {
  let mockStorage: DeltaStorage;
  let mockUnderlyingStrategy: jest.Mocked<DeltaStrategy>;
  let mockParms: DeltaStrategyParams;

  beforeEach(() => {
    // Create mock storage
    mockStorage = {
      name: 'Mock Storage',
      description: 'Mock storage for testing',
      fetchPreviousData: jest.fn(),
      updatePreviousData: jest.fn()
    };

    // Create mock parameters
    mockParms = {
      clientId: 'test-client',
      config: { path: '/mock/path' } as FileConfig
    };

    // Create mock underlying strategy
    mockUnderlyingStrategy = {
      parms: mockParms,
      storage: mockStorage,
      computeDelta: jest.fn()
    } as unknown as jest.Mocked<DeltaStrategy>;
  });

  describe('Constructor', () => {
    it('should wrap the underlying strategy', () => {
      const strategy = new IgnoreRemovalsDeltaStrategy(mockUnderlyingStrategy);
      
      expect(strategy.parms).toBe(mockParms);
      expect(strategy.storage).toBe(mockStorage);
    });

    it('should expose storage getter from underlying strategy', () => {
      const strategy = new IgnoreRemovalsDeltaStrategy(mockUnderlyingStrategy);
      
      expect(strategy.storage).toBe(mockUnderlyingStrategy.storage);
    });
  });

  describe('computeDelta', () => {
    it('should filter out all removed records when underlying strategy returns removals', async () => {
      // Arrange
      const added: FieldSet[] = [
        { hash: 'hash1', fieldValues: [{ id: 1 }, { name: 'Alice' }] }
      ];
      const updated: FieldSet[] = [
        { hash: 'hash2', fieldValues: [{ id: 2 }, { name: 'Bob Updated' }] }
      ];
      const removed: FieldSet[] = [
        { hash: 'hash3', fieldValues: [{ id: 3 }, { name: 'Charlie' }] },
        { hash: 'hash4', fieldValues: [{ id: 4 }, { name: 'Diana' }] }
      ];

      mockUnderlyingStrategy.computeDelta.mockResolvedValue({
        added,
        updated,
        removed
      });

      const strategy = new IgnoreRemovalsDeltaStrategy(mockUnderlyingStrategy);

      const currentFieldSets: FieldSet[] = [];
      const inputUtils = {} as InputUtilsDecorator;

      // Act
      const result = await strategy.computeDelta({
        storage: mockStorage,
        currentFieldSets,
        inputUtils,
        clientId: 'test-client'
      });

      // Assert
      expect(result.added).toEqual(added);
      expect(result.updated).toEqual(updated);
      expect(result.removed).toEqual([]); // ← Should be empty even though underlying returned 2 removals
      expect(mockUnderlyingStrategy.computeDelta).toHaveBeenCalledWith({
        storage: mockStorage,
        currentFieldSets,
        inputUtils,
        clientId: 'test-client'
      });
    });

    it('should preserve empty removed array when underlying strategy returns no removals', async () => {
      // Arrange
      const added: FieldSet[] = [
        { hash: 'hash1', fieldValues: [{ id: 1 }, { name: 'Alice' }] }
      ];
      const updated: FieldSet[] = [
        { hash: 'hash2', fieldValues: [{ id: 2 }, { name: 'Bob' }] }
      ];

      mockUnderlyingStrategy.computeDelta.mockResolvedValue({
        added,
        updated,
        removed: [] // Already empty
      });

      const strategy = new IgnoreRemovalsDeltaStrategy(mockUnderlyingStrategy);

      // Act
      const result = await strategy.computeDelta({
        storage: mockStorage,
        currentFieldSets: [],
        inputUtils: {} as InputUtilsDecorator,
        clientId: 'test-client'
      });

      // Assert
      expect(result.removed).toEqual([]);
    });

    it('should preserve added and updated arrays unchanged', async () => {
      // Arrange
      const added: FieldSet[] = [
        { hash: 'hash1', fieldValues: [{ id: 1 }, { name: 'Alice' }] },
        { hash: 'hash5', fieldValues: [{ id: 5 }, { name: 'Eve' }] }
      ];
      const updated: FieldSet[] = [
        { hash: 'hash2', fieldValues: [{ id: 2 }, { name: 'Bob' }] },
        { hash: 'hash6', fieldValues: [{ id: 6 }, { name: 'Frank' }] }
      ];
      const removed: FieldSet[] = [
        { hash: 'hash3', fieldValues: [{ id: 3 }, { name: 'Charlie' }] }
      ];

      mockUnderlyingStrategy.computeDelta.mockResolvedValue({
        added,
        updated,
        removed
      });

      const strategy = new IgnoreRemovalsDeltaStrategy(mockUnderlyingStrategy);

      // Act
      const result = await strategy.computeDelta({
        storage: mockStorage,
        currentFieldSets: [],
        inputUtils: {} as InputUtilsDecorator,
        clientId: 'test-client'
      });

      // Assert
      expect(result.added).toBe(added); // Same reference
      expect(result.updated).toBe(updated); // Same reference
      expect(result.added).toHaveLength(2);
      expect(result.updated).toHaveLength(2);
    });

    it('should handle delta result with no additions or updates', async () => {
      // Arrange - only removals
      mockUnderlyingStrategy.computeDelta.mockResolvedValue({
        added: [],
        updated: [],
        removed: [
          { hash: 'hash3', fieldValues: [{ id: 3 }, { name: 'Charlie' }] }
        ]
      });

      const strategy = new IgnoreRemovalsDeltaStrategy(mockUnderlyingStrategy);

      // Act
      const result = await strategy.computeDelta({
        storage: mockStorage,
        currentFieldSets: [],
        inputUtils: {} as InputUtilsDecorator,
        clientId: 'test-client'
      });

      // Assert
      expect(result.added).toEqual([]);
      expect(result.updated).toEqual([]);
      expect(result.removed).toEqual([]); // Filtered out the removal
    });

    it('should handle delta result with undefined updated array', async () => {
      // Arrange - updated is optional in DeltaResult
      mockUnderlyingStrategy.computeDelta.mockResolvedValue({
        added: [{ hash: 'hash1', fieldValues: [{ id: 1 }] }],
        updated: undefined, // Optional field
        removed: [{ hash: 'hash2', fieldValues: [{ id: 2 }] }]
      });

      const strategy = new IgnoreRemovalsDeltaStrategy(mockUnderlyingStrategy);

      // Act
      const result = await strategy.computeDelta({
        storage: mockStorage,
        currentFieldSets: [],
        inputUtils: {} as InputUtilsDecorator,
        clientId: 'test-client'
      });

      // Assert
      expect(result.added).toHaveLength(1);
      expect(result.updated).toBeUndefined();
      expect(result.removed).toEqual([]);
    });

    it('should forward all parameters to underlying strategy', async () => {
      // Arrange
      mockUnderlyingStrategy.computeDelta.mockResolvedValue({
        added: [],
        updated: [],
        removed: []
      });

      const strategy = new IgnoreRemovalsDeltaStrategy(mockUnderlyingStrategy);

      const currentFieldSets: FieldSet[] = [
        { hash: 'hash1', fieldValues: [{ id: 1 }, { name: 'Test' }] }
      ];
      const inputUtils = {
        getPrimaryKeys: jest.fn()
      } as unknown as InputUtilsDecorator;
      const clientId = 'custom-client-id';

      // Act
      await strategy.computeDelta({
        storage: mockStorage,
        currentFieldSets,
        inputUtils,
        clientId
      });

      // Assert
      expect(mockUnderlyingStrategy.computeDelta).toHaveBeenCalledWith({
        storage: mockStorage,
        currentFieldSets,
        inputUtils,
        clientId
      });
    });

    it('should propagate errors from underlying strategy', async () => {
      // Arrange
      const error = new Error('Underlying strategy failure');
      mockUnderlyingStrategy.computeDelta.mockRejectedValue(error);

      const strategy = new IgnoreRemovalsDeltaStrategy(mockUnderlyingStrategy);

      // Act & Assert
      await expect(strategy.computeDelta({
        storage: mockStorage,
        currentFieldSets: [],
        inputUtils: {} as InputUtilsDecorator,
        clientId: 'test-client'
      })).rejects.toThrow('Underlying strategy failure');
    });
  });

  describe('Integration with PersonDelta scenario', () => {
    it('should prevent deletions when source API returns delta subset (PersonDelta mode)', async () => {
      // Scenario: Source API returns only changed records (PersonDelta)
      // - Previous state: Alice, Bob, Charlie (all 3 in delta storage)
      // - API returns: Bob (only changed person)
      // - Without IgnoreRemovalsDeltaStrategy: Alice and Charlie would appear "removed"
      // - With IgnoreRemovalsDeltaStrategy: Alice and Charlie are NOT deleted

      // Arrange
      const previousData: FieldSet[] = [
        { hash: 'hash-alice', fieldValues: [{ sourceIdentifier: 'U001' }, { name: 'Alice' }] },
        { hash: 'hash-bob', fieldValues: [{ sourceIdentifier: 'U002' }, { name: 'Bob' }] },
        { hash: 'hash-charlie', fieldValues: [{ sourceIdentifier: 'U003' }, { name: 'Charlie' }] }
      ];

      const currentData: FieldSet[] = [
        { hash: 'hash-bob-updated', fieldValues: [{ sourceIdentifier: 'U002' }, { name: 'Bob Updated' }] }
      ];

      // Mock underlying strategy would normally see Alice and Charlie as removed
      mockUnderlyingStrategy.computeDelta.mockResolvedValue({
        added: [],
        updated: [currentData[0]], // Bob was updated
        removed: [previousData[0], previousData[2]] // Alice and Charlie appear removed
      });

      const strategy = new IgnoreRemovalsDeltaStrategy(mockUnderlyingStrategy);

      // Act
      const result = await strategy.computeDelta({
        storage: mockStorage,
        currentFieldSets: currentData,
        inputUtils: {} as InputUtilsDecorator,
        clientId: 'person-delta'
      });

      // Assert
      expect(result.added).toEqual([]);
      expect(result.updated).toEqual([currentData[0]]); // Bob updated
      expect(result.removed).toEqual([]); // Alice and Charlie NOT deleted (protected by strategy)
    });
  });
});
