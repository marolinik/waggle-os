import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
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

function installVersionKey(version = 'test-1.0.0'): string {
  return createHash('sha256').update(version).digest('hex');
}

function installCoordinatorPath(dataDir: string, version = 'test-1.0.0'): string {
  return path.join(dataDir, 'runtimes', 'ollama', `.install-lock-${installVersionKey(version)}.sqlite`);
}

async function expectNoInstallAttemptResidue(dataDir: string): Promise<void> {
  const entries = await readdir(path.join(dataDir, 'runtimes', 'ollama'));
  expect(entries.filter((entry) => entry.startsWith('.install-attempt-') || entry.endsWith('.part'))).toEqual([]);
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
  it('never downloads when asked to start an installed-only runtime that is missing', async () => {
    const bytes = Buffer.from('must not download');
    const fetchImpl = vi.fn();
    const runtime = new ManagedOllamaRuntime(
      await temporaryDataDir(),
      'http://127.0.0.1:11434',
      {
        artifact: fixtureArtifact(bytes),
        fetchImpl: fetchImpl as typeof fetch,
        probe: async () => false,
      },
    );

    await expect(runtime.startInstalled()).rejects.toThrow(/not installed/i);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(runtime.getStatus().installed).toBe(false);
  });

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

  it('serializes separate runtime instances behind one cross-process installation lock', async () => {
    const bytes = Buffer.from('cross-instance publication');
    const dataDir = await temporaryDataDir();
    const runtimeRoot = path.join(dataDir, 'runtimes', 'ollama');
    const invalidFinalDir = path.join(runtimeRoot, 'test-1.0.0');
    await mkdir(invalidFinalDir, { recursive: true });
    await writeFile(path.join(invalidFinalDir, 'install.json'), '{"invalid":true}');
    const fetchImpl = vi.fn(async () => new Response(bytes, {
      status: 200,
      headers: { 'content-length': String(bytes.length) },
    }));
    const destinations: string[] = [];
    let extractionStarted!: () => void;
    const started = new Promise<void>((resolve) => { extractionStarted = resolve; });
    let releaseExtraction!: () => void;
    const released = new Promise<void>((resolve) => { releaseExtraction = resolve; });
    const extractArchive = async (_archive: string, destination: string) => {
      destinations.push(destination);
      await writeFile(path.join(destination, 'ollama.exe'), 'fixture executable');
      extractionStarted();
      await released;
    };
    const dependencies = {
      artifact: fixtureArtifact(bytes),
      fetchImpl: fetchImpl as typeof fetch,
      extractArchive,
      probe: async () => false,
    };
    const firstRuntime = new ManagedOllamaRuntime(dataDir, 'http://127.0.0.1:11434', dependencies);
    const secondRuntime = new ManagedOllamaRuntime(dataDir, 'http://127.0.0.1:11434', dependencies);

    const firstInstall = firstRuntime.install();
    await started;
    const secondInstall = secondRuntime.install();
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    releaseExtraction();
    const results = await Promise.all([firstInstall, secondInstall]);

    expect(destinations).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(new Set(results.map((result) => result.executable)).size).toBe(1);
    expect(results.map((result) => Number(result.installedNow)).sort()).toEqual([0, 1]);
    expect(results.every((result) => existsSync(result.executable))).toBe(true);
    expect(firstRuntime.getStatus().installed).toBe(true);
    expect(secondRuntime.getStatus().installed).toBe(true);
    expect(await readdir(runtimeRoot)).toEqual([path.basename(installCoordinatorPath(dataDir)), 'test-1.0.0']);
    await expectNoInstallAttemptResidue(dataDir);
  });

  it('keeps live attempt files isolated while different runtime versions install concurrently', async () => {
    const firstBytes = Buffer.from('prerelease archive');
    const secondBytes = Buffer.from('stable archive');
    const dataDir = await temporaryDataDir();
    const firstArtifact = { ...fixtureArtifact(firstBytes), version: 'test-1.0.0-rc.1' };
    const secondArtifact = { ...fixtureArtifact(secondBytes), version: 'test-1.0.0' };
    let firstArchive = '';
    let firstExtractionStarted!: () => void;
    const extractionStarted = new Promise<void>((resolve) => { firstExtractionStarted = resolve; });
    let releaseFirstExtraction!: () => void;
    const extractionReleased = new Promise<void>((resolve) => { releaseFirstExtraction = resolve; });
    const firstRuntime = new ManagedOllamaRuntime(dataDir, 'http://127.0.0.1:11434', {
      artifact: firstArtifact,
      fetchImpl: (async () => new Response(firstBytes, {
        status: 200,
        headers: { 'content-length': String(firstBytes.length) },
      })) as typeof fetch,
      extractArchive: async (archive, destination) => {
        firstArchive = archive;
        firstExtractionStarted();
        await extractionReleased;
        await readFile(archive);
        await writeFile(path.join(destination, 'ollama.exe'), 'prerelease executable');
      },
      probe: async () => false,
    });
    const secondRuntime = new ManagedOllamaRuntime(dataDir, 'http://127.0.0.1:11434', {
      artifact: secondArtifact,
      fetchImpl: (async () => new Response(secondBytes, {
        status: 200,
        headers: { 'content-length': String(secondBytes.length) },
      })) as typeof fetch,
      extractArchive: async (archive, destination) => {
        await readFile(archive);
        await writeFile(path.join(destination, 'ollama.exe'), 'stable executable');
      },
      probe: async () => false,
    });

    const firstInstall = firstRuntime.install();
    await extractionStarted;
    const secondResult = await secondRuntime.install();
    const firstArchiveSurvived = existsSync(firstArchive);
    releaseFirstExtraction();
    const firstResult = await firstInstall;

    expect(firstArchiveSurvived).toBe(true);
    expect(firstResult.installedNow).toBe(true);
    expect(secondResult.installedNow).toBe(true);
    expect(existsSync(firstResult.executable)).toBe(true);
    expect(existsSync(secondResult.executable)).toBe(true);
    await expectNoInstallAttemptResidue(dataDir);
  });

  it('continues after a foreign installation coordinator process terminates', async () => {
    const bytes = Buffer.from('foreign process coordinator recovery');
    const dataDir = await temporaryDataDir();
    const runtimeRoot = path.join(dataDir, 'runtimes', 'ollama');
    await mkdir(runtimeRoot, { recursive: true });
    const versionKey = installVersionKey();
    const coordinator = spawn(process.execPath, ['-e', String.raw`
const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');
const database = new Database(process.argv[1], { timeout: 50 });
database.exec('BEGIN EXCLUSIVE');
fs.writeFileSync(path.join(process.argv[2], '.ollama-test.zip.' + process.argv[3] + '.crashed.part'), 'partial');
fs.mkdirSync(path.join(process.argv[2], '.install-attempt-' + process.argv[3] + '.crashed'));
if (process.send) process.send('locked');
process.on('message', (message) => { if (message === 'terminate') process.exit(99); });
setInterval(() => {}, 1000);
`, installCoordinatorPath(dataDir), runtimeRoot, versionKey], {
      cwd: process.cwd(),
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    const waitForCoordinatorExit = (): Promise<void> => {
      if (coordinator.exitCode !== null || coordinator.signalCode !== null) return Promise.resolve();
      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          coordinator.off('exit', onExit);
          reject(new Error('foreign coordinator did not exit within 2 seconds'));
        }, 2_000);
        const onExit = () => {
          clearTimeout(timeout);
          resolve();
        };
        coordinator.once('exit', onExit);
      });
    };

    try {
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          clearTimeout(timeout);
          coordinator.off('message', onMessage);
          coordinator.off('error', onError);
          coordinator.off('exit', onExit);
        };
        const onMessage = (message: unknown) => {
          if (message !== 'locked') return;
          cleanup();
          resolve();
        };
        const onError = (error: Error) => {
          cleanup();
          reject(error);
        };
        const onExit = (code: number | null) => {
          cleanup();
          reject(new Error(`foreign coordinator exited before acquiring the lock (${code})`));
        };
        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error('foreign coordinator did not acquire the lock'));
        }, 5_000);
        coordinator.on('message', onMessage);
        coordinator.once('error', onError);
        coordinator.once('exit', onExit);
      });
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
      const waitStartedAt = performance.now();
      const installation = runtime.install();
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(performance.now() - waitStartedAt).toBeLessThan(500);
      expect(fetchImpl).not.toHaveBeenCalled();
      const exited = waitForCoordinatorExit();
      coordinator.send('terminate');
      await exited;
      const result = await installation;

      expect(result.installedNow).toBe(true);
      expect(existsSync(result.executable)).toBe(true);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      await expectNoInstallAttemptResidue(dataDir);
    } finally {
      if (coordinator.exitCode === null && coordinator.signalCode === null) {
        const exited = waitForCoordinatorExit();
        coordinator.kill();
        await exited;
      }
    }
  });

  it('uses unique staging and archive paths across same-clock retry attempts', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_234_567_890);
    const bytes = Buffer.from('unique retry paths');
    const dataDir = await temporaryDataDir();
    const archives: string[] = [];
    const destinations: string[] = [];
    let extractionAttempts = 0;
    const runtime = new ManagedOllamaRuntime(dataDir, 'http://127.0.0.1:11434', {
      artifact: fixtureArtifact(bytes),
      fetchImpl: (async () => new Response(bytes, {
        status: 200,
        headers: { 'content-length': String(bytes.length) },
      })) as typeof fetch,
      extractArchive: async (archive, destination) => {
        archives.push(archive);
        destinations.push(destination);
        extractionAttempts += 1;
        if (extractionAttempts === 1) throw new Error('simulated extraction failure');
        await writeFile(path.join(destination, 'ollama.exe'), 'fixture executable');
      },
      probe: async () => false,
    });

    await expect(runtime.install()).rejects.toThrow('simulated extraction failure');
    const result = await runtime.install();

    expect(result.installedNow).toBe(true);
    expect(new Set(archives).size).toBe(2);
    expect(new Set(destinations).size).toBe(2);
  });

  it.each(['EPERM', 'EACCES', 'EBUSY'] as const)(
    'retries a transient Windows %s publication lock before succeeding',
    async (code) => {
      const bytes = Buffer.from(`transient publication lock ${code}`);
      const dataDir = await temporaryDataDir();
      const renameImpl = vi.fn(async (source: string, destination: string) => rename(source, destination))
        .mockRejectedValueOnce(Object.assign(new Error('locked'), { code }));
      const runtime = new ManagedOllamaRuntime(dataDir, 'http://127.0.0.1:11434', {
        artifact: fixtureArtifact(bytes),
        fetchImpl: (async () => new Response(bytes, {
          status: 200,
          headers: { 'content-length': String(bytes.length) },
        })) as typeof fetch,
        extractArchive: async (_archive, destination) => {
          await writeFile(path.join(destination, 'ollama.exe'), 'fixture executable');
        },
        renameImpl: renameImpl as typeof rename,
        probe: async () => false,
      });

      const result = await runtime.install();

      expect(result.installedNow).toBe(true);
      expect(renameImpl).toHaveBeenCalledTimes(2);
      expect(existsSync(result.executable)).toBe(true);
      await expectNoInstallAttemptResidue(dataDir);
    },
  );

  it('retries validation after a successful publish is temporarily unreadable', async () => {
    const bytes = Buffer.from('temporarily unreadable published metadata');
    const dataDir = await temporaryDataDir();
    const renameImpl = vi.fn(async (source: string, destination: string) => {
      await rename(source, destination);
      const metadata = path.join(destination, 'install.json');
      const hidden = path.join(destination, '.install.json.hidden');
      await rename(metadata, hidden);
      setTimeout(() => { void rename(hidden, metadata).catch(() => undefined); }, 40);
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
      renameImpl: renameImpl as typeof rename,
      probe: async () => false,
    });

    const result = await runtime.install();

    expect(result.installedNow).toBe(true);
    expect(renameImpl).toHaveBeenCalledTimes(1);
    expect(existsSync(result.executable)).toBe(true);
  });

  it('bounds persistent publication-lock retries and removes attempt residue', async () => {
    const bytes = Buffer.from('persistent publication lock');
    const dataDir = await temporaryDataDir();
    const locked = Object.assign(new Error('persistently locked'), { code: 'EBUSY' });
    const renameImpl = vi.fn(async () => { throw locked; });
    const runtime = new ManagedOllamaRuntime(dataDir, 'http://127.0.0.1:11434', {
      artifact: fixtureArtifact(bytes),
      fetchImpl: (async () => new Response(bytes, {
        status: 200,
        headers: { 'content-length': String(bytes.length) },
      })) as typeof fetch,
      extractArchive: async (_archive, destination) => {
        await writeFile(path.join(destination, 'ollama.exe'), 'fixture executable');
      },
      renameImpl: renameImpl as typeof rename,
      probe: async () => false,
    });

    await expect(runtime.install()).rejects.toBe(locked);
    expect(renameImpl).toHaveBeenCalledTimes(4);
    expect(existsSync(path.join(dataDir, 'runtimes', 'ollama', 'test-1.0.0'))).toBe(false);
    await expectNoInstallAttemptResidue(dataDir);
  });

  it('never accepts a concurrently published directory unless its metadata and executable validate', async () => {
    const bytes = Buffer.from('invalid publication winner');
    const dataDir = await temporaryDataDir();
    const renameImpl = vi.fn(async (_source: string, destination: string) => {
      await mkdir(destination, { recursive: true });
      await writeFile(path.join(destination, 'ollama.exe'), 'untrusted executable');
      await writeFile(path.join(destination, 'install.json'), JSON.stringify({
        version: 'test-1.0.0',
        sha256: '0'.repeat(64),
        executable: 'ollama.exe',
        installedAt: new Date().toISOString(),
      }));
      throw Object.assign(new Error('occupied by invalid install'), { code: 'EEXIST' });
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
      renameImpl: renameImpl as typeof rename,
      probe: async () => false,
    });

    await expect(runtime.install()).rejects.toThrow('occupied by invalid install');
    expect(renameImpl).toHaveBeenCalledTimes(1);
    expect(runtime.getStatus().installed).toBe(false);
  });

  it('keeps a verified install available when artifact cleanup exhausts retries', async () => {
    const bytes = Buffer.from('cleanup failure after success');
    const dataDir = await temporaryDataDir();
    const cleanupError = Object.assign(new Error('scanner holds archive'), { code: 'EPERM' });
    const warn = vi.fn();
    const rmImpl = vi.fn(async (target: string, options: { recursive?: boolean; force?: boolean }) => {
      if (target.endsWith('.part')) throw cleanupError;
      await rm(target, options);
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
      rmImpl: rmImpl as typeof rm,
      warn,
      probe: async () => false,
    });

    const result = await runtime.install();

    expect(result.installedNow).toBe(true);
    expect(existsSync(result.executable)).toBe(true);
    expect(rmImpl).toHaveBeenCalledTimes(5);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toMatch(/install artifact .*\.part/i);
  });

  it('preserves the primary verification error when cleanup also fails', async () => {
    const bytes = Buffer.from('primary and cleanup failure');
    const dataDir = await temporaryDataDir();
    const cleanupError = Object.assign(new Error('scanner holds attempt files'), { code: 'EBUSY' });
    const warn = vi.fn();
    const rmImpl = vi.fn(async () => { throw cleanupError; });
    const runtime = new ManagedOllamaRuntime(dataDir, 'http://127.0.0.1:11434', {
      artifact: fixtureArtifact(bytes, '0'.repeat(64)),
      fetchImpl: (async () => new Response(bytes, {
        status: 200,
        headers: { 'content-length': String(bytes.length) },
      })) as typeof fetch,
      extractArchive: vi.fn(),
      rmImpl: rmImpl as typeof rm,
      warn,
      probe: async () => false,
    });

    await expect(runtime.install()).rejects.toThrow(/checksum verification failed/i);
    expect(warn).toHaveBeenCalledTimes(2);
    const successor = new ManagedOllamaRuntime(dataDir, 'http://127.0.0.1:11434', {
      artifact: fixtureArtifact(bytes),
      fetchImpl: (async () => new Response(bytes, {
        status: 200,
        headers: { 'content-length': String(bytes.length) },
      })) as typeof fetch,
      extractArchive: async (_archive, destination) => {
        await writeFile(path.join(destination, 'ollama.exe'), 'fixture executable');
      },
      probe: async () => false,
    });
    expect((await successor.install()).installedNow).toBe(true);
    await expectNoInstallAttemptResidue(dataDir);
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
