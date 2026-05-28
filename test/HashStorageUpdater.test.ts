import { HashStorageUpdater } from '../src/delta-strategy/merging/HashStorageUpdater';
import { DeltaStorage, FieldSet } from 'integration-core';

describe('HashStorageUpdater', () => {
  let mockStorage: jest.Mocked<DeltaStorage>;
  const clientId = 'test-client';

  beforeEach(() => {
    mockStorage = {
      name: 'Mock Storage',
      description: 'Mock storage for testing',
      fetchPreviousData: jest.fn(),
      wouldOverwritePreviousData: jest.fn().mockResolvedValue(true),
      updatePreviousData: jest.fn()
    } as any;
  });

  describe('updateStorage', () => {
    it('should update a single existing record in storage', async () => {
      // Arrange
      const existingData: FieldSet[] = [
        {
          fieldValues: [{ id: 'U123' }], // Stored data is pruned (only PK fields)
          hash: 'old-hash'
        },
        {
          fieldValues: [{ id: 'U456' }], // Stored data is pruned (only PK fields)
          hash: 'other-hash'
        }
      ];
      mockStorage.fetchPreviousData.mockResolvedValue(existingData);

      const updatedFieldSet: FieldSet = {
        fieldValues: [{ id: 'U123' }, { name: 'John Updated' }], // Input has all fields
        hash: 'new-hash'
      };
      const fieldSetsToUpdate = new Map([['U123', updatedFieldSet]]);
      const primaryKeyFields = new Set(['id']);

      // Act
      const count = await HashStorageUpdater.updateStorage({
        storage: mockStorage,
        clientId,
        fieldSetsToUpdate,
        primaryKeyFields
      });

      // Assert
      expect(count).toBe(1);
      expect(mockStorage.fetchPreviousData).toHaveBeenCalledWith({ clientId });
      
      // Verify that stored data is pruned to only PK fields + hash
      const updateCall = mockStorage.updatePreviousData.mock.calls[0][0];
      expect(updateCall.newPreviousData).toHaveLength(2);
      expect(updateCall.newPreviousData[0]).toEqual({
        fieldValues: [{ id: 'U123' }], // Pruned - only PK field
        hash: 'new-hash',
        validationMessages: undefined
      });
      expect(updateCall.newPreviousData[1]).toEqual(existingData[1]);
    });

    it('should add a new record to storage when not found', async () => {
      // Arrange
      const existingData: FieldSet[] = [
        {
          fieldValues: [{ id: 'U123' }], // Stored data is pruned (only PK fields)
          hash: 'existing-hash'
        }
      ];
      mockStorage.fetchPreviousData.mockResolvedValue(existingData);

      const newFieldSet: FieldSet = {
        fieldValues: [{ id: 'U999' }, { name: 'New Person' }], // Input has all fields
        hash: 'new-hash'
      };
      const fieldSetsToUpdate = new Map([['U999', newFieldSet]]);
      const primaryKeyFields = new Set(['id']);

      // Act
      const count = await HashStorageUpdater.updateStorage({
        storage: mockStorage,
        clientId,
        fieldSetsToUpdate,
        primaryKeyFields
      });

      // Assert
      expect(count).toBe(1);
      
      // Verify that stored data is pruned to only PK fields + hash
      const updateCall = mockStorage.updatePreviousData.mock.calls[0][0];
      expect(updateCall.newPreviousData).toHaveLength(2);
      expect(updateCall.newPreviousData[0]).toEqual(existingData[0]);
      expect(updateCall.newPreviousData[1]).toEqual({
        fieldValues: [{ id: 'U999' }], // Pruned - only PK field
        hash: 'new-hash',
        validationMessages: undefined
      });
    });

    it('should handle composite primary keys correctly', async () => {
      // Arrange
      const existingData: FieldSet[] = [
        {
          fieldValues: [{ id: 'U123' }, { email: 'john@example.com' }], // Stored data is pruned (only PK fields)
          hash: 'old-hash'
        }
      ];
      mockStorage.fetchPreviousData.mockResolvedValue(existingData);

      const updatedFieldSet: FieldSet = {
        fieldValues: [{ id: 'U123' }, { email: 'john@example.com' }, { name: 'John Updated' }], // Input has all fields
        hash: 'new-hash'
      };
      const fieldSetsToUpdate = new Map([['U123', updatedFieldSet]]);
      const primaryKeyFields = new Set(['id', 'email']);

      // Act
      const count = await HashStorageUpdater.updateStorage({
        storage: mockStorage,
        clientId,
        fieldSetsToUpdate,
        primaryKeyFields
      });

      // Assert
      expect(count).toBe(1);
      const updateCall = mockStorage.updatePreviousData.mock.calls[0][0];
      expect(updateCall.newPreviousData).toHaveLength(1);
      // Verify data is pruned to only composite PK fields (id + email)
      expect(updateCall.newPreviousData[0]).toEqual({
        fieldValues: [{ id: 'U123' }, { email: 'john@example.com' }], // Pruned - only PK fields
        hash: 'new-hash',
        validationMessages: undefined
      });
    });

    it('should handle batch updates of multiple records efficiently', async () => {
      // Arrange
      const existingData: FieldSet[] = [
        {
          fieldValues: [{ id: 'U111' }], // Stored data is pruned (only PK fields)
          hash: 'hash-1'
        },
        {
          fieldValues: [{ id: 'U222' }], // Stored data is pruned (only PK fields)
          hash: 'hash-2'
        },
        {
          fieldValues: [{ id: 'U333' }], // Stored data is pruned (only PK fields)
          hash: 'hash-3'
        }
      ];
      mockStorage.fetchPreviousData.mockResolvedValue(existingData);

      const updatedFieldSets = new Map([
        ['U111', {
          fieldValues: [{ id: 'U111' }, { name: 'Updated Person 1' }], // Input has all fields
          hash: 'new-hash-1'
        }],
        ['U333', {
          fieldValues: [{ id: 'U333' }, { name: 'Updated Person 3' }], // Input has all fields
          hash: 'new-hash-3'
        }],
        ['U444', {
          fieldValues: [{ id: 'U444' }, { name: 'New Person 4' }], // Input has all fields
          hash: 'new-hash-4'
        }]
      ]);
      const primaryKeyFields = new Set(['id']);

      // Act
      const count = await HashStorageUpdater.updateStorage({
        storage: mockStorage,
        clientId,
        fieldSetsToUpdate: updatedFieldSets,
        primaryKeyFields
      });

      // Assert
      expect(count).toBe(3);
      expect(mockStorage.fetchPreviousData).toHaveBeenCalledTimes(1);
      expect(mockStorage.updatePreviousData).toHaveBeenCalledTimes(1);
      
      const updateCall = mockStorage.updatePreviousData.mock.calls[0][0];
      expect(updateCall.newPreviousData).toHaveLength(4); // Original 3, updated 2, added 1
      
      // Verify all stored data is pruned to only PK field
      // Check that U222 is unchanged
      const unchangedRecord = updateCall.newPreviousData.find((fs: FieldSet) => 
        fs.fieldValues.find(fv => fv.id === 'U222')
      );
      expect(unchangedRecord?.hash).toBe('hash-2');
      expect(unchangedRecord?.fieldValues).toEqual([{ id: 'U222' }]); // Pruned
      
      // Check that U111 and U333 are updated
      const updated111 = updateCall.newPreviousData.find((fs: FieldSet) => 
        fs.fieldValues.find(fv => fv.id === 'U111')
      );
      expect(updated111?.hash).toBe('new-hash-1');
      expect(updated111?.fieldValues).toEqual([{ id: 'U111' }]); // Pruned
      
      const updated333 = updateCall.newPreviousData.find((fs: FieldSet) => 
        fs.fieldValues.find(fv => fv.id === 'U333')
      );
      expect(updated333?.hash).toBe('new-hash-3');
      expect(updated333?.fieldValues).toEqual([{ id: 'U333' }]); // Pruned
      
      // Check that U444 was added
      const added444 = updateCall.newPreviousData.find((fs: FieldSet) => 
        fs.fieldValues.find(fv => fv.id === 'U444')
      );
      expect(added444?.hash).toBe('new-hash-4');
      expect(added444?.fieldValues).toEqual([{ id: 'U444' }]); // Pruned
    });

    it('should return 0 and skip update when fieldSetsToUpdate is empty', async () => {
      // Arrange
      const fieldSetsToUpdate = new Map<string, FieldSet>();
      const primaryKeyFields = new Set(['id']);

      // Act
      const count = await HashStorageUpdater.updateStorage({
        storage: mockStorage,
        clientId,
        fieldSetsToUpdate,
        primaryKeyFields
      });

      // Assert
      expect(count).toBe(0);
      expect(mockStorage.fetchPreviousData).not.toHaveBeenCalled();
      expect(mockStorage.updatePreviousData).not.toHaveBeenCalled();
    });

    it('should handle empty existing storage', async () => {
      // Arrange
      mockStorage.fetchPreviousData.mockResolvedValue([]);

      const newFieldSet: FieldSet = {
        fieldValues: [{ id: 'U123' }, { name: 'John Doe' }], // Input has all fields
        hash: 'new-hash'
      };
      const fieldSetsToUpdate = new Map([['U123', newFieldSet]]);
      const primaryKeyFields = new Set(['id']);

      // Act
      const count = await HashStorageUpdater.updateStorage({
        storage: mockStorage,
        clientId,
        fieldSetsToUpdate,
        primaryKeyFields
      });

      // Assert
      expect(count).toBe(1);
      const updateCall = mockStorage.updatePreviousData.mock.calls[0][0];
      expect(updateCall.newPreviousData).toHaveLength(1);
      // Verify data is pruned to only PK field
      expect(updateCall.newPreviousData[0]).toEqual({
        fieldValues: [{ id: 'U123' }], // Pruned - only PK field
        hash: 'new-hash',
        validationMessages: undefined
      });
    });
  });

  describe('getPrimaryKeyValue', () => {
    it('should extract primary key value for single key', () => {
      // Arrange
      const fieldSet: FieldSet = {
        fieldValues: [{ id: 'U123' }, { name: 'John Doe' }]
      };
      const primaryKeyFields = new Set(['id']);

      // Act
      const result = HashStorageUpdater.getPrimaryKeyValue(fieldSet, primaryKeyFields);

      // Assert
      expect(result).toBe('U123');
    });

    it('should extract and join composite primary key values', () => {
      // Arrange
      const fieldSet: FieldSet = {
        fieldValues: [{ id: 'U123' }, { email: 'john@example.com' }, { name: 'John Doe' }]
      };
      const primaryKeyFields = new Set(['id', 'email']);

      // Act
      const result = HashStorageUpdater.getPrimaryKeyValue(fieldSet, primaryKeyFields);

      // Assert
      expect(result).toContain('U123');
      expect(result).toContain('john@example.com');
      expect(result).toContain('|');
    });

    it('should handle missing primary key fields gracefully', () => {
      // Arrange
      const fieldSet: FieldSet = {
        fieldValues: [{ name: 'John Doe' }]
      };
      const primaryKeyFields = new Set(['id']);

      // Act
      const result = HashStorageUpdater.getPrimaryKeyValue(fieldSet, primaryKeyFields);

      // Assert
      expect(result).toBe('');
    });
  });
});
