import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ManagedRuntimeRollbackError,
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

function versionedFixtureArtifact(version: string, bytes: Buffer): OllamaRuntimeArtifact {
  return {
    ...fixtureArtifact(bytes),
    version,
    url: `https://github.com/ollama/ollama/releases/download/v${version}/ollama-test.zip`,
  };
}

function runtimeProcessHarness(failingVersions: ReadonlySet<string> = new Set()) {
  let healthyVersion: string | null = null;
  let liveChildren = 0;
  let maximumLiveChildren = 0;
  const startedVersions: string[] = [];
  const spawnImpl = vi.fn((_file: string, args: readonly string[]) => {
    const executable = args[2] ?? '';
    const version = executable.split(/[\\/]/).at(-2) ?? 'unknown';
    startedVersions.push(version);
    const fails = failingVersions.has(version);
    liveChildren += 1;
    maximumLiveChildren = Math.max(maximumLiveChildren, liveChildren);
    const child = Object.assign(new EventEmitter(), {
      exitCode: fails ? 1 : null as number | null,
      connected: true,
      send: vi.fn(() => {
        if (child.exitCode === null) child.exitCode = 0;
        if (healthyVersion === version) healthyVersion = null;
        liveChildren = Math.max(0, liveChildren - 1);
        queueMicrotask(() => child.emit('exit', child.exitCode, null));
        return true;
      }),
      kill: vi.fn(() => {
        if (child.exitCode === null) child.exitCode = 1;
        if (healthyVersion === version) healthyVersion = null;
        liveChildren = Math.max(0, liveChildren - 1);
        queueMicrotask(() => child.emit('exit', child.exitCode, null));
        return true;
      }),
    });
    if (fails) {
      liveChildren = Math.max(0, liveChildren - 1);
    } else {
      healthyVersion = version;
    }
    return child as never;
  });
  return {
    spawnImpl,
    probe: async () => healthyVersion !== null,
    get healthyVersion() { return healthyVersion; },
    get maximumLiveChildren() { return maximumLiveChildren; },
    startedVersions,
  };
}

function crashRecoveryProcessHarness() {
  let endpointHealthy = false;
  let liveChildren = 0;
  let maximumLiveChildren = 0;
  let nextStopExitCode = 0;
  const children: Array<EventEmitter & {
    exitCode: number | null;
    connected: boolean;
    pid: number;
    send: ReturnType<typeof vi.fn>;
    kill: ReturnType<typeof vi.fn>;
  }> = [];
  const spawnImpl = vi.fn(() => {
    liveChildren += 1;
    maximumLiveChildren = Math.max(maximumLiveChildren, liveChildren);
    endpointHealthy = true;
    const child = Object.assign(new EventEmitter(), {
      exitCode: null as number | null,
      connected: true,
      pid: 51_000 + children.length,
      send: vi.fn(() => {
        if (child.exitCode !== null) return false;
        const exitCode = nextStopExitCode;
        nextStopExitCode = 0;
        child.exitCode = exitCode;
        endpointHealthy = false;
        liveChildren -= 1;
        queueMicrotask(() => child.emit('exit', exitCode, null));
        return true;
      }),
      kill: vi.fn(() => true),
    });
    children.push(child);
    return child as never;
  });
  return {
    spawnImpl,
    probe: async () => endpointHealthy,
    endpointQuiescent: async () => !endpointHealthy,
    crashOwnedDaemon(endpointRemainsOccupied = false) {
      const child = children.at(-1);
      if (!child || child.exitCode !== null) throw new Error('No live owned daemon to crash');
      child.exitCode = 2;
      endpointHealthy = endpointRemainsOccupied;
      liveChildren -= 1;
      child.emit('exit', 2, null);
    },
    exitUnexpectedlyOnNextStop() { nextStopExitCode = 2; },
    releaseOccupiedEndpoint() { endpointHealthy = false; },
    get liveChildren() { return liveChildren; },
    get maximumLiveChildren() { return maximumLiveChildren; },
  };
}

