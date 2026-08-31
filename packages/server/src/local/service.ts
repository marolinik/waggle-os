import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import path from 'node:path';
import os from 'node:os';
import type { FastifyInstance } from 'fastify';
import { needsMigration, migrateToMultiMind, MindDB, VaultStore } from '@waggle/core';
import { buildLocalServer } from './index.js';
import type { LlmHealthStatus } from './index.js';
import { startLiteLLM, stopLiteLLM, type LiteLLMStatus } from './lifecycle.js';
import { createLogger } from './logger.js';
import { resolveBindHost } from './net-config.js';
import { readTierFromDataDir } from '../middleware/assert-tier.js';
import { listOllamaChatModelIds } from './model-availability.js';
import {
  readEraseMarker,
  performWipe,
  writeWipeReceipt,
} from './data-erase-helpers.js';
import {
  getProviderApiKey,
  hydrateProviderEnvFromVault,
  migrateLegacyProviderKeysToVault,
  PROVIDER_ENV_NAMES,
} from './provider-env.js';
import { prepareLiteLLMRuntimeConfig } from './litellm-runtime-config.js';

const log = createLogger('service');

// ── Startup progress types ─────────────────────────────────────────

export type StartupPhase = 'init' | 'migration' | 'creating-mind' | 'litellm' | 'server' | 'ready';

export interface StartupEvent {
  phase: StartupPhase;
  message: string;
  progress: number;
}

export interface ServiceOptions {
  dataDir?: string;
  port?: number;
  litellmPort?: number;
  skipLiteLLM?: boolean;
  onProgress?: (event: StartupEvent) => void;
}

export interface ServiceResult {
  server: FastifyInstance;
  litellm: LiteLLMStatus;
}

const DEFAULT_PORT = 3333;

interface DesktopReadyRecord {
  schemaVersion: 1;
  instanceId: string;
  pid: number;
  host: '127.0.0.1';
  preferredPort: number;
  port: number;
  startedAt: string;
}

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

function publishDesktopReadyFile(filePath: string, record: DesktopReadyRecord): void {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(record)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    fs.renameSync(temporaryPath, filePath);
  } catch (error) {
    try { fs.unlinkSync(temporaryPath); } catch { /* best effort */ }
    throw error;
  }
}

function removeOwnedDesktopReadyFile(filePath: string, instanceId: string): void {
  try {
    const record = JSON.parse(fs.readFileSync(filePath, 'utf8')) as { instanceId?: unknown };
    if (record.instanceId === instanceId) fs.unlinkSync(filePath);
  } catch { /* missing, malformed, or owned by a newer launch */ }
}

/**
 * Resolve the service data directory: explicit option > WAGGLE_DATA_DIR env >
 * ~/.waggle. D11 — the installer/launcher set WAGGLE_DATA_DIR; before this,
 * startService ignored it while other modules (local/index.ts config,
 * marketplace installer, memory-mcp) honored it, splitting state across two
 * directories on custom installs.
 */
export function resolveDataDir(optionDataDir?: string): string {
  // `||` on the env leg: WAGGLE_DATA_DIR set-but-empty must fall through to
  // the default, not yield '' (mkdirSync('') throws / resolves to cwd).
  return optionDataDir ?? (process.env.WAGGLE_DATA_DIR || path.join(os.homedir(), '.waggle'));
}

/** Resolve the listen port: explicit option > validated WAGGLE_PORT > 3333. */
export function resolveServicePort(optionPort?: number): number {
  if (optionPort !== undefined) return optionPort;
  const envPort = Number.parseInt(process.env.WAGGLE_PORT ?? '', 10);
  return Number.isInteger(envPort) && envPort > 0 && envPort <= 65_535
    ? envPort
    : DEFAULT_PORT;
}

/**
 * Check if this is a fresh install (no personal.mind, no default.mind).
 */
export function isFirstRun(dataDir: string): boolean {
  if (!fs.existsSync(dataDir)) return true;
  const hasPersonal = fs.existsSync(path.join(dataDir, 'personal.mind'));
  const hasDefault = fs.existsSync(path.join(dataDir, 'default.mind'));
  return !hasPersonal && !hasDefault;
}

/**
 * Check if a port is available by attempting to bind to it briefly.
 * Returns true if the port is free, false if already in use.
 */
export function checkPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', () => resolve(false))
      .once('listening', () => {
        tester.close(() => resolve(true));
      })
      .listen(port, '127.0.0.1');
  });
}

