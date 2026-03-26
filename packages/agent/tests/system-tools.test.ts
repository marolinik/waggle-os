import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createSystemTools } from '../src/system-tools.js';
import type { ToolDefinition } from '../src/tools.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

describe('createSystemTools', () => {
  let workspace: string;
  let tools: ToolDefinition[];

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-test-'));
    tools = createSystemTools(workspace);
  });

  afterEach(async () => {
    // On Windows, killed child processes may briefly hold locks on cwd
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

  it('creates all system tools', () => {
    const names = tools.map((t) => t.name);
    expect(names).toContain('bash');
    expect(names).toContain('read_file');
    expect(names).toContain('write_file');
    expect(names).toContain('edit_file');
    expect(names).toContain('search_files');
    expect(names).toContain('search_content');
    expect(names).toContain('web_search');
    expect(names).toContain('web_fetch');
    expect(names).toContain('multi_edit');
    expect(names).toContain('get_task_output');
    expect(names).toContain('kill_task');
    expect(names).toContain('run_code');
    expect(tools).toHaveLength(12);
  });

  describe('bash', () => {
    it('executes a simple command', async () => {
      const bash = getTool('bash');
      const result = await bash.execute({ command: 'echo hello world' });
      expect(result.trim()).toBe('hello world');
    });

    it('returns stderr on failure', async () => {
      const bash = getTool('bash');
      // Use a command that reliably writes to stderr cross-platform
      const result = await bash.execute({ command: 'node -e "process.stderr.write(String.fromCharCode(101,114,114)); process.exit(1)"' });
      expect(result).toContain('err');
    });

    it('respects timeout', async () => {
      const bash = getTool('bash');
      // Use ping which reliably blocks on both Windows and Unix
      const isWindows = process.platform === 'win32';
      const sleepCmd = isWindows ? 'ping -n 30 127.0.0.1' : 'sleep 30';
      const result = await bash.execute({ command: sleepCmd, timeout: 1000 });
      expect(result.toLowerCase()).toContain('timeout');
    }, 10_000);
  });

  describe('read_file', () => {
    it('reads a file within workspace', async () => {
      const filePath = path.join(workspace, 'test.txt');
      fs.writeFileSync(filePath, 'file contents here');

      const readFile = getTool('read_file');
      const result = await readFile.execute({ path: 'test.txt' });
      expect(result).toBe('file contents here');
    });

    it('rejects paths outside workspace', async () => {
      const readFile = getTool('read_file');
      const result = await readFile.execute({ path: '../../etc/passwd' });
      expect(result.toLowerCase()).toContain('outside');
    });
  });

  describe('write_file', () => {
    it('creates a new file', async () => {
      const writeFile = getTool('write_file');
      await writeFile.execute({ path: 'new-file.txt', content: 'new content' });

      const written = fs.readFileSync(path.join(workspace, 'new-file.txt'), 'utf-8');
      expect(written).toBe('new content');
    });

    it('creates intermediate directories', async () => {
      const writeFile = getTool('write_file');
      await writeFile.execute({ path: 'a/b/c/deep.txt', content: 'deep content' });

      const written = fs.readFileSync(path.join(workspace, 'a', 'b', 'c', 'deep.txt'), 'utf-8');
      expect(written).toBe('deep content');
    });
  });

  describe('edit_file', () => {
    it('replaces exact string', async () => {
      const filePath = path.join(workspace, 'edit-me.txt');
      fs.writeFileSync(filePath, 'hello world, hello universe');

      const editFile = getTool('edit_file');
      const result = await editFile.execute({
        path: 'edit-me.txt',
        old_string: 'world',
        new_string: 'planet',
      });

      const edited = fs.readFileSync(filePath, 'utf-8');
      expect(edited).toBe('hello planet, hello universe');
      expect(result.toLowerCase()).toContain('success');
    });

    it('fails if old_string not found', async () => {
      const filePath = path.join(workspace, 'edit-me.txt');
      fs.writeFileSync(filePath, 'hello world');

      const editFile = getTool('edit_file');
      const result = await editFile.execute({
        path: 'edit-me.txt',
        old_string: 'nonexistent',
        new_string: 'replacement',
      });
      expect(result.toLowerCase()).toContain('not found');
    });

    it('fails if old_string appears more than once', async () => {
      const filePath = path.join(workspace, 'edit-me.txt');
      fs.writeFileSync(filePath, 'hello hello');

      const editFile = getTool('edit_file');
      const result = await editFile.execute({
        path: 'edit-me.txt',
        old_string: 'hello',
        new_string: 'hi',
      });
      expect(result.toLowerCase()).toContain('multiple');
    });
  });

  describe('search_files', () => {
    it('finds files by glob pattern', async () => {
      fs.writeFileSync(path.join(workspace, 'foo.ts'), '');
      fs.writeFileSync(path.join(workspace, 'bar.ts'), '');
      fs.writeFileSync(path.join(workspace, 'baz.js'), '');

      const searchFiles = getTool('search_files');
      const result = await searchFiles.execute({ pattern: '**/*.ts' });
      expect(result).toContain('foo.ts');
      expect(result).toContain('bar.ts');
      expect(result).not.toContain('baz.js');
    });

    it('ignores node_modules', async () => {
      const nmDir = path.join(workspace, 'node_modules', 'pkg');
      fs.mkdirSync(nmDir, { recursive: true });
      fs.writeFileSync(path.join(nmDir, 'index.ts'), '');
      fs.writeFileSync(path.join(workspace, 'app.ts'), '');

      const searchFiles = getTool('search_files');
      const result = await searchFiles.execute({ pattern: '**/*.ts' });
      expect(result).toContain('app.ts');
      expect(result).not.toContain('node_modules');
    });
  });

  describe('search_content', () => {
    it('finds content in files', async () => {
      fs.writeFileSync(path.join(workspace, 'a.txt'), 'line1\nfind me here\nline3');
      fs.writeFileSync(path.join(workspace, 'b.txt'), 'nothing relevant');

      const searchContent = getTool('search_content');
      const result = await searchContent.execute({ pattern: 'find me' });
      expect(result).toContain('a.txt');
      expect(result).toContain('find me here');
      expect(result).not.toContain('b.txt');
    });

    it('supports regex patterns', async () => {
      fs.writeFileSync(path.join(workspace, 'code.ts'), 'const foo = 123;\nconst bar = 456;');

      const searchContent = getTool('search_content');
      const result = await searchContent.execute({ pattern: 'const \\w+ = \\d+' });
      expect(result).toContain('code.ts');
      expect(result).toContain('const foo = 123');
    });
  });
});
