/**
 * Drag-drop utility tests.
 *
 * Tests pure utility functions only — no jsdom/React Testing Library.
 */

import { describe, it, expect } from 'vitest';
import {
  categorizeFile,
  isSupported,
  validateFileSize,
  formatDropSummary,
  getDropMessage,
  parseCsvLine,
  parseCsvPreview,
  SUPPORTED_EXTENSIONS,
  MAX_FILE_SIZE,
  FileDropZone,
} from '../../src/index.js';
import type { DroppedFile, FileCategory } from '../../src/components/chat/drop-utils.js';

// ── Constants ───────────────────────────────────────────────────────

describe('SUPPORTED_EXTENSIONS', () => {
  it('maps image extensions to image', () => {
    for (const ext of ['png', 'jpg', 'jpeg', 'gif', 'webp']) {
      expect(SUPPORTED_EXTENSIONS[ext]).toBe('image');
    }
  });

  it('maps pdf to document', () => {
    expect(SUPPORTED_EXTENSIONS['pdf']).toBe('document');
  });

  it('maps csv to csv', () => {
    expect(SUPPORTED_EXTENSIONS['csv']).toBe('csv');
  });

  it('maps text/code extensions to text', () => {
    for (const ext of ['md', 'txt', 'json', 'xml', 'yaml', 'yml', 'ts', 'js', 'py', 'rs', 'go']) {
      expect(SUPPORTED_EXTENSIONS[ext]).toBe('text');
    }
  });
});

describe('MAX_FILE_SIZE', () => {
  it('equals 10 MB', () => {
    expect(MAX_FILE_SIZE).toBe(10 * 1024 * 1024);
  });
});

// ── isSupported ─────────────────────────────────────────────────────

describe('isSupported', () => {
  it('returns true for supported extensions', () => {
    expect(isSupported('png')).toBe(true);
    expect(isSupported('csv')).toBe(true);
    expect(isSupported('ts')).toBe(true);
    expect(isSupported('pdf')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isSupported('PNG')).toBe(true);
    expect(isSupported('Csv')).toBe(true);
  });

  it('returns false for unsupported extensions', () => {
    expect(isSupported('exe')).toBe(false);
    expect(isSupported('mp4')).toBe(false);
    expect(isSupported('avi')).toBe(false);
  });
});

// ── categorizeFile ──────────────────────────────────────────────────

describe('categorizeFile', () => {
  it('categorizes an image file', () => {
    const f = categorizeFile('photo.png', 5000);
    expect(f).toEqual({
      name: 'photo.png',
      type: 'png',
      size: 5000,
      extension: 'png',
      category: 'image',
    });
  });

  it('categorizes a PDF', () => {
    const f = categorizeFile('report.pdf', 200000);
    expect(f.category).toBe('document');
    expect(f.extension).toBe('pdf');
  });

  it('categorizes a CSV', () => {
    const f = categorizeFile('data.csv', 1024);
    expect(f.category).toBe('csv');
  });

  it('categorizes text/code files', () => {
    expect(categorizeFile('readme.md', 500).category).toBe('text');
    expect(categorizeFile('main.ts', 800).category).toBe('text');
    expect(categorizeFile('config.yaml', 300).category).toBe('text');
  });

  it('categorizes zip as archive', () => {
    expect(categorizeFile('archive.zip', 1000).category).toBe('archive');
  });

  it('marks unknown extensions as unsupported', () => {
    expect(categorizeFile('video.mp4', 9999).category).toBe('unsupported');
    expect(categorizeFile('app.exe', 5000).category).toBe('unsupported');
  });

  it('handles files with no extension', () => {
    const f = categorizeFile('Makefile', 200);
    expect(f.extension).toBe('');
    expect(f.category).toBe('unsupported');
  });

  it('handles files with multiple dots', () => {
    const f = categorizeFile('my.data.file.csv', 3000);
    expect(f.extension).toBe('csv');
    expect(f.category).toBe('csv');
  });
});

// ── validateFileSize ────────────────────────────────────────────────

describe('validateFileSize', () => {
  it('accepts files under the limit', () => {
    expect(validateFileSize(1024)).toEqual({ valid: true });
    expect(validateFileSize(MAX_FILE_SIZE)).toEqual({ valid: true });
  });

  it('rejects files over the limit', () => {
    const result = validateFileSize(MAX_FILE_SIZE + 1);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('10 MB limit');
  });

  it('includes actual size in error message', () => {
    const result = validateFileSize(15 * 1024 * 1024);
    expect(result.error).toContain('15.0 MB');
  });
});

// ── formatDropSummary ───────────────────────────────────────────────

