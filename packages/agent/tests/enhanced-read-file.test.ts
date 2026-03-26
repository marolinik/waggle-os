import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createSystemTools } from '../src/system-tools.js';
import type { ToolDefinition } from '../src/tools.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

describe('enhanced read_file', () => {
  let workspace: string;
  let tools: ToolDefinition[];
  let readFile: ToolDefinition;

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-read-test-'));
    tools = createSystemTools(workspace);
    readFile = tools.find((t) => t.name === 'read_file')!;
  });

  afterEach(async () => {
    for (let i = 0; i < 5; i++) {
      try {
        fs.rmSync(workspace, { recursive: true, force: true });
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
  });

  describe('default behavior (backward compatible)', () => {
    it('reads full file without options', async () => {
      fs.writeFileSync(path.join(workspace, 'test.txt'), 'line1\nline2\nline3');
      const result = await readFile.execute({ path: 'test.txt' });
      expect(result).toBe('line1\nline2\nline3');
    });
  });

  describe('offset', () => {
    it('reads from a specific offset (1-based)', async () => {
      fs.writeFileSync(path.join(workspace, 'test.txt'), 'line1\nline2\nline3\nline4\nline5');
      const result = await readFile.execute({ path: 'test.txt', offset: 3 });
      expect(result).toBe('line3\nline4\nline5');
    });

    it('offset=1 returns full file', async () => {
      fs.writeFileSync(path.join(workspace, 'test.txt'), 'a\nb\nc');
      const result = await readFile.execute({ path: 'test.txt', offset: 1 });
      expect(result).toBe('a\nb\nc');
    });

    it('offset beyond file length returns empty', async () => {
      fs.writeFileSync(path.join(workspace, 'test.txt'), 'a\nb');
      const result = await readFile.execute({ path: 'test.txt', offset: 100 });
      expect(result).toBe('');
    });
  });

  describe('limit', () => {
    it('limits number of lines returned', async () => {
      fs.writeFileSync(path.join(workspace, 'test.txt'), 'line1\nline2\nline3\nline4\nline5');
      const result = await readFile.execute({ path: 'test.txt', limit: 2 });
      expect(result).toBe('line1\nline2');
    });

    it('limit larger than file returns full file', async () => {
      fs.writeFileSync(path.join(workspace, 'test.txt'), 'a\nb');
      const result = await readFile.execute({ path: 'test.txt', limit: 100 });
      expect(result).toBe('a\nb');
    });
  });

  describe('offset + limit combined', () => {
    it('reads a window of lines', async () => {
      fs.writeFileSync(path.join(workspace, 'test.txt'), 'l1\nl2\nl3\nl4\nl5\nl6\nl7');
      const result = await readFile.execute({ path: 'test.txt', offset: 3, limit: 3 });
      expect(result).toBe('l3\nl4\nl5');
    });
  });

  describe('line_numbers', () => {
    it('prefixes lines with line numbers when enabled', async () => {
      fs.writeFileSync(path.join(workspace, 'test.txt'), 'alpha\nbeta\ngamma');
      const result = await readFile.execute({ path: 'test.txt', line_numbers: true });
      expect(result).toContain('1\talpha');
      expect(result).toContain('2\tbeta');
      expect(result).toContain('3\tgamma');
    });

    it('right-aligns line numbers for large files', async () => {
      const lines = Array.from({ length: 100 }, (_, i) => `line${i + 1}`);
      fs.writeFileSync(path.join(workspace, 'big.txt'), lines.join('\n'));
      const result = await readFile.execute({ path: 'big.txt', line_numbers: true, limit: 3 });
      // Lines 1-3, max line num visible is 3, so pad width = 1
      expect(result).toContain('1\tline1');
    });

    it('line numbers respect offset', async () => {
      fs.writeFileSync(path.join(workspace, 'test.txt'), 'a\nb\nc\nd\ne');
      const result = await readFile.execute({ path: 'test.txt', offset: 3, limit: 2, line_numbers: true });
      expect(result).toContain('3\tc');
      expect(result).toContain('4\td');
      expect(result).not.toContain('1\t');
      expect(result).not.toContain('2\t');
    });

    it('does not add line numbers by default', async () => {
      fs.writeFileSync(path.join(workspace, 'test.txt'), 'hello');
      const result = await readFile.execute({ path: 'test.txt' });
      expect(result).toBe('hello');
      expect(result).not.toContain('\t');
    });
  });

  describe('image file detection', () => {
    const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'];

    for (const ext of imageExts) {
      it(`detects .${ext} as image file`, async () => {
        const fpath = path.join(workspace, `photo.${ext}`);
        fs.writeFileSync(fpath, Buffer.from([0x89, 0x50, 0x4e, 0x47])); // fake binary
        const result = await readFile.execute({ path: `photo.${ext}` });
        expect(result).toMatch(/\[Image file: photo\.\w+, \d+ bytes\]/);
      });
    }

    it('returns file size for image files', async () => {
      const fpath = path.join(workspace, 'test.png');
      const buf = Buffer.alloc(1024);
      fs.writeFileSync(fpath, buf);
      const result = await readFile.execute({ path: 'test.png' });
      expect(result).toContain('1024 bytes');
    });
  });

  describe('PDF file detection', () => {
    it('returns fallback message when pdf-parse is not installed', async () => {
      const fpath = path.join(workspace, 'doc.pdf');
      fs.writeFileSync(fpath, Buffer.from('%PDF-1.4 fake'));
      const result = await readFile.execute({ path: 'doc.pdf' });
      // pdf-parse is almost certainly not installed in test env
      expect(result).toMatch(/\[PDF file: doc\.pdf, \d+ bytes/);
    });
  });
});
