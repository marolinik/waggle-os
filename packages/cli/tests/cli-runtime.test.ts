import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const CLI_DIR = path.join(ROOT, 'packages', 'cli');

function bin(name: string): string {
  return process.platform === 'win32' ? `${name}.cmd` : name;
}

function makeHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-cli-runtime-'));
}

function run(
  command: string,
  args: string[],
  home: string,
): Promise<AsyncRunResult> {
  return runInCwdAsync(command, args, ROOT, home);
}

function runInCwd(
  command: string,
  args: string[],
  cwd: string,
  home: string,
): Promise<AsyncRunResult> {
  return runInCwdAsync(command, args, cwd, home);
}

function spawnInCwd(
  command: string,
  args: string[],
  cwd: string,
  home: string,
  extraEnv: NodeJS.ProcessEnv = {},
): ChildProcessWithoutNullStreams {
  return spawn(command, args, {
    cwd,
    env: {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      NO_COLOR: '1',
      ...extraEnv,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: process.platform === 'win32' && command.endsWith('.cmd'),
  });
}

interface AsyncRunResult {
  status: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

function runInCwdAsync(
  command: string,
  args: string[],
  cwd: string,
  home: string,
): Promise<AsyncRunResult> {
  return new Promise((resolve, reject) => {
    const child = spawnInCwd(command, args, cwd, home);
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('exit', (status, signal) => resolve({ status, signal, stdout, stderr }));
  });
}

interface MockLiteLlmRequest {
  url: string;
  authorization: string | undefined;
  body: {
    model?: string;
    messages?: Array<{ role: string; content?: string | null }>;
    stream?: boolean;
    stream_options?: { include_usage?: boolean };
  };
}

interface MockLiteLlm {
  baseUrl: string;
  requests: MockLiteLlmRequest[];
  close: () => Promise<void>;
}

async function readJson(req: IncomingMessage): Promise<MockLiteLlmRequest['body']> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) as MockLiteLlmRequest['body'] : {};
}

function writeSse(res: ServerResponse, payload: unknown): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

async function startMockLiteLlm(): Promise<MockLiteLlm> {
  const requests: MockLiteLlmRequest[] = [];
  const server: Server = createServer(async (req, res) => {
    try {
      if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('not found');
        return;
      }

      const body = await readJson(req);
      requests.push({
        url: req.url,
        authorization: req.headers.authorization,
        body,
      });

      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      const id = 'chatcmpl-installed-cli-test';
      writeSse(res, {
        id,
        object: 'chat.completion.chunk',
        choices: [{ index: 0, delta: { content: 'Mock installed ' }, finish_reason: null }],
      });
      writeSse(res, {
        id,
        object: 'chat.completion.chunk',
        choices: [{ index: 0, delta: { content: 'chat response' }, finish_reason: null }],
      });
      writeSse(res, {
        id,
        object: 'chat.completion.chunk',
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        usage: { prompt_tokens: 12, completion_tokens: 5, total_tokens: 17 },
      });
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end((err as Error).message);
    }
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    requests,
    close: () => new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    }),
  };
}

async function extractTarball(file: string, cwd: string): Promise<void> {
  const tar = await import('tar');
  await tar.x({ file, cwd });
}

