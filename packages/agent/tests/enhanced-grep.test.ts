import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createSystemTools } from '../src/system-tools.js';
import type { ToolDefinition } from '../src/tools.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

describe('enhanced search_content', () => {
  let workspace: string;
  let tools: ToolDefinition[];
  let searchContent: ToolDefinition;

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-grep-test-'));
    tools = createSystemTools(workspace);
    searchContent = tools.find((t) => t.name === 'search_content')!;

    // Create test files
    fs.writeFileSync(
      path.join(workspace, 'app.ts'),
      'import React from "react";\nconst App = () => {\n  return <div>Hello</div>;\n};\nexport default App;',
    );
    fs.writeFileSync(
      path.join(workspace, 'utils.ts'),
      'export function add(a: number, b: number) {\n  return a + b;\n}\n\nexport function multiply(a: number, b: number) {\n  return a * b;\n}',
    );
    fs.writeFileSync(
      path.join(workspace, 'readme.md'),
      '# Project\n\nThis is a sample project.\n\nIt does things.',
    );
    fs.writeFileSync(
      path.join(workspace, 'data.json'),
      '{"name": "test", "value": 42}',
    );
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

  describe('default content mode (backward compatible)', () => {
    it('returns file:line: match format', async () => {
      const result = await searchContent.execute({ pattern: 'Hello' });
      expect(result).toContain('app.ts');
      expect(result).toContain('Hello');
    });
  });

  describe('context_before / context_after', () => {
    it('shows lines before a match', async () => {
      const result = await searchContent.execute({
        pattern: 'return a \\+ b',
        context_before: 1,
        context_after: 0,
      });
      expect(result).toContain('function add');
      expect(result).toContain('return a + b');
    });

    it('shows lines after a match', async () => {
      const result = await searchContent.execute({
        pattern: 'const App',
        context_before: 0,
        context_after: 1,
      });
      expect(result).toContain('const App');
      expect(result).toContain('return <div>Hello</div>');
    });

    it('shows context before and after', async () => {
      const result = await searchContent.execute({
        pattern: 'return a \\+ b',
        context_before: 1,
        context_after: 1,
      });
      expect(result).toContain('function add');
      expect(result).toContain('return a + b');
      expect(result).toContain('}');
    });

    it('marks the matching line with >', async () => {
      const result = await searchContent.execute({
        pattern: 'return a \\+ b',
        context_before: 1,
      });
      // The matching line gets '>' marker, context lines get ' '
      expect(result).toMatch(/:\s /); // context line with space marker
      expect(result).toMatch(/:>/);   // matching line with > marker
    });

    it('uses --- separator between context groups', async () => {
      const result = await searchContent.execute({
        pattern: 'return',
        context_before: 1,
        glob: '**/*.ts',
      });
      expect(result).toContain('---');
    });
  });

  describe('output_mode: files', () => {
    it('returns only unique file paths', async () => {
      const result = await searchContent.execute({
        pattern: 'return',
        output_mode: 'files',
      });
      // Should contain file paths, not line content
      expect(result).toContain('app.ts');
      expect(result).toContain('utils.ts');
      // Should not contain line numbers or content
      expect(result).not.toContain(':');
    });

    it('deduplicates file paths', async () => {
      const result = await searchContent.execute({
        pattern: 'return',
        output_mode: 'files',
        glob: '**/*.ts',
      });
      const lines = result.split('\n');
      const unique = new Set(lines);
      expect(lines.length).toBe(unique.size);
    });
  });

  describe('output_mode: count', () => {
    it('returns match counts per file', async () => {
      const result = await searchContent.execute({
        pattern: 'return',
        output_mode: 'count',
        glob: '**/*.ts',
      });
      // utils.ts has 2 returns, app.ts has 1
      expect(result).toContain('utils.ts: 2');
    });
  });

  describe('file_type filter', () => {
    it('filters by file extension', async () => {
      const result = await searchContent.execute({
        pattern: '.',
        output_mode: 'files',
        file_type: 'ts',
      });
      expect(result).toContain('app.ts');
      expect(result).toContain('utils.ts');
      expect(result).not.toContain('readme.md');
      expect(result).not.toContain('data.json');
    });

    it('returns no matches for unused extension', async () => {
      const result = await searchContent.execute({
        pattern: '.',
        file_type: 'py',
      });
      expect(result).toBe('No matches found.');
    });
  });

  describe('max_results', () => {
    it('limits total content results', async () => {
      const result = await searchContent.execute({
        pattern: 'return',
        max_results: 1,
        glob: '**/*.ts',
      });
      // Should only have 1 match, not all 3
      const matchLines = result.split('\n').filter((l) => l.includes('return'));
      expect(matchLines.length).toBe(1);
    });

    it('limits file results in files mode', async () => {
      const result = await searchContent.execute({
        pattern: '.',
        output_mode: 'files',
        max_results: 1,
      });
      const lines = result.split('\n').filter(Boolean);
      expect(lines.length).toBe(1);
    });

    it('limits count results', async () => {
      const result = await searchContent.execute({
        pattern: '.',
        output_mode: 'count',
        max_results: 1,
      });
      const lines = result.split('\n').filter(Boolean);
      expect(lines.length).toBe(1);
    });
  });

  describe('combined options', () => {
    it('file_type + output_mode: count', async () => {
      const result = await searchContent.execute({
        pattern: 'return',
        file_type: 'ts',
        output_mode: 'count',
      });
      expect(result).toContain('.ts');
      expect(result).not.toContain('.md');
    });

    it('context + max_results', async () => {
      const result = await searchContent.execute({
        pattern: 'return',
        context_before: 1,
        max_results: 1,
        glob: '**/*.ts',
      });
      // Only 1 match with context
      const separators = result.split('---').length - 1;
      expect(separators).toBe(1);
    });
  });
});
