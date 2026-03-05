import { isValidDateFormat, compareMMDDYYYYDates } from '../../src/data-mapper/DataMapperDateSorter';

describe('isValidDateFormat', () => {
  it('returns true for valid YYYYMMDD date', () => {
    expect(isValidDateFormat('20240305')).toBe(true);
    expect(isValidDateFormat('19991231')).toBe(true);
  });

  it('returns false for empty, null, or undefined', () => {
    expect(isValidDateFormat('')).toBe(false);
    expect(isValidDateFormat(null)).toBe(false);
    expect(isValidDateFormat(undefined)).toBe(false);
  });

  it('returns false for non-string and non-numeric input', () => {
    expect(isValidDateFormat({})).toBe(false);
    expect(isValidDateFormat([])).toBe(false);
    expect(isValidDateFormat('notadate')).toBe(false);
    expect(isValidDateFormat('2024-03-05')).toBe(false);
    expect(isValidDateFormat('2024035')).toBe(false); // 7 digits
    expect(isValidDateFormat('202403051')).toBe(false); // 9 digits
  });

  it('returns false for impossible dates', () => {
    expect(isValidDateFormat('20240230')).toBe(false); // Feb 30
    expect(isValidDateFormat('20241301')).toBe(false); // Month 13
    expect(isValidDateFormat('20240001')).toBe(false); // Month 0
    expect(isValidDateFormat('20240100')).toBe(false); // Day 0
    expect(isValidDateFormat('20240132')).toBe(false); // Day 32
  });
});

describe('compareMMDDYYYYDates', () => {
  const today = new Date();
  const todayStr = today.getFullYear().toString() +
    (today.getMonth() + 1).toString().padStart(2, '0') +
    today.getDate().toString().padStart(2, '0');

  it('returns 0 for both missing/invalid dates', () => {
    expect(compareMMDDYYYYDates('', '')).toBe(0);
    expect(compareMMDDYYYYDates(null, undefined)).toBe(0);
    expect(compareMMDDYYYYDates('invalid', 'notadate')).toBe(0);
  });

  it('missing/invalid beats future, loses to past', () => {
    // Pick a future date
    const future = (today.getFullYear() + 1) + '0101';
    const past = (today.getFullYear() - 1) + '1231';
    expect(compareMMDDYYYYDates('', future)).toBe(-1); // missing beats future
    expect(compareMMDDYYYYDates('', past)).toBe(1); // missing loses to past
    expect(compareMMDDYYYYDates(future, '')).toBe(1); // missing beats future
    expect(compareMMDDYYYYDates(past, '')).toBe(-1); // missing loses to past
  });

  it('past vs future: past comes first', () => {
    const future = (today.getFullYear() + 1) + '0101';
    const past = (today.getFullYear() - 1) + '1231';
    expect(compareMMDDYYYYDates(past, future)).toBe(-1);
    expect(compareMMDDYYYYDates(future, past)).toBe(1);
  });

  it('both past: more recent comes first', () => {
    const past1 = (today.getFullYear() - 2) + '0101';
    const past2 = (today.getFullYear() - 1) + '0101';
    expect(compareMMDDYYYYDates(past1, past2)).toBe(1); // past2 is more recent
    expect(compareMMDDYYYYDates(past2, past1)).toBe(-1);
  });

  it('both future: closer to today comes first', () => {
    const future1 = (today.getFullYear() + 2) + '0101';
    const future2 = (today.getFullYear() + 1) + '0101';
    expect(compareMMDDYYYYDates(future1, future2)).toBe(1); // future2 is closer
    expect(compareMMDDYYYYDates(future2, future1)).toBe(-1);
  });

  it('equal valid dates returns 0', () => {
    expect(compareMMDDYYYYDates('20240305', '20240305')).toBe(0);
  });

  it('handles edge cases with invalid and valid dates', () => {
    // Pick a future and a past date relative to today
    const today = new Date();
    const future = (today.getFullYear() + 1) + '0101';
    const past = (today.getFullYear() - 1) + '1231';
    // missing beats future
    expect(compareMMDDYYYYDates('invalid', future)).toBe(-1);
    expect(compareMMDDYYYYDates(future, 'invalid')).toBe(1);
    // missing loses to past
    expect(compareMMDDYYYYDates('invalid', past)).toBe(1);
    expect(compareMMDDYYYYDates(past, 'invalid')).toBe(-1);
  });
});
