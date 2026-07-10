/**
 * Persisted MCP server config — `<dataDir>/.mcp.json` (UX-Refactor Phase 4, C4).
 *
 * This is the canonical store the boot loader reads to populate the (previously
 * permanently-empty) `McpRuntime`, and that routes/mcps.ts mutates. The file
 * shape is identical to what the marketplace installer writes
 * (`{ mcpServers: { name: { command, args, env } } }`) plus an optional
 * per-entry `workspaceId` (C19: single-workspace scoping v1).
 *
 * NO SQLite migration — a JSON file at dataDir, mirroring workspace.json.
 * All reads are tolerant: a missing file yields an empty config and a bad
 * entry is skipped — MCP config must never block boot. A CORRUPT file is
 * quarantined aside (`.mcp.json.corrupt-<ts>`) before returning empty, so the
 * next save cannot silently wipe the user's installed servers; writes are
 * atomic (temp file + rename, same pattern as agents-store.ts).
 *
 * SECURITY NOTE (§7.1 accepted exposure): `env` values may carry MCP API keys
 * and are persisted PLAINTEXT in this local file — the same trust model as
 * every stdio MCP host's .mcp.json (the spawned process needs the raw value
 * in its environment). Vault-backed env references resolved at spawn time are
 * a scheduled follow-up; until then this file is the documented exception to
 * vault-only secrets. It must never leave the local dataDir (no GET route
 * returns env/command — see routes/mcps.ts McpListItem).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import type { McpRuntime, McpServerConfig } from '@waggle/agent';

/** One persisted server entry (installer-compatible + workspaceId). */
export interface PersistedMcpEntry {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  workspaceId?: string;
}

export interface McpConfigFile {
  mcpServers: Record<string, PersistedMcpEntry>;
}

/** Same fallback as local/index.ts `waggleHome`: empty dataDir → ~/.waggle. */
export function mcpConfigPath(dataDir: string): string {
  const home = dataDir || path.join(os.homedir(), '.waggle');
  return path.join(home, '.mcp.json');
}

/** Server names become tool prefixes (`mcp_<name>_<tool>`) and file keys —
 *  keep them shell/path-safe. */
const NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/;

/** Validate one entry; returns an error string or null when valid. */
export function validateMcpEntry(name: string, entry: unknown): string | null {
  if (!NAME_PATTERN.test(name)) {
    return `invalid server name "${name}" (allowed: alphanumeric . _ -, max 100 chars)`;
  }
  if (entry === null || typeof entry !== 'object') return 'entry must be an object';
  const e = entry as Partial<PersistedMcpEntry>;
  if (typeof e.command !== 'string' || e.command.trim().length === 0) {
    return 'command must be a non-empty string';
  }
  if (e.args !== undefined && (!Array.isArray(e.args) || e.args.some((a) => typeof a !== 'string'))) {
    return 'args must be an array of strings';
  }
  if (e.env !== undefined && (e.env === null || typeof e.env !== 'object' || Array.isArray(e.env)
      || Object.values(e.env).some((v) => typeof v !== 'string'))) {
    return 'env must be a string-to-string record';
  }
  if (e.workspaceId !== undefined && typeof e.workspaceId !== 'string') {
    return 'workspaceId must be a string';
  }
  return null;
}

/**
 * Read the persisted config. Missing file → empty config. An UNPARSEABLE file
 * is quarantined aside first (rename to `.mcp.json.corrupt-<ts>`) so the
 * user's installed servers stay recoverable on disk — without this, the next
 * read-modify-write save would rewrite the file with only the new entry and
 * permanently destroy every other server. Still never throws (boot-tolerant).
 */
export function loadMcpConfig(dataDir: string, log?: { warn: (msg: string) => void }): McpConfigFile {
  const file = mcpConfigPath(dataDir);
  try {
    if (!fs.existsSync(file)) return { mcpServers: {} };
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as Partial<McpConfigFile>;
    if (parsed === null || typeof parsed !== 'object' || typeof parsed.mcpServers !== 'object' || parsed.mcpServers === null) {
      return { mcpServers: {} };
    }
    return { mcpServers: parsed.mcpServers };
  } catch (err) {
    const quarantine = `${file}.corrupt-${Date.now()}`;
    try {
      fs.renameSync(file, quarantine);
      (log?.warn ?? console.warn)(
        `[mcp-config] Corrupt ${file} — quarantined to ${quarantine}: ${(err as Error).message}`,
      );
    } catch {
      (log?.warn ?? console.warn)(
        `[mcp-config] Corrupt ${file} (quarantine rename failed): ${(err as Error).message}`,
      );
    }
    return { mcpServers: {} };
  }
}

/** Atomic write: temp file in the same directory, then rename over the target
 *  (same pattern + Windows AV/file-lock handling as agents-store.ts). */
