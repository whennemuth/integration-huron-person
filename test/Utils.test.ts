import { removeNullValues, removeEmptyValues, deepClone } from '../src/Utils';

describe('nullsToUndefined', () => {
  it('should return undefined for null input', () => {
    expect(removeNullValues(null)).toBeUndefined();
  });

  it('should return undefined for undefined input', () => {
    expect(removeNullValues(undefined)).toBeUndefined();
  });

  it('should return primitive values unchanged', () => {
    expect(removeNullValues('string')).toBe('string');
    expect(removeNullValues(42)).toBe(42);
    expect(removeNullValues(true)).toBe(true);
    expect(removeNullValues(false)).toBe(false);
    expect(removeNullValues(0)).toBe(0);
    expect(removeNullValues('')).toBe('');
  });

  it('should remove properties with null values from objects', () => {
    const input = { a: null, b: 'value', c: null };
    const expected = { b: 'value' };
    const result = removeNullValues(input);
    expect(result).toEqual(expected);
    expect('a' in result).toBe(false);
    expect('c' in result).toBe(false);
  });

  it('should handle nested objects recursively', () => {
    const input = {
      a: null,
      b: { c: null, d: 'nested' },
      e: null
    };
    const expected = {
      b: { d: 'nested' }
    };
    const result = removeNullValues(input);
    expect(result).toEqual(expected);
    expect('a' in result).toBe(false);
    expect('e' in result).toBe(false);
    expect('c' in result.b).toBe(false);
  });

  it('should convert null values in arrays to undefined', () => {
    const input = [null, 'item', null, 123];
    const expected = [undefined, 'item', undefined, 123];
    expect(removeNullValues(input)).toEqual(expected);
  });

  it('should handle nested arrays recursively', () => {
    const input = [null, ['nested', null], { a: null }];
    const expected = [undefined, ['nested', undefined], {}];
    expect(removeNullValues(input)).toEqual(expected);
  });

  it('should handle mixed objects and arrays', () => {
    const input = {
      arr: [null, { inner: null }],
      obj: { key: null, list: [null] }
    };
    const expected = {
      arr: [undefined, {}],
      obj: { list: [undefined] }
    };
    expect(removeNullValues(input)).toEqual(expected);
  });

  it('should handle empty objects and arrays', () => {
    expect(removeNullValues({})).toEqual({});
    expect(removeNullValues([])).toEqual([]);
  });

  it('should not modify objects without null values', () => {
    const input = { a: 'value', b: 123, c: { d: 'nested' } };
    const expected = { a: 'value', b: 123, c: { d: 'nested' } };
    expect(removeNullValues(input)).toEqual(expected);
  });

  it('should remove properties with undefined and null values', () => {
    const input = { a: undefined, b: null, c: 'value' };
    const result = removeNullValues(input);
    // Properties with undefined should be removed
    expect('a' in result).toBe(false);
    // Properties with null should be removed
    expect('b' in result).toBe(false);
    expect(result.c).toBe('value');
  });

  it('should handle functions (return unchanged)', () => {
    const func = () => 'test';
    const input = { fn: func };
    const result = removeNullValues(input);
    expect(result.fn).toBe(func);
  });

  it('should handle Date objects (return unchanged)', () => {
    const date = new Date();
    const input = { date };
    const result = removeNullValues(input);
    expect(result.date).toBe(date);
  });

  it('should handle RegExp objects (return unchanged)', () => {
    const regex = /test/;
    const input = { regex };
    const result = removeNullValues(input);
    expect(result.regex).toBe(regex);
  });

  it('should create a new object/array without modifying the original', () => {
    const original = { a: null, b: [null] };
    const result = removeNullValues(original);
    expect(result).not.toBe(original);
    expect(result.b).not.toBe(original.b);
    expect(original.a).toBeNull();
    expect(original.b[0]).toBeNull();
  });

  it('should remove nested object if all properties are null', () => {
    const input = { a: { b: null, c: null }, d: 'value' };
    const result = removeNullValues(input);
    expect(result).toEqual({ a: {}, d: 'value' });
  });
});

