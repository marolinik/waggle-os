/**
 * 9D-3: npx waggle CLI Launcher — tests.
 *
 * Tests argument parsing, version checking, launcher configuration, and the
 * packed/installed CLI startup path a user gets from npm.
 */
import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  formatStartupFailure,
  formatStartupSuccess,
  parseArgs,
} from '../src/cli-core.js';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const LAUNCHER_DIR = path.join(ROOT, 'packages', 'launcher');

interface CommandResult {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
}

function bin(name: string): string {
  return process.platform === 'win32' ? `${name}.cmd` : name;
}

function makeHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-launcher-cli-'));
}

function run(
  command: string,
  args: string[],
  home: string,
  extraEnv: NodeJS.ProcessEnv = {},
): Promise<CommandResult> {
  return runInCwd(command, args, ROOT, home, extraEnv);
}

function runInCwd(
  command: string,
  args: string[],
  cwd: string,
  home: string,
  extraEnv: NodeJS.ProcessEnv = {},
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
        ...extraEnv,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32' && command.endsWith('.cmd'),
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', (error) => resolve({ status: null, stdout, stderr, error }));
    child.once('close', (status) => resolve({ status, stdout, stderr }));
  });
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
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32' && command.endsWith('.cmd'),
  });
}

async function occupyPort(): Promise<{
  server: http.Server;
  port: number;
  requestCount: () => number;
  bearerRequestCount: () => number;
}> {
  let requests = 0;
  let bearerRequests = 0;
  const server = http.createServer((request, response) => {
    requests += 1;
    if (request.headers.authorization?.startsWith('Bearer ')) bearerRequests += 1;
    response.writeHead(503, { 'content-type': 'application/json' });
    response.end('{}');
  });
  const port = await new Promise<number>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve(typeof addr === 'object' && addr ? addr.port : 0);
    });
  });
  return {
    server,
    port,
    requestCount: () => requests,
    bearerRequestCount: () => bearerRequests,
  };
}

async function freePort(): Promise<number> {
  const { server, port } = await occupyPort();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
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

async function waitForReadyFile(
  child: ChildProcessWithoutNullStreams,
  readyFile: string,
  output: () => { stdout: string; stderr: string },
  timeoutMs: number,
): Promise<void> {
  try {
    await waitFor(
      () => fs.existsSync(readyFile) || child.exitCode !== null || child.signalCode !== null,
      timeoutMs,
    );
  } catch (error) {
    const { stdout, stderr } = output();
    throw new Error(
      `${error instanceof Error ? error.message : String(error)} waiting for ${readyFile}`
      + `\nexit=${String(child.exitCode)} signal=${String(child.signalCode)}`
      + `\nstdout:\n${stdout}\nstderr:\n${stderr}`,
    );
  }

  if (!fs.existsSync(readyFile)) {
    const { stdout, stderr } = output();
    throw new Error(
      `Launcher exited before writing ${readyFile}`
      + `\nexit=${String(child.exitCode)} signal=${String(child.signalCode)}`
      + `\nstdout:\n${stdout}\nstderr:\n${stderr}`,
    );
  }
}

async function waitForHealth(url: string, timeoutMs: number): Promise<Record<string, unknown>> {
  let lastError = '';
  await waitFor(async () => {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(750) });
      if (!res.ok) {
        lastError = `HTTP ${res.status}`;
        return false;
      }
      const body = await res.json() as Record<string, unknown>;
      if (body.status === 'ok' || body.status === 'degraded') return true;
      lastError = `unexpected status ${String(body.status)}`;
      return false;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      return false;
    }
  }, timeoutMs).catch((err) => {
    throw new Error(`${err instanceof Error ? err.message : String(err)} waiting for ${url}: ${lastError}`);
  });

  const res = await fetch(url);
  return await res.json() as Record<string, unknown>;
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

