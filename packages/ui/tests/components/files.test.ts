/**
 * File preview component tests.
 *
 * Tests utility functions and exports only — no jsdom/React Testing Library.
 * React component rendering is tested in the desktop app's E2E suite.
 */

import { describe, it, expect } from 'vitest';
import {
  getFileIcon,
  getLanguageFromExtension,
  isImageFile,
  isCodeFile,
  computeUnifiedDiff,
  truncateFilePath,
  getFileExtension,
  formatFileSize,
  FILE_ICONS,
  CODE_EXTENSIONS,
  IMAGE_EXTENSIONS,
  FilePreview,
  CodePreview,
  DiffViewer,
  ImagePreview,
} from '../../src/index.js';
import type { FileEntry, DiffEntry, DiffLine, DiffViewMode } from '../../src/index.js';

// ── getFileIcon ─────────────────────────────────────────────────────

describe('getFileIcon', () => {
  it('returns typescript icon for .ts', () => {
    expect(getFileIcon('ts')).toBe('typescript');
  });

  it('returns typescript icon for .tsx', () => {
    expect(getFileIcon('tsx')).toBe('typescript');
  });

  it('returns javascript icon for .js', () => {
    expect(getFileIcon('js')).toBe('javascript');
  });

  it('returns python icon for .py', () => {
    expect(getFileIcon('py')).toBe('python');
  });

  it('returns rust icon for .rs', () => {
    expect(getFileIcon('rs')).toBe('rust');
  });

  it('returns markdown icon for .md', () => {
    expect(getFileIcon('md')).toBe('markdown');
  });

  it('returns json icon for .json', () => {
    expect(getFileIcon('json')).toBe('json');
  });

  it('returns html icon for .html', () => {
    expect(getFileIcon('html')).toBe('html');
  });

  it('returns css icon for .css', () => {
    expect(getFileIcon('css')).toBe('css');
  });

  it('returns image icon for .png', () => {
    expect(getFileIcon('png')).toBe('image');
  });

  it('returns image icon for .jpg', () => {
    expect(getFileIcon('jpg')).toBe('image');
  });

  it('returns default file icon for unknown extension', () => {
    expect(getFileIcon('xyz')).toBe('file');
  });

  it('handles empty string', () => {
    expect(getFileIcon('')).toBe('file');
  });
});

// ── getLanguageFromExtension ────────────────────────────────────────

describe('getLanguageFromExtension', () => {
  it('maps ts to typescript', () => {
    expect(getLanguageFromExtension('ts')).toBe('typescript');
  });

  it('maps tsx to tsx', () => {
    expect(getLanguageFromExtension('tsx')).toBe('tsx');
  });

  it('maps js to javascript', () => {
    expect(getLanguageFromExtension('js')).toBe('javascript');
  });

  it('maps py to python', () => {
    expect(getLanguageFromExtension('py')).toBe('python');
  });

  it('maps rs to rust', () => {
    expect(getLanguageFromExtension('rs')).toBe('rust');
  });

  it('maps md to markdown', () => {
    expect(getLanguageFromExtension('md')).toBe('markdown');
  });

  it('maps json to json', () => {
    expect(getLanguageFromExtension('json')).toBe('json');
  });

  it('maps html to html', () => {
    expect(getLanguageFromExtension('html')).toBe('html');
  });

  it('maps css to css', () => {
    expect(getLanguageFromExtension('css')).toBe('css');
  });

  it('maps yml to yaml', () => {
    expect(getLanguageFromExtension('yml')).toBe('yaml');
  });

  it('maps yaml to yaml', () => {
    expect(getLanguageFromExtension('yaml')).toBe('yaml');
  });

  it('maps sh to bash', () => {
    expect(getLanguageFromExtension('sh')).toBe('bash');
  });

  it('returns plaintext for unknown extension', () => {
    expect(getLanguageFromExtension('xyz')).toBe('plaintext');
  });

  it('returns plaintext for empty string', () => {
    expect(getLanguageFromExtension('')).toBe('plaintext');
  });
});

// ── isImageFile ─────────────────────────────────────────────────────