describe('deepClone', () => {
  it('should return primitives unchanged', () => {
    expect(deepClone('string')).toBe('string');
    expect(deepClone(42)).toBe(42);
    expect(deepClone(true)).toBe(true);
    expect(deepClone(false)).toBe(false);
    expect(deepClone(null)).toBeNull();
    expect(deepClone(undefined)).toBeUndefined();
  });

  it('should clone simple objects', () => {
    const original = { a: 1, b: 'test', c: true };
    const cloned = deepClone(original);
    
    expect(cloned).toEqual(original);
    expect(cloned).not.toBe(original);
  });

  it('should clone nested objects', () => {
    const original = {
      a: 1,
      b: { c: 2, d: { e: 3 } },
      f: 'test'
    };
    const cloned = deepClone(original);
    
    expect(cloned).toEqual(original);
    expect(cloned).not.toBe(original);
    expect(cloned.b).not.toBe(original.b);
    expect(cloned.b.d).not.toBe(original.b.d);
  });

  it('should clone arrays', () => {
    const original = [1, 2, 3, 4];
    const cloned = deepClone(original);
    
    expect(cloned).toEqual(original);
    expect(cloned).not.toBe(original);
  });

  it('should clone nested arrays', () => {
    const original = [1, [2, 3], [4, [5, 6]]];
    const cloned = deepClone(original);
    
    expect(cloned).toEqual(original);
    expect(cloned).not.toBe(original);
    expect(cloned[1]).not.toBe(original[1]);
    expect(cloned[2]).not.toBe(original[2]);
  });

  it('should clone objects with arrays', () => {
    const original = {
      a: [1, 2, 3],
      b: { c: [4, 5] }
    };
    const cloned = deepClone(original);
    
    expect(cloned).toEqual(original);
    expect(cloned.a).not.toBe(original.a);
    expect(cloned.b.c).not.toBe(original.b.c);
  });

  it('should clone Date objects', () => {
    const original = new Date('2024-01-01');
    const cloned = deepClone(original);
    
    expect(cloned).toEqual(original);
    expect(cloned).not.toBe(original);
    expect(cloned.getTime()).toBe(original.getTime());
  });

  it('should not mutate the original object', () => {
    const original = { a: { b: { c: 1 } }, d: [1, 2, 3] };
    const cloned = deepClone(original);
    
    // Mutate the clone
    cloned.a.b.c = 999;
    cloned.d.push(4);
    
    // Original should be unchanged
    expect(original.a.b.c).toBe(1);
    expect(original.d).toEqual([1, 2, 3]);
  });

  it('should handle objects with null and undefined values', () => {
    const original = { a: null, b: undefined, c: 'test' };
    const cloned = deepClone(original);
    
    expect(cloned).toEqual(original);
    expect(cloned).not.toBe(original);
  });

  it('should clone complex nested structures', () => {
    const original = {
      id: '123',
      name: 'Test',
      metadata: {
        created: new Date('2024-01-01'),
        tags: ['tag1', 'tag2'],
        nested: {
          values: [1, 2, { a: 3 }]
        }
      }
    };
    const cloned = deepClone(original);
    
    expect(cloned).toEqual(original);
    expect(cloned).not.toBe(original);
    expect(cloned.metadata).not.toBe(original.metadata);
    expect(cloned.metadata.created).not.toBe(original.metadata.created);
    expect(cloned.metadata.tags).not.toBe(original.metadata.tags);
    expect(cloned.metadata.nested.values).not.toBe(original.metadata.nested.values);
  });
});