describe('Waggle CLI Launcher', () => {
  describe('argument parsing', () => {
    it('uses default port 3333 when no arguments', () => {
      const result = parseArgs(['node', 'waggle']);
      expect(result.port).toBe(3333);
      expect(result.skipLiteLLM).toBe(false);
      expect(result.noBrowser).toBe(false);
      expect(result.help).toBe(false);
    });

    it('parses --port flag', () => {
      const result = parseArgs(['node', 'waggle', '--port', '4000']);
      expect(result.port).toBe(4000);
    });

    it('parses -p shorthand', () => {
      const result = parseArgs(['node', 'waggle', '-p', '8080']);
      expect(result.port).toBe(8080);
    });

    it('rejects invalid port values', () => {
      const result = parseArgs(['node', 'waggle', '--port', 'abc']);
      expect(result.port).toBe(3333); // default
      expect(result.error).toContain('Invalid port');
    });

    it('rejects out-of-range ports', () => {
      const neg = parseArgs(['node', 'waggle', '--port', '-1']);
      expect(neg.port).toBe(3333);
      expect(neg.error).toContain('Invalid port');

      const big = parseArgs(['node', 'waggle', '--port', '99999']);
      expect(big.port).toBe(3333);
      expect(big.error).toContain('Invalid port');
    });

    it('rejects missing port values', () => {
      const result = parseArgs(['node', 'waggle', '--port']);
      expect(result.port).toBe(3333);
      expect(result.error).toContain('Missing value');
    });

    it('rejects unknown options before startup', () => {
      const result = parseArgs(['node', 'waggle', '--wat']);
      expect(result.error).toContain('Unknown option');
    });

    it('parses --skip-litellm flag', () => {
      const result = parseArgs(['node', 'waggle', '--skip-litellm']);
      expect(result.skipLiteLLM).toBe(true);
    });

    it('parses --no-open flag', () => {
      const result = parseArgs(['node', 'waggle', '--no-open']);
      expect(result.noBrowser).toBe(true);
    });

    it('parses --help flag', () => {
      const result = parseArgs(['node', 'waggle', '--help']);
      expect(result.help).toBe(true);
    });

    it('parses -h shorthand', () => {
      const result = parseArgs(['node', 'waggle', '-h']);
      expect(result.help).toBe(true);
    });

    it('handles multiple flags together', () => {
      const result = parseArgs(['node', 'waggle', '--port', '5000', '--skip-litellm', '--no-open']);
      expect(result.port).toBe(5000);
      expect(result.skipLiteLLM).toBe(true);
      expect(result.noBrowser).toBe(true);
    });
  });

  describe('Node.js version check', () => {
    it('current Node version meets minimum requirement (>=18)', () => {
      const [major] = process.versions.node.split('.').map(Number);
      expect(major).toBeGreaterThanOrEqual(18);
    });
  });

  describe('package configuration', () => {
    it('package.json has correct bin entry', async () => {
      const { readFileSync } = await import('node:fs');
      const { resolve } = await import('node:path');
      const pkg = JSON.parse(
        readFileSync(resolve(import.meta.dirname, '..', 'package.json'), 'utf-8')
      );
      expect(pkg.name).toBe('@waggle-ai/waggle');
      expect(pkg.bin).toBeDefined();
      expect(pkg.bin.waggle).toContain('cli');
    });
  });

  describe('startup copy', () => {
    it('turns port conflicts into actionable CLI guidance', () => {
      const message = formatStartupFailure(
        'Port 3333 is already in use. Another Waggle instance may be running.',
        3333,
      );

      expect(message).toContain('Failed to start Waggle');
      expect(message).toContain('Port 3333 is already in use');
      expect(message).toContain('npx waggle --port 3334');
    });

    it('explains --no-open success without implying a browser opened', () => {
      const message = formatStartupSuccess({
        url: 'http://localhost:3333',
        llmProvider: 'anthropic-proxy',
        llmHealth: 'degraded',
        dataDir: 'C:/tmp/waggle',
        noBrowser: true,
      });

      expect(message).toContain('Server:  http://localhost:3333');
      expect(message).toContain('Browser: not opened (--no-open)');
      expect(message).toContain('Open manually: http://localhost:3333');
    });
  });

  describe('runtime help', () => {
    it('runs built help without starting service setup', async () => {
      const home = makeHome();
      try {
        const build = await run(bin('npm'), ['run', 'build', '--workspace', '@waggle-ai/waggle'], home);
        expect(build.status).toBe(0);

        const result = await run(process.execPath, [path.join(LAUNCHER_DIR, 'dist', 'cli.js'), '--help'], home);

        expect(result.status).toBe(0);
        expect(result.stdout).toContain('Usage:');
        expect(result.stdout).not.toContain('[waggle:service]');
        expect(result.stderr).toBe('');
        expect(fs.existsSync(path.join(home, '.waggle'))).toBe(false);
      } finally {
        fs.rmSync(home, { recursive: true, force: true });
      }
    });

    it('runs built invalid-port validation before starting service setup', async () => {
      const home = makeHome();
      try {
        const build = await run(bin('npm'), ['run', 'build', '--workspace', '@waggle-ai/waggle'], home);
        expect(build.status).toBe(0);

        const result = await run(process.execPath, [path.join(LAUNCHER_DIR, 'dist', 'cli.js'), '--port', 'abc'], home);

        expect(result.status).toBe(1);
        expect(result.stderr).toContain('Invalid port: abc');
        expect(result.stderr).not.toContain('[waggle:service]');
        expect(fs.existsSync(path.join(home, '.waggle'))).toBe(false);
      } finally {
        fs.rmSync(home, { recursive: true, force: true });
      }
    });

    it('reports occupied ports with a working --port recovery command', async () => {
      const home = makeHome();
      const { server: blocker, port, requestCount, bearerRequestCount } = await occupyPort();
      try {
        const build = await run(bin('npm'), ['run', 'build', '--workspace', '@waggle-ai/waggle'], home);
        expect(build.status).toBe(0);

        const result = await run(
          process.execPath,
          [
            path.join(LAUNCHER_DIR, 'dist', 'cli.js'),
            '--port',
            String(port),
            '--skip-litellm',
            '--no-open',
          ],
          home,
          { WAGGLE_DATA_DIR: path.join(home, 'data') },
        );

        expect(result.status).toBe(1);
        expect(result.stderr).toContain(`Port ${port} is already in use`);
        expect(result.stderr).toContain(`npx waggle --port ${port + 1}`);
        expect(bearerRequestCount()).toBe(0);
        expect(requestCount()).toBe(0);
      } finally {
        await new Promise<void>((resolve) => blocker.close(() => resolve()));
        fs.rmSync(home, { recursive: true, force: true });
      }
    });

    it('packs a tarball with a runnable first command', async () => {
      const home = makeHome();
      try {
        const build = await run(bin('npm'), ['run', 'build', '--workspace', '@waggle-ai/waggle'], home);
        expect(build.status).toBe(0);

        const pack = await run(
          bin('npm'),
          ['pack', '--workspace', '@waggle-ai/waggle', '--pack-destination', home, '--json'],
          home,
        );
        expect(pack.status).toBe(0);

        const [packResult] = JSON.parse(pack.stdout) as Array<{ filename: string }>;
        const tarball = path.join(home, packResult.filename);
        const extractDir = path.join(home, 'packed');
        fs.mkdirSync(extractDir, { recursive: true });
        await extractTarball(tarball, extractDir);

        const pkg = JSON.parse(
          fs.readFileSync(path.join(extractDir, 'package', 'package.json'), 'utf8'),
        );
        const distFiles = fs.readdirSync(path.join(extractDir, 'package', 'dist'));
        const result = await run(
          process.execPath,
          [path.join(extractDir, 'package', 'dist', 'cli.js'), '--help'],
          home,
        );

        expect(pkg.bin.waggle).toBe('./dist/cli.js');
        expect({
          transformersDependency: pkg.dependencies?.['@huggingface/transformers'],
          bundledNativeBindings: distFiles.filter((file) => /^onnxruntime_binding-.*\.node$/.test(file)),
          bundledTransformersRuntime: distFiles.filter((file) => /^transformers\.node-.*\.js$/.test(file)),
        }).toEqual({
          transformersDependency: '3.8.1',
          bundledNativeBindings: [],
          bundledTransformersRuntime: [],
        });
        expect(result.status).toBe(0);
        expect(result.stdout).toContain('Usage:');
        expect(result.stdout).not.toContain('[waggle:service]');
        expect(result.stderr).toBe('');
        expect(fs.existsSync(path.join(home, '.waggle'))).toBe(false);
      } finally {
        fs.rmSync(home, { recursive: true, force: true });
      }
    }, 120_000);

    it('installs the packed launcher and runs npx help plus startup recovery', async () => {
      const home = makeHome();
      const { server: blocker, port, requestCount, bearerRequestCount } = await occupyPort();
      try {
        const build = await run(bin('npm'), ['run', 'build', '--workspace', '@waggle-ai/waggle'], home);
        expect(build.status).toBe(0);

        const pack = await run(
          bin('npm'),
          ['pack', '--workspace', '@waggle-ai/waggle', '--pack-destination', home, '--json'],
          home,
        );
        expect(pack.status).toBe(0);

        const [packResult] = JSON.parse(pack.stdout) as Array<{ filename: string }>;
        const projectDir = path.join(home, 'project');
        fs.mkdirSync(projectDir, { recursive: true });
        fs.writeFileSync(
          path.join(projectDir, 'package.json'),
          JSON.stringify({ private: true, type: 'module' }, null, 2),
        );

        const install = await runInCwd(
          bin('npm'),
          [
            'install',
            path.join(home, packResult.filename),
            '--no-audit',
            '--no-fund',
            '--prefer-offline',
          ],
          projectDir,
          home,
        );
        expect(install.status).toBe(0);

        const nativeEmbeddingRuntime = await runInCwd(
          process.execPath,
          [
            '--input-type=module',
            '--eval',
            "const runtime = await import('@huggingface/transformers'); if (typeof runtime.pipeline !== 'function') throw new Error('Transformers pipeline API is unavailable');",
          ],
          projectDir,
          home,
        );
        expect(nativeEmbeddingRuntime.status).toBe(0);
        expect(nativeEmbeddingRuntime.stderr).toBe('');

        const help = await runInCwd(bin('npx'), ['waggle', '--help'], projectDir, home);
        expect(help.status).toBe(0);
        expect(help.stdout).toContain('Usage:');
        expect(help.stdout).not.toContain('[waggle:service]');
        expect(help.stderr).toBe('');
        expect(fs.existsSync(path.join(home, '.waggle'))).toBe(false);

        const startup = await runInCwd(
          bin('npx'),
          ['waggle', '--port', String(port), '--skip-litellm', '--no-open'],
          projectDir,
          home,
          { WAGGLE_DATA_DIR: path.join(home, 'data') },
        );

        expect(startup.status).toBe(1);
        expect(startup.stderr).toContain(`Port ${port} is already in use`);
        expect(startup.stderr).toContain(`npx waggle --port ${port + 1}`);
        expect(fs.existsSync(path.join(home, '.waggle'))).toBe(false);
        expect(bearerRequestCount()).toBe(0);
        expect(requestCount()).toBe(0);
      } finally {
        await new Promise<void>((resolve) => blocker.close(() => resolve()));
        fs.rmSync(home, { recursive: true, force: true });
      }
    }, 240_000);

    it('starts the installed launcher, isolates concurrent histories, and reloads them after restart', async () => {
      const home = makeHome();
      const {
        server: blocker,
        port: preferredPort,
        requestCount,
        bearerRequestCount,
      } = await occupyPort();
      let child: ChildProcessWithoutNullStreams | undefined;
      try {
        const build = await run(bin('npm'), ['run', 'build', '--workspace', '@waggle-ai/waggle'], home);
        expect(build.status).toBe(0);

        const pack = await run(
          bin('npm'),
          ['pack', '--workspace', '@waggle-ai/waggle', '--pack-destination', home, '--json'],
          home,
        );
        expect(pack.status).toBe(0);

        const [packResult] = JSON.parse(pack.stdout) as Array<{ filename: string }>;
        const projectDir = path.join(home, 'project');
        fs.mkdirSync(projectDir, { recursive: true });
        fs.writeFileSync(
          path.join(projectDir, 'package.json'),
          JSON.stringify({ private: true, type: 'module' }, null, 2),
        );

        const install = await runInCwd(
          bin('npm'),
          [
            'install',
            path.join(home, packResult.filename),
            '--no-audit',
            '--no-fund',
            '--prefer-offline',
          ],
          projectDir,
          home,
        );
        expect(install.status).toBe(0);

        const dataDir = path.join(home, 'data');
        const readyFile = path.join(home, 'desktop-ready.json');
        const restartReadyFile = path.join(home, 'desktop-ready-restart.json');
        const desktopBootstrapToken = 'launcher-desktop-bootstrap-token-1234567890';
        const unreachableOllamaPort = await freePort();
        const unreachableVllmPort = await freePort();
        const providerFreeEnv = {
          EMBEDDING_PROVIDER: 'mock',
          ANTHROPIC_API_KEY: '',
          OPENAI_API_KEY: '',
          GEMINI_API_KEY: '',
          GOOGLE_API_KEY: '',
          XAI_API_KEY: '',
          DEEPSEEK_API_KEY: '',
          MISTRAL_API_KEY: '',
          DASHSCOPE_API_KEY: '',
          MINIMAX_API_KEY: '',
          ZHIPU_API_KEY: '',
          MOONSHOT_API_KEY: '',
          PERPLEXITY_API_KEY: '',
          OPENROUTER_API_KEY: '',
          OLLAMA_HOST: `http://127.0.0.1:${unreachableOllamaPort}`,
          VLLM_HOST: `http://127.0.0.1:${unreachableVllmPort}`,
        };
        let stdout = '';
        let stderr = '';
        child = spawnInCwd(
          bin('npx'),
          ['waggle', '--port', String(preferredPort), '--skip-litellm', '--no-open'],
          projectDir,
          home,
          {
            WAGGLE_DATA_DIR: dataDir,
            WAGGLE_DESKTOP_PORT_FALLBACK: '1',
            WAGGLE_INSTANCE_ID: 'launcher-fallback-health',
            WAGGLE_DESKTOP_BOOTSTRAP_TOKEN: desktopBootstrapToken,
            WAGGLE_READY_FILE: readyFile,
            ...providerFreeEnv,
          },
        );
        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', (chunk) => { stdout += chunk; });
        child.stderr.on('data', (chunk) => { stderr += chunk; });

        await waitForReadyFile(child, readyFile, () => ({ stdout, stderr }), 90_000);
        const ready = JSON.parse(fs.readFileSync(readyFile, 'utf8')) as {
          preferredPort: number;
          port: number;
        };
        expect(ready.preferredPort).toBe(preferredPort);
        expect(ready.port).not.toBe(preferredPort);
        const baseUrl = `http://127.0.0.1:${ready.port}`;
        const health = await waitForHealth(`${baseUrl}/health`, 30_000);
        await waitFor(() => stdout.includes('Press Ctrl+C to stop'), 10_000);

        expect(health.database).toMatchObject({ healthy: true });
        expect(stdout).toContain(`Server:  http://localhost:${ready.port}`);
        expect(stdout).toContain('Browser: not opened (--no-open)');
        expect(stdout).toContain(`Open manually: http://localhost:${ready.port}`);
        expect(stderr).not.toContain('Failed to start Waggle');
        expect(fs.existsSync(path.join(dataDir, 'personal.mind'))).toBe(true);
        expect(bearerRequestCount()).toBe(0);
        expect(requestCount()).toBe(0);

        const tokenResponse = await fetch(`${baseUrl}/api/auth/session-token`, {
          headers: { 'x-waggle-desktop-bootstrap': desktopBootstrapToken },
        });
        expect(tokenResponse.status).toBe(200);
        const token = (await tokenResponse.json() as { token?: string }).token;
        if (!token) throw new Error('Installed launcher returned no session token');
        const headers = {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        };

        const workspaceResponse = await fetch(`${baseUrl}/api/workspaces`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ name: 'Packed launcher concurrent history', group: 'Test' }),
        });
        expect(workspaceResponse.status).toBe(201);
        const workspaceId = (await workspaceResponse.json() as { id?: string }).id;
        if (!workspaceId) throw new Error('Installed launcher returned no workspace id');

        const sessionA = 'packed-concurrent-a';
        const sessionB = 'packed-concurrent-b';
        const markerA = 'PACKED_CONCURRENT_SESSION_A';
        const markerB = 'PACKED_CONCURRENT_SESSION_B';
        const [chatA, chatB] = await Promise.all([
          fetch(`${baseUrl}/api/chat`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ message: markerA, workspace: workspaceId, session: sessionA }),
          }),
          fetch(`${baseUrl}/api/chat`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ message: markerB, workspace: workspaceId, session: sessionB }),
          }),
        ]);
        const [chatBodyA, chatBodyB] = await Promise.all([chatA.text(), chatB.text()]);
        for (const [response, body] of [[chatA, chatBodyA], [chatB, chatBodyB]] as const) {
          expect(response.status).toBe(200);
          expect(response.headers.get('content-type')).toMatch(/^text\/event-stream/);
          expect(body.match(/^event:\s*done\s*$/gm)).toHaveLength(1);
          expect(body.match(/^event:\s*error\s*$/gm) ?? []).toHaveLength(0);
          expect(body).toContain('No AI model is ready');
        }

        for (const sessionId of [sessionA, sessionB]) {
          expect(fs.existsSync(path.join(
            dataDir,
            'workspaces',
            workspaceId,
            'sessions',
            `${sessionId}.jsonl`,
          ))).toBe(true);
        }

        await stopProcess(child);
        child = undefined;

        let restartStdout = '';
        let restartStderr = '';
        child = spawnInCwd(
          bin('npx'),
          ['waggle', '--port', String(preferredPort), '--skip-litellm', '--no-open'],
          projectDir,
          home,
          {
            WAGGLE_DATA_DIR: dataDir,
            WAGGLE_DESKTOP_PORT_FALLBACK: '1',
            WAGGLE_INSTANCE_ID: 'launcher-fallback-history-restart',
            WAGGLE_DESKTOP_BOOTSTRAP_TOKEN: desktopBootstrapToken,
            WAGGLE_READY_FILE: restartReadyFile,
            ...providerFreeEnv,
          },
        );
        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', (chunk) => { restartStdout += chunk; });
        child.stderr.on('data', (chunk) => { restartStderr += chunk; });

        await waitForReadyFile(
          child,
          restartReadyFile,
          () => ({ stdout: restartStdout, stderr: restartStderr }),
          90_000,
        );
        const restartReady = JSON.parse(fs.readFileSync(restartReadyFile, 'utf8')) as {
          preferredPort: number;
          port: number;
        };
        expect(restartReady.preferredPort).toBe(preferredPort);
        expect(restartReady.port).not.toBe(preferredPort);
        const restartBaseUrl = `http://127.0.0.1:${restartReady.port}`;
        const restartHealth = await waitForHealth(`${restartBaseUrl}/health`, 30_000);
        await waitFor(() => restartStdout.includes('Press Ctrl+C to stop'), 10_000);
        expect(restartHealth.database).toMatchObject({ healthy: true });
        expect(restartStderr).not.toContain('Failed to start Waggle');

        const restartTokenResponse = await fetch(`${restartBaseUrl}/api/auth/session-token`, {
          headers: { 'x-waggle-desktop-bootstrap': desktopBootstrapToken },
        });
        expect(restartTokenResponse.status).toBe(200);
        const restartToken = (await restartTokenResponse.json() as { token?: string }).token;
        if (!restartToken) throw new Error('Restarted launcher returned no session token');
        const restartHeaders = { authorization: `Bearer ${restartToken}` };
        const [historyResponseA, historyResponseB] = await Promise.all([
          fetch(
            `${restartBaseUrl}/api/history?workspace=${encodeURIComponent(workspaceId)}&session=${encodeURIComponent(sessionA)}`,
            { headers: restartHeaders },
          ),
          fetch(
            `${restartBaseUrl}/api/history?workspace=${encodeURIComponent(workspaceId)}&session=${encodeURIComponent(sessionB)}`,
            { headers: restartHeaders },
          ),
        ]);
        expect(historyResponseA.status).toBe(200);
        expect(historyResponseB.status).toBe(200);
        const [historyA, historyB] = await Promise.all([
          historyResponseA.json(),
          historyResponseB.json(),
        ]) as Array<{
          sessionId: string;
          count: number;
          messages: Array<{ role: string; content: string }>;
        }>;

        expect(historyA.sessionId).toBe(sessionA);
        expect(historyB.sessionId).toBe(sessionB);
        expect(historyA.count).toBe(2);
        expect(historyB.count).toBe(2);
        expect(historyA.messages).toEqual([
          expect.objectContaining({ role: 'user', content: markerA }),
          expect.objectContaining({ role: 'assistant', content: expect.stringContaining('No AI model is ready') }),
        ]);
        expect(historyB.messages).toEqual([
          expect.objectContaining({ role: 'user', content: markerB }),
          expect.objectContaining({ role: 'assistant', content: expect.stringContaining('No AI model is ready') }),
        ]);
        expect(historyA.messages.some(({ content }) => content.includes(markerB))).toBe(false);
        expect(historyB.messages.some(({ content }) => content.includes(markerA))).toBe(false);
        expect(bearerRequestCount()).toBe(0);
        expect(requestCount()).toBe(0);
      } finally {
        if (child) await stopProcess(child);
        await new Promise<void>((resolve) => blocker.close(() => resolve()));
        // Windows can release SQLite WAL/SHM handles a few milliseconds after
        // taskkill reports success; retry the isolated temp-home cleanup.
        fs.rmSync(home, {
          recursive: true,
          force: true,
          maxRetries: 10,
          retryDelay: 100,
        });
      }
    }, 360_000);
  });
});
