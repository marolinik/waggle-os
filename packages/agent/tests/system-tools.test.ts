import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createSanitizedEnv, createSystemTools } from '../src/system-tools.js';
import { execFileWithTreeTimeout } from '../src/system-tools-helpers.js';
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

    it('rejects absolute sibling-prefix and junction escapes', async () => {
      const outside = `${workspace}-outside`;
      const junction = path.join(workspace, 'junction-out');
      fs.mkdirSync(outside, { recursive: true });
      fs.writeFileSync(path.join(outside, 'secret.txt'), 'must-not-read');
      try {
        const readFile = getTool('read_file');
        const siblingResult = await readFile.execute({ path: path.join(outside, 'secret.txt') });
        expect(siblingResult.toLowerCase()).toContain('outside');

        fs.symlinkSync(outside, junction, process.platform === 'win32' ? 'junction' : 'dir');
        const junctionResult = await readFile.execute({ path: 'junction-out/secret.txt' });
        expect(junctionResult.toLowerCase()).toContain('outside');
      } finally {
        fs.rmSync(outside, { recursive: true, force: true });
      }
    });
  });

  it.runIf(process.platform === 'win32')('fails closed when the Windows process supervisor cannot start', async () => {
    const marker = path.join(workspace, 'unsupervised-command.txt');
    const result = await execFileWithTreeTimeout(process.execPath, [
      '-e',
      `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'started')`,
    ], {
      cwd: workspace,
      env: {
        ...createSanitizedEnv(),
        NON_CLONEABLE_TEST_VALUE: (() => {}) as unknown as string,
      },
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    }, 1000);

    expect(result.errorMessage).toContain('supervisor could not start');
    expect(fs.existsSync(marker)).toBe(false);
  });

  it.runIf(process.platform !== 'win32')('force-kills a process that ignores the cooperative timeout signal', async () => {
    const ready = path.join(workspace, 'sigterm-handler-ready.txt');
    const code = [
      `require('node:fs').writeFileSync(${JSON.stringify(ready)}, 'ready')`,
      "process.on('SIGTERM', () => {})",
      'setInterval(() => {}, 30000)',
    ].join(';');
    const startedAt = Date.now();
    const execution = execFileWithTreeTimeout(process.execPath, ['-e', code], {
      cwd: workspace,
      env: createSanitizedEnv(),
      maxBuffer: 1024 * 1024,
    }, 500);
    const readyDeadline = Date.now() + 5_000;
    while (!fs.existsSync(ready) && Date.now() < readyDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(fs.existsSync(ready)).toBe(true);

    const result = await execution;

    expect(result.timedOut).toBe(true);
    expect(Date.now() - startedAt).toBeLessThan(4_000);
  }, 10_000);

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

    it.runIf(process.platform === 'win32')('rejects NTFS alternate data streams', async () => {
      const writeFile = getTool('write_file');
      const result = await writeFile.execute({ path: 'safe.txt:secret', content: 'hidden' });
      expect(result.toLowerCase()).toContain('alternate data');
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

    it('rejects absolute and parent-traversing glob patterns', async () => {
      const outside = `${workspace}-glob-outside`;
      fs.mkdirSync(outside, { recursive: true });
      fs.writeFileSync(path.join(outside, 'secret.txt'), 'glob-secret');
      try {
        const searchFiles = getTool('search_files');
        const absolute = await searchFiles.execute({ pattern: path.join(outside, '*.txt') });
        expect(absolute.toLowerCase()).toContain('relative');

        const traversal = await searchFiles.execute({
          pattern: `../${path.basename(outside)}/*.txt`,
        });
        expect(traversal.toLowerCase()).toContain('outside');
      } finally {
        fs.rmSync(outside, { recursive: true, force: true });
      }
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

    it('rejects parent-traversing content globs', async () => {
      const outside = `${workspace}-content-outside`;
      fs.mkdirSync(outside, { recursive: true });
      fs.writeFileSync(path.join(outside, 'secret.txt'), 'content-secret');
      try {
        const searchContent = getTool('search_content');
        const result = await searchContent.execute({
          pattern: 'content-secret',
          glob: `../${path.basename(outside)}/*.txt`,
        });
        expect(result.toLowerCase()).toContain('outside');
        expect(result).not.toContain('content-secret');
      } finally {
        fs.rmSync(outside, { recursive: true, force: true });
      }
    });
  });

  describe('run_code', () => {
    it('preserves JavaScript quotes and shell metacharacters without invoking a shell', async () => {
      const expected = 'quote:" amp:& pipe:| percent:% caret:^';
      const runCode = getTool('run_code');
      const result = await runCode.execute({
        language: 'javascript',
        code: `console.log(${JSON.stringify(expected)})`,
      });
      expect(result).toContain(expected);
    });

    it('uses an allowlisted child environment and strips provider and infrastructure secrets', async () => {
      const secrets = {
        GEMINI_API_KEY: 'gemini-sentinel',
        GOOGLE_API_KEY: 'google-sentinel',
        XAI_API_KEY: 'xai-sentinel',
        DEEPSEEK_API_KEY: 'deepseek-sentinel',
        STRIPE_SECRET_KEY: 'stripe-sentinel',
        AWS_SECRET_ACCESS_KEY: 'aws-sentinel',
        GITHUB_TOKEN: 'github-sentinel',
      };
      const originals = Object.fromEntries(
        Object.keys(secrets).map((key) => [key, process.env[key]]),
      );
      Object.assign(process.env, secrets);
      try {
        const sanitized = createSanitizedEnv();
        for (const key of Object.keys(secrets)) expect(sanitized[key]).toBeUndefined();
        expect(sanitized.PATH ?? sanitized.Path).toBeDefined();

        const runCode = getTool('run_code');
        const result = await runCode.execute({
          language: 'javascript',
          code: `console.log(JSON.stringify(${JSON.stringify(Object.keys(secrets))}.map((key) => process.env[key] ?? null)))`,
        });
        for (const sentinel of Object.values(secrets)) expect(result).not.toContain(sentinel);
      } finally {
        for (const [key, value] of Object.entries(originals)) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      }
    });

    it('reports output-limit failures instead of presenting partial output as success', async () => {
      const runCode = getTool('run_code');
      const result = await runCode.execute({
        language: 'javascript',
        code: "process.stdout.write('x'.repeat(2 * 1024 * 1024)); setTimeout(() => {}, 30000)",
        timeout: 10_000,
      });

      expect(result).toContain('maxBuffer');
      expect(result).toContain('--- error ---');
    }, 10_000);

    it.runIf(process.platform === 'win32')('kills descendant processes when execution times out', async () => {
      const marker = path.join(workspace, 'orphan-marker.txt');
      const childCode = `setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'orphaned'), 1500)`;
      const code = `require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(childCode)}], { stdio: 'ignore' }); setTimeout(() => {}, 30000)`;
      const runCode = getTool('run_code');
      const result = await runCode.execute({ language: 'javascript', code, timeout: 1000 });
      expect(result.toLowerCase()).toContain('timed out');
      await new Promise((resolve) => setTimeout(resolve, 1800));
      expect(fs.existsSync(marker)).toBe(false);
    }, 10_000);

    it.runIf(process.platform === 'win32')('kills descendants on time while the main event loop is blocked', async () => {
      const ready = path.join(workspace, 'descendant-ready.txt');
      const marker = path.join(workspace, 'starved-timeout-orphan.txt');
      const childCode = [
        `const fs = require('node:fs')`,
        `fs.writeFileSync(${JSON.stringify(ready)}, 'ready')`,
        `setTimeout(() => fs.writeFileSync(${JSON.stringify(marker)}, 'orphaned'), 1600)`,
        'setTimeout(() => {}, 30000)',
      ].join(';');
      const code = [
        `require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(childCode)}], { stdio: 'ignore' })`,
        'setTimeout(() => {}, 30000)',
      ].join(';');
      const runCode = getTool('run_code');
      const execution = Promise.resolve(runCode.execute({
        language: 'javascript',
        code,
        timeout: 1000,
      }));
      const readyDeadline = Date.now() + 5_000;
      while (!fs.existsSync(ready) && Date.now() < readyDeadline) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(fs.existsSync(ready)).toBe(true);

      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2_600);
      const result = await execution;

      expect(result.toLowerCase()).toContain('timed out');
      expect(fs.existsSync(marker)).toBe(false);
    }, 15_000);

    it.runIf(process.platform === 'win32')('does not time out a process that exits while the main event loop is blocked', async () => {
      const ready = path.join(workspace, 'completion-ready.txt');
      const finished = path.join(workspace, 'completion-finished.txt');
      const code = [
        `const fs = require('node:fs')`,
        `fs.writeFileSync(${JSON.stringify(ready)}, 'ready')`,
        'setTimeout(() => {',
        `  fs.writeFileSync(${JSON.stringify(finished)}, 'finished')`,
        "  console.log('completed-before-deadline')",
        '}, 200)',
      ].join(';');
      const runCode = getTool('run_code');
      const execution = Promise.resolve(runCode.execute({
        language: 'javascript',
        code,
        timeout: 1000,
      }));
      const readyDeadline = Date.now() + 5_000;
      while (!fs.existsSync(ready) && Date.now() < readyDeadline) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(fs.existsSync(ready)).toBe(true);

      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1_800);
      const result = await execution;

      expect(fs.existsSync(finished)).toBe(true);
      expect(result).toContain('completed-before-deadline');
      expect(result.toLowerCase()).not.toContain('timed out');
    }, 10_000);

    it.runIf(process.platform === 'win32')('starts a cold process supervisor while the main event loop is blocked', async () => {
      const finished = path.join(workspace, 'cold-supervisor-finished.txt');
      const code = [
        `const fs = require('node:fs')`,
        'setTimeout(() => {',
        `  fs.writeFileSync(${JSON.stringify(finished)}, 'finished')`,
        "  console.log('cold-supervisor-complete')",
        '}, 400)',
      ].join(';');
      const runCode = getTool('run_code');
      const execution = Promise.resolve(runCode.execute({
        language: 'javascript',
        code,
        timeout: 1000,
      }));

      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1_800);
      expect(fs.existsSync(finished)).toBe(true);
      const result = await execution;

      expect(result).toContain('cold-supervisor-complete');
      expect(result.toLowerCase()).not.toContain('timed out');
    }, 10_000);

    it.runIf(process.platform === 'win32')('enforces timeout from a cold supervisor while the main event loop is blocked', async () => {
      const ready = path.join(workspace, 'cold-timeout-ready.txt');
      const marker = path.join(workspace, 'cold-timeout-orphan.txt');
      const childCode = `setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'orphaned'), 1600)`;
      const code = [
        `require('node:fs').writeFileSync(${JSON.stringify(ready)}, 'ready')`,
        `require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(childCode)}], { stdio: 'ignore' })`,
        'setTimeout(() => {}, 30000)',
      ].join(';');
      const runCode = getTool('run_code');
      const execution = Promise.resolve(runCode.execute({
        language: 'javascript',
        code,
        timeout: 1000,
      }));

      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2_600);
      expect(fs.existsSync(ready)).toBe(true);
      const result = await execution;

      expect(result.toLowerCase()).toContain('timed out');
      expect(fs.existsSync(marker)).toBe(false);
    }, 10_000);

    it.runIf(process.platform === 'win32')('does not target a reused PID after the root exits with inherited output open', async () => {
      const descendantCode = [
        "setTimeout(() => process.stdout.write('x'.repeat(2 * 1024 * 1024)), 200)",
        'setTimeout(() => {}, 2500)',
      ].join(';');
      const code = [
        `const child = require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(descendantCode)}], { detached: true, stdio: ['ignore', 'inherit', 'inherit'] })`,
        'child.unref()',
        "console.log('root-exited')",
      ].join(';');
      const runCode = getTool('run_code');
      const result = await runCode.execute({
        language: 'javascript',
        code,
        timeout: 1000,
      });

      expect(result.toLowerCase()).not.toContain('timed out');
      expect(result).not.toContain('maxBuffer');
      expect(result).toContain('descendant processes may still be running');
      await new Promise((resolve) => setTimeout(resolve, 700));
    }, 10_000);

    it.runIf(process.platform === 'win32')('surfaces degraded cleanup when taskkill is unavailable', async () => {
      const targetEnv = createSanitizedEnv();
      const originalSystemRoot = process.env.SystemRoot;
      const originalWindir = process.env.WINDIR;
      const unavailableWindowsRoot = path.join(workspace, 'missing-windows-root');

      try {
        process.env.SystemRoot = unavailableWindowsRoot;
        process.env.WINDIR = unavailableWindowsRoot;
        const result = await execFileWithTreeTimeout(process.execPath, [
          '-e',
          'setTimeout(() => {}, 30000)',
        ], {
          cwd: workspace,
          env: targetEnv,
          maxBuffer: 1024 * 1024,
          windowsHide: true,
        }, 1000);

        expect(result.timedOut).toBe(true);
        expect(result.cleanupDegraded).toBe(true);
      } finally {
        if (originalSystemRoot === undefined) delete process.env.SystemRoot;
        else process.env.SystemRoot = originalSystemRoot;
        if (originalWindir === undefined) delete process.env.WINDIR;
        else process.env.WINDIR = originalWindir;
      }
    }, 10_000);
  });
});