/** Identify configured providers routable by the built-in compatibility proxy. */
function getConfiguredProviderIds(dataDir: string, server?: FastifyInstance): string[] {
  const configured = new Set<string>();
  for (const providerId of Object.keys(PROVIDER_ENV_NAMES)) {
    try {
      if (server?.vault && getProviderApiKey(providerId, server.vault)) {
        configured.add(providerId);
        continue;
      }
    } catch { /* vault read failed */ }
    if (PROVIDER_ENV_NAMES[providerId].some((name) => Boolean(process.env[name]))) {
      configured.add(providerId);
    }
  }

  // buildLocalServer migrates legacy plaintext keys into Vault. Keep this
  // fallback so a partial migration cannot hide an otherwise usable route.
  try {
    const configPath = path.join(dataDir, 'config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
        providers?: Record<string, { apiKey?: string; baseUrl?: string }>;
      };
      for (const [providerId, provider] of Object.entries(config.providers ?? {})) {
        const hasKnownProviderKey = Boolean(PROVIDER_ENV_NAMES[providerId] && provider.apiKey?.trim());
        const hasCompatibleEndpoint = providerId === 'openai-compatible' && Boolean(provider.baseUrl?.trim());
        if (hasKnownProviderKey || hasCompatibleEndpoint) configured.add(providerId);
      }
    }
  } catch { /* ignore */ }
  return [...configured];
}

/**
 * Start the Waggle agent service.
 *
 * 1. Resolves/creates dataDir (option > WAGGLE_DATA_DIR > ~/.waggle)
 * 2. Runs migration if needed (default.mind -> personal.mind)
 * 3. Creates personal.mind if fresh install
 * 4. Starts LiteLLM proxy (unless skipped)
 * 5. Builds & starts local Fastify server
 * 6. Registers graceful shutdown handlers
 *
 * Optionally accepts an onProgress callback to emit startup phase events
 * for UI splash screen display.
 */
