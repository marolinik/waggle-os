import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import os from 'node:os';
import type { FastifyInstance } from 'fastify';
import { needsMigration, migrateToMultiMind, MindDB } from '@waggle/core';
import { buildLocalServer } from './index.js';
import type { LlmHealthStatus } from './index.js';
import { startLiteLLM, stopLiteLLM, type LiteLLMStatus } from './lifecycle.js';

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

/**
 * Check if an Anthropic API key is available (env, vault, or config file).
 * P0-3 fix: Also checks vault to match getAnthropicKey() in anthropic-proxy.ts.
 */
function hasAnthropicKey(dataDir: string, server?: FastifyInstance): boolean {
  if (process.env.ANTHROPIC_API_KEY) return true;
  // Check vault (encrypted storage from Settings UI)
  if (server && (server as any).vault) {
    try {
      const entry = (server as any).vault.get('anthropic');
      if (entry?.value) return true;
    } catch { /* vault read failed */ }
  }
  try {
    const configPath = path.join(dataDir, 'config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return !!config?.providers?.anthropic?.apiKey;
    }
  } catch { /* ignore */ }
  return false;
}

/**
 * Start the Waggle agent service.
 *
 * 1. Resolves/creates dataDir (~/.waggle)
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
  const dataDir = options?.dataDir ?? path.join(os.homedir(), '.waggle');
  const port = options?.port ?? DEFAULT_PORT;
  const litellmPort = options?.litellmPort ?? 4000;
  const skipLiteLLM = options?.skipLiteLLM ?? false;
  const emit = options?.onProgress ?? (() => {});

  // 1. Ensure dataDir exists
  emit({ phase: 'init', message: 'Initializing Waggle service...', progress: 0.05 });
  fs.mkdirSync(dataDir, { recursive: true });

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

  // 3. Ensure personal.mind exists
  const personalPath = path.join(dataDir, 'personal.mind');
  if (!fs.existsSync(personalPath)) {
    emit({ phase: 'creating-mind', message: 'Creating personal memory...', progress: 0.3 });
    const mind = new MindDB(personalPath);
    mind.close();
  }

  // 4. Start LiteLLM (unless skipped)
  emit({ phase: 'litellm', message: skipLiteLLM ? 'Skipping LiteLLM proxy...' : 'Starting LiteLLM proxy...', progress: 0.5 });
  let litellm: LiteLLMStatus;
  if (skipLiteLLM) {
    litellm = { status: 'error', port: litellmPort, error: 'Skipped' };
  } else {
    litellm = await startLiteLLM(litellmPort);
  }

  // 5. Check port availability before building server
  emit({ phase: 'server', message: 'Checking port availability...', progress: 0.7 });
  const portFree = await checkPortAvailable(port);
  if (!portFree) {
    const msg = `Port ${port} is already in use. Another Waggle instance may be running.\nTo fix: close the other instance, or set WAGGLE_PORT=<port> to use a different port.`;
    emit({ phase: 'server', message: msg, progress: 0.7 });
    throw new Error(msg);
  }

  // 6. Build and start local server
  emit({ phase: 'server', message: 'Starting local server...', progress: 0.75 });
  const server = await buildLocalServer({
    dataDir,
    port,
    litellmUrl: `http://localhost:${litellmPort}`,
  });

  // 7. Register self-removing shutdown handlers (must add hook before listen)
  let shutdown: () => Promise<void>;

  // Deregister signal handlers when server closes normally (e.g. in tests)
  server.addHook('onClose', async () => {
    process.off('SIGTERM', shutdown);
    process.off('SIGINT', shutdown);
    // Remove PID file on close
    try { fs.unlinkSync(path.join(dataDir, 'server.pid')); } catch { /* ok */ }
  });

  await server.listen({ port, host: process.env.WAGGLE_HOST ?? '0.0.0.0' });

  // Write PID file for stale-process detection
  try {
    fs.writeFileSync(path.join(dataDir, 'server.pid'), String(process.pid));
  } catch { /* non-blocking */ }

  // 8. Determine LLM provider — truthful, not optimistic
  let providerName: 'litellm' | 'anthropic-proxy' = 'anthropic-proxy';
  let providerHealth: LlmHealthStatus = 'unavailable';
  let providerDetail = 'No working LLM path';

  // Try LiteLLM first
  let litellmReachable = false;
  try {
    const healthRes = await fetch(`http://localhost:${litellmPort}/health/liveliness`, {
      signal: AbortSignal.timeout(2000),
    });
    litellmReachable = healthRes.ok;
  } catch { /* not reachable */ }

  if (litellmReachable) {
    providerName = 'litellm';
    providerHealth = 'healthy';
    providerDetail = `LiteLLM on port ${litellmPort}`;
    console.log(`[waggle] LLM provider: LiteLLM (http://localhost:${litellmPort})`);
  } else {
    // Fall back to built-in Anthropic proxy
    const selfUrl = `http://127.0.0.1:${port}/v1`;
    server.agentState.litellmApiKey = server.agentState.wsSessionToken;
    (server.localConfig as any).litellmUrl = selfUrl;
    providerName = 'anthropic-proxy';

    const hasKey = hasAnthropicKey(dataDir, server);
    if (hasKey) {
      providerHealth = 'healthy';
      providerDetail = 'Built-in Anthropic proxy (API key configured)';
    } else {
      providerHealth = 'degraded';
      providerDetail = 'Built-in Anthropic proxy (no API key — configure in Settings > API Keys)';
    }

    if (litellm.status !== 'running' && litellm.status !== 'started') {
      console.log(`[waggle] LiteLLM unavailable (${litellm.status}), using built-in Anthropic proxy`);
    } else {
      console.log(`[waggle] LiteLLM not reachable, using built-in Anthropic proxy`);
    }
    console.log(`[waggle] LLM provider: ${providerDetail}`);
  }

  // Set the provider status on server state
  server.agentState.llmProvider = {
    provider: providerName,
    health: providerHealth,
    detail: providerDetail,
    checkedAt: new Date().toISOString(),
  };

  emit({ phase: 'ready', message: `LLM: ${providerDetail}`, progress: 0.9 });

  shutdown = async () => {
    process.off('SIGTERM', shutdown);
    process.off('SIGINT', shutdown);
    await server.close();
    if (!skipLiteLLM) {
      await stopLiteLLM();
    }
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

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
      console.log(`[waggle] Server running on http://127.0.0.1:${port}`);
      console.log(`[waggle] LLM: ${llm.provider} (${llm.health}) — ${llm.detail}`);
    })
    .catch((err) => {
      console.error('[waggle] Failed to start:', err.message ?? err);
      process.exit(1);
    });
}
