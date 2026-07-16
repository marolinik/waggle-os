import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ManagedOllamaRuntime,
  MANAGED_OLLAMA_WATCHDOG_SOURCE,
  OLLAMA_RUNTIME_ARTIFACTS,
  buildManagedOllamaEnv,
  resolveOllamaRuntimeArtifact,
  type OllamaRuntimeArtifact,
} from '../../src/local/managed-ollama-runtime.js';

const temporaryDirectories: string[] = [];

async function temporaryDataDir(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'waggle-managed-ollama-'));
  temporaryDirectories.push(directory);
  return directory;
}

function fixtureArtifact(bytes: Buffer, sha256 = createHash('sha256').update(bytes).digest('hex')): OllamaRuntimeArtifact {
  return {
    version: 'test-1.0.0',
    platform: 'win32',
    arch: 'x64',
    filename: 'ollama-test.zip',
    url: 'https://github.com/ollama/ollama/releases/download/vtest/ollama-test.zip',
    sha256,
    sizeBytes: bytes.length,
    executableName: 'ollama.exe',
  };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('managed Ollama supply-chain manifest', () => {
  it('pins official HTTPS release artifacts with exact SHA-256 digests and sizes', () => {
    expect(OLLAMA_RUNTIME_ARTIFACTS).toHaveLength(4);
    for (const artifact of OLLAMA_RUNTIME_ARTIFACTS) {
      expect(artifact.url).toBe(
        `https://github.com/ollama/ollama/releases/download/v${artifact.version}/${artifact.filename}`,
      );
      expect(artifact.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(artifact.sizeBytes).toBeGreaterThan(10_000_000);
    }
    expect(resolveOllamaRuntimeArtifact('win32', 'x64')?.filename).toBe('ollama-windows-amd64.zip');
    expect(resolveOllamaRuntimeArtifact('linux', 'x64')).toBeNull();
  });

  it('binds the managed daemon to loopback and isolates its model store', () => {
    const env = buildManagedOllamaEnv('http://127.0.0.1:11434', 'C:\\Waggle\\models', { PATH: 'fixture' });
    expect(env).toMatchObject({
      PATH: 'fixture',
      OLLAMA_HOST: '127.0.0.1:11434',
      OLLAMA_MODELS: 'C:\\Waggle\\models',
      OLLAMA_NOHISTORY: '1',
    });
    expect(() => buildManagedOllamaEnv('http://0.0.0.0:11434', 'models')).toThrow(/loopback/i);
    expect(() => buildManagedOllamaEnv('https://127.0.0.1:11434', 'models')).toThrow(/loopback/i);
  });

  it('reports the target version without claiming it is installed', async () => {
    const runtime = new ManagedOllamaRuntime(await temporaryDataDir(), 'http://127.0.0.1:11434', {
      platform: 'win32',
      arch: 'x64',
    });
    expect(runtime.getStatus()).toMatchObject({
      installed: false,
      targetVersion: '0.32.0',
      version: null,
    });
  });
});

describe('ManagedOllamaRuntime', () => {
  it('downloads, verifies, extracts, and records an official runtime atomically', async () => {
    const bytes = Buffer.from('trusted fixture archive');
    const dataDir = await temporaryDataDir();
    const fetchImpl = vi.fn(async () => new Response(bytes, {
      status: 200,
      headers: { 'content-length': String(bytes.length) },
    }));
    const extractArchive = vi.fn(async (_archive: string, destination: string) => {
      await mkdir(path.join(destination, 'bin'), { recursive: true });
      await writeFile(path.join(destination, 'bin', 'ollama.exe'), 'fixture executable');
    });
    const runtime = new ManagedOllamaRuntime(dataDir, 'http://127.0.0.1:11434', {
      artifact: fixtureArtifact(bytes),
      fetchImpl: fetchImpl as typeof fetch,
      extractArchive,
      probe: async () => false,
    });

    const result = await runtime.install();

    expect(result.installedNow).toBe(true);
    expect(result.executable).toMatch(/test-1\.0\.0[\\/]bin[\\/]ollama\.exe$/);
    expect(existsSync(result.executable)).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(extractArchive).toHaveBeenCalledTimes(1);
    const metadata = JSON.parse(await readFile(path.join(dataDir, 'runtimes', 'ollama', 'test-1.0.0', 'install.json'), 'utf8'));
    expect(metadata).toMatchObject({
      version: 'test-1.0.0',
      sha256: fixtureArtifact(bytes).sha256,
      executable: path.join('bin', 'ollama.exe'),
    });
    expect(runtime.getStatus()).toMatchObject({
      supported: true,
      installed: true,
      downloadRequired: false,
      dockerRequired: false,
    });
  });

  it('rejects a byte-perfect-size archive when its checksum is wrong and leaves no install', async () => {
    const bytes = Buffer.from('tampered fixture archive');
    const dataDir = await temporaryDataDir();
    const runtime = new ManagedOllamaRuntime(dataDir, 'http://127.0.0.1:11434', {
      artifact: fixtureArtifact(bytes, '0'.repeat(64)),
      fetchImpl: (async () => new Response(bytes, {
        status: 200,
        headers: { 'content-length': String(bytes.length) },
      })) as typeof fetch,
      extractArchive: vi.fn(),
      probe: async () => false,
    });

    await expect(runtime.install()).rejects.toThrow(/checksum verification failed/i);
    expect(runtime.getStatus().installed).toBe(false);
    expect(existsSync(path.join(dataDir, 'runtimes', 'ollama', 'test-1.0.0'))).toBe(false);
  });

  it('deduplicates concurrent installation requests', async () => {
    const bytes = Buffer.from('one download only');
    const dataDir = await temporaryDataDir();
    const fetchImpl = vi.fn(async () => new Response(bytes, {
      status: 200,
      headers: { 'content-length': String(bytes.length) },
    }));
    const runtime = new ManagedOllamaRuntime(dataDir, 'http://127.0.0.1:11434', {
      artifact: fixtureArtifact(bytes),
      fetchImpl: fetchImpl as typeof fetch,
      extractArchive: async (_archive, destination) => {
        await writeFile(path.join(destination, 'ollama.exe'), 'fixture executable');
      },
      probe: async () => false,
    });

    const [first, second] = await Promise.all([runtime.install(), runtime.install()]);
    expect(first.executable).toBe(second.executable);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('starts the verified executable without a shell and waits for loopback health', async () => {
    const bytes = Buffer.from('startable fixture');
    const dataDir = await temporaryDataDir();
    const child = Object.assign(new EventEmitter(), {
      exitCode: null as number | null,
      connected: true,
      send: vi.fn(() => {
        child.exitCode = 0;
        queueMicrotask(() => child.emit('exit', 0, null));
        return true;
      }),
      kill: vi.fn(() => true),
    });
    const spawnImpl = vi.fn(() => child as never);
    let probes = 0;
    const runtime = new ManagedOllamaRuntime(dataDir, 'http://127.0.0.1:11434', {
      artifact: fixtureArtifact(bytes),
      fetchImpl: (async () => new Response(bytes, {
        status: 200,
        headers: { 'content-length': String(bytes.length) },
      })) as typeof fetch,
      extractArchive: async (_archive, destination) => {
        await writeFile(path.join(destination, 'ollama.exe'), 'fixture executable');
      },
      spawnImpl,
      probe: async () => ++probes >= 3,
    });

    const ready = await runtime.ensureReady();

    expect(ready).toMatchObject({ installedNow: true, startedNow: true, endpoint: 'http://127.0.0.1:11434' });
    expect(spawnImpl).toHaveBeenCalledWith(process.execPath, [
      '-e',
      MANAGED_OLLAMA_WATCHDOG_SOURCE,
      expect.stringMatching(/ollama\.exe$/),
      JSON.stringify(['serve']),
    ], expect.objectContaining({
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    }));
    expect(spawnImpl.mock.calls[0]?.[2]?.env).toMatchObject({
      OLLAMA_HOST: '127.0.0.1:11434',
      OLLAMA_NOHISTORY: '1',
    });
    await runtime.stop();
    expect(child.send).toHaveBeenCalledWith('shutdown');
    expect(child.kill).not.toHaveBeenCalled();
  });

  it('surfaces a watchdog spawn error instead of crashing the sidecar', async () => {
    const bytes = Buffer.from('blocked fixture');
    const dataDir = await temporaryDataDir();
    const child = Object.assign(new EventEmitter(), {
      exitCode: null as number | null,
      connected: false,
      kill: vi.fn(() => true),
    });
    const runtime = new ManagedOllamaRuntime(dataDir, 'http://127.0.0.1:11434', {
      artifact: fixtureArtifact(bytes),
      fetchImpl: (async () => new Response(bytes, {
        status: 200,
        headers: { 'content-length': String(bytes.length) },
      })) as typeof fetch,
      extractArchive: async (_archive, destination) => {
        await writeFile(path.join(destination, 'ollama.exe'), 'fixture executable');
      },
      spawnImpl: () => {
        queueMicrotask(() => child.emit('error', new Error('blocked by quarantine')));
        return child as never;
      },
      probe: async () => false,
    });

    await expect(runtime.ensureReady()).rejects.toThrow(/blocked by quarantine/i);
    expect(runtime.getStatus().running).toBe(false);
  });

  it('kills the runtime process when an abruptly terminated sidecar loses its IPC handle', async () => {
    const dataDir = await temporaryDataDir();
    const pidFile = path.join(dataDir, 'runtime.pid');
    const childProgram = `
      const fs = require('node:fs');
      fs.writeFileSync(process.argv[1], String(process.pid));
      setInterval(() => {}, 1000);
    `;
    const sidecarProgram = `
      const { spawn } = require('node:child_process');
      const fs = require('node:fs');
      const watchdogSource = Buffer.from(process.argv[1], 'base64').toString('utf8');
      const childProgram = Buffer.from(process.argv[2], 'base64').toString('utf8');
      const pidFile = process.argv[3];
      const watchdog = spawn(process.execPath, [
        '-e', watchdogSource, process.execPath, JSON.stringify(['-e', childProgram, pidFile]),
      ], { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
      watchdog.on('message', (message) => {
        if (message?.type !== 'spawned') return;
        const timer = setInterval(() => {
          if (!fs.existsSync(pidFile)) return;
          clearInterval(timer);
          process.exit(0);
        }, 20);
      });
      setTimeout(() => process.exit(2), 5000).unref();
    `;
    const sidecar = spawn(process.execPath, [
      '-e',
      sidecarProgram,
      Buffer.from(MANAGED_OLLAMA_WATCHDOG_SOURCE).toString('base64'),
      Buffer.from(childProgram).toString('base64'),
      pidFile,
    ], { windowsHide: true, stdio: 'ignore' });

    const sidecarCode = await new Promise<number | null>((resolve, reject) => {
      sidecar.once('error', reject);
      sidecar.once('exit', (code) => resolve(code));
    });
    expect(sidecarCode).toBe(0);
    const runtimePid = Number.parseInt(await readFile(pidFile, 'utf8'), 10);
    expect(runtimePid).toBeGreaterThan(0);

    const deadline = Date.now() + 5_000;
    let alive = true;
    while (alive && Date.now() < deadline) {
      try {
        process.kill(runtimePid, 0);
        await new Promise((resolve) => setTimeout(resolve, 50));
      } catch {
        alive = false;
      }
    }
    if (alive) {
      try { process.kill(runtimePid); } catch { /* already gone */ }
    }
    expect(alive).toBe(false);
  }, 15_000);
});
