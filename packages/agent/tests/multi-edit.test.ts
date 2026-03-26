import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createSystemTools } from '../src/system-tools.js';
import type { ToolDefinition } from '../src/tools.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

describe('multi_edit and replace_all', () => {
  let workspace: string;
  let tools: ToolDefinition[];

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-edit-test-'));
    tools = createSystemTools(workspace);
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

  function getTool(name: string): ToolDefinition {
    const tool = tools.find((t) => t.name === name);
    if (!tool) throw new Error(`Tool "${name}" not found`);
    return tool;
  }

  describe('edit_file replace_all', () => {
    it('replaces single occurrence without replace_all (backward compatible)', async () => {
      fs.writeFileSync(path.join(workspace, 'test.txt'), 'hello world');
      const editFile = getTool('edit_file');
      const result = await editFile.execute({
        path: 'test.txt',
        old_string: 'world',
        new_string: 'earth',
      });
      expect(result).toContain('Successfully');
      expect(fs.readFileSync(path.join(workspace, 'test.txt'), 'utf-8')).toBe('hello earth');
    });

    it('fails on multiple occurrences without replace_all', async () => {
      fs.writeFileSync(path.join(workspace, 'test.txt'), 'foo bar foo baz foo');
      const editFile = getTool('edit_file');
      const result = await editFile.execute({
        path: 'test.txt',
        old_string: 'foo',
        new_string: 'qux',
      });
      expect(result).toContain('multiple');
      expect(result).toContain('replace_all');
      // File should be unchanged
      expect(fs.readFileSync(path.join(workspace, 'test.txt'), 'utf-8')).toBe('foo bar foo baz foo');
    });

    it('replaces all occurrences with replace_all: true', async () => {
      fs.writeFileSync(path.join(workspace, 'test.txt'), 'foo bar foo baz foo');
      const editFile = getTool('edit_file');
      const result = await editFile.execute({
        path: 'test.txt',
        old_string: 'foo',
        new_string: 'qux',
        replace_all: true,
      });
      expect(result).toContain('Successfully');
      expect(result).toContain('3 occurrences');
      expect(fs.readFileSync(path.join(workspace, 'test.txt'), 'utf-8')).toBe('qux bar qux baz qux');
    });

    it('replace_all with single occurrence works without count message', async () => {
      fs.writeFileSync(path.join(workspace, 'test.txt'), 'hello world');
      const editFile = getTool('edit_file');
      const result = await editFile.execute({
        path: 'test.txt',
        old_string: 'world',
        new_string: 'earth',
        replace_all: true,
      });
      expect(result).toContain('Successfully');
      expect(result).not.toContain('occurrences');
    });

    it('replace_all fails when old_string not found', async () => {
      fs.writeFileSync(path.join(workspace, 'test.txt'), 'hello world');
      const editFile = getTool('edit_file');
      const result = await editFile.execute({
        path: 'test.txt',
        old_string: 'nonexistent',
        new_string: 'replacement',
        replace_all: true,
      });
      expect(result).toContain('not found');
    });
  });

  describe('multi_edit', () => {
    it('applies multiple edits to the same file', async () => {
      fs.writeFileSync(path.join(workspace, 'test.txt'), 'aaa bbb ccc');
      const multiEdit = getTool('multi_edit');
      const result = await multiEdit.execute({
        edits: [
          { file_path: 'test.txt', old_string: 'aaa', new_string: 'AAA' },
          { file_path: 'test.txt', old_string: 'ccc', new_string: 'CCC' },
        ],
      });
      expect(result).toContain('Successfully');
      expect(result).toContain('2 edit(s)');
      expect(fs.readFileSync(path.join(workspace, 'test.txt'), 'utf-8')).toBe('AAA bbb CCC');
    });

    it('applies edits across multiple files', async () => {
      fs.writeFileSync(path.join(workspace, 'a.txt'), 'hello world');
      fs.writeFileSync(path.join(workspace, 'b.txt'), 'foo bar');
      const multiEdit = getTool('multi_edit');
      const result = await multiEdit.execute({
        edits: [
          { file_path: 'a.txt', old_string: 'world', new_string: 'earth' },
          { file_path: 'b.txt', old_string: 'bar', new_string: 'baz' },
        ],
      });
      expect(result).toContain('Successfully');
      expect(result).toContain('2 file(s)');
      expect(fs.readFileSync(path.join(workspace, 'a.txt'), 'utf-8')).toBe('hello earth');
      expect(fs.readFileSync(path.join(workspace, 'b.txt'), 'utf-8')).toBe('foo baz');
    });

    it('rolls back all edits if any old_string not found', async () => {
      fs.writeFileSync(path.join(workspace, 'a.txt'), 'hello world');
      fs.writeFileSync(path.join(workspace, 'b.txt'), 'foo bar');
      const multiEdit = getTool('multi_edit');
      const result = await multiEdit.execute({
        edits: [
          { file_path: 'a.txt', old_string: 'world', new_string: 'earth' },
          { file_path: 'b.txt', old_string: 'NONEXISTENT', new_string: 'baz' },
        ],
      });
      expect(result).toContain('not found');
      expect(result).toContain('atomic rollback');
      // Both files should be unchanged
      expect(fs.readFileSync(path.join(workspace, 'a.txt'), 'utf-8')).toBe('hello world');
      expect(fs.readFileSync(path.join(workspace, 'b.txt'), 'utf-8')).toBe('foo bar');
    });

    it('rolls back if old_string appears multiple times', async () => {
      fs.writeFileSync(path.join(workspace, 'a.txt'), 'hello hello');
      const multiEdit = getTool('multi_edit');
      const result = await multiEdit.execute({
        edits: [
          { file_path: 'a.txt', old_string: 'hello', new_string: 'hi' },
        ],
      });
      expect(result).toContain('multiple');
      expect(result).toContain('atomic rollback');
      expect(fs.readFileSync(path.join(workspace, 'a.txt'), 'utf-8')).toBe('hello hello');
    });

    it('returns error for empty edits array', async () => {
      const multiEdit = getTool('multi_edit');
      const result = await multiEdit.execute({ edits: [] });
      expect(result).toContain('No edits provided');
    });

    it('returns summary with per-file edit counts', async () => {
      fs.writeFileSync(path.join(workspace, 'a.txt'), 'aaa bbb ccc');
      fs.writeFileSync(path.join(workspace, 'b.txt'), 'xxx yyy');
      const multiEdit = getTool('multi_edit');
      const result = await multiEdit.execute({
        edits: [
          { file_path: 'a.txt', old_string: 'aaa', new_string: 'AAA' },
          { file_path: 'a.txt', old_string: 'ccc', new_string: 'CCC' },
          { file_path: 'b.txt', old_string: 'xxx', new_string: 'XXX' },
        ],
      });
      expect(result).toContain('3 edit(s)');
      expect(result).toContain('2 file(s)');
      expect(result).toContain('a.txt: 2 edit(s)');
      expect(result).toContain('b.txt: 1 edit(s)');
    });

    it('rejects paths outside workspace', async () => {
      const multiEdit = getTool('multi_edit');
      const result = await multiEdit.execute({
        edits: [
          { file_path: '../../etc/passwd', old_string: 'root', new_string: 'hacked' },
        ],
      });
      expect(result.toLowerCase()).toContain('outside');
    });
  });
});