describe('isImageFile', () => {
  it('returns true for png', () => {
    expect(isImageFile('png')).toBe(true);
  });

  it('returns true for jpg', () => {
    expect(isImageFile('jpg')).toBe(true);
  });

  it('returns true for jpeg', () => {
    expect(isImageFile('jpeg')).toBe(true);
  });

  it('returns true for gif', () => {
    expect(isImageFile('gif')).toBe(true);
  });

  it('returns true for svg', () => {
    expect(isImageFile('svg')).toBe(true);
  });

  it('returns true for webp', () => {
    expect(isImageFile('webp')).toBe(true);
  });

  it('returns true for ico', () => {
    expect(isImageFile('ico')).toBe(true);
  });

  it('returns true for bmp', () => {
    expect(isImageFile('bmp')).toBe(true);
  });

  it('returns false for ts', () => {
    expect(isImageFile('ts')).toBe(false);
  });

  it('returns false for txt', () => {
    expect(isImageFile('txt')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isImageFile('')).toBe(false);
  });
});

// ── isCodeFile ──────────────────────────────────────────────────────

describe('isCodeFile', () => {
  it('returns true for ts', () => {
    expect(isCodeFile('ts')).toBe(true);
  });

  it('returns true for tsx', () => {
    expect(isCodeFile('tsx')).toBe(true);
  });

  it('returns true for js', () => {
    expect(isCodeFile('js')).toBe(true);
  });

  it('returns true for py', () => {
    expect(isCodeFile('py')).toBe(true);
  });

  it('returns true for rs', () => {
    expect(isCodeFile('rs')).toBe(true);
  });

  it('returns true for go', () => {
    expect(isCodeFile('go')).toBe(true);
  });

  it('returns true for java', () => {
    expect(isCodeFile('java')).toBe(true);
  });

  it('returns true for html', () => {
    expect(isCodeFile('html')).toBe(true);
  });

  it('returns true for css', () => {
    expect(isCodeFile('css')).toBe(true);
  });

  it('returns false for png', () => {
    expect(isCodeFile('png')).toBe(false);
  });

  it('returns false for pdf', () => {
    expect(isCodeFile('pdf')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isCodeFile('')).toBe(false);
  });
});

// ── getFileExtension ────────────────────────────────────────────────

describe('getFileExtension', () => {
  it('extracts ts from file.ts', () => {
    expect(getFileExtension('src/file.ts')).toBe('ts');
  });

  it('extracts json from package.json', () => {
    expect(getFileExtension('package.json')).toBe('json');
  });

  it('handles dotfiles as extensionless', () => {
    expect(getFileExtension('.gitignore')).toBe('');
  });

  it('extracts last extension from multiple dots', () => {
    expect(getFileExtension('file.test.ts')).toBe('ts');
  });

  it('returns empty for no extension', () => {
    expect(getFileExtension('Makefile')).toBe('');
  });

  it('returns empty for empty string', () => {
    expect(getFileExtension('')).toBe('');
  });

  it('handles Windows paths', () => {
    expect(getFileExtension('C:\\Users\\file.tsx')).toBe('tsx');
  });
});

// ── truncateFilePath ────────────────────────────────────────────────

describe('truncateFilePath', () => {
  it('returns path as-is if under maxLength', () => {
    expect(truncateFilePath('/src/file.ts', 50)).toBe('/src/file.ts');
  });

  it('truncates long path with ellipsis prefix', () => {
    const long = '/very/long/path/to/some/deeply/nested/file.ts';
    const result = truncateFilePath(long, 25);
    expect(result.length).toBeLessThanOrEqual(25);
    expect(result).toMatch(/^\.\.\..*file\.ts$/);
  });

  it('handles exact maxLength', () => {
    const path = '/src/file.ts';
    expect(truncateFilePath(path, path.length)).toBe(path);
  });

  it('handles very short maxLength by still showing end', () => {
    const result = truncateFilePath('/a/b/c/d/e/file.ts', 10);
    expect(result.length).toBeLessThanOrEqual(10);
    expect(result.startsWith('...')).toBe(true);
  });
});

// ── formatFileSize ──────────────────────────────────────────────────

describe('formatFileSize', () => {
  it('formats bytes', () => {
    expect(formatFileSize(500)).toBe('500 B');
  });

  it('formats kilobytes', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB');
  });

  it('formats megabytes', () => {
    expect(formatFileSize(1048576)).toBe('1.0 MB');
  });

  it('formats gigabytes', () => {
    expect(formatFileSize(1073741824)).toBe('1.0 GB');
  });

  it('formats fractional kilobytes', () => {
    expect(formatFileSize(1536)).toBe('1.5 KB');
  });

  it('handles zero', () => {
    expect(formatFileSize(0)).toBe('0 B');
  });

  it('handles negative input', () => {
    expect(formatFileSize(-100)).toBe('0 B');
  });
});

// ── computeUnifiedDiff ──────────────────────────────────────────────

