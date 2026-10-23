import { describe, expect, it } from 'vitest';
import { csvCell, toCsv } from './csv';

describe('csvCell', () => {
  it('leaves plain values alone and blanks null', () => {
    expect(csvCell('Asha')).toBe('Asha');
    expect(csvCell(42)).toBe('42');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });

  it('quotes commas, quotes and newlines', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
  });

  it('defuses spreadsheet formulas', () => {
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell('@cmd')).toBe("'@cmd");
    expect(csvCell('+919876543210')).toBe("'+919876543210");
  });
});

describe('toCsv', () => {
  it('joins header and rows with CRLF', () => {
    expect(toCsv(['Name', 'City'], [['Asha', 'Noida'], ['Ravi, K', null]])).toBe('Name,City\r\nAsha,Noida\r\n"Ravi, K",');
  });
});