async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out after ${timeoutMs}ms`);
}

async function waitForExit(child: ChildProcessWithoutNullStreams, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await Promise.race([
    new Promise<void>((resolve) => child.once('exit', () => resolve())),
    new Promise<void>((_, reject) => setTimeout(() => reject(new Error('process did not exit')), timeoutMs)),
  ]);
}

async function stopProcess(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;

  if (process.platform === 'win32' && child.pid) {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }

  await Promise.race([
    new Promise<void>((resolve) => child.once('exit', () => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
  ]);

  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
  }
}

const CLI_PACKAGE_CLOSURE = [
  '@waggle/shared',
  '@waggle/hive-mind-core',
  '@waggle/core',
  '@waggle/marketplace',
  '@waggle/agent',
  '@waggle/weaver',
  '@waggle/cli',
] as const;

describe('@waggle/cli runtime UX', () => {
  it('runs built help without loading the REPL dependency graph', async () => {
    const home = makeHome();
    try {
      const build = await run(bin('npm'), ['run', 'build', '--workspace', '@waggle/cli'], home);
      expect(build.status).toBe(0);

      const result = await run(process.execPath, [path.join(CLI_DIR, 'dist', 'index.js'), '--help'], home);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Waggle CLI');
      expect(result.stdout).toContain('Usage:');
      expect(result.stderr).toBe('');
      expect(fs.existsSync(path.join(home, '.waggle'))).toBe(false);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it('packs a tarball with a runnable bin help command', async () => {
    const home = makeHome();
    try {
      const build = await run(bin('npm'), ['run', 'build', '--workspace', '@waggle/cli'], home);
      expect(build.status).toBe(0);

      const pack = await run(
        bin('npm'),
        ['pack', '--workspace', '@waggle/cli', '--pack-destination', home, '--json'],
        home,
      );
      expect(pack.status).toBe(0);

      const [packResult] = JSON.parse(pack.stdout) as Array<{ filename: string }>;
      const extractDir = path.join(home, 'packed');
      fs.mkdirSync(extractDir, { recursive: true });
      await extractTarball(path.join(home, packResult.filename), extractDir);

      const pkg = JSON.parse(
        fs.readFileSync(path.join(extractDir, 'package', 'package.json'), 'utf8'),
      );
      const result = await run(
        process.execPath,
        [path.join(extractDir, 'package', 'bin', 'waggle.js'), '--help'],
        home,
      );

      expect(pkg.bin.waggle).toBe('bin/waggle.js');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Waggle CLI');
      expect(result.stdout).toContain('Usage:');
      expect(result.stderr).toBe('');
      expect(fs.existsSync(path.join(home, '.waggle'))).toBe(false);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it('installs the local package closure and runs npx help', async () => {
    const home = makeHome();
    try {
      const packsDir = path.join(home, 'packs');
      const projectDir = path.join(home, 'project');
      fs.mkdirSync(packsDir, { recursive: true });
      fs.mkdirSync(projectDir, { recursive: true });

      const dependencies: Record<string, string> = {};
      for (const workspace of CLI_PACKAGE_CLOSURE) {
        const build = await run(bin('npm'), ['run', 'build', '--workspace', workspace], home);
        expect(build.status).toBe(0);

        const pack = await run(
          bin('npm'),
          ['pack', '--workspace', workspace, '--pack-destination', packsDir, '--json'],
          home,
        );
        expect(pack.status).toBe(0);

        const [packResult] = JSON.parse(pack.stdout) as Array<{ filename: string }>;
        const tarball = path.join(packsDir, packResult.filename).replace(/\\/g, '/');
        dependencies[workspace] = `file:${tarball}`;
      }

      fs.writeFileSync(
        path.join(projectDir, 'package.json'),
        JSON.stringify({ private: true, type: 'module', dependencies }, null, 2),
      );

      const install = await runInCwd(
        bin('npm'),
        ['install', '--no-audit', '--no-fund', '--ignore-scripts', '--prefer-offline'],
        projectDir,
        home,
      );
      expect(install.status).toBe(0);

      const result = await runInCwd(bin('npx'), ['waggle', '--help'], projectDir, home);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Waggle CLI');
      expect(result.stdout).toContain('Usage:');
      expect(result.stderr).toBe('');
      expect(fs.existsSync(path.join(home, '.waggle'))).toBe(false);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  }, 180_000);

  it('installs the local package closure and starts the local REPL', async () => {
    const home = makeHome();
    let child: ChildProcessWithoutNullStreams | undefined;
    try {
      const packsDir = path.join(home, 'packs');
      const projectDir = path.join(home, 'project');
      fs.mkdirSync(packsDir, { recursive: true });
      fs.mkdirSync(projectDir, { recursive: true });

      const dependencies: Record<string, string> = {};
      for (const workspace of CLI_PACKAGE_CLOSURE) {
        const build = await run(bin('npm'), ['run', 'build', '--workspace', workspace], home);
        expect(build.status).toBe(0);

        const pack = await run(
          bin('npm'),
          ['pack', '--workspace', workspace, '--pack-destination', packsDir, '--json'],
          home,
        );
        expect(pack.status).toBe(0);

        const [packResult] = JSON.parse(pack.stdout) as Array<{ filename: string }>;
        const tarball = path.join(packsDir, packResult.filename).replace(/\\/g, '/');
        dependencies[workspace] = `file:${tarball}`;
      }

      fs.writeFileSync(
        path.join(projectDir, 'package.json'),
        JSON.stringify({ private: true, type: 'module', dependencies }, null, 2),
      );

      const install = await runInCwdAsync(
        bin('npm'),
        // The REPL opens MindDB on startup, so this install must allow better-sqlite3's
        // native binding lifecycle rather than using the help-only --ignore-scripts path.
        ['install', '--no-audit', '--no-fund', '--prefer-offline'],
        projectDir,
        home,
      );
      if (install.status !== 0) {
        throw new Error(
          [
            'Installed waggle REPL dependency install failed.',
            `status=${install.status ?? 'null'} signal=${install.signal ?? 'none'}`,
            `stdout:\n${install.stdout}`,
            `stderr:\n${install.stderr}`,
          ].join('\n'),
        );
      }

      let stdout = '';
      let stderr = '';
      child = spawnInCwd(bin('npx'), ['waggle', '--local'], projectDir, home);
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });

      try {
        await waitFor(() => stdout.includes('Type /help for commands') && stdout.includes('you >'), 30_000);
      } catch (err) {
        throw new Error(
          [
            'Installed waggle REPL did not reach the prompt.',
            `exitCode=${child.exitCode ?? 'running'} signalCode=${child.signalCode ?? 'none'}`,
            `stdout:\n${stdout}`,
            `stderr:\n${stderr}`,
          ].join('\n'),
          { cause: err },
        );
      }

      const writeCommand = async (command: string, expected: string | string[]) => {
        child!.stdin.write(`${command}\n`);
        const expectedText = Array.isArray(expected) ? expected : [expected];
        await waitFor(() => expectedText.every((text) => stdout.includes(text)), 10_000);
      };

      await writeCommand('/help', ['Available commands:', '/models', '/whoami']);
      await writeCommand('/mode', 'Current mode: local');
      await writeCommand('/whoami', ['User:', 'not logged in', 'Server:']);
      await writeCommand('/models', ['Available models:', 'No models configured']);
      await writeCommand('/cost', ['Tokens: 0 in / 0 out', 'Est. cost: $0.0000']);
      await writeCommand('/clear', 'Conversation cleared.');

      child.stdin.write('/exit\n');
      await waitForExit(child, 10_000);

      expect(child.exitCode).toBe(0);
      expect(stdout).toContain('Waggle');
      expect(stdout).toContain('Mode:');
      expect(stdout).toContain('local');
      expect(stdout).toContain('Available commands:');
      expect(stdout).toContain('Current mode: local');
      expect(stdout).toContain('No models configured');
      expect(stdout).toContain('Conversation cleared.');
      expect(stdout).toContain('Goodbye!');
      expect(stderr).not.toContain('Fatal error');
      expect(fs.existsSync(path.join(home, '.waggle', 'default.mind'))).toBe(true);
    } finally {
      if (child) await stopProcess(child);
      fs.rmSync(home, { recursive: true, force: true });
    }
  }, 180_000);

  it('installs the local package closure and completes a streamed chat turn', async () => {
    const home = makeHome();
    let child: ChildProcessWithoutNullStreams | undefined;
    let mockLiteLlm: MockLiteLlm | undefined;
    try {
      const packsDir = path.join(home, 'packs');
      const projectDir = path.join(home, 'project');
      fs.mkdirSync(packsDir, { recursive: true });
      fs.mkdirSync(projectDir, { recursive: true });

      const dependencies: Record<string, string> = {};
      for (const workspace of CLI_PACKAGE_CLOSURE) {
        const build = await run(bin('npm'), ['run', 'build', '--workspace', workspace], home);
        expect(build.status).toBe(0);

        const pack = await run(
          bin('npm'),
          ['pack', '--workspace', workspace, '--pack-destination', packsDir, '--json'],
          home,
        );
        expect(pack.status).toBe(0);

        const [packResult] = JSON.parse(pack.stdout) as Array<{ filename: string }>;
        const tarball = path.join(packsDir, packResult.filename).replace(/\\/g, '/');
        dependencies[workspace] = `file:${tarball}`;
      }

      fs.writeFileSync(
        path.join(projectDir, 'package.json'),
        JSON.stringify({ private: true, type: 'module', dependencies }, null, 2),
      );

      const install = await runInCwdAsync(
        bin('npm'),
        ['install', '--no-audit', '--no-fund', '--prefer-offline'],
        projectDir,
        home,
      );
      if (install.status !== 0) {
        throw new Error(
          [
            'Installed waggle chat dependency install failed.',
            `status=${install.status ?? 'null'} signal=${install.signal ?? 'none'}`,
            `stdout:\n${install.stdout}`,
            `stderr:\n${install.stderr}`,
          ].join('\n'),
        );
      }

      mockLiteLlm = await startMockLiteLlm();
      const waggleHome = path.join(home, '.waggle');
      const workspaceConfigDir = path.join(projectDir, '.waggle');
      fs.mkdirSync(waggleHome, { recursive: true });
      fs.mkdirSync(workspaceConfigDir, { recursive: true });
      fs.writeFileSync(
        path.join(waggleHome, 'config.json'),
        JSON.stringify({
          defaultModel: 'mock-model',
          providers: {
            litellm: {
              apiKey: 'sk-test',
              models: ['mock-model'],
            },
          },
        }, null, 2),
      );
      fs.writeFileSync(
        path.join(workspaceConfigDir, 'workspace.json'),
        JSON.stringify({
          model: 'mock-model',
          litellmUrl: mockLiteLlm.baseUrl,
        }, null, 2),
      );

      let stdout = '';
      let stderr = '';
      child = spawnInCwd(
        bin('npx'),
        ['waggle', '--local'],
        projectDir,
        home,
        {
          LITELLM_API_KEY: 'sk-test',
          WAGGLE_LLM_TIMEOUT_MS: '30000',
        },
      );
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });

      try {
        await waitFor(() => stdout.includes('Type /help for commands') && stdout.includes('you >'), 30_000);
      } catch (err) {
        throw new Error(
          [
            'Installed waggle REPL did not reach the prompt before chat.',
            `exitCode=${child.exitCode ?? 'running'} signalCode=${child.signalCode ?? 'none'}`,
            `stdout:\n${stdout}`,
            `stderr:\n${stderr}`,
          ].join('\n'),
          { cause: err },
        );
      }

      child.stdin.write('Say hello from the installed CLI test.\n');
      await waitFor(
        () => stdout.includes('Mock installed chat response') && stdout.includes('[mock-model |'),
        30_000,
      );

      child.stdin.write('/exit\n');
      await waitForExit(child, 10_000);

      const chatRequest = mockLiteLlm.requests.find((request) => request.url === '/v1/chat/completions');
      expect(chatRequest).toBeDefined();
      expect(chatRequest?.authorization).toBe('Bearer sk-test');
      expect(chatRequest?.body.model).toBe('mock-model');
      expect(chatRequest?.body.stream).toBe(true);
      expect(chatRequest?.body.stream_options).toEqual({ include_usage: true });
      expect(JSON.stringify(chatRequest?.body.messages)).toContain('Say hello from the installed CLI test.');
      expect(child.exitCode).toBe(0);
      expect(stdout).toContain('Model:');
      expect(stdout).toContain('mock-model');
      expect(stdout).toContain('Mock installed chat response');
      expect(stdout).toContain('12');
      expect(stdout).toContain('5');
      expect(stdout).toContain('Goodbye!');
      expect(stderr).not.toContain('Fatal error');
    } finally {
      if (child) await stopProcess(child);
      if (mockLiteLlm) await mockLiteLlm.close();
      fs.rmSync(home, { recursive: true, force: true });
    }
  }, 240_000);
});
