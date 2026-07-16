import { createHash } from 'node:crypto';
import { spawn, execFile, type ChildProcess, type SpawnOptions } from 'node:child_process';
import {
  chmodSync,
  createWriteStream,
  existsSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { mkdir, readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const OLLAMA_VERSION = '0.32.0';
const RELEASE_ROOT = `https://github.com/ollama/ollama/releases/download/v${OLLAMA_VERSION}`;
const DOWNLOAD_TIMEOUT_MS = 45 * 60_000;
const START_TIMEOUT_MS = 45_000;
const STOP_TIMEOUT_MS = 5_000;

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
  if (child.exitCode !== null || !child.pid) return finish(0);
  forceTimer = setTimeout(() => finish(1), 4000);
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      windowsHide: true,
      shell: false,
      stdio: 'ignore',
    });
    killer.once('error', () => { try { child.kill(); } catch {} });
    killer.once('exit', () => finish(0));
  } else {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { try { child.kill(); } catch {} }
    setTimeout(() => {
      try { process.kill(-child.pid, 'SIGKILL'); } catch {}
      finish(0);
    }, 1500).unref();
  }
};
child.once('spawn', () => {
  if (process.send) process.send({ type: 'spawned', pid: child.pid });
});
child.once('error', () => finish(1));
child.once('exit', (code) => finish(stopping ? 0 : (code ?? 1)));
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

