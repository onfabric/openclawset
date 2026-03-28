import { describe, expect, test } from 'bun:test';
import { addHours, cronFromTime } from '../src/cron-utils.js';

describe('cronFromTime', () => {
  test('UTC time produces correct cron expression', () => {
    const result = cronFromTime('21:30', ['mon', 'tue', 'wed', 'thu', 'fri'], 'UTC');
    expect(result).toBe('30 21 * * 1,2,3,4,5');
  });

  test('all days produces wildcard', () => {
    const result = cronFromTime('08:00', ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], 'UTC');
    expect(result).toBe('0 8 * * *');
  });

  test('single day works', () => {
    const result = cronFromTime('12:00', ['wed'], 'UTC');
    expect(result).toBe('0 12 * * 3');
  });

  test('midnight edge case', () => {
    const result = cronFromTime('00:00', ['mon'], 'UTC');
    expect(result).toBe('0 0 * * 1');
  });
});

describe('addHours', () => {
  test('adds hours within same day', () => {
    expect(addHours('21:30', 1)).toBe('22:30');
  });

  test('wraps past midnight', () => {
    expect(addHours('23:00', 2)).toBe('01:00');
  });

  test('handles fractional hours', () => {
    expect(addHours('10:00', 1.5)).toBe('11:30');
  });

  test('zero hours returns same time', () => {
    expect(addHours('15:45', 0)).toBe('15:45');
  });
});
