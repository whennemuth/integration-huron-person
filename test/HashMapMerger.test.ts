import { HashMapMerger, KeyHashPair, MergeResult } from '../src/delta-strategy/merging/HashMapMerger';
import { FieldSet } from 'integration-core';

describe('HashMapMerger', () => {
  let merger: HashMapMerger;

  beforeEach(() => {
    merger = new HashMapMerger();
  });

  describe('Basic merge scenarios', () => {
    it('should retain records only in baseline', () => {
      const baseline: KeyHashPair[] = [
        { key: 'U001', hash: 'hash1' },
        { key: 'U002', hash: 'hash2' },
        { key: 'U003', hash: 'hash3' }
      ];
      const incremental: KeyHashPair[] = [];

      const result = merger.merge(baseline, incremental);

      expect(result.merged).toHaveLength(3);
      expect(result.stats.retained).toBe(3);
      expect(result.stats.added).toBe(0);
      expect(result.stats.updated).toBe(0);
      expect(result.stats.unchanged).toBe(0);
      expect(result.stats.total).toBe(3);
    });

    it('should add records only in incremental', () => {
      const baseline: KeyHashPair[] = [];
      const incremental: KeyHashPair[] = [
        { key: 'U001', hash: 'hash1' },
        { key: 'U002', hash: 'hash2' }
      ];

      const result = merger.merge(baseline, incremental);

      expect(result.merged).toHaveLength(2);
      expect(result.stats.retained).toBe(0);
      expect(result.stats.added).toBe(2);
      expect(result.stats.updated).toBe(0);
      expect(result.stats.total).toBe(2);
    });

    it('should update records with different hashes', () => {
      const baseline: KeyHashPair[] = [
        { key: 'U001', hash: 'old-hash' },
        { key: 'U002', hash: 'hash2' }
      ];
      const incremental: KeyHashPair[] = [
        { key: 'U001', hash: 'new-hash' } // Changed
      ];

      const result = merger.merge(baseline, incremental);

      expect(result.merged).toHaveLength(2);
      expect(result.stats.retained).toBe(1); // U002
      expect(result.stats.updated).toBe(1); // U001
      expect(result.stats.total).toBe(2);
      
      // Verify U001 has new hash
      const u001 = result.merged.find(p => p.key === 'U001');
      expect(u001?.hash).toBe('new-hash');
    });

    it('should mark unchanged records with same hash', () => {
      const baseline: KeyHashPair[] = [
        { key: 'U001', hash: 'same-hash' }
      ];
      const incremental: KeyHashPair[] = [
        { key: 'U001', hash: 'same-hash' } // Unchanged
      ];

      const result = merger.merge(baseline, incremental);

      expect(result.merged).toHaveLength(1);
      expect(result.stats.unchanged).toBe(1);
      expect(result.stats.updated).toBe(0);
      expect(result.stats.total).toBe(1);
    });
  });

  describe('Complex scenarios', () => {
    it('should handle mixed operations correctly', () => {
      const baseline: KeyHashPair[] = [
        { key: 'U001', hash: 'hash1' },    // Will be retained
        { key: 'U002', hash: 'old-hash2' }, // Will be updated
        { key: 'U003', hash: 'hash3' },    // Will be retained
        { key: 'U004', hash: 'same4' }     // Will be unchanged
      ];
      const incremental: KeyHashPair[] = [
        { key: 'U002', hash: 'new-hash2' }, // Update
        { key: 'U004', hash: 'same4' },      // Unchanged
        { key: 'U005', hash: 'hash5' }       // Add
      ];

      const result = merger.merge(baseline, incremental);

      expect(result.merged).toHaveLength(5);
      expect(result.stats.retained).toBe(2); // U001, U003
      expect(result.stats.updated).toBe(1);  // U002
      expect(result.stats.unchanged).toBe(1); // U004
      expect(result.stats.added).toBe(1);    // U005
      expect(result.stats.total).toBe(5);

      // Verify specific records
      expect(result.merged.find(p => p.key === 'U001')?.hash).toBe('hash1');
      expect(result.merged.find(p => p.key === 'U002')?.hash).toBe('new-hash2');
      expect(result.merged.find(p => p.key === 'U005')?.hash).toBe('hash5');
    });

    it('should handle large baseline with small incremental (typical incremental sync)', () => {
      const baseline: KeyHashPair[] = Array.from({ length: 10000 }, (_, i) => ({
        key: `U${String(i).padStart(6, '0')}`,
        hash: `hash-${i}`
      }));

      const incremental: KeyHashPair[] = [
        { key: 'U000050', hash: 'updated-hash-50' },  // Update
        { key: 'U000100', hash: 'updated-hash-100' }, // Update
        { key: 'U999999', hash: 'new-hash' }          // Add new
      ];

      const result = merger.merge(baseline, incremental);

      expect(result.merged).toHaveLength(10001);
      expect(result.stats.retained).toBe(9998);
      expect(result.stats.updated).toBe(2);
      expect(result.stats.added).toBe(1);
      expect(result.stats.total).toBe(10001);
    });

    it('should handle first run scenario (empty baseline)', () => {
      const baseline: KeyHashPair[] = [];
      const incremental: KeyHashPair[] = Array.from({ length: 1000 }, (_, i) => ({
        key: `U${String(i).padStart(6, '0')}`,
        hash: `hash-${i}`
      }));

      const result = merger.merge(baseline, incremental);

      expect(result.merged).toHaveLength(1000);
      expect(result.stats.added).toBe(1000);
      expect(result.stats.retained).toBe(0);
      expect(result.stats.total).toBe(1000);
    });

    it('should handle no changes scenario (empty incremental)', () => {
      const baseline: KeyHashPair[] = [
        { key: 'U001', hash: 'hash1' },
        { key: 'U002', hash: 'hash2' }
      ];
      const incremental: KeyHashPair[] = [];

      const result = merger.merge(baseline, incremental);

      expect(result.merged).toHaveLength(2);
      expect(result.stats.retained).toBe(2);
      expect(result.stats.added).toBe(0);
      expect(result.stats.unchanged).toBe(0);
    });
  });

  describe('Validation', () => {
    it('should throw error if baseline contains duplicate keys', () => {
      const baseline: KeyHashPair[] = [
        { key: 'U001', hash: 'hash1' },
        { key: 'U001', hash: 'hash1-dup' } // Duplicate
      ];
      const incremental: KeyHashPair[] = [];

      expect(() => merger.merge(baseline, incremental))
        .toThrow(/Duplicate keys found in baseline: U001/);
    });

    it('should throw error if incremental contains duplicate keys', () => {
      const baseline: KeyHashPair[] = [];
      const incremental: KeyHashPair[] = [
        { key: 'U001', hash: 'hash1' },
        { key: 'U001', hash: 'hash1-dup' } // Duplicate
      ];

      expect(() => merger.merge(baseline, incremental))
        .toThrow(/Duplicate keys found in incremental: U001/);
    });

    it('should handle multiple duplicates in error message', () => {
      const baseline: KeyHashPair[] = [
        { key: 'U001', hash: 'h1' },
        { key: 'U001', hash: 'h2' },
        { key: 'U002', hash: 'h3' },
        { key: 'U002', hash: 'h4' },
        { key: 'U003', hash: 'h5' },
        { key: 'U003', hash: 'h6' }
      ];
      const incremental: KeyHashPair[] = [];

      expect(() => merger.merge(baseline, incremental))
        .toThrow(/Duplicate keys found in baseline:/);
    });
  });

  describe('FieldSet conversion utilities', () => {
    it('should convert FieldSets to KeyHashPairs with single primary key', () => {
      const fieldSets: FieldSet[] = [
        {
          fieldValues: [
            { BUID: 'U12345678' },
            { name: 'John Doe' }
          ],
          hash: 'hash-john'
        },
        {
          fieldValues: [
            { BUID: 'U87654321' },
            { name: 'Jane Smith' }
          ],
          hash: 'hash-jane'
        }
      ];

      const pairs = HashMapMerger.fieldSetsToKeyHashPairs(
        fieldSets,
        new Set(['BUID'])
      );

      expect(pairs).toHaveLength(2);
      expect(pairs[0]).toEqual({
        key: 'U12345678',
        hash: 'hash-john',
        fieldSet: fieldSets[0]
      });
      expect(pairs[1]).toEqual({
        key: 'U87654321',
        hash: 'hash-jane',
        fieldSet: fieldSets[1]
      });
    });

    it('should convert FieldSets to KeyHashPairs with compound primary key', () => {
      const fieldSets: FieldSet[] = [
        {
          fieldValues: [
            { BUID: 'U12345678' },
            { year: '2024' },
            { name: 'John Doe' }
          ],
          hash: 'hash-john-2024'
        }
      ];

      const pairs = HashMapMerger.fieldSetsToKeyHashPairs(
        fieldSets,
        new Set(['BUID', 'year'])
      );

      expect(pairs).toHaveLength(1);
      // Compound key should be sorted: BUID|year
      expect(pairs[0].key).toBe('U12345678|2024');
      expect(pairs[0].hash).toBe('hash-john-2024');
    });

    it('should throw error if primary key field not found', () => {
      const fieldSets: FieldSet[] = [
        {
          fieldValues: [{ name: 'John Doe' }],
          hash: 'hash-john'
        }
      ];

      expect(() => HashMapMerger.fieldSetsToKeyHashPairs(
        fieldSets,
        new Set(['BUID'])
      )).toThrow(/Primary key field 'BUID' not found/);
    });

    it('should convert KeyHashPairs back to FieldSets', () => {
      const originalFieldSets: FieldSet[] = [
        {
          fieldValues: [{ BUID: 'U12345678' }, { name: 'John' }],
          hash: 'hash1'
        }
      ];

      const pairs: KeyHashPair[] = [{
        key: 'U12345678',
        hash: 'hash1',
        fieldSet: originalFieldSets[0]
      }];

      const converted = HashMapMerger.keyHashPairsToFieldSets(pairs);

      expect(converted).toEqual(originalFieldSets);
    });

    it('should throw error when converting pairs without fieldSet property', () => {
      const pairs: KeyHashPair[] = [{
        key: 'U12345678',
        hash: 'hash1'
        // No fieldSet property
      }];

      expect(() => HashMapMerger.keyHashPairsToFieldSets(pairs))
        .toThrow(/KeyHashPair missing fieldSet property/);
    });
  });

  describe('Integration test with realistic data', () => {
    it('should handle realistic incremental sync scenario', () => {
      // Simulate a baseline of 5000 people
      const baseline: KeyHashPair[] = Array.from({ length: 5000 }, (_, i) => ({
        key: `U${String(i + 10000).padStart(8, '0')}`,
        hash: `baseline-hash-${i}`
      }));

      // Simulate incremental update: 50 changed, 5 new
      const incremental: KeyHashPair[] = [
        ...Array.from({ length: 50 }, (_, i) => ({
          key: `U${String(i * 100 + 10000).padStart(8, '0')}`, // Scattered updates
          hash: `updated-hash-${i}`
        })),
        ...Array.from({ length: 5 }, (_, i) => ({
          key: `U${String(i + 90000).padStart(8, '0')}`, // New records
          hash: `new-hash-${i}`
        }))
      ];

      const result = merger.merge(baseline, incremental);

      expect(result.stats.total).toBe(5005);
      expect(result.stats.retained).toBe(4950); // 5000 - 50 updated
      expect(result.stats.updated).toBe(50);
      expect(result.stats.added).toBe(5);
      expect(result.stats.unchanged).toBe(0);
    });
  });
});