describe('computeUnifiedDiff', () => {
  it('returns empty array for identical content', () => {
    const result = computeUnifiedDiff('hello\nworld', 'hello\nworld');
    expect(result.every((l) => l.type === 'unchanged')).toBe(true);
    expect(result).toHaveLength(2);
  });

  it('detects added lines', () => {
    const result = computeUnifiedDiff('line1\nline2', 'line1\nline2\nline3');
    const added = result.filter((l) => l.type === 'added');
    expect(added).toHaveLength(1);
    expect(added[0].content).toBe('line3');
  });

  it('detects removed lines', () => {
    const result = computeUnifiedDiff('line1\nline2\nline3', 'line1\nline3');
    const removed = result.filter((l) => l.type === 'removed');
    expect(removed).toHaveLength(1);
    expect(removed[0].content).toBe('line2');
  });

  it('detects modified lines (remove old, add new) in correct order', () => {
    const result = computeUnifiedDiff('line1\nold\nline3', 'line1\nnew\nline3');
    const removed = result.filter((l) => l.type === 'removed');
    const added = result.filter((l) => l.type === 'added');
    expect(removed).toHaveLength(1);
    expect(removed[0].content).toBe('old');
    expect(added).toHaveLength(1);
    expect(added[0].content).toBe('new');
    // Removed lines must appear before added lines (standard diff order)
    expect(result[1].type).toBe('removed');
    expect(result[2].type).toBe('added');
  });

  it('handles empty old content', () => {
    const result = computeUnifiedDiff('', 'line1\nline2');
    const added = result.filter((l) => l.type === 'added');
    expect(added).toHaveLength(2);
  });

  it('handles empty new content', () => {
    const result = computeUnifiedDiff('line1\nline2', '');
    const removed = result.filter((l) => l.type === 'removed');
    expect(removed).toHaveLength(2);
  });

  it('handles both empty', () => {
    const result = computeUnifiedDiff('', '');
    expect(result).toHaveLength(0);
  });

  it('assigns correct line numbers to unchanged lines', () => {
    const result = computeUnifiedDiff('a\nb\nc', 'a\nb\nc');
    expect(result[0].lineNumber).toEqual({ old: 1, new: 1 });
    expect(result[1].lineNumber).toEqual({ old: 2, new: 2 });
    expect(result[2].lineNumber).toEqual({ old: 3, new: 3 });
  });

  it('assigns correct line numbers to added lines', () => {
    const result = computeUnifiedDiff('a\nc', 'a\nb\nc');
    const added = result.filter((l) => l.type === 'added');
    expect(added[0].lineNumber.old).toBeUndefined();
    expect(added[0].lineNumber.new).toBeDefined();
  });

  it('assigns correct line numbers to removed lines', () => {
    const result = computeUnifiedDiff('a\nb\nc', 'a\nc');
    const removed = result.filter((l) => l.type === 'removed');
    expect(removed[0].lineNumber.old).toBeDefined();
    expect(removed[0].lineNumber.new).toBeUndefined();
  });

  it('handles multi-line additions in middle', () => {
    const result = computeUnifiedDiff('a\nd', 'a\nb\nc\nd');
    const added = result.filter((l) => l.type === 'added');
    expect(added).toHaveLength(2);
    expect(added[0].content).toBe('b');
    expect(added[1].content).toBe('c');
  });
});

// ── Constants ───────────────────────────────────────────────────────

describe('FILE_ICONS', () => {
  it('is a non-empty record', () => {
    expect(Object.keys(FILE_ICONS).length).toBeGreaterThan(0);
  });

  it('maps ts to typescript', () => {
    expect(FILE_ICONS['ts']).toBe('typescript');
  });
});

describe('CODE_EXTENSIONS', () => {
  it('is a non-empty set', () => {
    expect(CODE_EXTENSIONS.size).toBeGreaterThan(0);
  });

  it('contains ts', () => {
    expect(CODE_EXTENSIONS.has('ts')).toBe(true);
  });
});

describe('IMAGE_EXTENSIONS', () => {
  it('is a non-empty set', () => {
    expect(IMAGE_EXTENSIONS.size).toBeGreaterThan(0);
  });

  it('contains png', () => {
    expect(IMAGE_EXTENSIONS.has('png')).toBe(true);
  });
});

// ── Component exports ───────────────────────────────────────────────

describe('component exports', () => {
  it('exports FilePreview', () => {
    expect(typeof FilePreview).toBe('function');
  });

  it('exports CodePreview', () => {
    expect(typeof CodePreview).toBe('function');
  });

  it('exports DiffViewer', () => {
    expect(typeof DiffViewer).toBe('function');
  });

  it('exports ImagePreview', () => {
    expect(typeof ImagePreview).toBe('function');
  });
});