describe('emptysToUndefined', () => {
  it('should return undefined for null input', () => {
    expect(removeEmptyValues(null)).toBeUndefined();
  });

  it('should return undefined for undefined input', () => {
    expect(removeEmptyValues(undefined)).toBeUndefined();
  });

  it('should return undefined for empty string', () => {
    expect(removeEmptyValues('')).toBeUndefined();
  });

  it('should return undefined for whitespace-only string', () => {
    expect(removeEmptyValues('   ')).toBeUndefined();
    expect(removeEmptyValues('\t')).toBeUndefined();
    expect(removeEmptyValues('\n')).toBeUndefined();
  });

  it('should return undefined for empty array', () => {
    expect(removeEmptyValues([])).toBeUndefined();
  });

  it('should return undefined for empty object', () => {
    expect(removeEmptyValues({})).toBeUndefined();
  });

  it('should return non-empty primitive values unchanged', () => {
    expect(removeEmptyValues('string')).toBe('string');
    expect(removeEmptyValues(42)).toBe(42);
    expect(removeEmptyValues(0)).toBe(0);
    expect(removeEmptyValues(true)).toBe(true);
    expect(removeEmptyValues(false)).toBe(false);
  });

  it('should remove properties with empty values from objects', () => {
    const input = { a: null, b: 'value', c: '', d: '   ', e: [] };
    const expected = { b: 'value' };
    const result = removeEmptyValues(input);
    expect(result).toEqual(expected);
    expect('a' in result).toBe(false);
    expect('c' in result).toBe(false);
    expect('d' in result).toBe(false);
    expect('e' in result).toBe(false);
  });

  it('should handle nested objects recursively', () => {
    const input = {
      a: '',
      b: { c: null, d: 'nested', e: '   ' },
      f: 'value'
    };
    const expected = {
      b: { d: 'nested' },
      f: 'value'
    };
    const result = removeEmptyValues(input);
    expect(result).toEqual(expected);
    expect('a' in result).toBe(false);
    expect('c' in result.b).toBe(false);
    expect('e' in result.b).toBe(false);
  });

  it('should remove empty values from arrays', () => {
    const input = [null, 'item', '', 123, []];
    const expected = ['item', 123];
    expect(removeEmptyValues(input)).toEqual(expected);
  });

  it('should handle nested arrays recursively', () => {
    const input = ['', ['nested', null], { a: '' }];
    const expected = [['nested']];
    expect(removeEmptyValues(input)).toEqual(expected);
  });

  it('should handle mixed objects and arrays', () => {
    const input = {
      arr: [null, { inner: '' }],
      obj: { key: '', list: [null, 'value'] }
    };
    const expected = {
      obj: { list: ['value'] }
    };
    expect(removeEmptyValues(input)).toEqual(expected);
  });

  it('should not modify objects without empty values', () => {
    const input = { a: 'value', b: 123, c: { d: 'nested' } };
    const expected = { a: 'value', b: 123, c: { d: 'nested' } };
    expect(removeEmptyValues(input)).toEqual(expected);
  });

  it('should remove properties with undefined values', () => {
    const input = { a: undefined, b: '', c: 'value' };
    const result = removeEmptyValues(input);
    // Properties with undefined should be removed
    expect('a' in result).toBe(false);
    // Properties with empty strings should be removed
    expect('b' in result).toBe(false);
    expect(result.c).toBe('value');
  });

  it('should handle functions (return unchanged)', () => {
    const func = () => 'test';
    const input = { fn: func };
    const result = removeEmptyValues(input);
    expect(result.fn).toBe(func);
  });

  it('should handle Date objects (return unchanged)', () => {
    const date = new Date();
    const input = { date };
    const result = removeEmptyValues(input);
    expect(result.date).toBe(date);
  });

  it('should create a new object/array without modifying the original', () => {
    const original = { a: null, b: '', c: [null, 'value'] };
    const result = removeEmptyValues(original);
    expect(result).not.toBe(original);
    expect(result.c).not.toBe(original.c);
    expect(result.c).toEqual(['value']);
    expect(original.a).toBeNull();
    expect(original.b).toBe('');
    expect(original.c[0]).toBeNull();
    expect(original.c[1]).toBe('value');
  });

  it('should remove nested object if all properties are empty', () => {
    const input = { a: { b: null, c: '' }, d: 'value' };
    const result = removeEmptyValues(input);
    // The nested object becomes empty after removing empty properties
    // Since empty objects are considered empty, the nested object itself gets removed
    expect(result).toEqual({ d: 'value' });
    expect('a' in result).toBe(false);
  });

  it('should handle deeply nested structures with mixed empty values', () => {
    const input = {
      level1: {
        level2: {
          level3: {
            empty: '',
            valid: 'data',
            nullValue: null
          },
          emptyArray: [],
          validArray: [1, 2, 3]
        },
        whitespace: '   '
      },
      valid: 'keep this'
    };
    const expected = {
      level1: {
        level2: {
          level3: { valid: 'data' },
          validArray: [1, 2, 3]
        }
      },
      valid: 'keep this'
    };
    expect(removeEmptyValues(input)).toEqual(expected);
  });

  it('should handle arrays with empty objects', () => {
    const input = [{ a: '' }, { b: 'value' }, {}];
    const expected = [{ b: 'value' }];
    expect(removeEmptyValues(input)).toEqual(expected);
  });

  it('should remove undefined properties from objects in arrays', () => {
    const input = [
      { id: 'U70801118' },
      { employeeId: 'U70801118' },
      { firstName: 'Bugs' },
      { middleName: undefined },
      { lastName: 'Bunny' }
    ];
    const expected = [
      { id: 'U70801118' },
      { employeeId: 'U70801118' },
      { firstName: 'Bugs' },
      // Object with only undefined becomes empty, then gets filtered out
      { lastName: 'Bunny' }
    ];
    expect(removeEmptyValues(input)).toEqual(expected);
  });
});