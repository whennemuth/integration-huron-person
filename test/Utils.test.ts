import { nullsToUndefined } from '../src/Utils';

describe('nullsToUndefined', () => {
  it('should return undefined for null input', () => {
    expect(nullsToUndefined(null)).toBeUndefined();
  });

  it('should return undefined for undefined input', () => {
    expect(nullsToUndefined(undefined)).toBeUndefined();
  });

  it('should return primitive values unchanged', () => {
    expect(nullsToUndefined('string')).toBe('string');
    expect(nullsToUndefined(42)).toBe(42);
    expect(nullsToUndefined(true)).toBe(true);
    expect(nullsToUndefined(false)).toBe(false);
    expect(nullsToUndefined(0)).toBe(0);
    expect(nullsToUndefined('')).toBe('');
  });

  it('should convert null values in objects to undefined', () => {
    const input = { a: null, b: 'value', c: null };
    const expected = { a: undefined, b: 'value', c: undefined };
    expect(nullsToUndefined(input)).toEqual(expected);
  });

  it('should handle nested objects recursively', () => {
    const input = {
      a: null,
      b: { c: null, d: 'nested' },
      e: null
    };
    const expected = {
      a: undefined,
      b: { c: undefined, d: 'nested' },
      e: undefined
    };
    expect(nullsToUndefined(input)).toEqual(expected);
  });

  it('should convert null values in arrays to undefined', () => {
    const input = [null, 'item', null, 123];
    const expected = [undefined, 'item', undefined, 123];
    expect(nullsToUndefined(input)).toEqual(expected);
  });

  it('should handle nested arrays recursively', () => {
    const input = [null, ['nested', null], { a: null }];
    const expected = [undefined, ['nested', undefined], { a: undefined }];
    expect(nullsToUndefined(input)).toEqual(expected);
  });

  it('should handle mixed objects and arrays', () => {
    const input = {
      arr: [null, { inner: null }],
      obj: { key: null, list: [null] }
    };
    const expected = {
      arr: [undefined, { inner: undefined }],
      obj: { key: undefined, list: [undefined] }
    };
    expect(nullsToUndefined(input)).toEqual(expected);
  });

  it('should handle empty objects and arrays', () => {
    expect(nullsToUndefined({})).toEqual({});
    expect(nullsToUndefined([])).toEqual([]);
  });

  it('should not modify objects without null values', () => {
    const input = { a: 'value', b: 123, c: { d: 'nested' } };
    const expected = { a: 'value', b: 123, c: { d: 'nested' } };
    expect(nullsToUndefined(input)).toEqual(expected);
  });

  it('should handle objects with undefined values (leave as undefined)', () => {
    const input = { a: undefined, b: null };
    const expected = { a: undefined, b: undefined };
    expect(nullsToUndefined(input)).toEqual(expected);
  });

  it('should handle functions (return unchanged)', () => {
    const func = () => 'test';
    const input = { fn: func };
    const result = nullsToUndefined(input);
    expect(result.fn).toBe(func);
  });

  it('should handle Date objects (return unchanged)', () => {
    const date = new Date();
    const input = { date };
    const result = nullsToUndefined(input);
    expect(result.date).toBe(date);
  });

  it('should handle RegExp objects (return unchanged)', () => {
    const regex = /test/;
    const input = { regex };
    const result = nullsToUndefined(input);
    expect(result.regex).toBe(regex);
  });

  it('should create a new object/array without modifying the original', () => {
    const original = { a: null, b: [null] };
    const result = nullsToUndefined(original);
    expect(result).not.toBe(original);
    expect(result.b).not.toBe(original.b);
    expect(original.a).toBeNull();
    expect(original.b[0]).toBeNull();
  });
});