describe('formatDropSummary', () => {
  it('summarizes a single image', () => {
    const files: DroppedFile[] = [
      { name: 'a.png', type: 'png', size: 100, extension: 'png', category: 'image' },
    ];
    expect(formatDropSummary(files)).toBe('1 image');
  });

  it('pluralizes multiple files', () => {
    const files: DroppedFile[] = [
      { name: 'a.png', type: 'png', size: 100, extension: 'png', category: 'image' },
      { name: 'b.jpg', type: 'jpg', size: 200, extension: 'jpg', category: 'image' },
    ];
    expect(formatDropSummary(files)).toBe('2 images');
  });

  it('groups different categories', () => {
    const files: DroppedFile[] = [
      { name: 'a.png', type: 'png', size: 100, extension: 'png', category: 'image' },
      { name: 'b.csv', type: 'csv', size: 200, extension: 'csv', category: 'csv' },
      { name: 'c.jpg', type: 'jpg', size: 300, extension: 'jpg', category: 'image' },
    ];
    expect(formatDropSummary(files)).toBe('2 images, 1 CSV');
  });

  it('handles unsupported files', () => {
    const files: DroppedFile[] = [
      { name: 'a.zip', type: 'zip', size: 100, extension: 'zip', category: 'unsupported' },
    ];
    expect(formatDropSummary(files)).toBe('1 unsupported file');
  });
});

// ── getDropMessage ──────────────────────────────────────────────────

describe('getDropMessage', () => {
  it('returns a single-line message for one file', () => {
    const files: DroppedFile[] = [
      { name: 'photo.png', type: 'png', size: 240000, extension: 'png', category: 'image' },
    ];
    const msg = getDropMessage(files);
    expect(msg).toContain('User shared photo.png');
    expect(msg).toContain('image file');
    expect(msg).toContain('234 KB');
  });

  it('returns multi-line messages for multiple files', () => {
    const files: DroppedFile[] = [
      { name: 'a.png', type: 'png', size: 1024, extension: 'png', category: 'image' },
      { name: 'b.csv', type: 'csv', size: 2048, extension: 'csv', category: 'csv' },
    ];
    const lines = getDropMessage(files).split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('a.png');
    expect(lines[1]).toContain('b.csv');
  });
});

// ── parseCsvLine ────────────────────────────────────────────────────

describe('parseCsvLine', () => {
  it('parses a simple comma-separated line', () => {
    expect(parseCsvLine('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('handles quoted fields containing commas', () => {
    expect(parseCsvLine('"Smith, John",30,NYC')).toEqual(['Smith, John', '30', 'NYC']);
  });

  it('handles escaped double-quotes inside quoted fields', () => {
    expect(parseCsvLine('"He said ""hi""",42')).toEqual(['He said "hi"', '42']);
  });

  it('handles mixed quoted and unquoted fields', () => {
    expect(parseCsvLine('plain,"with, comma","with ""quotes"""')).toEqual([
      'plain', 'with, comma', 'with "quotes"',
    ]);
  });

  it('trims whitespace from unquoted fields', () => {
    expect(parseCsvLine(' a , b , c ')).toEqual(['a', 'b', 'c']);
  });
});

// ── parseCsvPreview ─────────────────────────────────────────────────

describe('parseCsvPreview', () => {
  it('parses headers and rows', () => {
    const csv = 'name,age,city\nAlice,30,NYC\nBob,25,LA';
    const result = parseCsvPreview(csv);
    expect(result.headers).toEqual(['name', 'age', 'city']);
    expect(result.rows).toEqual([['Alice', '30', 'NYC'], ['Bob', '25', 'LA']]);
    expect(result.totalRows).toBe(2);
  });

  it('respects maxRows', () => {
    const csv = 'h\n1\n2\n3\n4\n5\n6\n7';
    const result = parseCsvPreview(csv, 3);
    expect(result.rows).toHaveLength(3);
    expect(result.totalRows).toBe(7);
  });

  it('defaults to 5 max rows', () => {
    const lines = ['h', ...Array.from({ length: 10 }, (_, i) => String(i))];
    const result = parseCsvPreview(lines.join('\n'));
    expect(result.rows).toHaveLength(5);
    expect(result.totalRows).toBe(10);
  });

  it('handles empty content', () => {
    expect(parseCsvPreview('')).toEqual({ headers: [], rows: [], totalRows: 0 });
  });

  it('handles header only', () => {
    const result = parseCsvPreview('a,b,c');
    expect(result.headers).toEqual(['a', 'b', 'c']);
    expect(result.rows).toEqual([]);
    expect(result.totalRows).toBe(0);
  });

  it('trims whitespace in cells', () => {
    const csv = ' name , age \n Alice , 30 ';
    const result = parseCsvPreview(csv);
    expect(result.headers).toEqual(['name', 'age']);
    expect(result.rows[0]).toEqual(['Alice', '30']);
  });

  it('handles CRLF line endings', () => {
    const csv = 'a,b\r\n1,2\r\n3,4';
    const result = parseCsvPreview(csv);
    expect(result.rows).toEqual([['1', '2'], ['3', '4']]);
  });

  it('handles quoted fields with commas (RFC 4180)', () => {
    const csv = 'name,address,city\n"Smith, John","123 Main St, Apt 4",NYC';
    const result = parseCsvPreview(csv);
    expect(result.headers).toEqual(['name', 'address', 'city']);
    expect(result.rows[0]).toEqual(['Smith, John', '123 Main St, Apt 4', 'NYC']);
  });
});

// ── Component export ────────────────────────────────────────────────

describe('FileDropZone export', () => {
  it('is exported as a function (React component)', () => {
    expect(typeof FileDropZone).toBe('function');
  });
});
