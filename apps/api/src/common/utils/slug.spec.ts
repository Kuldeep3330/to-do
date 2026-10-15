import { slugify, withSuffix } from './slug';

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('3 BHK in Dwarka')).toBe('3-bhk-in-dwarka');
  });

  it('strips combining marks', () => {
    expect(slugify('Café Noida')).toBe('cafe-noida');
  });

  it('returns empty string for punctuation-only input', () => {
    expect(slugify('!!!')).toBe('');
  });
});

describe('withSuffix', () => {
  it('appends a suffix within 180 chars', () => {
    const out = withSuffix('listing', 'abc123');
    expect(out).toBe('listing-abc123');
    expect(out.length).toBeLessThanOrEqual(180);
  });
});