export interface ManagedOllamaStatus {
  source: 'waggle-managed';
  supported: boolean;
  installed: boolean;
  running: boolean;
  targetVersion: string | null;
  version: string | null;
  artifactSizeBytes: number | null;
  downloadRequired: boolean;
  dockerRequired: false;
  reason?: string;
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
  artifact?: OllamaRuntimeArtifact | null;
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
    const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/version`, {
      signal: AbortSignal.timeout(1_500),
    });
    return response.ok;
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

async function removeWithin(root: string, target: string): Promise<void> {
  if (!inside(root, target) || path.resolve(root) === path.resolve(target)) {
    throw new Error(`Refusing to remove path outside managed runtime root: ${target}`);
  }
  await rm(target, { recursive: true, force: true });
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
  private readonly fetchImpl: typeof fetch;
  private readonly extractArchive: NonNullable<RuntimeDependencies['extractArchive']>;
  private readonly spawnImpl: NonNullable<RuntimeDependencies['spawnImpl']>;
  private readonly probe: NonNullable<RuntimeDependencies['probe']>;
  private installPromise: Promise<{ executable: string; installedNow: boolean }> | null = null;
  private startPromise: Promise<boolean> | null = null;
  private child: ChildProcess | null = null;

  constructor(
    dataDir: string,
    private readonly baseUrl = 'http://127.0.0.1:11434',
    dependencies: RuntimeDependencies = {},
  ) {
    const platform = dependencies.platform ?? process.platform;
    const arch = dependencies.arch ?? process.arch;
    this.root = path.resolve(dataDir, 'runtimes', 'ollama');
    this.modelsDir = path.resolve(dataDir, 'models', 'ollama');
    this.artifact = dependencies.artifact === undefined
      ? resolveOllamaRuntimeArtifact(platform, arch)
      : dependencies.artifact;
    this.fetchImpl = dependencies.fetchImpl ?? fetch;
    this.extractArchive = dependencies.extractArchive ?? defaultExtract;
    this.spawnImpl = dependencies.spawnImpl ?? ((file, args, options) => spawn(file, args, options));
    this.probe = dependencies.probe ?? defaultProbe;
  }

  getStatus(): ManagedOllamaStatus {
    const executable = this.getInstalledExecutable();
    const supported = this.artifact !== null && isLoopbackEndpoint(this.baseUrl);
    return {
      source: 'waggle-managed',
      supported,
      installed: executable !== null,
      running: this.child !== null && this.child.exitCode === null,
      targetVersion: this.artifact?.version ?? null,
      version: executable ? this.artifact?.version ?? null : null,
      artifactSizeBytes: this.artifact?.sizeBytes ?? null,
      downloadRequired: executable === null,
      dockerRequired: false,
      ...(!supported
        ? { reason: this.artifact === null
          ? `No managed Ollama artifact for ${process.platform}/${process.arch}`
          : 'Managed Ollama requires a loopback OLLAMA_HOST' }
        : {}),
    };
  }

  private versionDir(): string | null {
    return this.artifact ? path.join(this.root, this.artifact.version) : null;
  }

  private getInstalledExecutable(): string | null {
    const versionDir = this.versionDir();
    if (!versionDir) return null;
    const metadataPath = path.join(versionDir, 'install.json');
    try {
      const metadata = JSON.parse(readFileSync(metadataPath, 'utf8')) as InstallMetadata;
      if (metadata.version !== this.artifact?.version || metadata.sha256 !== this.artifact.sha256) return null;
      if (path.isAbsolute(metadata.executable) || metadata.executable.split(/[\\/]/).includes('..')) return null;
      const executable = realpathSync(path.join(versionDir, metadata.executable));
      return inside(versionDir, executable) && statSync(executable).isFile() ? executable : null;
    } catch {
      return null;
    }
  }

  async install(): Promise<{ executable: string; installedNow: boolean }> {
    const existing = this.getInstalledExecutable();
    if (existing) return { executable: existing, installedNow: false };
    if (this.installPromise) return this.installPromise;
    this.installPromise = this.installInternal().finally(() => { this.installPromise = null; });
    return this.installPromise;
  }

  private async installInternal(): Promise<{ executable: string; installedNow: boolean }> {
    if (!this.artifact) throw new Error(`Managed Ollama is unsupported on ${process.platform}/${process.arch}`);
    if (!isLoopbackEndpoint(this.baseUrl)) throw new Error('Managed Ollama requires a loopback OLLAMA_HOST');

    await mkdir(this.root, { recursive: true });
    const finalDir = this.versionDir()!;
    if (existsSync(finalDir)) await removeWithin(this.root, finalDir);
    const staging = path.join(this.root, `.install-${this.artifact.version}-${process.pid}-${Date.now()}`);
    const archive = path.join(this.root, `.${this.artifact.filename}.${process.pid}.${Date.now()}.part`);
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
      await rename(staging, finalDir);
      return { executable: path.join(finalDir, relativeExecutable), installedNow: true };
    } finally {
      await rm(archive, { force: true });
      if (existsSync(staging)) await removeWithin(this.root, staging);
    }
  }

  async ensureReady(): Promise<ManagedOllamaReadyResult> {
    if (await this.probe(this.baseUrl)) {
      return { installedNow: false, startedNow: false, endpoint: this.baseUrl, status: this.getStatus() };
    }
    const installation = await this.install();
    const startedNow = await this.start(installation.executable);
    return {
      installedNow: installation.installedNow,
      startedNow,
      endpoint: this.baseUrl,
      status: this.getStatus(),
    };
  }

  private async start(executable?: string): Promise<boolean> {
    if (await this.probe(this.baseUrl)) return false;
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.startInternal(executable).finally(() => { this.startPromise = null; });
    return this.startPromise;
  }

  private async startInternal(executable?: string): Promise<boolean> {
    const runtimeExecutable = executable ?? (await this.install()).executable;
    await mkdir(this.modelsDir, { recursive: true });
    const child = this.spawnImpl(process.execPath, [
      '-e',
      MANAGED_OLLAMA_WATCHDOG_SOURCE,
      runtimeExecutable,
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
      if (this.child === child) this.child = null;
    });
    child.once('exit', () => {
      if (this.child === child) this.child = null;
    });

    const deadline = Date.now() + START_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (startupError) throw startupError;
      if (child.exitCode !== null) break;
      if (await this.probe(this.baseUrl)) return true;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    this.requestStop(child);
    if (this.child === child) this.child = null;
    throw new Error('Waggle-managed Ollama did not become ready on loopback');
  }

  private requestStop(child: ChildProcess): void {
    try {
      if (child.connected) child.send('shutdown');
      else child.kill();
    } catch {
      try { child.kill(); } catch { /* process already gone */ }
    }
  }

  async stop(): Promise<void> {
    const child = this.child;
    this.child = null;
    if (!child || child.exitCode !== null) return;
    this.requestStop(child);
    await Promise.race([
      new Promise<void>((resolve) => child.once('exit', () => resolve())),
      new Promise<void>((resolve) => setTimeout(resolve, STOP_TIMEOUT_MS)),
    ]);
    if (child.exitCode === null) child.kill();
  }
}
