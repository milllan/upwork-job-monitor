import * as utils from './utils.js';

describe('utils.formatBudget', () => {
  it('should format a fixed-price budget with only minAmount', () => {
    const budget = { minAmount: 500 };
    expect(utils.formatBudget(budget)).toBe('$500');
  });

  it('should format a fixed-price budget with minAmount and maxAmount (same)', () => {
    const budget = { minAmount: 1000, maxAmount: 1000 };
    expect(utils.formatBudget(budget)).toBe('$1,000');
  });

  it('should format a fixed-price budget with minAmount and maxAmount (different)', () => {
    const budget = { minAmount: 200, maxAmount: 400 };
    expect(utils.formatBudget(budget)).toBe('$200 - $400');
  });

  it('should format an hourly budget with minAmount and maxAmount', () => {
    const budget = { type: 'HOURLY', minAmount: 20, maxAmount: 40 };
    expect(utils.formatBudget(budget)).toBe('$20 - $40/hr');
  });

  it('should return "N/A" for an empty budget object', () => {
    expect(utils.formatBudget({})).toBe('N/A');
  });

  it('should handle string amounts correctly', () => {
    const budget = { type: 'HOURLY', minAmount: '25.50', maxAmount: '50.75' };
    expect(utils.formatBudget(budget)).toBe('$25.50 - $50.75/hr');
  });

  it('should handle large numbers with thousand separators', () => {
    const budget = { minAmount: 1000000 };
    expect(utils.formatBudget(budget)).toBe('$1,000,000');
  });

  it('should return N/A if only type is present for hourly', () => {
    const budget = { type: 'HOURLY' };
    expect(utils.formatBudget(budget)).toBe('N/A');
  });
});