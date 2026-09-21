import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createSanitizedEnv,
  createSystemTools,
  executeToolWithStatus,
  extractWebPageText,
} from '../src/system-tools.js';
import { execFileWithTreeTimeout } from '../src/system-tools-helpers.js';
import { capToolResultForModel } from '../src/agent-run-budget.js';
import { untrustedContextWrapper } from '../src/untrusted-context.js';
import { executeToolCall } from '../src/tool-executor.js';
import { LoopGuard } from '../src/loop-guard.js';
import type { ToolDefinition } from '../src/tools.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFileSync } from 'node:child_process';

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

  function getToolFrom(toolSet: ToolDefinition[], name: string): ToolDefinition {
    const tool = toolSet.find((t) => t.name === name);
    if (!tool) throw new Error(`Tool "${name}" not found`);
    return tool;
  }

  function getTool(name: string): ToolDefinition {
    return getToolFrom(tools, name);
  }

  function boundedHeartbeatChildCode(ready: string, heartbeat: string): string {
    return [
      `const fs = require('node:fs')`,
      `fs.writeFileSync(${JSON.stringify(heartbeat)}, '0')`,
      `fs.writeFileSync(${JSON.stringify(ready)}, String(process.pid))`,
      'let beat = 0',
      `setInterval(() => fs.writeFileSync(${JSON.stringify(heartbeat)}, String(++beat)), 75)`,
      // Bound a deliberate cleanup regression without later targeting a possibly reused PID.
      'setTimeout(() => process.exit(0), 15000)',
    ].join(';');
  }

  function boundedEscapedHeartbeatChildCode(
    ready: string,
    heartbeat: string,
    stop: string,
  ): string {
    return [
      boundedHeartbeatChildCode(ready, heartbeat),
      `setInterval(() => { if (fs.existsSync(${JSON.stringify(stop)})) process.exit(0) }, 25)`,
    ].join(';');
  }

  function isProcessRunning(pid: number): boolean {
    try {
      process.kill(pid, 0);
    } catch (error) {
      return (error as NodeJS.ErrnoException).code !== 'ESRCH';
    }
    if (process.platform === 'win32') return true;
    try {
      const state = execFileSync('/bin/ps', ['-o', 'stat=', '-p', String(pid)], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      return state.length > 0 && !/^[ZX]/.test(state);
    } catch (error) {
      return (error as { status?: number }).status !== 1;
    }
  }

  async function expectDescendantStopped(ready: string, heartbeat: string): Promise<void> {
    expect(fs.existsSync(ready)).toBe(true);
    const descendantPid = Number(fs.readFileSync(ready, 'utf8'));
    expect(Number.isSafeInteger(descendantPid) && descendantPid > 0).toBe(true);
    expect(isProcessRunning(descendantPid)).toBe(false);
    const heartbeatAtReturn = fs.readFileSync(heartbeat, 'utf8');
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(fs.readFileSync(heartbeat, 'utf8')).toBe(heartbeatAtReturn);
  }

  async function expectEscapedDescendantRunningThenStop(
    ready: string,
    heartbeat: string,
    stop: string,
  ): Promise<void> {
    let descendantPid = Number.NaN;
    try {
      expect(fs.existsSync(ready)).toBe(true);
      descendantPid = Number(fs.readFileSync(ready, 'utf8'));
      expect(Number.isSafeInteger(descendantPid) && descendantPid > 0).toBe(true);
      expect(isProcessRunning(descendantPid)).toBe(true);
      const heartbeatAtReturn = fs.readFileSync(heartbeat, 'utf8');
      await new Promise((resolve) => setTimeout(resolve, 250));
      expect(fs.readFileSync(heartbeat, 'utf8')).not.toBe(heartbeatAtReturn);
      expect(isProcessRunning(descendantPid)).toBe(true);
    } finally {
      fs.writeFileSync(stop, 'stop');
      const stopDeadline = Date.now() + 5_000;
      while (
        Number.isSafeInteger(descendantPid)
        && descendantPid > 0
        && isProcessRunning(descendantPid)
        && Date.now() < stopDeadline
      ) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }
    expect(isProcessRunning(descendantPid)).toBe(false);
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
    expect(names).toContain('calculate_decision_matrix');
    expect(tools).toHaveLength(13);
  });

  describe('calculate_decision_matrix', () => {
    it('returns reconciled weighted totals and two-option sensitivity', async () => {
      const calculator = getTool('calculate_decision_matrix');

      expect(calculator.riskLevel).toBe('low');
      expect(calculator.offlineCapable).toBe(true);

      const result = JSON.parse(await calculator.execute({
        criteria: [
          { name: 'cost', weight: 5 },
          { name: 'speed', weight: 3 },
          { name: 'privacy', weight: 5 },
        ],
        options: [
          { name: 'Option A', scores: [4, 3, 5] },
          { name: 'Option B', scores: [2, 5, 4] },
        ],
        sensitivityCriterion: 'speed',
      }));

      expect(result.options[0]).toMatchObject({
        name: 'Option A',
        checksum: '20 + 9 + 25 = 54',
        total: 54,
      });
      expect(result.options[1]).toMatchObject({
        name: 'Option B',
        checksum: '10 + 15 + 20 = 45',
        total: 45,
      });
      expect(result.decision).toEqual({
        winner: 'Option A',
        tied: false,
        tiedOptions: [],
      });
      expect(result.sensitivity).toMatchObject({
        criterion: 'speed',
        tieWeight: 7.5,
        firstWholeNumberWeightWhereWinnerChanges: 8,
        winnerAtFirstWholeNumber: 'Option B',
        totalsAtFirstWholeNumber: {
          'Option A': 69,
          'Option B': 70,
        },
      });
    });

    it('handles decreasing and equal-slope sensitivity deterministically', async () => {
      const calculator = getTool('calculate_decision_matrix');
      const decreasing = JSON.parse(await calculator.execute({
        criteria: [
          { name: 'cost', weight: 5 },
          { name: 'speed', weight: 8 },
          { name: 'privacy', weight: 5 },
        ],
        options: [
          { name: 'Option A', scores: [4, 3, 5] },
          { name: 'Option B', scores: [2, 5, 4] },
        ],
        sensitivityCriterion: 'speed',
      }));
      expect(decreasing.sensitivity).toMatchObject({
        tieWeight: 7.5,
        firstWholeNumberWeightWhereWinnerChanges: 7,
        winnerAtFirstWholeNumber: 'Option A',
        totalsAtFirstWholeNumber: { 'Option A': 66, 'Option B': 65 },
      });

      const equalSlope = JSON.parse(await calculator.execute({
        criteria: [{ name: 'cost', weight: 1 }],
        options: [
          { name: 'Ångström', scores: [3] },
          { name: 'Zulu', scores: [3] },
        ],
        sensitivityCriterion: 'cost',
      }));
      expect(equalSlope.ranking.map((item: { name: string }) => item.name)).toEqual([
        'Zulu',
        'Ångström',
      ]);
      expect(equalSlope.sensitivity).toMatchObject({
        tieWeight: null,
        firstWholeNumberWeightWhereWinnerChanges: null,
        winnerAtFirstWholeNumber: null,
      });
    });

    it('keeps the largest valid result inside the smallest tool-context cap', async () => {
      const name = (prefix: string, index: number) => `${prefix}${index}`.padEnd(64, 'x');
      const criteria = Array.from({ length: 5 }, (_unused, index) => ({
        name: name('criterion-', index),
        weight: 100,
      }));
      const options = Array.from({ length: 5 }, (_unused, index) => ({
        name: name('option-', index),
        scores: Array.from({ length: 5 }, () => 100),
      }));

      const result = await getTool('calculate_decision_matrix').execute({
        criteria,
        options,
      });

      expect(result).not.toMatch(/^Error:/);
      expect(untrustedContextWrapper('calculate_decision_matrix', result).length)
        .toBeLessThanOrEqual(3_000);
      const parsed = JSON.parse(result);
      expect(parsed.options).toHaveLength(5);
      expect(parsed.options.every((option: { checksum: string }) => option.checksum.endsWith('= 50000')))
        .toBe(true);
    });

    it.each([
      ['non-finite weight', {
        criteria: [{ name: 'cost', weight: Number.POSITIVE_INFINITY }],
        options: [{ name: 'A', scores: [1] }, { name: 'B', scores: [2] }],
      }],
      ['duplicate criterion names', {
        criteria: [{ name: 'Cost', weight: 1 }, { name: ' cost ', weight: 2 }],
        options: [{ name: 'A', scores: [1, 2] }, { name: 'B', scores: [2, 3] }],
      }],
      ['duplicate option names', {
        criteria: [{ name: 'cost', weight: 1 }],
        options: [{ name: 'Alpha', scores: [1] }, { name: ' alpha ', scores: [2] }],
      }],
      ['out-of-range score', {
        criteria: [{ name: 'cost', weight: 1 }],
        options: [{ name: 'A', scores: [101] }, { name: 'B', scores: [2] }],
      }],
      ['Unicode format control in a name', {
        criteria: [{ name: 'co\u202est', weight: 1 }],
        options: [{ name: 'A', scores: [1] }, { name: 'B', scores: [2] }],
      }],
      ['mismatched score count', {
        criteria: [{ name: 'cost', weight: 1 }, { name: 'speed', weight: 2 }],
        options: [{ name: 'A', scores: [1] }, { name: 'B', scores: [2, 3] }],
      }],
      ['unknown sensitivity criterion', {
        criteria: [{ name: 'cost', weight: 1 }],
        options: [{ name: 'A', scores: [1] }, { name: 'B', scores: [2] }],
        sensitivityCriterion: 'speed',
      }],
      ['sensitivity with three options', {
        criteria: [{ name: 'cost', weight: 1 }],
        options: [
          { name: 'A', scores: [1] },
          { name: 'B', scores: [2] },
          { name: 'C', scores: [3] },
        ],
        sensitivityCriterion: 'cost',
      }],
    ])('fails closed for %s', async (_label, args) => {
      const result = await getTool('calculate_decision_matrix').execute(args);

      expect(result).toMatch(/^Error:/);
      expect(result).not.toMatch(/(?:NaN|Infinity)/);
    });
  });

  it('labels host execution tools high risk and describes their host-wide access', () => {
    const bash = getTool('bash');
    const runCode = getTool('run_code');

    expect(bash.riskLevel).toBe('high');
    expect(runCode.riskLevel).toBe('high');
    expect(bash.description).toMatch(/host.*not.*sandbox/i);
    expect(runCode.description).toMatch(/host.*not.*sandbox/i);
  });

  it('denies ordinary bash without a human-approval mechanism', async () => {
    let executed = false;
    const bash = {
      ...getTool('bash'),
      execute: async () => {
        executed = true;
        return 'executed';
      },
    };
    const result = await executeToolCall({
      id: 'ordinary-bash',
      function: {
        name: 'bash',
        arguments: JSON.stringify({ command: 'echo hello' }),
      },
    }, {
      toolMap: new Map([['bash', bash]]),
      guard: new LoopGuard(),
    });

    expect(result.content).toContain('[BLOCKED]');
    expect(result.countedAsUsed).toBe(false);
    expect(executed).toBe(false);
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

    it('reports execution status independently of Error-prefixed file content', async () => {
      fs.writeFileSync(path.join(workspace, 'literal-error.txt'), 'Error: ENOENT is file content');
      fs.writeFileSync(path.join(workspace, 'credentials.json'), 'SENSITIVE_FILE_SENTINEL');
      const readFile = getTool('read_file');
      const linkedRead = getToolFrom(
        createSystemTools({ workspace, denySensitiveFiles: true }),
        'read_file',
      );

      await expect(executeToolWithStatus(readFile, { path: 'literal-error.txt' }))
        .resolves.toEqual({ content: 'Error: ENOENT is file content', isError: false });
      await expect(executeToolWithStatus(readFile, { path: 'missing.txt' }))
        .resolves.toMatchObject({ isError: true, content: expect.stringContaining('ENOENT') });
      await expect(executeToolWithStatus(linkedRead, { path: 'credentials.json' }))
        .resolves.toEqual({ content: 'Error: Access to sensitive file denied', isError: true });
    });

    it('fails closed without executing a tool that has no structured status contract', async () => {
      const execute = vi.fn(async () => 'unstructured result');
      const unregisteredTool: ToolDefinition = {
        name: 'unregistered_read_file',
        description: 'Test-only unregistered tool',
        parameters: { type: 'object', properties: {} },
        execute,
      };

      await expect(executeToolWithStatus(unregisteredTool, {})).resolves.toEqual({
        content: 'Error: structured execution status unavailable for tool "unregistered_read_file".',
        isError: true,
      });
      expect(execute).not.toHaveBeenCalled();
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

    it('denies canonical secret paths in linked workspaces while preserving safe files and managed storage', async () => {
      const sensitiveFiles = [
        '.env',
        '.npmrc',
        '.env.production',
        path.join('.ssh', 'id_ed25519'),
        'credentials.json',
        'server.pem',
      ];
      const safeFiles = ['README.md', '.env.example', 'id_rsa.pub'];

      for (const file of [...sensitiveFiles, ...safeFiles]) {
        fs.mkdirSync(path.dirname(path.join(workspace, file)), { recursive: true });
        fs.writeFileSync(path.join(workspace, file), `contents:${file}`);
      }

      const linkedTools = createSystemTools({ workspace, denySensitiveFiles: true });
      const linkedRead = getToolFrom(linkedTools, 'read_file');
      for (const file of sensitiveFiles) {
        const result = await linkedRead.execute({ path: file });
        expect(result, file).toBe('Error: Access to sensitive file denied');
        expect(result, file).not.toContain(`contents:${file}`);
      }
      expect(await linkedRead.execute({ path: path.join('safe', '..', '.env') }))
        .toBe('Error: Access to sensitive file denied');
      for (const file of safeFiles) {
        expect(await linkedRead.execute({ path: file }), file).toBe(`contents:${file}`);
      }

      // The same names remain legitimate inside Waggle-managed sandbox storage.
      expect(await getTool('read_file').execute({ path: '.env' })).toBe('contents:.env');
    });

    it('denies a benign symlink that resolves to a sensitive file when symlinks are supported', async () => {
      const sensitiveDirectory = path.join(workspace, '.ssh');
      fs.mkdirSync(sensitiveDirectory, { recursive: true });
      fs.writeFileSync(path.join(sensitiveDirectory, 'config.txt'), 'SYMLINK_SECRET');
      const alias = path.join(workspace, 'public-config');
      try {
        fs.symlinkSync(
          sensitiveDirectory,
          alias,
          process.platform === 'win32' ? 'junction' : 'dir',
        );
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'EPERM' || code === 'EACCES' || code === 'ENOSYS') return;
        throw error;
      }

      const linkedTools = createSystemTools({ workspace, denySensitiveFiles: true });
      const readResult = await getToolFrom(linkedTools, 'read_file').execute({ path: 'public-config/config.txt' });
      expect(readResult).toBe('Error: Access to sensitive file denied');

      const filesResult = await getToolFrom(linkedTools, 'search_files').execute({ pattern: 'public-config/config.txt' });
      expect(filesResult).toBe('No files found.');
      expect(filesResult).not.toContain('public-config');

      const contentResult = await getToolFrom(linkedTools, 'search_content').execute({
        pattern: 'SYMLINK_SECRET',
        glob: 'public-config/config.txt',
      });
      expect(contentResult).toBe('No matches found.');
      expect(contentResult).not.toContain('public-config');
      expect(contentResult).not.toContain('SYMLINK_SECRET');
    });

    it('applies the same sensitive-read policy before a storage backend is called', async () => {
      const backendReads: string[] = [];
      const backend = {
        read: async (filePath: string) => {
          backendReads.push(filePath);
          return Buffer.from(filePath === '/README.md' ? 'backend readme' : 'BACKEND_SECRET');
        },
        write: async () => { throw new Error('write not expected'); },
        exists: async () => true,
        delete: async () => { throw new Error('delete not expected'); },
      };
      const backendTools = createSystemTools({
        workspace,
        fileBackend: backend,
        denySensitiveFiles: true,
      });
      const readFile = getToolFrom(backendTools, 'read_file');

      expect(await readFile.execute({ path: '.env' }))
        .toBe('Error: Access to sensitive file denied');
      expect(backendReads).toEqual([]);
      expect(await readFile.execute({ path: 'README.md' })).toBe('backend readme');
      expect(backendReads).toEqual(['/README.md']);
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

    it('omits sensitive matches without disclosing their filenames', async () => {
      fs.writeFileSync(path.join(workspace, 'README.md'), 'public');
      const sensitiveFiles = [
        '.env',
        '.npmrc',
        '.env.production',
        '.ssh/id_ed25519',
        'credentials.json',
        'server.pem',
      ];
      for (const file of sensitiveFiles) {
        fs.mkdirSync(path.dirname(path.join(workspace, file)), { recursive: true });
        fs.writeFileSync(path.join(workspace, file), 'private');
      }
      const linkedSearch = getToolFrom(
        createSystemTools({ workspace, denySensitiveFiles: true }),
        'search_files',
      );

      const broad = await linkedSearch.execute({ pattern: '**/*' });
      expect(broad).toContain('README.md');
      for (const file of sensitiveFiles) {
        expect(broad, file).not.toContain(path.basename(file));

        const exact = await linkedSearch.execute({ pattern: file });
        expect(exact, file).toBe('No files found.');
        expect(exact, file).not.toContain(path.basename(file));
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

    it('omits sensitive content in every output mode without filename disclosure', async () => {
      fs.writeFileSync(path.join(workspace, 'README.md'), 'SHARED_MARKER PUBLIC_VALUE');
      const sensitiveFiles = [
        '.env',
        '.npmrc',
        '.env.production',
        '.ssh/id_ed25519',
        'credentials.json',
        'server.pem',
      ];
      for (const file of sensitiveFiles) {
        fs.mkdirSync(path.dirname(path.join(workspace, file)), { recursive: true });
        fs.writeFileSync(path.join(workspace, file), `SHARED_MARKER PRIVATE_VALUE:${file}`);
      }
      const linkedSearch = getToolFrom(
        createSystemTools({ workspace, denySensitiveFiles: true }),
        'search_content',
      );

      for (const outputMode of ['content', 'files', 'count']) {
        const broad = await linkedSearch.execute({
          pattern: 'SHARED_MARKER',
          glob: '**/*',
          output_mode: outputMode,
        });
        expect(broad, outputMode).toContain('README.md');
        expect(broad, outputMode).not.toContain('PRIVATE_VALUE');
        for (const file of sensitiveFiles) {
          expect(broad, `${outputMode}:${file}`).not.toContain(path.basename(file));

          const exact = await linkedSearch.execute({
            pattern: 'PRIVATE_VALUE',
            glob: file,
            output_mode: outputMode,
          });
          expect(exact, `${outputMode}:${file}`).toBe('No matches found.');
          expect(exact, `${outputMode}:${file}`).not.toContain(path.basename(file));
          expect(exact, `${outputMode}:${file}`).not.toContain('PRIVATE_VALUE');
        }
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

    it('kills descendant processes when execution times out', async () => {
      const ready = path.join(workspace, 'descendant-timeout-ready.txt');
      const heartbeat = path.join(workspace, 'descendant-timeout-heartbeat.txt');
      const childCode = boundedHeartbeatChildCode(ready, heartbeat);
      const code = `require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(childCode)}], { stdio: 'ignore' }); setTimeout(() => {}, 30000)`;
      const runCode = getTool('run_code');
      const execution = Promise.resolve(runCode.execute({ language: 'javascript', code, timeout: 1000 }));
      const readyDeadline = Date.now() + 5_000;
      while (!fs.existsSync(ready) && Date.now() < readyDeadline) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      const result = await execution;
      expect(result.toLowerCase()).toContain('timed out');
      await expectDescendantStopped(ready, heartbeat);
    }, 10_000);

    it('enforces descendant timeout while the main event loop is blocked', async () => {
      const ready = path.join(workspace, 'descendant-ready.txt');
      const heartbeat = path.join(workspace, 'starved-timeout-heartbeat.txt');
      const childCode = boundedHeartbeatChildCode(ready, heartbeat);
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
      const readyBeforeBlock = fs.existsSync(ready);
      let descendantPid = Number.NaN;
      if (readyBeforeBlock) {
        try {
          descendantPid = Number(fs.readFileSync(ready, 'utf8'));
        } catch {
          // Record invalid readiness now; assert only after execution settles.
        }
      }
      const descendantPidValid = Number.isSafeInteger(descendantPid) && descendantPid > 0;

      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 9_000);
      const aliveAtUnblock = descendantPidValid && isProcessRunning(descendantPid);
      const result = await execution;

      expect(readyBeforeBlock).toBe(true);
      expect(descendantPidValid).toBe(true);
      expect(result.toLowerCase()).toContain('timed out');
      expect(aliveAtUnblock).toBe(false);
      await expectDescendantStopped(ready, heartbeat);
    }, 20_000);

    it('does not time out a process that exits while the main event loop is blocked', async () => {
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
        timeout: 3000,
      }));
      const readyDeadline = Date.now() + 5_000;
      while (!fs.existsSync(ready) && Date.now() < readyDeadline) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(fs.existsSync(ready)).toBe(true);

      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3_800);
      const result = await execution;

      expect(fs.existsSync(finished)).toBe(true);
      expect(result).toContain('completed-before-deadline');
      expect(result.toLowerCase()).not.toContain('timed out');
    }, 15_000);

    it('starts a cold process supervisor while the main event loop is blocked', async () => {
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
        timeout: 7000,
      }));

      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5_000);
      expect(fs.existsSync(finished)).toBe(true);
      const result = await execution;

      expect(result).toContain('cold-supervisor-complete');
      expect(result.toLowerCase()).not.toContain('timed out');
    }, 15_000);

    it('enforces timeout from a cold supervisor while the main event loop is blocked', async () => {
      const rootReady = path.join(workspace, 'cold-timeout-root-ready.txt');
      const descendantReady = path.join(workspace, 'cold-timeout-descendant-ready.txt');
      const heartbeat = path.join(workspace, 'cold-timeout-heartbeat.txt');
      const childCode = boundedHeartbeatChildCode(descendantReady, heartbeat);
      const code = [
        `require('node:fs').writeFileSync(${JSON.stringify(rootReady)}, 'ready')`,
        `require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(childCode)}], { stdio: 'ignore' })`,
        'setTimeout(() => {}, 30000)',
      ].join(';');
      const runCode = getTool('run_code');
      const execution = Promise.resolve(runCode.execute({
        language: 'javascript',
        code,
        timeout: 1000,
      }));

      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 9_000);
      const rootReadyAtUnblock = fs.existsSync(rootReady);
      const descendantReadyAtUnblock = fs.existsSync(descendantReady);
      let descendantPid = Number.NaN;
      if (descendantReadyAtUnblock) {
        try {
          descendantPid = Number(fs.readFileSync(descendantReady, 'utf8'));
        } catch {
          // Record invalid readiness now; assert only after execution settles.
        }
      }
      const descendantPidValid = Number.isSafeInteger(descendantPid) && descendantPid > 0;
      const aliveAtUnblock = descendantPidValid && isProcessRunning(descendantPid);
      const result = await execution;

      expect(rootReadyAtUnblock).toBe(true);
      expect(descendantReadyAtUnblock).toBe(true);
      expect(descendantPidValid).toBe(true);
      expect(result.toLowerCase()).toContain('timed out');
      expect(aliveAtUnblock).toBe(false);
      await expectDescendantStopped(descendantReady, heartbeat);
    }, 20_000);

    it('does not target a reused PID after the root exits with inherited output open', async () => {
      const descendantReady = path.join(workspace, 'reused-pid-descendant-ready.txt');
      const descendantCode = [
        `require('node:fs').writeFileSync(${JSON.stringify(descendantReady)}, String(process.pid))`,
        "setTimeout(() => process.stdout.write('inherited-output'), 200)",
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

      if (process.platform === 'win32') expect(result.toLowerCase()).not.toContain('timed out');
      else expect(result.toLowerCase()).toContain('timed out');
      expect(result).not.toContain('maxBuffer');
      expect(result).toMatch(/descendant(?: processes|s) may still be running/);
      expect(fs.existsSync(descendantReady)).toBe(true);
      const descendantPid = Number(fs.readFileSync(descendantReady, 'utf8'));
      expect(Number.isSafeInteger(descendantPid) && descendantPid > 0).toBe(true);
      if (process.platform !== 'win32') expect(isProcessRunning(descendantPid)).toBe(true);
      const exitDeadline = Date.now() + 5_000;
      while (isProcessRunning(descendantPid) && Date.now() < exitDeadline) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(isProcessRunning(descendantPid)).toBe(false);
    }, 10_000);

    it.runIf(process.platform !== 'win32')('kills same-group descendants after the managed root exits without inherited pipes', async () => {
      const ready = path.join(workspace, 'root-exit-descendant-ready.txt');
      const heartbeat = path.join(workspace, 'root-exit-descendant-heartbeat.txt');
      const childCode = boundedHeartbeatChildCode(ready, heartbeat);
      const code = [
        `const child = require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(childCode)}], { stdio: 'ignore' })`,
        'child.unref()',
      ].join(';');
      const runCode = getTool('run_code');
      const execution = Promise.resolve(runCode.execute({ language: 'javascript', code, timeout: 1000 }));
      const readyDeadline = Date.now() + 5_000;
      while (!fs.existsSync(ready) && Date.now() < readyDeadline) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }

      const result = await execution;
      expect(result.toLowerCase()).toContain('timed out');
      await expectDescendantStopped(ready, heartbeat);
    }, 10_000);

    it.runIf(process.platform !== 'win32')('kills same-group descendants when output exceeds the limit after root exit', async () => {
      const ready = path.join(workspace, 'root-exit-maxbuffer-ready.txt');
      const heartbeat = path.join(workspace, 'root-exit-maxbuffer-heartbeat.txt');
      const childCode = [
        boundedHeartbeatChildCode(ready, heartbeat),
        "process.stdout.write('x'.repeat(4096))",
      ].join(';');
      const code = [
        `const child = require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(childCode)}], { stdio: ['ignore', 'inherit', 'inherit'] })`,
        'child.unref()',
      ].join(';');
      const execution = execFileWithTreeTimeout(process.execPath, ['-e', code], {
        cwd: workspace,
        env: createSanitizedEnv(),
        maxBuffer: 1024,
        windowsHide: true,
      }, 10_000);
      const readyDeadline = Date.now() + 5_000;
      while (!fs.existsSync(ready) && Date.now() < readyDeadline) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }

      const result = await execution;
      expect(result.errorCode).toBe('ERR_CHILD_PROCESS_STDIO_MAXBUFFER');
      expect(result.cleanupDegraded).toBe(true);
      await expectDescendantStopped(ready, heartbeat);
    }, 10_000);

    it.runIf(process.platform !== 'win32')('warns when a detached descendant escapes a timed-out process group', async () => {
      const ready = path.join(workspace, 'escaped-timeout-ready.txt');
      const heartbeat = path.join(workspace, 'escaped-timeout-heartbeat.txt');
      const stop = path.join(workspace, 'escaped-timeout-stop.txt');
      const childCode = boundedEscapedHeartbeatChildCode(ready, heartbeat, stop);
      const code = [
        `const child = require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(childCode)}], { detached: true, stdio: 'ignore' })`,
        'child.unref()',
        'setTimeout(() => {}, 30000)',
      ].join(';');
      const runCode = getTool('run_code');
      const execution = Promise.resolve(runCode.execute({ language: 'javascript', code, timeout: 1000 }));
      const readyDeadline = Date.now() + 5_000;
      while (!fs.existsSync(ready) && Date.now() < readyDeadline) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }

      const result = await execution;
      await expectEscapedDescendantRunningThenStop(ready, heartbeat, stop);
      expect(result.toLowerCase()).toContain('timed out');
      expect(result).toMatch(/descendants may still be running/i);
    }, 10_000);

    it.runIf(process.platform !== 'win32')('warns when a detached descendant escapes max-buffer cleanup', async () => {
      const ready = path.join(workspace, 'escaped-maxbuffer-ready.txt');
      const heartbeat = path.join(workspace, 'escaped-maxbuffer-heartbeat.txt');
      const stop = path.join(workspace, 'escaped-maxbuffer-stop.txt');
      const childCode = boundedEscapedHeartbeatChildCode(ready, heartbeat, stop);
      const code = [
        `const fs = require('node:fs')`,
        `const child = require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(childCode)}], { detached: true, stdio: 'ignore' })`,
        'child.unref()',
        'const sleeper = new Int32Array(new SharedArrayBuffer(4))',
        `const readyDeadline = Date.now() + 5000`,
        `while (!fs.existsSync(${JSON.stringify(ready)}) && Date.now() < readyDeadline) Atomics.wait(sleeper, 0, 0, 20)`,
        `process.stdout.write('x'.repeat(4096))`,
      ].join(';');
      const execution = execFileWithTreeTimeout(process.execPath, ['-e', code], {
        cwd: workspace,
        env: createSanitizedEnv(),
        maxBuffer: 1024,
        windowsHide: true,
      }, 10_000);
      const readyDeadline = Date.now() + 5_000;
      while (!fs.existsSync(ready) && Date.now() < readyDeadline) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }

      const result = await execution;
      await expectEscapedDescendantRunningThenStop(ready, heartbeat, stop);
      expect(result.errorCode).toBe('ERR_CHILD_PROCESS_STDIO_MAXBUFFER');
      expect(result.cleanupDegraded).toBe(true);
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

describe('extractWebPageText', () => {
  const githubHtml = [
    '<header>GitHub navigation chrome</header>',
    `<main>Repository shell text ${'Repository navigation '.repeat(300)}`,
    '<article class="markdown-body entry-content container-lg" itemprop="text">',
    '<h1>sqlite-vec</h1><p>Vector search that runs anywhere &amp; stays embedded.</p>',
    `<p>${'SQLite vector extension details. '.repeat(200)}</p>`,
    '</article><aside>Uh oh! There was an error while loading.</aside></main>',
  ].join('');

  it('extracts the README article for an exact GitHub repository root', () => {
    const text = extractWebPageText(githubHtml, 'https://github.com/asg017/sqlite-vec');

    expect(text).toContain('sqlite-vec');
    expect(text).toContain('Vector search that runs anywhere & stays embedded.');
    expect(text).not.toContain('GitHub navigation chrome');
    expect(text).not.toContain('Repository shell text');
    expect(text).not.toContain('Uh oh!');
  });

  it('keeps README facts visible after untrusted wrapping and the research result cap', () => {
    const extracted = extractWebPageText(githubHtml, 'https://github.com/asg017/sqlite-vec');
    const modelVisible = capToolResultForModel(untrustedContextWrapper('web_fetch', extracted), 3_000);

    expect(modelVisible.length).toBeLessThanOrEqual(3_000);
    expect(modelVisible).toContain('Vector search that runs anywhere & stays embedded.');
    expect(modelVisible).not.toContain('Repository shell text');
  });

  it('fails closed for an exact GitHub repository root without a README article', () => {
    const text = extractWebPageText(
      '<header>GitHub navigation chrome</header><main>Uh oh! There was an error while loading.</main>',
      'https://github.com/asg017/sqlite-vec',
    );

    expect(text).toBe('');
  });

  it('keeps full-page extraction for non-root GitHub pages', () => {
    const text = extractWebPageText(githubHtml, 'https://github.com/asg017/sqlite-vec/issues');

    expect(text).toContain('Repository shell text');
    expect(text).toContain('sqlite-vec');
  });
});