function writeMcpConfig(dataDir: string, config: McpConfigFile): void {
  const file = mcpConfigPath(dataDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmpPath = `${file}.${process.pid}.${randomUUID()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2), 'utf-8');
  try {
    fs.renameSync(tmpPath, file);
  } catch (err) {
    // Windows AV/file-lock on the target is a real occurrence — don't orphan
    // the temp file when the swap fails; surface the original error.
    try { fs.unlinkSync(tmpPath); } catch { /* already gone */ }
    throw err;
  }
}

/** Upsert one server entry (immutable read-modify-write). */
export function saveMcpServerEntry(dataDir: string, name: string, entry: PersistedMcpEntry): void {
  const current = loadMcpConfig(dataDir);
  writeMcpConfig(dataDir, {
    mcpServers: { ...current.mcpServers, [name]: entry },
  });
}

/** Remove one server entry. Returns true when it existed. */
export function removeMcpServerEntry(dataDir: string, name: string): boolean {
  const current = loadMcpConfig(dataDir);
  if (!(name in current.mcpServers)) return false;
  const { [name]: _removed, ...rest } = current.mcpServers;
  writeMcpConfig(dataDir, { mcpServers: rest });
  return true;
}

/**
 * Boot-time population (C4 — THE foundational Phase-4 work item): register
 * every valid persisted entry into the runtime. Register only — servers stay
 * 'stopped' until POST /api/mcps/:id/start (no surprise process spawns at
 * boot). A bad entry logs + skips; nothing here may throw.
 *
 * Returns { registered, skipped } for boot logging / smoke assertions.
 */
export function populateMcpRuntimeFromConfig(
  runtime: McpRuntime,
  dataDir: string,
  log?: { info: (msg: string) => void; warn?: (msg: string) => void },
): { registered: string[]; skipped: Array<{ name: string; reason: string }> } {
  const registered: string[] = [];
  const skipped: Array<{ name: string; reason: string }> = [];
  try {
    const { mcpServers } = loadMcpConfig(
      dataDir,
      log?.warn ? { warn: (m) => log.warn!(m) } : undefined,
    );
    for (const [name, entry] of Object.entries(mcpServers)) {
      const invalid = validateMcpEntry(name, entry);
      if (invalid) {
        skipped.push({ name, reason: invalid });
        log?.info(` Skipping persisted MCP server "${name}": ${invalid}`);
        continue;
      }
      try {
        runtime.addServer({
          name,
          command: entry.command,
          args: entry.args,
          env: entry.env,
          workspaceId: entry.workspaceId,
        });
        registered.push(name);
      } catch (err) {
        // e.g. duplicate name — never block boot
        skipped.push({ name, reason: (err as Error).message });
        log?.info(` Skipping persisted MCP server "${name}": ${(err as Error).message}`);
      }
    }
  } catch (err) {
    log?.info(` MCP config load failed (continuing with empty runtime): ${(err as Error).message}`);
  }
  if (registered.length > 0) {
    log?.info(` Registered ${registered.length} persisted MCP server(s): ${registered.join(', ')}`);
  }
  return { registered, skipped };
}

// ── Hot-reload (.mcp.json) — steal #7 ─────────────────────────────────────
//
// Bring a running McpRuntime back into agreement with the on-disk config
// WITHOUT a restart: a (mtime, sha256) signature fast-path skips the common
// no-op case; a 3-way diff applies the delta surgically. State is preserved —
// a changed server is only restarted if it was already running, additions are
// registered stopped (matching the C4 boot loader), and a corrupt file NEVER
// tears anything down. Triggered explicitly (POST /api/mcps/reload) and cheaply
// piggybacked on GET /api/mcps.

interface McpFileSignature {
  mtimeMs: number;
  hash: string;
}

/** Last-observed signature per config path (module-scoped: one runtime per process). */
const mcpSignatureCache = new Map<string, McpFileSignature | 'missing'>();

export interface McpReloadResult {
  changed: boolean;
  added: string[];
  removed: string[];
  /** Changed servers that were re-registered with new config. */
  reregistered: string[];
  /** Re-registered servers that were running and got restarted. */
  restarted: string[];
  skipped: Array<{ name: string; reason: string }>;
  /** Set on parse failure — servers were left untouched. */
  error?: string;
}

/** Reset the signature cache — test-only (each temp config starts clean). */
export function _resetMcpSignatureCache(): void {
  mcpSignatureCache.clear();
}

/** Config equality between a live runtime config and a persisted entry. */
function entryConfigEqual(a: McpServerConfig, b: PersistedMcpEntry): boolean {
  return (
    a.command === b.command &&
    JSON.stringify(a.args ?? []) === JSON.stringify(b.args ?? []) &&
    JSON.stringify(a.env ?? {}) === JSON.stringify(b.env ?? {}) &&
    (a.workspaceId ?? null) === (b.workspaceId ?? null)
  );
}

/**
 * Reconcile the runtime against `<dataDir>/.mcp.json` if the file changed since
 * the last call. Cheap when unchanged (mtime short-circuit). Never throws.
 */
export async function refreshMcpIfChanged(
  runtime: McpRuntime,
  dataDir: string,
  log?: { info?: (msg: string) => void; warn?: (msg: string) => void },
): Promise<McpReloadResult> {
  const empty: McpReloadResult = {
    changed: false, added: [], removed: [], reregistered: [], restarted: [], skipped: [],
  };
  const file = mcpConfigPath(dataDir);

  let stat: fs.Stats | null;
  try { stat = fs.statSync(file); } catch { stat = null; }
  const cached = mcpSignatureCache.get(file);

  // Fast path: unchanged mtime (or still-missing file) → nothing to do.
  if (stat === null) {
    if (cached === 'missing') return empty;
  } else if (cached && cached !== 'missing' && cached.mtimeMs === stat.mtimeMs) {
    return empty;
  }

  let content = '';
  let hash = 'missing';
  if (stat !== null) {
    try {
      content = fs.readFileSync(file, 'utf-8');
    } catch (err) {
      log?.warn?.(`[mcp-config] reload read failed: ${(err as Error).message}`);
      return empty;
    }
    hash = createHash('sha256').update(content).digest('hex');
    // Same bytes, new mtime (a touch) — refresh the signature and no-op.
    if (cached && cached !== 'missing' && cached.hash === hash) {
      mcpSignatureCache.set(file, { mtimeMs: stat.mtimeMs, hash });
      return empty;
    }
  }

  // Parse explicitly (NOT loadMcpConfig — it quarantines + empties a corrupt
  // file, which would masquerade here as "every server removed").
  let desiredRaw: Record<string, unknown>;
  if (stat === null) {
    desiredRaw = {};
  } else {
    try {
      const parsed = JSON.parse(content) as Partial<McpConfigFile>;
      if (parsed === null || typeof parsed !== 'object'
          || typeof parsed.mcpServers !== 'object' || parsed.mcpServers === null) {
        throw new Error('missing mcpServers object');
      }
      desiredRaw = parsed.mcpServers as Record<string, unknown>;
    } catch (err) {
      // Bad file: warn, keep running servers, and record the signature so we
      // don't re-warn until the file changes again.
      log?.warn?.(`[mcp-config] reload skipped — unparseable .mcp.json: ${(err as Error).message}`);
      mcpSignatureCache.set(file, { mtimeMs: stat.mtimeMs, hash });
      return { ...empty, error: (err as Error).message };
    }
  }

  const desired = new Map<string, PersistedMcpEntry>();
  const skipped: Array<{ name: string; reason: string }> = [];
  for (const [name, entry] of Object.entries(desiredRaw)) {
    const invalid = validateMcpEntry(name, entry);
    if (invalid) { skipped.push({ name, reason: invalid }); continue; }
    desired.set(name, entry as PersistedMcpEntry);
  }

  const added: string[] = [];
  const removed: string[] = [];
  const reregistered: string[] = [];
  const restarted: string[] = [];

  // Removed: registered in the runtime, absent from the desired config.
  for (const name of Object.keys(runtime.getServerStates())) {
    if (!desired.has(name)) {
      await runtime.removeServer(name); // stops the process if running
      removed.push(name);
    }
  }

  // Added / changed.
  for (const [name, entry] of desired) {
    const existing = runtime.getServer(name);
    if (!existing) {
      try {
        runtime.addServer({ name, command: entry.command, args: entry.args, env: entry.env, workspaceId: entry.workspaceId });
        added.push(name); // registered stopped (no surprise spawn)
      } catch (err) {
        skipped.push({ name, reason: (err as Error).message });
      }
      continue;
    }
    if (entryConfigEqual(existing.config, entry)) continue;

    const state = existing.getState();
    const wasRunning = state === 'ready' || state === 'starting';
    await runtime.removeServer(name);
    try {
      runtime.addServer({ name, command: entry.command, args: entry.args, env: entry.env, workspaceId: entry.workspaceId });
      reregistered.push(name);
      if (wasRunning) {
        try {
          await runtime.getServer(name)!.start();
          restarted.push(name);
        } catch (err) {
          skipped.push({ name, reason: `restart failed: ${(err as Error).message}` });
        }
      }
    } catch (err) {
      skipped.push({ name, reason: (err as Error).message });
    }
  }

  mcpSignatureCache.set(file, stat === null ? 'missing' : { mtimeMs: stat.mtimeMs, hash });

  const changed = added.length > 0 || removed.length > 0 || reregistered.length > 0;
  if (changed) {
    log?.info?.(`[mcp-config] hot-reload: +${added.length} -${removed.length} ~${reregistered.length}`);
  }
  return { changed, added, removed, reregistered, restarted, skipped };
}