async function seedActiveRuntime(
  dataDir: string,
  artifact: OllamaRuntimeArtifact,
  bytes: Buffer,
  artifactCatalog: ReadonlyArray<OllamaRuntimeArtifact>,
): Promise<void> {
  const processes = runtimeProcessHarness();
  const runtime = new ManagedOllamaRuntime(dataDir, 'http://127.0.0.1:11434', {
    artifact,
    artifactCatalog,
    fetchImpl: (async () => new Response(bytes, {
      status: 200,
      headers: { 'content-length': String(bytes.length) },
    })) as typeof fetch,
    extractArchive: async (_archive, destination) => {
      await writeFile(path.join(destination, 'ollama.exe'), `${artifact.version} executable`);
    },
    spawnImpl: processes.spawnImpl,
    probe: processes.probe,
  });
  await runtime.ensureReady();
  await runtime.stop();
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

  it('promotes a healthy upgrade atomically and restarts only the persisted active version', async () => {
    const dataDir = await temporaryDataDir();
    const firstBytes = Buffer.from('trusted runtime N');
    const nextBytes = Buffer.from('trusted runtime N plus 1');
    const firstArtifact = versionedFixtureArtifact('test-1.0.0', firstBytes);
    const nextArtifact = versionedFixtureArtifact('test-2.0.0', nextBytes);
    const artifactCatalog = [firstArtifact, nextArtifact];
    const processes = runtimeProcessHarness();
    const dependencies = (artifact: OllamaRuntimeArtifact, bytes: Buffer) => ({
      artifact,
      artifactCatalog,
      fetchImpl: (async () => new Response(bytes, {
        status: 200,
        headers: { 'content-length': String(bytes.length) },
      })) as typeof fetch,
      extractArchive: async (_archive: string, destination: string) => {
        await writeFile(path.join(destination, 'ollama.exe'), `${artifact.version} executable`);
      },
      spawnImpl: processes.spawnImpl,
      probe: processes.probe,
    });

    const firstRuntime = new ManagedOllamaRuntime(
      dataDir,
      'http://127.0.0.1:11434',
      dependencies(firstArtifact, firstBytes),
    );
    expect((await firstRuntime.ensureReady()).status).toMatchObject({
      activeVersion: 'test-1.0.0',
      previousVersion: null,
      fallbackActive: false,
    });
    await firstRuntime.stop();

    const upgradedRuntime = new ManagedOllamaRuntime(
      dataDir,
      'http://127.0.0.1:11434',
      dependencies(nextArtifact, nextBytes),
    );
    expect((await upgradedRuntime.ensureReady()).status).toMatchObject({
      targetInstalled: true,
      activeVersion: 'test-2.0.0',
      previousVersion: 'test-1.0.0',
      fallbackActive: false,
      rollback: { available: true, active: false, lastAttempt: null },
    });
    await upgradedRuntime.stop();

    const restartedRuntime = new ManagedOllamaRuntime(
      dataDir,
      'http://127.0.0.1:11434',
      dependencies(nextArtifact, nextBytes),
    );
    expect((await restartedRuntime.startInstalled()).status).toMatchObject({
      activeVersion: 'test-2.0.0',
      previousVersion: 'test-1.0.0',
      fallbackActive: false,
    });
    expect(processes.startedVersions).toEqual(['test-1.0.0', 'test-2.0.0', 'test-2.0.0']);
    await restartedRuntime.stop();
  });

  it('promotes only after the default generation-capable tags probe succeeds', async () => {
    const dataDir = await temporaryDataDir();
    const bytes = Buffer.from('default readiness probe runtime');
    const artifact = versionedFixtureArtifact('test-1.0.0', bytes);
    let spawned = false;
    const probeUrls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      probeUrls.push(String(input));
      return spawned
        ? new Response(JSON.stringify({ models: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
        : new Response('not ready', { status: 503 });
    });
    const child = Object.assign(new EventEmitter(), {
      exitCode: null as number | null,
      connected: true,
      pid: 42_001,
      send: vi.fn(() => {
        child.exitCode = 0;
        queueMicrotask(() => child.emit('exit', 0, null));
        return true;
      }),
      kill: vi.fn(() => true),
    });
    const spawnImpl = vi.fn(() => {
      spawned = true;
      return child as never;
    });
    const download = vi.fn(async () => new Response(bytes, {
      status: 200,
      headers: { 'content-length': String(bytes.length) },
    }));
    const runtime = new ManagedOllamaRuntime(dataDir, 'http://127.0.0.1:11434', {
      artifact,
      artifactCatalog: [artifact],
      fetchImpl: download as typeof fetch,
      extractArchive: async (_archive, destination) => {
        await writeFile(path.join(destination, 'ollama.exe'), 'probe-ready executable');
      },
      spawnImpl,
    });

    const ready = await runtime.ensureReady();

    expect(download).toHaveBeenCalledOnce();
    expect(spawnImpl).toHaveBeenCalledOnce();
    expect(probeUrls.length).toBeGreaterThanOrEqual(3);
    expect(probeUrls.every((url) => url === 'http://127.0.0.1:11434/api/tags')).toBe(true);
    expect(probeUrls.some((url) => url.endsWith('/api/version'))).toBe(false);
    expect(ready.status).toMatchObject({
      activeVersion: 'test-1.0.0',
      running: true,
      fallbackActive: false,
    });
    await runtime.stop();
  });

  it('serializes a concurrent readiness call until a failed activation rename has restored the prior runtime', async () => {
    const dataDir = await temporaryDataDir();
    const firstBytes = Buffer.from('trusted concurrent runtime N');
    const nextBytes = Buffer.from('trusted concurrent runtime N plus 1');
    const firstArtifact = versionedFixtureArtifact('test-1.0.0', firstBytes);
    const nextArtifact = versionedFixtureArtifact('test-2.0.0', nextBytes);
    const artifactCatalog = [firstArtifact, nextArtifact];
    const firstProcesses = runtimeProcessHarness();
    const firstRuntime = new ManagedOllamaRuntime(dataDir, 'http://127.0.0.1:11434', {
      artifact: firstArtifact,
      artifactCatalog,
      fetchImpl: (async () => new Response(firstBytes, {
        status: 200,
        headers: { 'content-length': String(firstBytes.length) },
      })) as typeof fetch,
      extractArchive: async (_archive, destination) => {
        await writeFile(path.join(destination, 'ollama.exe'), 'runtime N executable');
      },
      spawnImpl: firstProcesses.spawnImpl,
      probe: firstProcesses.probe,
    });
    await firstRuntime.ensureReady();
    await firstRuntime.stop();

    let renameEntered!: () => void;
    const enteredRename = new Promise<void>((resolve) => { renameEntered = resolve; });
    let releaseRename!: () => void;
    const renameReleased = new Promise<void>((resolve) => { releaseRename = resolve; });
    let stateRenameCalls = 0;
    const stateRenameImpl = vi.fn(async (source: string, destination: string) => {
      stateRenameCalls += 1;
      if (stateRenameCalls === 1) {
        renameEntered();
        await renameReleased;
        throw new Error('simulated activation-state rename failure');
      }
      await rename(source, destination);
    });
    const processes = runtimeProcessHarness();
    const upgradedRuntime = new ManagedOllamaRuntime(dataDir, 'http://127.0.0.1:11434', {
      artifact: nextArtifact,
      artifactCatalog,
      fetchImpl: (async () => new Response(nextBytes, {
        status: 200,
        headers: { 'content-length': String(nextBytes.length) },
      })) as typeof fetch,
      extractArchive: async (_archive, destination) => {
        await writeFile(path.join(destination, 'ollama.exe'), 'runtime N plus 1 executable');
      },
      spawnImpl: processes.spawnImpl,
      probe: processes.probe,
      stateRenameImpl: stateRenameImpl as typeof rename,
    });

    const firstActivation = upgradedRuntime.ensureReady().then(
      (value) => ({ fulfilled: true as const, value }),
      (error: unknown) => ({ fulfilled: false as const, error }),
    );
    await enteredRename;
    let secondSettled = false;
    const secondActivation = upgradedRuntime.ensureReady().finally(() => { secondSettled = true; });
    await new Promise((resolve) => setTimeout(resolve, 25));
    const settledBeforeRenameRelease = secondSettled;
    releaseRename();

    const firstResult = await firstActivation;
    const secondResult = await secondActivation;

    expect(settledBeforeRenameRelease).toBe(false);
    expect(firstResult.fulfilled).toBe(false);
    expect(firstResult.fulfilled ? null : firstResult.error).toBeInstanceOf(ManagedRuntimeRollbackError);
    expect(processes.startedVersions).toEqual(['test-2.0.0', 'test-1.0.0']);
    expect(stateRenameImpl).toHaveBeenCalledTimes(2);
    expect(secondResult).toMatchObject({
      installedNow: false,
      startedNow: false,
      status: {
        targetInstalled: true,
        activeVersion: 'test-1.0.0',
        fallbackActive: true,
        rollback: {
          active: true,
          lastAttempt: {
            failedVersion: 'test-2.0.0',
            restoredVersion: 'test-1.0.0',
            reason: 'simulated activation-state rename failure',
          },
        },
      },
    });
    const persistedState = JSON.parse(await readFile(
      path.join(dataDir, 'runtimes', 'ollama', 'runtime-state.json'),
      'utf8',
    ));
    expect(persistedState).toMatchObject({
      active: { version: 'test-1.0.0' },
      lastRollback: {
        failedVersion: 'test-2.0.0',
        restoredVersion: 'test-1.0.0',
      },
    });
    await upgradedRuntime.stop();
  });

  it('serializes distinct runtime instances across a delayed failed activation rename', async () => {
    const dataDir = await temporaryDataDir();
    const firstBytes = Buffer.from('trusted cross-instance runtime N');
    const nextBytes = Buffer.from('trusted cross-instance runtime N plus 1');
    const firstArtifact = versionedFixtureArtifact('test-1.0.0', firstBytes);
    const nextArtifact = versionedFixtureArtifact('test-2.0.0', nextBytes);
    const artifactCatalog = [firstArtifact, nextArtifact];
    await seedActiveRuntime(dataDir, firstArtifact, firstBytes, artifactCatalog);

    let renameEntered!: () => void;
    const enteredRename = new Promise<void>((resolve) => { renameEntered = resolve; });
    let releaseRename!: () => void;
    const renameReleased = new Promise<void>((resolve) => { releaseRename = resolve; });
    let stateRenameCalls = 0;
    const delayedStateRename = vi.fn(async (source: string, destination: string) => {
      stateRenameCalls += 1;
      if (stateRenameCalls === 1) {
        renameEntered();
        await renameReleased;
        throw new Error('simulated cross-instance activation rename failure');
      }
      await rename(source, destination);
    });
    const processes = runtimeProcessHarness();
    const dependencies = {
      artifact: nextArtifact,
      artifactCatalog,
      fetchImpl: (async () => new Response(nextBytes, {
        status: 200,
        headers: { 'content-length': String(nextBytes.length) },
      })) as typeof fetch,
      extractArchive: async (_archive: string, destination: string) => {
        await writeFile(path.join(destination, 'ollama.exe'), 'runtime N plus 1 executable');
      },
      spawnImpl: processes.spawnImpl,
      probe: processes.probe,
    };
    const firstInstance = new ManagedOllamaRuntime(dataDir, 'http://127.0.0.1:11434', {
      ...dependencies,
      stateRenameImpl: delayedStateRename as typeof rename,
    });
    const secondInstance = new ManagedOllamaRuntime(
      dataDir,
      'http://127.0.0.1:11434',
      dependencies,
    );

    const firstActivation = firstInstance.ensureReady().then(
      (value) => ({ fulfilled: true as const, value }),
      (error: unknown) => ({ fulfilled: false as const, error }),
    );
    await enteredRename;
    let secondSettled = false;
    const secondActivation = secondInstance.ensureReady().finally(() => { secondSettled = true; });
    await new Promise((resolve) => setTimeout(resolve, 25));
    const settledBeforeRenameRelease = secondSettled;
    releaseRename();

    const firstResult = await firstActivation;
    const secondResult = await secondActivation;

    expect(settledBeforeRenameRelease).toBe(false);
    expect(firstResult.fulfilled).toBe(false);
    expect(firstResult.fulfilled ? null : firstResult.error).toBeInstanceOf(ManagedRuntimeRollbackError);
    expect(processes.startedVersions).toEqual(['test-2.0.0', 'test-1.0.0']);
    expect(secondResult).toMatchObject({
      installedNow: false,
      startedNow: false,
      status: {
        activeVersion: 'test-1.0.0',
        fallbackActive: true,
        rollback: {
          active: true,
          lastAttempt: {
            failedVersion: 'test-2.0.0',
            restoredVersion: 'test-1.0.0',
            reason: 'simulated cross-instance activation rename failure',
          },
        },
      },
    });
    await firstInstance.stop();
    await secondInstance.stop();
  });

  it('restores the persisted previous runtime when the active runtime fails its startInstalled health probe', async () => {
    const dataDir = await temporaryDataDir();
    const firstBytes = Buffer.from('trusted persisted runtime N');
    const nextBytes = Buffer.from('trusted persisted runtime N plus 1');
    const firstArtifact = versionedFixtureArtifact('test-1.0.0', firstBytes);
    const nextArtifact = versionedFixtureArtifact('test-2.0.0', nextBytes);
    const artifactCatalog = [firstArtifact, nextArtifact];
    await seedActiveRuntime(dataDir, firstArtifact, firstBytes, artifactCatalog);
    await seedActiveRuntime(dataDir, nextArtifact, nextBytes, artifactCatalog);
    const processes = runtimeProcessHarness();
    let targetProbeFailed = false;
    const restartedRuntime = new ManagedOllamaRuntime(dataDir, 'http://127.0.0.1:11434', {
      artifact: nextArtifact,
      artifactCatalog,
      spawnImpl: processes.spawnImpl,
      probe: async () => {
        if (processes.healthyVersion === nextArtifact.version && !targetProbeFailed) {
          targetProbeFailed = true;
          throw new Error('persisted target health probe failed');
        }
        return processes.probe();
      },
    });

    let failure: unknown;
    try {
      await restartedRuntime.startInstalled();
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(ManagedRuntimeRollbackError);
    expect((failure as ManagedRuntimeRollbackError).rollback).toMatchObject({
      failedVersion: 'test-2.0.0',
      restoredVersion: 'test-1.0.0',
    });
    expect(processes.startedVersions).toEqual(['test-2.0.0', 'test-1.0.0']);
    expect(restartedRuntime.getStatus()).toMatchObject({
      running: true,
      activeVersion: 'test-1.0.0',
      previousVersion: 'test-2.0.0',
      fallbackActive: true,
      rollback: {
        active: true,
        lastAttempt: {
          failedVersion: 'test-2.0.0',
          restoredVersion: 'test-1.0.0',
        },
      },
    });
    await restartedRuntime.stop();
  });

  it('restarts exactly once after the watchdog confirms its owned daemon exited', async () => {
    const dataDir = await temporaryDataDir();
    const bytes = Buffer.from('trusted crash recovery runtime');
    const processes = crashRecoveryProcessHarness();
    const runtime = new ManagedOllamaRuntime(dataDir, 'http://127.0.0.1:11434', {
      artifact: fixtureArtifact(bytes),
      fetchImpl: (async () => new Response(bytes, {
        status: 200,
        headers: { 'content-length': String(bytes.length) },
      })) as typeof fetch,
      extractArchive: async (_archive, destination) => {
        await writeFile(path.join(destination, 'ollama.exe'), 'fixture executable');
      },
      spawnImpl: processes.spawnImpl,
      probe: processes.probe,
      endpointQuiescent: processes.endpointQuiescent,
    });
    await runtime.ensureReady();

    processes.crashOwnedDaemon();
    await vi.waitFor(() => expect(processes.spawnImpl).toHaveBeenCalledTimes(2));
    const stable = await Promise.all([
      runtime.startInstalled(),
      runtime.startInstalled(),
    ]);

    expect(stable.map((result) => result.installedNow)).toEqual([false, false]);
    expect(stable.map((result) => result.startedNow)).toEqual([false, false]);
    expect(processes.spawnImpl).toHaveBeenCalledTimes(2);
    expect(processes.maximumLiveChildren).toBe(1);
    expect(processes.liveChildren).toBe(1);
    expect(runtime.getStatus()).toMatchObject({ running: true, activeVersion: 'test-1.0.0' });

    processes.crashOwnedDaemon();
    await new Promise((resolve) => queueMicrotask(resolve));
    await expect(runtime.startInstalled()).rejects.toThrow(/one recovery attempt/i);
    expect(processes.spawnImpl).toHaveBeenCalledTimes(2);
    expect(processes.liveChildren).toBe(0);
  });

  it('does not spawn a third daemon when the recovered daemon crashes during a readiness probe', async () => {
    const dataDir = await temporaryDataDir();
    const bytes = Buffer.from('trusted second crash probe runtime');
    const processes = crashRecoveryProcessHarness();
    let induceSecondCrash = false;
    let raceProbeCalls = 0;
    const runtime = new ManagedOllamaRuntime(dataDir, 'http://127.0.0.1:11434', {
      artifact: fixtureArtifact(bytes),
      fetchImpl: (async () => new Response(bytes, {
        status: 200,
        headers: { 'content-length': String(bytes.length) },
      })) as typeof fetch,
      extractArchive: async (_archive, destination) => {
        await writeFile(path.join(destination, 'ollama.exe'), 'fixture executable');
      },
      spawnImpl: processes.spawnImpl,
      probe: async () => {
        if (induceSecondCrash) {
          raceProbeCalls += 1;
          if (raceProbeCalls === 1) return false;
          if (raceProbeCalls === 2) {
            processes.crashOwnedDaemon();
            return false;
          }
        }
        return processes.probe();
      },
      endpointQuiescent: processes.endpointQuiescent,
    });
    await runtime.ensureReady();
    processes.crashOwnedDaemon();
    await vi.waitFor(() => expect(processes.spawnImpl).toHaveBeenCalledTimes(2));

    induceSecondCrash = true;
    await expect(runtime.startInstalled()).rejects.toThrow(/one recovery attempt/i);

    expect(processes.spawnImpl).toHaveBeenCalledTimes(2);
    expect(processes.maximumLiveChildren).toBe(1);
    expect(processes.liveChildren).toBe(0);
  });

  it('serializes queued recovery before a concurrent readiness check and stop', async () => {
    const dataDir = await temporaryDataDir();
    const bytes = Buffer.from('trusted recovery stop queue runtime');
    const processes = crashRecoveryProcessHarness();
    const runtime = new ManagedOllamaRuntime(dataDir, 'http://127.0.0.1:11434', {
      artifact: fixtureArtifact(bytes),
      fetchImpl: (async () => new Response(bytes, {
        status: 200,
        headers: { 'content-length': String(bytes.length) },
      })) as typeof fetch,
      extractArchive: async (_archive, destination) => {
        await writeFile(path.join(destination, 'ollama.exe'), 'fixture executable');
      },
      spawnImpl: processes.spawnImpl,
      probe: processes.probe,
      endpointQuiescent: processes.endpointQuiescent,
    });
    await runtime.ensureReady();

    processes.crashOwnedDaemon();
    const readiness = runtime.startInstalled();
    const stopping = runtime.stop();
    const [readyResult] = await Promise.all([readiness, stopping]);

    expect(readyResult.startedNow).toBe(false);
    expect(processes.spawnImpl).toHaveBeenCalledTimes(2);
    expect(processes.maximumLiveChildren).toBe(1);
    expect(processes.liveChildren).toBe(0);
    expect(runtime.getStatus().running).toBe(false);
  });

  it('tombstones an occupied endpoint after its owned daemon exited', async () => {
    const dataDir = await temporaryDataDir();
    const bytes = Buffer.from('trusted occupied endpoint recovery runtime');
    const processes = crashRecoveryProcessHarness();
    const runtime = new ManagedOllamaRuntime(dataDir, 'http://127.0.0.1:11434', {
      artifact: fixtureArtifact(bytes),
      fetchImpl: (async () => new Response(bytes, {
        status: 200,
        headers: { 'content-length': String(bytes.length) },
      })) as typeof fetch,
      extractArchive: async (_archive, destination) => {
        await writeFile(path.join(destination, 'ollama.exe'), 'fixture executable');
      },
      spawnImpl: processes.spawnImpl,
      probe: processes.probe,
      endpointQuiescent: processes.endpointQuiescent,
    });
    await runtime.ensureReady();

    processes.crashOwnedDaemon(true);
    await expect(runtime.startInstalled()).rejects.toThrow(/endpoint remains occupied/i);
    expect(processes.spawnImpl).toHaveBeenCalledTimes(1);

    processes.releaseOccupiedEndpoint();
    await expect(runtime.startInstalled()).rejects.toThrow(/endpoint remains occupied/i);
    expect(processes.spawnImpl).toHaveBeenCalledTimes(1);
    expect(processes.maximumLiveChildren).toBe(1);
  });

  it('rolls back a startup code 2 stale health response without consuming crash recovery', async () => {
    const dataDir = await temporaryDataDir();
    const firstBytes = Buffer.from('trusted startup race runtime N');
    const nextBytes = Buffer.from('startup race runtime N plus 1');
    const firstArtifact = versionedFixtureArtifact('test-1.0.0', firstBytes);
    const nextArtifact = versionedFixtureArtifact('test-1.1.0', nextBytes);
    const artifactCatalog = [firstArtifact, nextArtifact];
    await seedActiveRuntime(dataDir, firstArtifact, firstBytes, artifactCatalog);

    let runningVersion: string | null = null;
    let liveChildren = 0;
    let maximumLiveChildren = 0;
    let staleTargetProbeReturned = false;
    const startedVersions: string[] = [];
    const children: Array<EventEmitter & {
      exitCode: number | null;
      connected: boolean;
      pid: number;
      send: ReturnType<typeof vi.fn>;
      kill: ReturnType<typeof vi.fn>;
    }> = [];
    const spawnImpl = vi.fn((_file: string, args: readonly string[]) => {
      const executable = args[2] ?? '';
      const version = executable.split(/[\\/]/).at(-2) ?? 'unknown';
      startedVersions.push(version);
      runningVersion = version;
      liveChildren += 1;
      maximumLiveChildren = Math.max(maximumLiveChildren, liveChildren);
      const child = Object.assign(new EventEmitter(), {
        exitCode: null as number | null,
        connected: true,
        pid: 52_000 + children.length,
        send: vi.fn(() => {
          if (child.exitCode !== null) return false;
          child.exitCode = 0;
          if (runningVersion === version) runningVersion = null;
          liveChildren -= 1;
          queueMicrotask(() => child.emit('exit', 0, null));
          return true;
        }),
        kill: vi.fn(() => true),
      });
      children.push(child);
      return child as never;
    });
    const crashCurrentChild = () => {
      const child = children.at(-1);
      if (!child || child.exitCode !== null) throw new Error('No live child to crash');
      child.exitCode = 2;
      runningVersion = null;
      liveChildren -= 1;
      child.emit('exit', 2, null);
    };
    const runtime = new ManagedOllamaRuntime(dataDir, 'http://127.0.0.1:11434', {
      artifact: nextArtifact,
      artifactCatalog,
      fetchImpl: (async () => new Response(nextBytes, {
        status: 200,
        headers: { 'content-length': String(nextBytes.length) },
      })) as typeof fetch,
      extractArchive: async (_archive, destination) => {
        await writeFile(path.join(destination, 'ollama.exe'), 'startup race target executable');
      },
      spawnImpl,
      probe: async () => {
        if (runningVersion === nextArtifact.version && !staleTargetProbeReturned) {
          staleTargetProbeReturned = true;
          crashCurrentChild();
          return true;
        }
        return runningVersion !== null;
      },
      endpointQuiescent: async () => runningVersion === null,
    });

    const failure = await runtime.ensureReady().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ManagedRuntimeRollbackError);
    expect((failure as ManagedRuntimeRollbackError).rollback).toMatchObject({
      failedVersion: nextArtifact.version,
      restoredVersion: firstArtifact.version,
    });
    expect(startedVersions).toEqual([nextArtifact.version, firstArtifact.version]);
    expect(maximumLiveChildren).toBe(1);
    expect(liveChildren).toBe(1);

    crashCurrentChild();
    await vi.waitFor(() => expect(startedVersions).toEqual([
      nextArtifact.version,
      firstArtifact.version,
      firstArtifact.version,
    ]));
    expect(maximumLiveChildren).toBe(1);
    expect(liveChildren).toBe(1);
    await runtime.stop();
  });

  it('does not arm or consume crash recovery when code 2 arrives during explicit stop', async () => {
    const dataDir = await temporaryDataDir();
    const bytes = Buffer.from('trusted explicit stop race runtime');
    const processes = crashRecoveryProcessHarness();
    const runtime = new ManagedOllamaRuntime(dataDir, 'http://127.0.0.1:11434', {
      artifact: fixtureArtifact(bytes),
      fetchImpl: (async () => new Response(bytes, {
        status: 200,
        headers: { 'content-length': String(bytes.length) },
      })) as typeof fetch,
      extractArchive: async (_archive, destination) => {
        await writeFile(path.join(destination, 'ollama.exe'), 'fixture executable');
      },
      spawnImpl: processes.spawnImpl,
      probe: processes.probe,
      endpointQuiescent: processes.endpointQuiescent,
    });
    await runtime.ensureReady();

    processes.exitUnexpectedlyOnNextStop();
    await runtime.stop();
    expect(processes.spawnImpl).toHaveBeenCalledTimes(1);
    expect(processes.liveChildren).toBe(0);

    await runtime.startInstalled();
    processes.crashOwnedDaemon();
    await vi.waitFor(() => expect(processes.spawnImpl).toHaveBeenCalledTimes(3));
    expect(processes.maximumLiveChildren).toBe(1);
    expect(processes.liveChildren).toBe(1);
    await runtime.stop();
  });

  it('keeps a stop-timeout tombstone authoritative when the watchdog later exits with code 2', async () => {
    vi.useFakeTimers();
    try {
      const dataDir = await temporaryDataDir();
      const bytes = Buffer.from('trusted late stop exit runtime');
      let endpointHealthy = false;
      let stopRequested!: () => void;
      const requestedStop = new Promise<void>((resolve) => { stopRequested = resolve; });
      let child!: EventEmitter & {
        exitCode: number | null;
        connected: boolean;
        pid: number;
        send: ReturnType<typeof vi.fn>;
        kill: ReturnType<typeof vi.fn>;
      };
      const spawnImpl = vi.fn(() => {
        endpointHealthy = true;
        child = Object.assign(new EventEmitter(), {
          exitCode: null as number | null,
          connected: true,
          pid: 53_000,
          send: vi.fn(() => {
            stopRequested();
            return true;
          }),
          kill: vi.fn(() => true),
        });
        return child as never;
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
        spawnImpl,
        probe: async () => endpointHealthy,
        endpointQuiescent: async () => !endpointHealthy,
      });
      await runtime.ensureReady();

      const stopped = runtime.stop().then(
        () => null,
        (error: unknown) => error,
      );
      await requestedStop;
      await vi.advanceTimersByTimeAsync(5_000);
      const stopFailure = await stopped;
      expect(stopFailure).toBeInstanceOf(Error);
      expect((stopFailure as Error).message).toMatch(/did not confirm process-tree termination/i);

      child.exitCode = 2;
      endpointHealthy = false;
      child.emit('exit', 2, null);
      const retryFailure = await runtime.startInstalled().catch((error: unknown) => error);

      expect(retryFailure).toBeInstanceOf(Error);
      expect((retryFailure as Error).message).toMatch(/did not confirm process-tree termination/i);
      expect(spawnImpl).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('fails closed without spawning a replacement when an owned watchdog cannot be terminated', async () => {
    const dataDir = await temporaryDataDir();
    const firstBytes = Buffer.from('trusted unkillable rollback runtime N');
    const nextBytes = Buffer.from('unkillable rollback runtime N plus 1');
    const firstArtifact = versionedFixtureArtifact('test-1.0.0', firstBytes);
    const nextArtifact = versionedFixtureArtifact('test-2.0.0', nextBytes);
    const artifactCatalog = [firstArtifact, nextArtifact];
    await seedActiveRuntime(dataDir, firstArtifact, firstBytes, artifactCatalog);

    vi.useFakeTimers();
    try {
      let runningVersion: string | null = null;
      let targetProbeFailed = false;
      let stopRequested!: () => void;
      const requestedStop = new Promise<void>((resolve) => { stopRequested = resolve; });
      const spawnImpl = vi.fn((_file: string, args: readonly string[]) => {
        const executable = args[2] ?? '';
        const version = executable.split(/[\\/]/).at(-2) ?? 'unknown';
        runningVersion = version;
        if (spawnImpl.mock.calls.length === 1) {
          return Object.assign(new EventEmitter(), {
            exitCode: null as number | null,
            connected: true,
            pid: 41_001,
            send: vi.fn(() => {
              stopRequested();
              return true;
            }),
            kill: vi.fn(() => true),
          }) as never;
        }
        const child = Object.assign(new EventEmitter(), {
          exitCode: null as number | null,
          connected: true,
          pid: 41_002,
          send: vi.fn(() => {
            child.exitCode = 0;
            runningVersion = null;
            queueMicrotask(() => child.emit('exit', 0, null));
            return true;
          }),
          kill: vi.fn(() => true),
        });
        return child as never;
      });
      const runtime = new ManagedOllamaRuntime(dataDir, 'http://127.0.0.1:11434', {
        artifact: nextArtifact,
        artifactCatalog,
        fetchImpl: (async () => new Response(nextBytes, {
          status: 200,
          headers: { 'content-length': String(nextBytes.length) },
        })) as typeof fetch,
        extractArchive: async (_archive, destination) => {
          await writeFile(path.join(destination, 'ollama.exe'), 'runtime N plus 1 executable');
        },
        spawnImpl,
        probe: async () => {
          if (runningVersion === nextArtifact.version && !targetProbeFailed) {
            targetProbeFailed = true;
            throw new Error('target startup health failed');
          }
          return runningVersion === firstArtifact.version;
        },
      });
      const attempt = runtime.ensureReady().then(
        (value) => ({ fulfilled: true as const, value }),
        (error: unknown) => ({ fulfilled: false as const, error }),
      );
      await requestedStop;
      // The sidecar makes one bounded request and refuses overlap when the
      // watchdog cannot confirm that its owned process tree is gone.
      for (let timer = 0; timer < 4; timer += 1) {
        await vi.runOnlyPendingTimersAsync();
      }
      const result = await attempt;

      expect(result.fulfilled).toBe(false);
      expect(result.fulfilled ? null : result.error).not.toBeInstanceOf(ManagedRuntimeRollbackError);
      expect(spawnImpl).toHaveBeenCalledTimes(1);
      expect(runtime.getStatus()).toMatchObject({
        fallbackActive: false,
        activeVersion: 'test-1.0.0',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('refuses rollback when the watchdog reports failed tree termination and the target remains live', async () => {
    const dataDir = await temporaryDataDir();
    const firstBytes = Buffer.from('trusted rollback runtime N');
    const nextBytes = Buffer.from('surviving rollback runtime N plus 1');
    const firstArtifact = versionedFixtureArtifact('test-1.0.0', firstBytes);
    const nextArtifact = versionedFixtureArtifact('test-2.0.0', nextBytes);
    const artifactCatalog = [firstArtifact, nextArtifact];
    await seedActiveRuntime(dataDir, firstArtifact, firstBytes, artifactCatalog);

    let runningVersion: string | null = null;
    let targetProbeFailed = false;
    const targetWatchdog = Object.assign(new EventEmitter(), {
      exitCode: null as number | null,
      connected: true,
      pid: 42_001,
      send: vi.fn(() => {
        targetWatchdog.exitCode = 1;
        queueMicrotask(() => targetWatchdog.emit('exit', 1, null));
        return true;
      }),
      kill: vi.fn(() => true),
    });
    const spawnImpl = vi.fn((_file: string, args: readonly string[]) => {
      const executable = args[2] ?? '';
      runningVersion = executable.split(/[\\/]/).at(-2) ?? 'unknown';
      return targetWatchdog as never;
    });
    const runtime = new ManagedOllamaRuntime(dataDir, 'http://127.0.0.1:11434', {
      artifact: nextArtifact,
      artifactCatalog,
      fetchImpl: (async () => new Response(nextBytes, {
        status: 200,
        headers: { 'content-length': String(nextBytes.length) },
      })) as typeof fetch,
      extractArchive: async (_archive, destination) => {
        await writeFile(path.join(destination, 'ollama.exe'), 'runtime N plus 1 executable');
      },
      spawnImpl,
      probe: async () => {
        if (runningVersion === nextArtifact.version && !targetProbeFailed) {
          targetProbeFailed = true;
          throw new Error('target startup health failed');
        }
        return runningVersion === firstArtifact.version
          || (targetProbeFailed && runningVersion === nextArtifact.version);
      },
    });

    const failure = await runtime.ensureReady().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(ManagedRuntimeRollbackError);
    expect((failure as Error).message).toMatch(/watchdog exited with code 1/i);
    expect(spawnImpl).toHaveBeenCalledTimes(1);
    expect(targetWatchdog.kill).not.toHaveBeenCalled();
    expect(runningVersion).toBe(nextArtifact.version);
    // Model a late-starting target that now answers loopback. The retained
    // termination tombstone must win before that health probe can report ready.
    const retryFailure = await runtime.ensureReady().catch((error: unknown) => error);
    expect(retryFailure).toBeInstanceOf(Error);
    expect((retryFailure as Error).message).toMatch(/watchdog exited with code 1/i);
    expect(spawnImpl).toHaveBeenCalledTimes(1);
    expect(runtime.getStatus()).toMatchObject({
      running: false,
      fallbackActive: false,
      activeVersion: firstArtifact.version,
    });
  });

  it('waits for a failed target watchdog to exit before restoring the trusted prior runtime', async () => {
    const dataDir = await temporaryDataDir();
    const firstBytes = Buffer.from('trusted rollback runtime N');
    const nextBytes = Buffer.from('failing rollback runtime N plus 1');
    const firstArtifact = versionedFixtureArtifact('test-1.0.0', firstBytes);
    const nextArtifact = versionedFixtureArtifact('test-2.0.0', nextBytes);
    const artifactCatalog = [firstArtifact, nextArtifact];
    const firstProcesses = runtimeProcessHarness();
    const firstRuntime = new ManagedOllamaRuntime(dataDir, 'http://127.0.0.1:11434', {
      artifact: firstArtifact,
      artifactCatalog,
      fetchImpl: (async () => new Response(firstBytes, {
        status: 200,
        headers: { 'content-length': String(firstBytes.length) },
      })) as typeof fetch,
      extractArchive: async (_archive, destination) => {
        await writeFile(path.join(destination, 'ollama.exe'), 'runtime N executable');
      },
      spawnImpl: firstProcesses.spawnImpl,
      probe: firstProcesses.probe,
    });
    await firstRuntime.ensureReady();
    await firstRuntime.stop();

    let runningVersion: string | null = null;
    let liveChildren = 0;
    let maximumLiveChildren = 0;
    let targetExitedBeforeFallback = false;
    const startedVersions: string[] = [];
    const spawnImpl = vi.fn((_file: string, args: readonly string[]) => {
      const executable = args[2] ?? '';
      const version = executable.split(/[\\/]/).at(-2) ?? 'unknown';
      if (version === firstArtifact.version) targetExitedBeforeFallback = liveChildren === 0;
      startedVersions.push(version);
      liveChildren += 1;
      maximumLiveChildren = Math.max(maximumLiveChildren, liveChildren);
      runningVersion = version;
      const child = Object.assign(new EventEmitter(), {
        exitCode: null as number | null,
        connected: true,
        pid: 10_000 + startedVersions.length,
        send: vi.fn(() => {
          setTimeout(() => {
            if (child.exitCode !== null) return;
            child.exitCode = 0;
            if (runningVersion === version) runningVersion = null;
            liveChildren -= 1;
            child.emit('exit', 0, null);
          }, 25);
          return true;
        }),
        kill: vi.fn(() => {
          if (child.exitCode === null) {
            child.exitCode = 1;
            if (runningVersion === version) runningVersion = null;
            liveChildren -= 1;
            queueMicrotask(() => child.emit('exit', 1, null));
          }
          return true;
        }),
      });
      return child as never;
    });
    const upgradedRuntime = new ManagedOllamaRuntime(dataDir, 'http://127.0.0.1:11434', {
      artifact: nextArtifact,
      artifactCatalog,
      fetchImpl: (async () => new Response(nextBytes, {
        status: 200,
        headers: { 'content-length': String(nextBytes.length) },
      })) as typeof fetch,
      extractArchive: async (_archive, destination) => {
        await writeFile(path.join(destination, 'ollama.exe'), 'runtime N plus 1 executable');
      },
      spawnImpl,
      probe: async () => {
        if (runningVersion === nextArtifact.version) throw new Error('target readiness probe failed');
        return runningVersion === firstArtifact.version;
      },
    });

    let failure: unknown;
    try {
      await upgradedRuntime.ensureReady();
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(ManagedRuntimeRollbackError);
    expect((failure as ManagedRuntimeRollbackError).rollback).toMatchObject({
      failedVersion: 'test-2.0.0',
      restoredVersion: 'test-1.0.0',
      reason: 'target readiness probe failed',
    });
    expect(startedVersions).toEqual(['test-2.0.0', 'test-1.0.0']);
    expect(targetExitedBeforeFallback).toBe(true);
    expect(maximumLiveChildren).toBe(1);
    expect(upgradedRuntime.getStatus()).toMatchObject({
      running: true,
      targetInstalled: true,
      activeVersion: 'test-1.0.0',
      fallbackActive: true,
      rollback: {
        available: true,
        active: true,
        lastAttempt: {
          failedVersion: 'test-2.0.0',
          restoredVersion: 'test-1.0.0',
        },
      },
    });
    await upgradedRuntime.stop();
  });

  it('restores the trusted prior runtime when the target download fails checksum verification', async () => {
    const dataDir = await temporaryDataDir();
    const firstBytes = Buffer.from('trusted checksum rollback runtime N');
    const nextBytes = Buffer.from('tampered checksum upgrade payload');
    const firstArtifact = versionedFixtureArtifact('test-1.0.0', firstBytes);
    const nextArtifact = {
      ...versionedFixtureArtifact('test-2.0.0', nextBytes),
      sha256: '0'.repeat(64),
    };
    const artifactCatalog = [firstArtifact, nextArtifact];
    const firstProcesses = runtimeProcessHarness();
    const firstRuntime = new ManagedOllamaRuntime(dataDir, 'http://127.0.0.1:11434', {
      artifact: firstArtifact,
      artifactCatalog,
      fetchImpl: (async () => new Response(firstBytes, {
        status: 200,
        headers: { 'content-length': String(firstBytes.length) },
      })) as typeof fetch,
      extractArchive: async (_archive, destination) => {
        await writeFile(path.join(destination, 'ollama.exe'), 'runtime N executable');
      },
      spawnImpl: firstProcesses.spawnImpl,
      probe: firstProcesses.probe,
    });
    await firstRuntime.ensureReady();
    await firstRuntime.stop();
    const priorExecutable = path.join(dataDir, 'runtimes', 'ollama', firstArtifact.version, 'ollama.exe');

    const rollbackProcesses = runtimeProcessHarness();
    const upgradedRuntime = new ManagedOllamaRuntime(dataDir, 'http://127.0.0.1:11434', {
      artifact: nextArtifact,
      artifactCatalog,
      fetchImpl: (async () => new Response(nextBytes, {
        status: 200,
        headers: { 'content-length': String(nextBytes.length) },
      })) as typeof fetch,
      extractArchive: vi.fn(),
      spawnImpl: rollbackProcesses.spawnImpl,
      probe: rollbackProcesses.probe,
    });

    let failure: unknown;
    try {
      await upgradedRuntime.ensureReady();
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(ManagedRuntimeRollbackError);
    expect((failure as ManagedRuntimeRollbackError).rollback).toMatchObject({
      failedVersion: 'test-2.0.0',
      restoredVersion: 'test-1.0.0',
      reason: 'Official Ollama runtime checksum verification failed',
    });
    expect(rollbackProcesses.startedVersions).toEqual(['test-1.0.0']);
    expect(existsSync(priorExecutable)).toBe(true);
    expect(existsSync(path.join(dataDir, 'runtimes', 'ollama', nextArtifact.version))).toBe(false);
    expect(upgradedRuntime.getStatus()).toMatchObject({
      running: true,
      targetInstalled: false,
      activeVersion: 'test-1.0.0',
      fallbackActive: true,
      downloadRequired: true,
    });
    await upgradedRuntime.stop();
  });

  it('never selects an unknown activation receipt and recovers through the sole verified legacy target', async () => {
    const dataDir = await temporaryDataDir();
    const bytes = Buffer.from('trusted legacy runtime');
    const artifact = versionedFixtureArtifact('test-1.0.0', bytes);
    const installRuntime = new ManagedOllamaRuntime(dataDir, 'http://127.0.0.1:11434', {
      artifact,
      artifactCatalog: [artifact],
      fetchImpl: (async () => new Response(bytes, {
        status: 200,
        headers: { 'content-length': String(bytes.length) },
      })) as typeof fetch,
      extractArchive: async (_archive, destination) => {
        await writeFile(path.join(destination, 'ollama.exe'), 'trusted legacy executable');
      },
      probe: async () => false,
    });
    await installRuntime.install();
    const statePath = path.join(dataDir, 'runtimes', 'ollama', 'runtime-state.json');
    await writeFile(statePath, JSON.stringify({
      schemaVersion: 1,
      active: {
        version: 'unknown-9.9.9',
        sha256: artifact.sha256,
        executable: path.join('bin', 'untrusted.exe'),
        installedAt: new Date().toISOString(),
      },
      previous: null,
      lastRollback: null,
    }));
    const processes = runtimeProcessHarness();
    const recoveredRuntime = new ManagedOllamaRuntime(dataDir, 'http://127.0.0.1:11434', {
      artifact,
      artifactCatalog: [artifact],
      fetchImpl: vi.fn() as unknown as typeof fetch,
      spawnImpl: processes.spawnImpl,
      probe: processes.probe,
    });

    const ready = await recoveredRuntime.startInstalled();

    expect(processes.startedVersions).toEqual(['test-1.0.0']);
    expect(ready).toMatchObject({
      installedNow: false,
      startedNow: true,
      status: {
        activeVersion: 'test-1.0.0',
        fallbackActive: false,
      },
    });
    const recoveredState = JSON.parse(await readFile(statePath, 'utf8'));
    expect(recoveredState.active).toMatchObject({
      version: 'test-1.0.0',
      sha256: artifact.sha256,
      executable: 'ollama.exe',
    });
    expect(JSON.stringify(recoveredState)).not.toContain('unknown-9.9.9');
    await recoveredRuntime.stop();
  });

  it('recovers only the exact trusted previous receipt when a multi-install active receipt is corrupt', async () => {
    const dataDir = await temporaryDataDir();
    const firstBytes = Buffer.from('trusted recovery receipt runtime N');
    const nextBytes = Buffer.from('corrupt active receipt runtime N plus 1');
    const firstArtifact = versionedFixtureArtifact('test-1.0.0', firstBytes);
    const nextArtifact = versionedFixtureArtifact('test-2.0.0', nextBytes);
    const artifactCatalog = [firstArtifact, nextArtifact];
    await seedActiveRuntime(dataDir, firstArtifact, firstBytes, artifactCatalog);
    await seedActiveRuntime(dataDir, nextArtifact, nextBytes, artifactCatalog);
    const statePath = path.join(dataDir, 'runtimes', 'ollama', 'runtime-state.json');
    const installedState = JSON.parse(await readFile(statePath, 'utf8'));
    const trustedPrevious = installedState.previous;
    expect(trustedPrevious).toMatchObject({
      version: 'test-1.0.0',
      sha256: firstArtifact.sha256,
    });
    await writeFile(statePath, JSON.stringify({
      ...installedState,
      active: {
        ...installedState.active,
        executable: path.join('..', 'untrusted-target.exe'),
      },
      previous: trustedPrevious,
    }));
    const processes = runtimeProcessHarness();
    const fetchImpl = vi.fn();
    const recoveredRuntime = new ManagedOllamaRuntime(dataDir, 'http://127.0.0.1:11434', {
      artifact: nextArtifact,
      artifactCatalog,
      fetchImpl: fetchImpl as typeof fetch,
      spawnImpl: processes.spawnImpl,
      probe: processes.probe,
    });

    const ready = await recoveredRuntime.startInstalled();

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(processes.startedVersions).toEqual(['test-1.0.0']);
    expect(ready).toMatchObject({
      installedNow: false,
      startedNow: true,
      status: {
        targetInstalled: true,
        activeVersion: 'test-1.0.0',
        previousVersion: null,
        fallbackActive: true,
      },
    });
    const recoveredState = JSON.parse(await readFile(statePath, 'utf8'));
    expect(recoveredState).toMatchObject({
      active: trustedPrevious,
      previous: null,
    });
    expect(JSON.stringify(recoveredState)).not.toContain('untrusted-target.exe');
    await recoveredRuntime.stop();
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
      probe: async () => spawnImpl.mock.calls.length > 0,
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

  it('reports a distinct exit code when its owned daemon exits unexpectedly', async () => {
    const watchdog = spawn(process.execPath, [
      '-e',
      MANAGED_OLLAMA_WATCHDOG_SOURCE,
      process.execPath,
      JSON.stringify(['-e', 'process.exit(23)']),
    ], { windowsHide: true, stdio: 'ignore' });

    const exitCode = await new Promise<number | null>((resolve, reject) => {
      watchdog.once('error', reject);
      watchdog.once('exit', resolve);
    });

    expect(exitCode).toBe(2);
  }, 10_000);

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