export async function startService(options?: ServiceOptions): Promise<ServiceResult> {
  const dataDir = resolveDataDir(options?.dataDir);
  const port = resolveServicePort(options?.port);
  const litellmPort = options?.litellmPort ?? 4000;
  const skipLiteLLM = options?.skipLiteLLM ?? false;
  const emit = options?.onProgress ?? (() => {});
  const allowDesktopPortFallback = process.env.WAGGLE_DESKTOP_PORT_FALLBACK === '1';
  const desktopInstanceId = process.env.WAGGLE_INSTANCE_ID?.trim();
  const desktopReadyFile = process.env.WAGGLE_READY_FILE?.trim();
  const desktopStartedAt = new Date().toISOString();

  if (allowDesktopPortFallback && (!desktopInstanceId || !desktopReadyFile || !path.isAbsolute(desktopReadyFile))) {
    throw new Error(
      'Managed desktop port fallback requires WAGGLE_INSTANCE_ID and an absolute WAGGLE_READY_FILE',
    );
  }

  // 1. Ensure dataDir exists
  emit({ phase: 'init', message: 'Initializing Waggle service...', progress: 0.05 });
  fs.mkdirSync(dataDir, { recursive: true });

  // 1.5. Honor pending erasure (Phase 4.1 pilot data-handling).
  //
  // If the previous session called POST /api/data/erase, a marker file
  // sits at <dataDir>/.erase-pending.json. We MUST process it BEFORE
  // any DB opens so SQLite never picks up handles that the wipe is about
  // to delete underneath it. The wipe is fully scoped to dataDir; see
  // assertDataDirIsSafeToWipe + the path-relative escape guards in
  // data-erase-helpers.ts.
  const pendingMarker = readEraseMarker(dataDir);
  if (pendingMarker) {
    emit({ phase: 'init', message: 'Erasing data per prior request...', progress: 0.07 });
    log.warn(
      'Pending data erasure detected — wiping data dir before any DB opens',
      { requestedAt: pendingMarker.requestedAt, snapshot: pendingMarker.snapshot },
    );
    const receipt = performWipe(dataDir, pendingMarker);
    const receiptPath = writeWipeReceipt(dataDir, receipt);
    log.warn('Data erasure complete', {
      receiptPath,
      removed: receipt.filesRemoved.length,
      skipped: receipt.filesSkipped.length,
    });
    // Re-create the dataDir if performWipe collapsed any subdirs the
    // boot path needs. (mkdirSync is idempotent above.)
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // 2. Check/run migration
  if (needsMigration(dataDir)) {
    emit({ phase: 'migration', message: 'Migrating to multi-mind layout...', progress: 0.15 });
    try {
      migrateToMultiMind(dataDir);
      emit({ phase: 'migration', message: 'Migration complete', progress: 0.2 });
    } catch (err) {
      const msg = `Migration failed: ${err instanceof Error ? err.message : String(err)}`;
      emit({ phase: 'migration', message: msg, progress: 0.2 });
      throw new Error(msg);
    }
  }

  // D11: ONE startup line answering "which state am I running against?" —
  // resolved dataDir + effective tier. Logged after wipe/migration so it
  // reflects the directory the server will actually serve.
  log.info(`Data dir: ${dataDir} · tier: ${readTierFromDataDir(dataDir)}`);

  // 3. Ensure personal.mind exists
  const personalPath = path.join(dataDir, 'personal.mind');
  if (!fs.existsSync(personalPath)) {
    emit({ phase: 'creating-mind', message: 'Creating personal memory...', progress: 0.3 });
    const mind = new MindDB(personalPath);
    mind.close();
  }

  // 4. Hydrate provider credentials before the LiteLLM child snapshots env,
  // then generate its concrete model catalog from provider APIs.
  emit({ phase: 'litellm', message: skipLiteLLM ? 'Skipping LiteLLM proxy...' : 'Starting LiteLLM proxy...', progress: 0.5 });
  let litellm: LiteLLMStatus;
  if (skipLiteLLM) {
    litellm = { status: 'error', port: litellmPort, error: 'Skipped' };
  } else {
    const startupVault = new VaultStore(dataDir);
    migrateLegacyProviderKeysToVault(dataDir, startupVault);
    hydrateProviderEnvFromVault(startupVault);
    const runtimeConfig = await prepareLiteLLMRuntimeConfig(dataDir, startupVault);
    litellm = runtimeConfig.configPath
      ? await startLiteLLM(litellmPort, runtimeConfig.configPath)
      : { status: 'error', port: litellmPort, error: 'No provider models available' };
  }

  const managedLiteLLMUrl = `http://localhost:${litellmPort}`;
  let selfProxyUrl = `http://127.0.0.1:${port}/v1`;
  let litellmReachable = false;
  if (!skipLiteLLM) {
    try {
      const healthRes = await fetch(`${managedLiteLLMUrl}/health/liveliness`, {
        signal: AbortSignal.timeout(2000),
      });
      litellmReachable = healthRes.ok;
    } catch { /* not reachable */ }
  }

  // 5. Build and atomically bind the local server. Managed desktop launches
  // may retry the same Fastify instance on an OS-assigned port when the
  // preferred port is occupied; CLI/browser launches preserve fail-closed
  // EADDRINUSE behavior.
  emit({ phase: 'server', message: 'Starting local server...', progress: 0.75 });
  const server = await buildLocalServer({
    dataDir,
    port,
    instanceId: allowDesktopPortFallback ? desktopInstanceId : undefined,
    litellmUrl: litellmReachable ? managedLiteLLMUrl : selfProxyUrl,
    manageLiteLLM: !skipLiteLLM,
    managedLiteLLMPort: litellmPort,
    useBuiltInProxy: !litellmReachable,
    startOfflineManagerOnListen: false,
  });

  // 7. Register self-removing shutdown handlers (must add hook before listen)
  const shutdown = async (): Promise<void> => {
    process.off('SIGTERM', shutdown);
    process.off('SIGINT', shutdown);
    await server.close();
    if (!skipLiteLLM) {
      await stopLiteLLM();
    }
  };

  // Deregister signal handlers when server closes normally (e.g. in tests)
  server.addHook('onClose', async () => {
    process.off('SIGTERM', shutdown);
    process.off('SIGINT', shutdown);
    if (allowDesktopPortFallback && desktopReadyFile && desktopInstanceId) {
      removeOwnedDesktopReadyFile(desktopReadyFile, desktopInstanceId);
    } else {
      // Legacy CLI/browser lifecycle keeps the shared PID file contract.
      try { fs.unlinkSync(path.join(dataDir, 'server.pid')); } catch { /* ok */ }
    }
  });

  const bindHost = allowDesktopPortFallback ? '127.0.0.1' : resolveBindHost();
  const cleanupListenFailure = async (): Promise<void> => {
    try { await server.close(); } catch { /* preserve the listen error */ }
    if (!skipLiteLLM) await stopLiteLLM().catch(() => undefined);
  };
  try {
    await server.listen({ port, host: bindHost });
  } catch (error) {
    if (allowDesktopPortFallback && errorCode(error) === 'EADDRINUSE') {
      try {
        await server.listen({ port: 0, host: bindHost });
      } catch (fallbackError) {
        await cleanupListenFailure();
        throw fallbackError;
      }
    } else {
      await cleanupListenFailure();
      if (errorCode(error) === 'EADDRINUSE') {
        const message = `Port ${port} is already in use. Another Waggle instance may be running.\nTo fix: close the other instance, or set WAGGLE_PORT=<port> to use a different port.`;
        emit({ phase: 'server', message, progress: 0.7 });
        throw new Error(message, { cause: error });
      }
      throw error;
    }
  }

  const listeningAddress = server.server.address();
  if (!listeningAddress || typeof listeningAddress === 'string') {
    await server.close();
    if (!skipLiteLLM) await stopLiteLLM().catch(() => undefined);
    throw new Error('Unable to resolve the Waggle service listen port');
  }
  const actualPort = listeningAddress.port;
  server.localConfig.port = actualPort;
  if (!litellmReachable) {
    selfProxyUrl = `http://127.0.0.1:${actualPort}/v1`;
    server.localConfig.litellmUrl = selfProxyUrl;
  }

  // Write PID file for stale-process detection
  if (!allowDesktopPortFallback) {
    try {
      fs.writeFileSync(path.join(dataDir, 'server.pid'), String(process.pid));
    } catch { /* non-blocking */ }
  }

  // 8. Determine LLM provider — truthful, not optimistic
  let providerName: 'litellm' | 'anthropic-proxy' | 'ollama' = 'anthropic-proxy';
  let providerHealth: LlmHealthStatus = 'unavailable';
  let providerDetail = 'No working LLM path';

  if (litellmReachable) {
    providerName = 'litellm';
    providerHealth = 'healthy';
    providerDetail = `LiteLLM on port ${litellmPort}`;
    log.info(`LLM provider: LiteLLM (http://localhost:${litellmPort})`);
  } else {
    // Fall back to the in-process provider proxy (no Python/Docker required).
    server.agentState.litellmApiKey = server.agentState.wsSessionToken;
    server.localConfig.litellmUrl = selfProxyUrl;
    providerName = 'anthropic-proxy';

    const configuredProviders = getConfiguredProviderIds(dataDir, server);
    if (configuredProviders.length > 0) {
      providerHealth = 'degraded';
      providerDetail = configuredProviders.length === 1 && configuredProviders[0] === 'anthropic'
        ? 'Built-in Anthropic proxy (API key configured; verification pending)'
        : `Built-in provider proxy (provider configured: ${configuredProviders.join(', ')}; verification pending)`;
    } else {
      const localModels = await listOllamaChatModelIds();
      if (localModels.length > 0) {
        providerName = 'ollama';
        providerHealth = 'healthy';
        providerDetail = `Local Ollama model (${localModels[0]})`;
        server.agentState.currentModel = localModels[0];
      } else {
        providerHealth = 'degraded';
      providerDetail = 'Built-in provider proxy (no API key — configure in Settings > API Keys)';
      }
    }

    if (litellm.status !== 'running' && litellm.status !== 'started') {
      log.info(`LiteLLM unavailable (${litellm.status}), using built-in provider proxy`);
    } else {
      log.info(`LiteLLM not reachable, using built-in provider proxy`);
    }
    log.info(`LLM provider: ${providerDetail}`);
  }

  // Set the provider status on server state
  server.agentState.llmProvider = {
    provider: providerName,
    health: providerHealth,
    detail: providerDetail,
    checkedAt: new Date().toISOString(),
  };
  server.offlineManager.start();

  emit({ phase: 'ready', message: `LLM: ${providerDetail}`, progress: 0.9 });

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  if (allowDesktopPortFallback && desktopReadyFile && desktopInstanceId) {
    try {
      publishDesktopReadyFile(desktopReadyFile, {
        schemaVersion: 1,
        instanceId: desktopInstanceId,
        pid: process.pid,
        host: '127.0.0.1',
        preferredPort: port,
        port: actualPort,
        startedAt: desktopStartedAt,
      });
    } catch (error) {
      await shutdown();
      throw new Error(`Unable to publish desktop service readiness: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  emit({ phase: 'ready', message: 'Waggle service is ready!', progress: 1 });

  return { server, litellm };
}

// Main entry point when run directly
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isMain) {
  const skipLiteLLM = process.argv.includes('--skip-litellm') || process.env.WAGGLE_SKIP_LITELLM === '1';
  startService({ skipLiteLLM })
    .then(({ server }) => {
      const addr = server.server.address();
      const port = typeof addr === 'object' && addr ? addr.port : '?';
      const llm = server.agentState.llmProvider;
      log.info(`Server running on http://127.0.0.1:${port}`);
      log.info(`LLM: ${llm.provider} (${llm.health}) — ${llm.detail}`);
    })
    .catch((err) => {
      log.error('Failed to start:', err.message ?? err);
      process.exit(1);
    });
}
