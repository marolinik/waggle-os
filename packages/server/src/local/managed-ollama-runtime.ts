import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import { spawn, execFile, type ChildProcess, type SpawnOptions } from 'node:child_process';
import {
  chmodSync,
  closeSync,
  createWriteStream,
  existsSync,
  fsyncSync,
  openSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { mkdir, readdir, rename, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import { createLogger } from './logger.js';

const execFileAsync = promisify(execFile);
const log = createLogger('managed-ollama');
const OLLAMA_VERSION = '0.32.0';
const RELEASE_ROOT = `https://github.com/ollama/ollama/releases/download/v${OLLAMA_VERSION}`;
const DOWNLOAD_TIMEOUT_MS = 45 * 60_000;
const START_TIMEOUT_MS = 45_000;
const STOP_TIMEOUT_MS = 5_000;
const WATCHDOG_EXIT_TERMINATION_CONFIRMED = 0;
const WATCHDOG_EXIT_CLEANUP_UNCONFIRMED = 1;
const WATCHDOG_EXIT_OWNED_DAEMON_EXITED = 2;
const INSTALL_LOCK_WAIT_MS = DOWNLOAD_TIMEOUT_MS + 15 * 60_000;
const INSTALL_LOCK_BUSY_TIMEOUT_MS = 0;
const INSTALL_LOCK_RETRY_MIN_MS = 200;
const INSTALL_LOCK_RETRY_MAX_MS = 1_000;

/**
 * The desktop shell terminates the Node sidecar directly on exit, which bypasses
 * Fastify's onClose hooks on Windows. Keep the model daemon behind a tiny Node
 * supervisor connected to the sidecar over IPC: loss of that IPC handle means
 * the parent died, so the supervisor terminates the entire Ollama process tree.
 */
export const MANAGED_OLLAMA_WATCHDOG_SOURCE = String.raw`
const { spawn } = require('node:child_process');
const executable = process.argv[1];
const args = JSON.parse(process.argv[2] || '[]');
const child = spawn(executable, args, {
  env: process.env,
  windowsHide: true,
  shell: false,
  stdio: 'ignore',
  detached: process.platform !== 'win32',
});
let stopping = false;
let forceTimer;
const finish = (code) => {
  if (forceTimer) clearTimeout(forceTimer);
  process.exit(code);
};
const stopTree = () => {
  if (stopping) return;
  stopping = true;
  if (!child.pid) return finish(${WATCHDOG_EXIT_CLEANUP_UNCONFIRMED});
  forceTimer = setTimeout(() => finish(${WATCHDOG_EXIT_CLEANUP_UNCONFIRMED}), 4000);
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      windowsHide: true,
      shell: false,
      stdio: 'ignore',
    });
    killer.once('error', () => finish(${WATCHDOG_EXIT_CLEANUP_UNCONFIRMED}));
    killer.once('exit', (code) => finish(code === 0
      ? ${WATCHDOG_EXIT_TERMINATION_CONFIRMED}
      : ${WATCHDOG_EXIT_CLEANUP_UNCONFIRMED}));
  } else {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { try { child.kill(); } catch {} }
    setTimeout(() => {
      try { process.kill(-child.pid, 'SIGKILL'); } catch {}
      setTimeout(() => {
        try {
          process.kill(-child.pid, 0);
          finish(${WATCHDOG_EXIT_CLEANUP_UNCONFIRMED});
        } catch (error) {
          finish(error && error.code === 'ESRCH'
            ? ${WATCHDOG_EXIT_TERMINATION_CONFIRMED}
            : ${WATCHDOG_EXIT_CLEANUP_UNCONFIRMED});
        }
      }, 100).unref();
    }, 1500).unref();
  }
};
child.once('spawn', () => {
  if (process.send) process.send({ type: 'spawned', pid: child.pid });
});
child.once('error', () => finish(${WATCHDOG_EXIT_CLEANUP_UNCONFIRMED}));
child.once('exit', () => {
  if (!stopping) finish(${WATCHDOG_EXIT_OWNED_DAEMON_EXITED});
});
process.once('disconnect', stopTree);
process.on('message', (message) => { if (message === 'shutdown') stopTree(); });
process.once('SIGTERM', stopTree);
process.once('SIGINT', stopTree);
`;

export interface OllamaRuntimeArtifact {
  version: string;
  platform: NodeJS.Platform;
  arch: string;
  filename: string;
  url: string;
  sha256: string;
  sizeBytes: number;
  executableName: string;
}

/**
 * Pinned official standalone artifacts. Updating this table is an intentional
 * supply-chain change: version, byte size, and GitHub-published SHA-256 must move
 * together. The runtime is downloaded only from this hardcoded release URL.
 */
export const OLLAMA_RUNTIME_ARTIFACTS: ReadonlyArray<OllamaRuntimeArtifact> = [
  {
    version: OLLAMA_VERSION,
    platform: 'win32',
    arch: 'x64',
    filename: 'ollama-windows-amd64.zip',
    url: `${RELEASE_ROOT}/ollama-windows-amd64.zip`,
    sha256: '56561a8f0a904483303c610e61af61c5a7b6f5496ce3707e207d25d4ff67b89e',
    sizeBytes: 1_503_047_573,
    executableName: 'ollama.exe',
  },
  {
    version: OLLAMA_VERSION,
    platform: 'win32',
    arch: 'arm64',
    filename: 'ollama-windows-arm64.zip',
    url: `${RELEASE_ROOT}/ollama-windows-arm64.zip`,
    sha256: '82b7d36b63e62a44d3f9853c2f8edb829cf871eaf722ce20070e09e96922c0cc',
    sizeBytes: 16_346_970,
    executableName: 'ollama.exe',
  },
  {
    version: OLLAMA_VERSION,
    platform: 'darwin',
    arch: 'x64',
    filename: 'ollama-darwin.tgz',
    url: `${RELEASE_ROOT}/ollama-darwin.tgz`,
    sha256: '3b12a49c6c4cbafd7ffba5ccba60cbf80274cdc22eea3ead79c646aba888174c',
    sizeBytes: 145_356_966,
    executableName: 'ollama',
  },
  {
    version: OLLAMA_VERSION,
    platform: 'darwin',
    arch: 'arm64',
    filename: 'ollama-darwin.tgz',
    url: `${RELEASE_ROOT}/ollama-darwin.tgz`,
    sha256: '3b12a49c6c4cbafd7ffba5ccba60cbf80274cdc22eea3ead79c646aba888174c',
    sizeBytes: 145_356_966,
    executableName: 'ollama',
  },
];

interface InstallMetadata {
  version: string;
  sha256: string;
  executable: string;
  installedAt: string;
}

interface RuntimeReceipt {
  version: string;
  sha256: string;
  executable: string;
  installedAt: string;
}

interface RuntimeActivationState {
  schemaVersion: 1;
  active: RuntimeReceipt;
  previous: RuntimeReceipt | null;
  lastRollback: ManagedRuntimeRollback | null;
}

type RuntimeStateLoad =
  | { kind: 'missing' }
  | {
    kind: 'invalid';
    reason: string;
    recoveryArtifact?: OllamaRuntimeArtifact;
    recoveryReceipt?: RuntimeReceipt;
    lastRollback?: ManagedRuntimeRollback | null;
  }
  | {
    kind: 'valid';
    state: RuntimeActivationState;
    activeArtifact: OllamaRuntimeArtifact;
    previousArtifact: OllamaRuntimeArtifact | null;
  };

interface InstallLockClaim {
  database: DatabaseType;
}

export interface ManagedOllamaStatus {
  source: 'waggle-managed';
  supported: boolean;
  installed: boolean;
  running: boolean;
  targetVersion: string | null;
  version: string | null;
  targetInstalled: boolean;
  activeVersion: string | null;
  previousVersion: string | null;
  fallbackActive: boolean;
  rollback: {
    available: boolean;
    active: boolean;
    lastAttempt: ManagedRuntimeRollback | null;
  };
  artifactSizeBytes: number | null;
  downloadRequired: boolean;
  dockerRequired: false;
  reason?: string;
}

export interface ManagedRuntimeRollback {
  failedVersion: string;
  restoredVersion: string;
  occurredAt: string;
  reason: string;
}

export class ManagedRuntimeRollbackError extends Error {
  readonly rollback: ManagedRuntimeRollback;
  readonly failedVersion: string;
  readonly restoredVersion: string;

  constructor(rollback: ManagedRuntimeRollback, cause: unknown) {
    super(
      `Managed Ollama ${rollback.failedVersion} failed; restored verified runtime ${rollback.restoredVersion}: ${rollback.reason}`,
      { cause },
    );
    this.name = 'ManagedRuntimeRollbackError';
    this.rollback = rollback;
    this.failedVersion = rollback.failedVersion;
    this.restoredVersion = rollback.restoredVersion;
  }
}

class ManagedRuntimeTerminationError extends Error {
  constructor(reason = 'watchdog did not confirm process-tree termination') {
    super(`Managed Ollama ${reason}; refusing to start a replacement runtime`);
    this.name = 'ManagedRuntimeTerminationError';
  }
}

export interface ManagedOllamaReadyResult {
  installedNow: boolean;
  startedNow: boolean;
  endpoint: string;
  status: ManagedOllamaStatus;
}

interface RuntimeDependencies {
  fetchImpl?: typeof fetch;
  extractArchive?: (
    archivePath: string,
    destination: string,
    artifact: OllamaRuntimeArtifact,
  ) => Promise<void>;
  spawnImpl?: (file: string, args: readonly string[], options: SpawnOptions) => ChildProcess;
  probe?: (baseUrl: string) => Promise<boolean>;
  endpointQuiescent?: (baseUrl: string) => Promise<boolean>;
  renameImpl?: typeof rename;
  stateRenameImpl?: typeof rename;
  rmImpl?: typeof rm;
  warn?: (message: string, error: unknown) => void;
  artifact?: OllamaRuntimeArtifact | null;
  artifactCatalog?: ReadonlyArray<OllamaRuntimeArtifact>;
  platform?: NodeJS.Platform;
  arch?: string;
}

export function resolveOllamaRuntimeArtifact(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): OllamaRuntimeArtifact | null {
  return OLLAMA_RUNTIME_ARTIFACTS.find((entry) => entry.platform === platform && entry.arch === arch) ?? null;
}

function isLoopbackEndpoint(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    return url.protocol === 'http:'
      && (url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '::1')
      && (url.pathname === '/' || url.pathname === '');
  } catch {
    return false;
  }
}

export function buildManagedOllamaEnv(
  baseUrl: string,
  modelsDir: string,
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  if (!isLoopbackEndpoint(baseUrl)) {
    throw new Error('Waggle-managed Ollama must bind to an HTTP loopback endpoint');
  }
  const endpoint = new URL(baseUrl);
  return {
    ...source,
    OLLAMA_HOST: endpoint.host,
    OLLAMA_MODELS: modelsDir,
    OLLAMA_NOHISTORY: '1',
  };
}

async function defaultProbe(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/tags`, {
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) return false;
    const payload = await response.json() as { models?: unknown };
    return Array.isArray(payload.models);
  } catch {
    return false;
  }
}

async function defaultExtract(
  archivePath: string,
  destination: string,
  artifact: OllamaRuntimeArtifact,
): Promise<void> {
  const executable = artifact.platform === 'win32' ? 'tar.exe' : 'tar';
  await execFileAsync(executable, ['-xf', archivePath, '-C', destination], {
    windowsHide: true,
    timeout: 10 * 60_000,
  });
}

function inside(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

const TRANSIENT_FILESYSTEM_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);
const FILESYSTEM_ATTEMPTS = 4;
const PROCESS_INSTALLS = new Map<string, Promise<{ executable: string; installedNow: boolean }>>();

function isTransientFilesystemError(error: unknown): boolean {
  return TRANSIENT_FILESYSTEM_CODES.has((error as NodeJS.ErrnoException)?.code ?? '');
}

async function waitForFilesystemRetry(attempt: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 25 * attempt));
}

async function removeWithin(root: string, target: string, rmImpl: typeof rm = rm): Promise<void> {
  if (!inside(root, target) || path.resolve(root) === path.resolve(target)) {
    throw new Error(`Refusing to remove path outside managed runtime root: ${target}`);
  }
  for (let attempt = 1; attempt <= FILESYSTEM_ATTEMPTS; attempt += 1) {
    try {
      await rmImpl(target, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!isTransientFilesystemError(error) || attempt === FILESYSTEM_ATTEMPTS) throw error;
      await waitForFilesystemRetry(attempt);
    }
  }
}

function isSqliteBusyError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === 'SQLITE_BUSY' || code === 'SQLITE_BUSY_SNAPSHOT' || code === 'SQLITE_LOCKED';
}

async function findExecutable(root: string, executableName: string): Promise<string> {
  const queue: Array<{ directory: string; depth: number }> = [{ directory: root, depth: 0 }];
  let visited = 0;
  while (queue.length > 0 && visited < 10_000) {
    const current = queue.shift()!;
    const entries = await readdir(current.directory, { withFileTypes: true });
    for (const entry of entries) {
      visited += 1;
      const candidate = path.join(current.directory, entry.name);
      if (entry.name.toLowerCase() === executableName.toLowerCase()) {
        const resolved = realpathSync(candidate);
        if (!inside(root, resolved) || !statSync(resolved).isFile()) continue;
        return resolved;
      }
      if (entry.isDirectory() && current.depth < 6) {
        queue.push({ directory: candidate, depth: current.depth + 1 });
      }
    }
  }
  throw new Error(`Official runtime archive did not contain ${executableName}`);
}

export class ManagedOllamaRuntime {
  private readonly root: string;
  private readonly modelsDir: string;
  private readonly artifact: OllamaRuntimeArtifact | null;
  private readonly artifactCatalog: ReadonlyArray<OllamaRuntimeArtifact>;
  private readonly platform: NodeJS.Platform;
  private readonly arch: string;
  private readonly fetchImpl: typeof fetch;
  private readonly extractArchive: NonNullable<RuntimeDependencies['extractArchive']>;
  private readonly spawnImpl: NonNullable<RuntimeDependencies['spawnImpl']>;
  private readonly probe: NonNullable<RuntimeDependencies['probe']>;
  private readonly endpointQuiescent: NonNullable<RuntimeDependencies['endpointQuiescent']>;
  private readonly renameImpl: NonNullable<RuntimeDependencies['renameImpl']>;
  private readonly stateRenameImpl: NonNullable<RuntimeDependencies['stateRenameImpl']>;
  private readonly rmImpl: NonNullable<RuntimeDependencies['rmImpl']>;
  private readonly warn: NonNullable<RuntimeDependencies['warn']>;
  private installPromise: Promise<{ executable: string; installedNow: boolean }> | null = null;
  private startPromise: Promise<boolean> | null = null;
  private activationPromise: Promise<unknown> | null = null;
  private child: ChildProcess | null = null;
  private runningArtifact: OllamaRuntimeArtifact | null = null;
  private terminationFailure: ManagedRuntimeTerminationError | null = null;
  private pendingCrashRecovery: OllamaRuntimeArtifact | null = null;
  private crashRecoveryConsumed = false;
  private stopInProgress = false;
  private readonly stopRequestedChildren = new WeakSet<ChildProcess>();

  constructor(
    dataDir: string,
    private readonly baseUrl = 'http://127.0.0.1:11434',
    dependencies: RuntimeDependencies = {},
  ) {
    const platform = dependencies.platform ?? dependencies.artifact?.platform ?? process.platform;
    const arch = dependencies.arch ?? dependencies.artifact?.arch ?? process.arch;
    this.platform = platform;
    this.arch = arch;
    this.root = path.resolve(dataDir, 'runtimes', 'ollama');
    this.modelsDir = path.resolve(dataDir, 'models', 'ollama');
    this.artifact = dependencies.artifact === undefined
      ? resolveOllamaRuntimeArtifact(platform, arch)
      : dependencies.artifact;
    this.artifactCatalog = dependencies.artifactCatalog
      ?? (dependencies.artifact === undefined
        ? OLLAMA_RUNTIME_ARTIFACTS
        : (dependencies.artifact ? [dependencies.artifact] : []));
    this.fetchImpl = dependencies.fetchImpl ?? fetch;
    this.extractArchive = dependencies.extractArchive ?? defaultExtract;
    this.spawnImpl = dependencies.spawnImpl ?? ((file, args, options) => spawn(file, args, options));
    this.probe = dependencies.probe ?? defaultProbe;
    this.endpointQuiescent = dependencies.endpointQuiescent ?? defaultEndpointQuiescent;
    this.renameImpl = dependencies.renameImpl ?? rename;
    this.stateRenameImpl = dependencies.stateRenameImpl ?? rename;
    this.rmImpl = dependencies.rmImpl ?? rm;
    this.warn = dependencies.warn ?? ((message, error) => log.warn(message, {
      error: error instanceof Error ? error.message : String(error),
      code: (error as { code?: unknown } | null)?.code ?? null,
    }));
  }

  getStatus(): ManagedOllamaStatus {
    const executable = this.getInstalledExecutable();
    const targetInstalled = executable !== null;
    const loadedState = this.loadRuntimeState();
    const running = this.child !== null && this.child.exitCode === null;
    const managedRunningVersion = running ? this.runningArtifact?.version ?? null : null;
    const activeVersion = managedRunningVersion
      ?? (loadedState.kind === 'valid' ? loadedState.state.active.version : null);
    const previousVersion = loadedState.kind === 'valid'
      ? loadedState.state.previous?.version ?? null
      : loadedState.kind === 'invalid'
        ? loadedState.recoveryArtifact?.version ?? null
        : null;
    const persistedRollbackActive = loadedState.kind === 'valid'
      && this.artifact !== null
      && !this.sameArtifact(loadedState.activeArtifact, this.artifact)
      && loadedState.state.lastRollback?.failedVersion === this.artifact.version
      && loadedState.state.lastRollback.restoredVersion === loadedState.activeArtifact.version;
    const fallbackActive = persistedRollbackActive || (running
      && this.runningArtifact !== null
      && this.artifact !== null
      && !this.sameArtifact(this.runningArtifact, this.artifact));
    const rollbackAvailable = loadedState.kind === 'valid'
      && this.selectFallbackArtifact(loadedState, this.artifact) !== null;
    const supported = this.artifact !== null && isLoopbackEndpoint(this.baseUrl);
    return {
      source: 'waggle-managed',
      supported,
      installed: targetInstalled
        || loadedState.kind === 'valid'
        || (loadedState.kind === 'invalid' && loadedState.recoveryArtifact !== undefined)
        || this.runningArtifact !== null,
      running,
      targetVersion: this.artifact?.version ?? null,
      version: activeVersion ?? (targetInstalled ? this.artifact?.version ?? null : null),
      targetInstalled,
      activeVersion,
      previousVersion,
      fallbackActive,
      rollback: {
        available: rollbackAvailable || fallbackActive,
        active: fallbackActive,
        lastAttempt: loadedState.kind === 'valid'
          ? loadedState.state.lastRollback
          : loadedState.kind === 'invalid'
            ? loadedState.lastRollback ?? null
            : null,
      },
      artifactSizeBytes: this.artifact?.sizeBytes ?? null,
      downloadRequired: !targetInstalled,
      dockerRequired: false,
      ...(!supported
        ? { reason: this.artifact === null
          ? `No managed Ollama artifact for ${process.platform}/${process.arch}`
          : 'Managed Ollama requires a loopback OLLAMA_HOST' }
        : loadedState.kind === 'invalid'
          ? { reason: loadedState.reason }
        : {}),
    };
  }

  private versionDir(artifact = this.artifact): string | null {
    if (!artifact) return null;
    const candidate = path.join(this.root, artifact.version);
    return inside(this.root, candidate) && path.resolve(candidate) !== this.root ? candidate : null;
  }

  private installVersionKey(): string {
    return createHash('sha256').update(this.artifact!.version).digest('hex');
  }

  private installLockDatabasePath(): string {
    return path.join(this.root, `.install-lock-${this.installVersionKey()}.sqlite`);
  }

  private getVerifiedInstall(artifact = this.artifact): { executable: string; receipt: RuntimeReceipt } | null {
    const versionDir = this.versionDir(artifact);
    if (!versionDir) return null;
    const metadataPath = path.join(versionDir, 'install.json');
    try {
      const metadata = JSON.parse(readFileSync(metadataPath, 'utf8')) as InstallMetadata;
      if (metadata.version !== artifact?.version || metadata.sha256 !== artifact.sha256) return null;
      if (path.isAbsolute(metadata.executable) || metadata.executable.split(/[\\/]/).includes('..')) return null;
      if (path.basename(metadata.executable).toLowerCase() !== artifact.executableName.toLowerCase()) return null;
      if (typeof metadata.installedAt !== 'string' || !Number.isFinite(Date.parse(metadata.installedAt))) return null;
      const executable = realpathSync(path.join(versionDir, metadata.executable));
      if (!inside(versionDir, executable) || !statSync(executable).isFile()) return null;
      return {
        executable,
        receipt: {
          version: metadata.version,
          sha256: metadata.sha256,
          executable: metadata.executable,
          installedAt: metadata.installedAt,
        },
      };
    } catch {
      return null;
    }
  }

  private getInstalledExecutable(artifact = this.artifact): string | null {
    return this.getVerifiedInstall(artifact)?.executable ?? null;
  }

  private statePath(): string {
    return path.join(this.root, 'runtime-state.json');
  }

  private receiptFor(artifact: OllamaRuntimeArtifact): RuntimeReceipt {
    const installation = this.getVerifiedInstall(artifact);
    if (!installation) throw new Error(`Managed Ollama ${artifact.version} install receipt failed validation`);
    return installation.receipt;
  }

  private sameReceipt(left: RuntimeReceipt, right: RuntimeReceipt): boolean {
    return left.version === right.version
      && left.sha256 === right.sha256
      && left.executable === right.executable
      && left.installedAt === right.installedAt;
  }

  private sameArtifact(left: OllamaRuntimeArtifact, right: OllamaRuntimeArtifact): boolean {
    return left.version === right.version && left.sha256 === right.sha256;
  }

  private sameCatalogArtifact(left: OllamaRuntimeArtifact, right: OllamaRuntimeArtifact): boolean {
    return this.sameArtifact(left, right)
      && left.platform === right.platform
      && left.arch === right.arch
      && left.filename === right.filename
      && left.url === right.url
      && left.sizeBytes === right.sizeBytes
      && left.executableName === right.executableName;
  }

  private assertTrustedTarget(): OllamaRuntimeArtifact {
    if (!this.artifact) throw new Error(`Managed Ollama is unsupported on ${process.platform}/${process.arch}`);
    const trusted = this.artifactCatalog.find((candidate) => this.sameCatalogArtifact(candidate, this.artifact!));
    if (!trusted) throw new Error(`Managed Ollama ${this.artifact.version} is not present in the trusted artifact catalog`);
    return trusted;
  }

  private catalogArtifact(receipt: RuntimeReceipt): OllamaRuntimeArtifact | null {
    return this.artifactCatalog.find((candidate) => (
      candidate.platform === this.platform
      && candidate.arch === this.arch
      && candidate.version === receipt.version
      && candidate.sha256 === receipt.sha256
    )) ?? null;
  }

  private validReceipt(value: unknown): RuntimeReceipt | null {
    if (!value || typeof value !== 'object') return null;
    const candidate = value as Partial<RuntimeReceipt>;
    if (typeof candidate.version !== 'string' || candidate.version.length === 0 || candidate.version.length > 128) return null;
    if (typeof candidate.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(candidate.sha256)) return null;
    if (typeof candidate.executable !== 'string' || candidate.executable.length === 0 || candidate.executable.length > 1_024) return null;
    if (path.isAbsolute(candidate.executable) || candidate.executable.split(/[\\/]/).includes('..')) return null;
    if (typeof candidate.installedAt !== 'string' || !Number.isFinite(Date.parse(candidate.installedAt))) return null;
    return {
      version: candidate.version,
      sha256: candidate.sha256,
      executable: candidate.executable,
      installedAt: candidate.installedAt,
    };
  }

  private validRollback(value: unknown): ManagedRuntimeRollback | null | undefined {
    if (value === null) return null;
    if (!value || typeof value !== 'object') return undefined;
    const candidate = value as Partial<ManagedRuntimeRollback>;
    if (typeof candidate.failedVersion !== 'string' || candidate.failedVersion.length === 0 || candidate.failedVersion.length > 128) return undefined;
    if (typeof candidate.restoredVersion !== 'string' || candidate.restoredVersion.length === 0 || candidate.restoredVersion.length > 128) return undefined;
    if (typeof candidate.occurredAt !== 'string' || !Number.isFinite(Date.parse(candidate.occurredAt))) return undefined;
    if (typeof candidate.reason !== 'string' || candidate.reason.length === 0 || candidate.reason.length > 2_048) return undefined;
    return {
      failedVersion: candidate.failedVersion,
      restoredVersion: candidate.restoredVersion,
      occurredAt: candidate.occurredAt,
      reason: candidate.reason,
    };
  }

  private loadRuntimeState(): RuntimeStateLoad {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(this.statePath(), 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return { kind: 'missing' };
      return { kind: 'invalid', reason: 'Managed Ollama activation state failed validation' };
    }
    if (!parsed || typeof parsed !== 'object') {
      return { kind: 'invalid', reason: 'Managed Ollama activation state failed validation' };
    }
    const candidate = parsed as Partial<RuntimeActivationState>;
    if (candidate.schemaVersion !== 1) {
      return { kind: 'invalid', reason: 'Managed Ollama activation state failed validation' };
    }
    const parsedRollback = this.validRollback(candidate.lastRollback);
    const lastRollback = parsedRollback === undefined ? null : parsedRollback;
    const previous = candidate.previous === null ? null : this.validReceipt(candidate.previous);
    const previousArtifact = previous ? this.catalogArtifact(previous) : null;
    const previousInstall = previousArtifact ? this.getVerifiedInstall(previousArtifact) : null;
    const trustedPrevious = previous && previousArtifact && previousInstall
      && this.sameReceipt(previous, previousInstall.receipt)
      ? { receipt: previous, artifact: previousArtifact }
      : null;
    const recovery = trustedPrevious
      ? {
        recoveryArtifact: trustedPrevious.artifact,
        recoveryReceipt: trustedPrevious.receipt,
        lastRollback,
      }
      : { lastRollback };
    const active = this.validReceipt(candidate.active);
    if (!active) {
      return {
        kind: 'invalid',
        reason: 'Managed Ollama activation state failed validation',
        ...recovery,
      };
    }
    const activeArtifact = this.catalogArtifact(active);
    const activeInstall = activeArtifact ? this.getVerifiedInstall(activeArtifact) : null;
    if (!activeArtifact || !activeInstall || !this.sameReceipt(active, activeInstall.receipt)) {
      return {
        kind: 'invalid',
        reason: 'Managed Ollama activation state references an untrusted or invalid runtime',
        ...recovery,
      };
    }
    const usablePrevious = trustedPrevious
      && !this.sameArtifact(activeArtifact, trustedPrevious.artifact)
      ? trustedPrevious
      : null;
    return {
      kind: 'valid',
      state: {
        schemaVersion: 1,
        active,
        previous: usablePrevious?.receipt ?? null,
        lastRollback,
      },
      activeArtifact,
      previousArtifact: usablePrevious?.artifact ?? null,
    };
  }

  private async writeRuntimeState(state: RuntimeActivationState): Promise<void> {
    await mkdir(this.root, { recursive: true });
    const temporary = path.join(this.root, `.runtime-state.${process.pid}-${randomUUID()}.tmp`);
    let descriptor: number | null = null;
    try {
      descriptor = openSync(temporary, 'wx');
      writeFileSync(descriptor, `${JSON.stringify(state, null, 2)}\n`);
      fsyncSync(descriptor);
      closeSync(descriptor);
      descriptor = null;
      for (let attempt = 1; attempt <= FILESYSTEM_ATTEMPTS; attempt += 1) {
        try {
          await this.stateRenameImpl(temporary, this.statePath());
          break;
        } catch (error) {
          if (!isTransientFilesystemError(error) || attempt === FILESYSTEM_ATTEMPTS) throw error;
          await waitForFilesystemRetry(attempt);
        }
      }
    } finally {
      if (descriptor !== null) closeSync(descriptor);
      if (existsSync(temporary)) await removeWithin(this.root, temporary, this.rmImpl);
    }
  }

  private async promoteActive(artifact: OllamaRuntimeArtifact): Promise<void> {
    const loaded = this.loadRuntimeState();
    const receipt = this.receiptFor(artifact);
    const current = loaded.kind === 'valid' ? loaded.state : null;
    await this.writeRuntimeState({
      schemaVersion: 1,
      active: receipt,
      previous: current && !this.sameReceipt(current.active, receipt) ? current.active : current?.previous ?? null,
      lastRollback: current?.lastRollback ?? null,
    });
  }

  private selectFallbackArtifact(
    loaded: Extract<RuntimeStateLoad, { kind: 'valid' }>,
    failedArtifact: OllamaRuntimeArtifact | null,
  ): OllamaRuntimeArtifact | null {
    if (!failedArtifact || !this.sameArtifact(loaded.activeArtifact, failedArtifact)) return loaded.activeArtifact;
    return loaded.previousArtifact && !this.sameArtifact(loaded.previousArtifact, failedArtifact)
      ? loaded.previousArtifact
      : null;
  }

  private verifiedCatalogInstalls(): Array<{ artifact: OllamaRuntimeArtifact; executable: string }> {
    const seen = new Set<string>();
    const installations: Array<{ artifact: OllamaRuntimeArtifact; executable: string }> = [];
    for (const artifact of this.artifactCatalog) {
      if (artifact.platform !== this.platform || artifact.arch !== this.arch) continue;
      const key = `${artifact.version}:${artifact.sha256}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const executable = this.getInstalledExecutable(artifact);
      if (executable) installations.push({ artifact, executable });
    }
    return installations;
  }

  private legacyStartCandidate(): { artifact: OllamaRuntimeArtifact; executable: string } | null {
    const installations = this.verifiedCatalogInstalls();
    return installations.length === 1 ? installations[0]! : null;
  }

  private rollbackReason(error: unknown): string {
    const reason = error instanceof Error ? error.message : String(error);
    return (reason || 'target runtime failed').slice(0, 2_048);
  }

  private async persistRollback(
    failedArtifact: OllamaRuntimeArtifact,
    restoredArtifact: OllamaRuntimeArtifact,
    rollback: ManagedRuntimeRollback,
  ): Promise<void> {
    const loaded = this.loadRuntimeState();
    const restored = this.receiptFor(restoredArtifact);
    const current = loaded.kind === 'valid' ? loaded.state : null;
    const failedWasActive = current !== null
      && current.active.version === failedArtifact.version
      && current.active.sha256 === failedArtifact.sha256;
    await this.writeRuntimeState({
      schemaVersion: 1,
      active: restored,
      previous: failedWasActive ? current.active : current?.previous ?? null,
      lastRollback: rollback,
    });
  }

  private activationLockDatabasePath(): string {
    return path.join(this.root, '.activation-lock.sqlite');
  }

  private async acquireActivationLock(): Promise<InstallLockClaim> {
    await mkdir(this.root, { recursive: true });
    const database = new Database(this.activationLockDatabasePath(), { timeout: INSTALL_LOCK_BUSY_TIMEOUT_MS });
    const deadline = Date.now() + INSTALL_LOCK_WAIT_MS;
    let retryDelay = INSTALL_LOCK_RETRY_MIN_MS;
    while (Date.now() < deadline) {
      try {
        database.exec('BEGIN EXCLUSIVE');
        return { database };
      } catch (error) {
        if (!isSqliteBusyError(error)) {
          try { database.close(); } catch { /* primary error wins */ }
          throw error;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
      retryDelay = Math.min(retryDelay * 2, INSTALL_LOCK_RETRY_MAX_MS);
    }
    try { database.close(); } catch { /* timeout error wins */ }
    throw new Error('Timed out waiting for the managed Ollama activation coordinator');
  }

  private withActivationLock<T>(operation: () => Promise<T>): Promise<T> {
    const prior = this.activationPromise;
    const activation = (async () => {
      if (prior) {
        try {
          await prior;
        } catch {
          // The next caller must observe the resulting state, including a healthy rollback.
        }
      }
      const lock = await this.acquireActivationLock();
      try {
        return await operation();
      } finally {
        await this.releaseInstallLock(lock);
      }
    })();
    this.activationPromise = activation;
    return activation.finally(() => {
      if (this.activationPromise === activation) this.activationPromise = null;
    });
  }

  async install(): Promise<{ executable: string; installedNow: boolean }> {
    const existing = this.getInstalledExecutable();
    if (existing) return { executable: existing, installedNow: false };
    if (this.installPromise) return this.installPromise;
    const coordinationKey = this.installLockDatabasePath();
    const processInstall = PROCESS_INSTALLS.get(coordinationKey);
    if (processInstall) {
      const result = await processInstall;
      return { executable: result.executable, installedNow: false };
    }
    const installation = this.installInternal();
    PROCESS_INSTALLS.set(coordinationKey, installation);
    this.installPromise = installation.finally(() => {
      if (PROCESS_INSTALLS.get(coordinationKey) === installation) PROCESS_INSTALLS.delete(coordinationKey);
      this.installPromise = null;
    });
    return this.installPromise;
  }

  private reportWarning(message: string, error: unknown): void {
    try {
      this.warn(message, error);
    } catch {
      // Diagnostics must never change runtime availability.
    }
  }

  private async acquireInstallLock(): Promise<InstallLockClaim> {
    const database = new Database(this.installLockDatabasePath(), { timeout: INSTALL_LOCK_BUSY_TIMEOUT_MS });
    const deadline = Date.now() + INSTALL_LOCK_WAIT_MS;
    let retryDelay = INSTALL_LOCK_RETRY_MIN_MS;
    while (Date.now() < deadline) {
      try {
        database.exec('BEGIN EXCLUSIVE');
        return { database };
      } catch (error) {
        if (!isSqliteBusyError(error)) {
          try {
            database.close();
          } catch (closeError) {
            this.reportWarning('Could not close the managed Ollama install coordinator', closeError);
          }
          throw error;
        }
      }
      const jitter = Math.floor(Math.random() * Math.min(100, retryDelay / 4));
      await new Promise((resolve) => setTimeout(resolve, retryDelay + jitter));
      retryDelay = Math.min(retryDelay * 2, INSTALL_LOCK_RETRY_MAX_MS);
    }
    try {
      database.close();
    } catch (error) {
      this.reportWarning('Could not close the timed-out managed Ollama install coordinator', error);
    }
    throw new Error(`Timed out waiting for the managed Ollama ${this.artifact!.version} installation coordinator`);
  }

  private async releaseInstallLock(claim: InstallLockClaim): Promise<void> {
    try {
      if (claim.database.inTransaction) claim.database.exec('ROLLBACK');
    } catch (error) {
      this.reportWarning('Could not roll back the managed Ollama install coordinator', error);
    } finally {
      try {
        claim.database.close();
      } catch (error) {
        this.reportWarning('Could not close the managed Ollama install coordinator', error);
      }
    }
  }

  private async cleanupInstallAttempt(targets: readonly string[]): Promise<void> {
    for (const target of targets) {
      try {
        await removeWithin(this.root, target, this.rmImpl);
      } catch (error) {
        this.reportWarning(`Could not remove managed Ollama install artifact ${path.basename(target)}`, error);
      }
    }
  }

  private async removeOrphanedInstallAttempts(): Promise<void> {
    const versionKey = this.installVersionKey();
    const stagingPrefix = `.install-attempt-${versionKey}.`;
    const archivePrefix = `.${this.artifact!.filename}.${versionKey}.`;
    const entries = await readdir(this.root, { withFileTypes: true });
    for (const entry of entries) {
      const isStaging = entry.name.startsWith(stagingPrefix);
      const isArchive = entry.name.startsWith(archivePrefix) && entry.name.endsWith('.part');
      if (!isStaging && !isArchive) continue;
      await removeWithin(this.root, path.join(this.root, entry.name), this.rmImpl);
    }
  }

  private async installInternal(): Promise<{ executable: string; installedNow: boolean }> {
    this.assertTrustedTarget();
    if (!this.artifact) throw new Error(`Managed Ollama is unsupported on ${process.platform}/${process.arch}`);
    if (!isLoopbackEndpoint(this.baseUrl)) throw new Error('Managed Ollama requires a loopback OLLAMA_HOST');

    await mkdir(this.root, { recursive: true });
    const lock = await this.acquireInstallLock();
    try {
      const concurrentlyInstalled = this.getInstalledExecutable();
      if (concurrentlyInstalled) return { executable: concurrentlyInstalled, installedNow: false };
      await this.removeOrphanedInstallAttempts();
      const finalDir = this.versionDir()!;
      if (existsSync(finalDir)) await removeWithin(this.root, finalDir, this.rmImpl);
      const attemptId = `${process.pid}-${randomUUID()}`;
      const versionKey = this.installVersionKey();
      const staging = path.join(this.root, `.install-attempt-${versionKey}.${attemptId}`);
      const archive = path.join(this.root, `.${this.artifact.filename}.${versionKey}.${attemptId}.part`);
      await mkdir(staging, { recursive: true });

      try {
        const response = await this.fetchImpl(this.artifact.url, {
          redirect: 'follow',
          signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
        });
        if (!response.ok || !response.body) {
          throw new Error(`Official Ollama runtime download failed with HTTP ${response.status}`);
        }
        const declaredSize = Number(response.headers.get('content-length'));
        if (Number.isFinite(declaredSize) && declaredSize !== this.artifact.sizeBytes) {
          throw new Error(`Official Ollama runtime size mismatch: expected ${this.artifact.sizeBytes}, got ${declaredSize}`);
        }

        const digest = createHash('sha256');
        let downloaded = 0;
        const expectedBytes = this.artifact.sizeBytes;
        const verifier = new Transform({
          transform(chunk: Buffer, _encoding, callback) {
            downloaded += chunk.length;
            if (downloaded > expectedBytes) {
              callback(new Error(`Official Ollama runtime exceeded the expected ${expectedBytes} bytes`));
              return;
            }
            digest.update(chunk);
            callback(null, chunk);
          },
        });
        const body = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream);
        await pipeline(body, verifier, createWriteStream(archive, { flags: 'wx' }));
        if (downloaded !== this.artifact.sizeBytes) {
          throw new Error(`Official Ollama runtime size mismatch: expected ${this.artifact.sizeBytes}, got ${downloaded}`);
        }
        const actualDigest = digest.digest('hex');
        if (actualDigest !== this.artifact.sha256) {
          throw new Error('Official Ollama runtime checksum verification failed');
        }

        await this.extractArchive(archive, staging, this.artifact);
        const executable = await findExecutable(staging, this.artifact.executableName);
        if (this.artifact.platform !== 'win32') chmodSync(executable, 0o755);
        const relativeExecutable = path.relative(staging, executable);
        const metadata: InstallMetadata = {
          version: this.artifact.version,
          sha256: this.artifact.sha256,
          executable: relativeExecutable,
          installedAt: new Date().toISOString(),
        };
        writeFileSync(path.join(staging, 'install.json'), `${JSON.stringify(metadata, null, 2)}\n`, { flag: 'wx' });
        return await this.publishInstall(staging, finalDir);
      } finally {
        await this.cleanupInstallAttempt([archive, staging]);
      }
    } finally {
      await this.releaseInstallLock(lock);
    }
  }

  private async waitForInstalledExecutable(): Promise<string | null> {
    for (let attempt = 1; attempt <= FILESYSTEM_ATTEMPTS; attempt += 1) {
      const executable = this.getInstalledExecutable();
      if (executable) return executable;
      if (attempt < FILESYSTEM_ATTEMPTS) await waitForFilesystemRetry(attempt);
    }
    return null;
  }

  private async publishInstall(
    staging: string,
    finalDir: string,
  ): Promise<{ executable: string; installedNow: boolean }> {
    for (let attempt = 1; attempt <= FILESYSTEM_ATTEMPTS; attempt += 1) {
      try {
        await this.renameImpl(staging, finalDir);
      } catch (error) {
        const winner = existsSync(finalDir) ? await this.waitForInstalledExecutable() : null;
        if (winner) return { executable: winner, installedNow: false };
        if (!isTransientFilesystemError(error) || attempt === FILESYSTEM_ATTEMPTS) throw error;
        await waitForFilesystemRetry(attempt);
        continue;
      }
      const executable = await this.waitForInstalledExecutable();
      if (!executable) throw new Error('Published Ollama runtime failed install metadata validation');
      return { executable, installedNow: true };
    }
    throw new Error('Managed Ollama runtime publication exhausted all retry attempts');
  }

  private fallbackCandidate(
    loaded: RuntimeStateLoad,
    failedArtifact: OllamaRuntimeArtifact,
  ): { artifact: OllamaRuntimeArtifact; executable: string } | null {
    const artifact = loaded.kind === 'valid'
      ? this.selectFallbackArtifact(loaded, failedArtifact)
      : loaded.kind === 'invalid' && loaded.recoveryArtifact
        ? loaded.recoveryArtifact
        : this.legacyStartCandidate()?.artifact ?? null;
    if (!artifact || this.sameArtifact(artifact, failedArtifact)) return null;
    const executable = this.getInstalledExecutable(artifact);
    return executable ? { artifact, executable } : null;
  }

  private async rollbackAfterFailure(
    failedArtifact: OllamaRuntimeArtifact,
    fallback: { artifact: OllamaRuntimeArtifact; executable: string } | null,
    cause: unknown,
  ): Promise<never> {
    if (cause instanceof ManagedRuntimeTerminationError) throw cause;
    await this.stopInternal();
    if (!fallback) throw cause;

    try {
      const started = await this.start(fallback.executable, fallback.artifact);
      if (!started || !this.runningArtifact || !this.sameArtifact(this.runningArtifact, fallback.artifact)) {
        throw new Error(`Verified fallback runtime ${fallback.artifact.version} was not started by Waggle`);
      }
    } catch (rollbackError) {
      throw new Error(
        `Managed Ollama ${failedArtifact.version} failed and verified fallback ${fallback.artifact.version} could not start: ${this.rollbackReason(rollbackError)}`,
        { cause },
      );
    }

    const rollback: ManagedRuntimeRollback = {
      failedVersion: failedArtifact.version,
      restoredVersion: fallback.artifact.version,
      occurredAt: new Date().toISOString(),
      reason: this.rollbackReason(cause),
    };
    try {
      await this.persistRollback(failedArtifact, fallback.artifact, rollback);
    } catch (stateError) {
      this.reportWarning('Could not persist the managed Ollama rollback receipt', stateError);
    }
    throw new ManagedRuntimeRollbackError(rollback, cause);
  }

  private async recoverCrashedRuntime(): Promise<ManagedOllamaReadyResult | null> {
    const artifact = this.pendingCrashRecovery;
    if (!artifact) return null;
    if (this.crashRecoveryConsumed) {
      throw this.markTerminationUnconfirmed('managed Ollama crash-recovery budget is exhausted');
    }
    const executable = this.getInstalledExecutable(artifact);
    if (!executable) {
      throw this.markTerminationUnconfirmed('verified managed Ollama runtime disappeared before crash recovery');
    }
    if (!await this.endpointQuiescent(this.baseUrl)) {
      throw this.markTerminationUnconfirmed(
        'owned Ollama daemon exited but its loopback endpoint remains occupied',
      );
    }
    this.assertTerminationConfirmed();

    this.crashRecoveryConsumed = true;
    this.pendingCrashRecovery = null;
    try {
      const started = await this.start(executable, artifact, true);
      if (!started || !this.runningArtifact || !this.sameArtifact(this.runningArtifact, artifact)) {
        throw new Error(`verified runtime ${artifact.version} was not restarted by Waggle`);
      }
    } catch (error) {
      throw this.markTerminationUnconfirmed(
        `managed Ollama crash recovery failed: ${this.rollbackReason(error)}`,
      );
    }
    return {
      installedNow: false,
      startedNow: true,
      endpoint: this.baseUrl,
      status: this.getStatus(),
    };
  }

  private queueCrashRecovery(artifact: OllamaRuntimeArtifact): void {
    this.pendingCrashRecovery = artifact;
    const recovery = this.withActivationLock(async () => {
      this.assertTerminationConfirmed();
      await this.recoverCrashedRuntime();
    });
    void recovery.catch((error: unknown) => {
      if (!this.terminationFailure) {
        this.markTerminationUnconfirmed(
          `managed Ollama crash recovery failed: ${this.rollbackReason(error)}`,
        );
      }
    });
  }

  async startInstalled(): Promise<ManagedOllamaReadyResult> {
    return this.withActivationLock(async () => {
      this.assertTerminationConfirmed();
      let recovered = await this.recoverCrashedRuntime();
      if (recovered) return recovered;
      const endpointReady = await this.probe(this.baseUrl);
      this.assertTerminationConfirmed();
      recovered = await this.recoverCrashedRuntime();
      if (recovered) return recovered;
      if (endpointReady) {
        return { installedNow: false, startedNow: false, endpoint: this.baseUrl, status: this.getStatus() };
      }
      const loaded = this.loadRuntimeState();
      const candidate = loaded.kind === 'valid'
        ? {
          artifact: loaded.activeArtifact,
          executable: this.getInstalledExecutable(loaded.activeArtifact),
        }
        : loaded.kind === 'invalid' && loaded.recoveryArtifact
          ? {
            artifact: loaded.recoveryArtifact,
            executable: this.getInstalledExecutable(loaded.recoveryArtifact),
          }
          : this.legacyStartCandidate();
      if (!candidate?.executable) {
        throw new Error('Verified Waggle-managed Ollama runtime is not installed');
      }
      const fallback = this.fallbackCandidate(loaded, candidate.artifact);
      let startedNow: boolean;
      try {
        startedNow = await this.start(candidate.executable, candidate.artifact);
        if (startedNow && loaded.kind !== 'valid') await this.promoteActive(candidate.artifact);
      } catch (error) {
        return this.rollbackAfterFailure(candidate.artifact, fallback, error);
      }
      return {
        installedNow: false,
        startedNow,
        endpoint: this.baseUrl,
        status: this.getStatus(),
      };
    });
  }

  async ensureReady(): Promise<ManagedOllamaReadyResult> {
    return this.withActivationLock(async () => {
      this.assertTerminationConfirmed();
      let recovered = await this.recoverCrashedRuntime();
      if (recovered) return recovered;
      const endpointReady = await this.probe(this.baseUrl);
      this.assertTerminationConfirmed();
      recovered = await this.recoverCrashedRuntime();
      if (recovered) return recovered;
      if (endpointReady) {
        return { installedNow: false, startedNow: false, endpoint: this.baseUrl, status: this.getStatus() };
      }
      const target = this.assertTrustedTarget();
      const loadedBefore = this.loadRuntimeState();
      const fallback = this.fallbackCandidate(loadedBefore, target);
      let installation: { executable: string; installedNow: boolean };
      try {
        installation = await this.install();
      } catch (error) {
        return this.rollbackAfterFailure(target, fallback, error);
      }

      let startedNow: boolean;
      try {
        startedNow = await this.start(installation.executable, target);
        if (startedNow) await this.promoteActive(target);
      } catch (error) {
        return this.rollbackAfterFailure(target, fallback, error);
      }
      return {
        installedNow: installation.installedNow,
        startedNow,
        endpoint: this.baseUrl,
        status: this.getStatus(),
      };
    });
  }

  private async start(
    executable: string,
    artifact: OllamaRuntimeArtifact,
    requireQuiescentEndpoint = false,
  ): Promise<boolean> {
    if (this.startPromise) return this.startPromise;
    this.assertTerminationConfirmed();
    const endpointReady = await this.probe(this.baseUrl);
    this.assertTerminationConfirmed();
    const recovered = await this.recoverCrashedRuntime();
    if (recovered) return false;
    if (endpointReady) {
      if (requireQuiescentEndpoint) {
        throw new ManagedRuntimeTerminationError('managed Ollama loopback endpoint remains occupied');
      }
      return false;
    }
    if (requireQuiescentEndpoint && !await this.endpointQuiescent(this.baseUrl)) {
      throw new ManagedRuntimeTerminationError('managed Ollama loopback endpoint remains occupied');
    }
    if (this.child) {
      if (this.child.exitCode === null) await this.stopInternal();
      else if (this.child.exitCode === WATCHDOG_EXIT_OWNED_DAEMON_EXITED) {
        if (!await this.endpointQuiescent(this.baseUrl)) {
          throw this.markTerminationUnconfirmed('owned Ollama daemon exited but its loopback endpoint remains occupied');
        }
        this.child = null;
        this.runningArtifact = null;
      } else if (this.child.exitCode !== WATCHDOG_EXIT_TERMINATION_CONFIRMED) {
        throw this.markTerminationUnconfirmed(`watchdog exited with code ${this.child.exitCode}`);
      } else {
        this.child = null;
        this.runningArtifact = null;
      }
    }
    this.assertTerminationConfirmed();
    this.startPromise = this.startInternal(executable, artifact).finally(() => { this.startPromise = null; });
    return this.startPromise;
  }

  private async startInternal(executable: string, artifact: OllamaRuntimeArtifact): Promise<boolean> {
    await mkdir(this.modelsDir, { recursive: true });
    const child = this.spawnImpl(process.execPath, [
      '-e',
      MANAGED_OLLAMA_WATCHDOG_SOURCE,
      executable,
      JSON.stringify(['serve']),
    ], {
      env: buildManagedOllamaEnv(this.baseUrl, this.modelsDir),
      windowsHide: true,
      shell: false,
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    this.child = child;
    let startupError: Error | null = null;
    child.once('error', (error) => {
      startupError = error;
      if (this.child === child) {
        this.child = null;
        this.runningArtifact = null;
      }
    });
    child.once('exit', (code) => {
      if (this.child === child) {
        const readyArtifact = this.runningArtifact && this.sameArtifact(this.runningArtifact, artifact)
          ? this.runningArtifact
          : null;
        const stopWasRequested = this.stopRequestedChildren.has(child);
        if (code === WATCHDOG_EXIT_TERMINATION_CONFIRMED) {
          this.child = null;
          this.terminationFailure = null;
          this.pendingCrashRecovery = null;
        } else if (code === WATCHDOG_EXIT_OWNED_DAEMON_EXITED) {
          this.child = null;
          if (readyArtifact && !stopWasRequested && !this.stopInProgress && !this.terminationFailure) {
            if (this.crashRecoveryConsumed) {
              this.markTerminationUnconfirmed('managed Ollama replacement exited after its one recovery attempt');
            } else {
              this.queueCrashRecovery(readyArtifact);
            }
          }
        } else {
          this.markTerminationUnconfirmed(
            code === null ? 'watchdog exited without a success code' : `watchdog exited with code ${code}`,
          );
        }
        this.runningArtifact = null;
      }
    });

    try {
      const deadline = Date.now() + START_TIMEOUT_MS;
      while (Date.now() < deadline) {
        if (startupError) throw startupError;
        if (child.exitCode !== null) break;
        const ready = await this.probe(this.baseUrl);
        if (startupError) throw startupError;
        if (child.exitCode !== null || this.child !== child) break;
        if (ready) {
          this.runningArtifact = artifact;
          return true;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } catch (error) {
      if (startupError && child.pid === undefined) {
        if (this.child === child) this.child = null;
        this.runningArtifact = null;
        throw error;
      }
      await this.stopChild(child);
      if (this.child === child) this.child = null;
      if (this.runningArtifact === artifact) this.runningArtifact = null;
      throw error;
    }
    await this.stopChild(child);
    if (this.child === child) this.child = null;
    if (this.runningArtifact === artifact) this.runningArtifact = null;
    throw new Error('Waggle-managed Ollama did not become ready on loopback');
  }

  private requestStop(child: ChildProcess): void {
    try {
      if (child.connected) child.send('shutdown');
    } catch { /* a disconnected watchdog must confirm shutdown by exiting cleanly */ }
  }

  private markTerminationUnconfirmed(reason: string): ManagedRuntimeTerminationError {
    this.pendingCrashRecovery = null;
    this.terminationFailure ??= new ManagedRuntimeTerminationError(reason);
    return this.terminationFailure;
  }

  private assertTerminationConfirmed(): void {
    if (this.terminationFailure) throw this.terminationFailure;
  }

  private async stopChild(child: ChildProcess): Promise<void> {
    this.stopRequestedChildren.add(child);
    if (child.exitCode !== null) {
      return this.confirmWatchdogExit(child.exitCode);
    }
    const exitPromise = new Promise<number | null | undefined>((resolve) => {
      const onExit = (code: number | null) => {
        clearTimeout(timeout);
        resolve(code);
      };
      const timeout = setTimeout(() => {
        child.off('exit', onExit);
        resolve(undefined);
      }, STOP_TIMEOUT_MS);
      child.once('exit', onExit);
    });
    this.requestStop(child);
    const exitCode = await exitPromise;
    if (exitCode === undefined) {
      throw this.markTerminationUnconfirmed('watchdog did not confirm process-tree termination');
    }
    return this.confirmWatchdogExit(exitCode);
  }

  private async confirmWatchdogExit(exitCode: number | null): Promise<void> {
    if (exitCode === WATCHDOG_EXIT_TERMINATION_CONFIRMED) {
      this.terminationFailure = null;
      return;
    }
    if (exitCode === WATCHDOG_EXIT_OWNED_DAEMON_EXITED) {
      if (await this.endpointQuiescent(this.baseUrl)) return;
      throw this.markTerminationUnconfirmed('owned Ollama daemon exited but its loopback endpoint remains occupied');
    }
    throw this.markTerminationUnconfirmed(
      exitCode === null ? 'watchdog exited without a success code' : `watchdog exited with code ${exitCode}`,
    );
  }

  private async stopInternal(): Promise<void> {
    this.stopInProgress = true;
    this.pendingCrashRecovery = null;
    try {
      const child = this.child;
      if (!child) return;
      this.stopRequestedChildren.add(child);
      if (child.exitCode !== null) {
        await this.confirmWatchdogExit(child.exitCode);
        if (this.child === child) this.child = null;
        this.runningArtifact = null;
        return;
      }
      await this.stopChild(child);
      if (this.child === child) this.child = null;
      this.runningArtifact = null;
    } finally {
      this.pendingCrashRecovery = null;
      this.stopInProgress = false;
    }
  }

  async stop(): Promise<void> {
    return this.withActivationLock(() => this.stopInternal());
  }
}

async function defaultEndpointQuiescent(baseUrl: string): Promise<boolean> {
  const endpoint = new URL(baseUrl);
  const host = endpoint.hostname.replace(/^\[|\]$/g, '');
  const port = Number.parseInt(endpoint.port || '80', 10);
  return new Promise((resolve) => {
    const server = createServer();
    server.unref();
    server.once('error', () => resolve(false));
    server.listen({ host, port, exclusive: true }, () => {
      server.close((error) => resolve(error === undefined));
    });
  });
}
