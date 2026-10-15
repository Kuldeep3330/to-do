import { describe, expect, it } from 'vitest';
import {
  formatBedrooms,
  formatINRCompact,
  formatPrice,
  normalizeIndianPhone,
  parseMoneyInput,
  slugify,
} from './index';

describe('formatINRCompact', () => {
  it('uses lakh and crore', () => {
    expect(formatINRCompact(4_500_000)).toBe('₹45 L');
    expect(formatINRCompact(12_000_000)).toBe('₹1.2 Cr');
    expect(formatINRCompact(25_000)).toBe('₹25,000');
  });
  it('handles missing price', () => {
    expect(formatINRCompact(null)).toBe('Price on request');
  });
});

describe('formatPrice', () => {
  it('adds /mo for rent', () => {
    expect(formatPrice(25_000, 'MONTHLY')).toBe('₹25,000/mo');
    expect(formatPrice(4_500_000, 'ONE_TIME')).toBe('₹45 L');
  });
});

describe('formatBedrooms', () => {
  it('formats BHK and studio', () => {
    expect(formatBedrooms(2)).toBe('2 BHK');
    expect(formatBedrooms(0)).toBe('Studio');
    expect(formatBedrooms(null)).toBeNull();
  });
});

describe('normalizeIndianPhone', () => {
  it.each([
    ['98765 43210', '+919876543210'],
    ['+91 98765-43210', '+919876543210'],
    ['09876543210', '+919876543210'],
    ['919876543210', '+919876543210'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeIndianPhone(input)).toBe(expected);
  });
  it.each(['12345', '5876543210', 'abc', ''])('rejects "%s"', (input) => {
    expect(normalizeIndianPhone(input)).toBeNull();
  });
});

describe('parseMoneyInput', () => {
  it('strips separators to an integer', () => {
    expect(parseMoneyInput('45,00,000')).toBe(4_500_000);
    expect(parseMoneyInput('₹ 25000')).toBe(25_000);
    expect(parseMoneyInput('')).toBeNull();
  });
});

describe('slugify', () => {
  it('kebab-cases', () => {
    expect(slugify('Dwarka Mor!')).toBe('dwarka-mor');
  });
});
