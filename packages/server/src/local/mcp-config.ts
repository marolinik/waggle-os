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
 * returns env/command — see routes/mcps.ts McpListItem). Rejected entries
 * retain their original values only in a sibling recovery quarantine under
 * the same local dataDir trust boundary, never in the active configuration.
 */

import fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import type { McpRuntime, McpServerConfig } from '@waggle/agent';
import {
  MCP_SERVERS,
  createMarketplaceMcpProvenance,
  type MarketplaceMcpProvenance,
  type McpServerConfig as MarketplaceMcpServerConfig,
} from '@waggle/marketplace';
import { MCP_CATALOG } from '@waggle/shared';

/** One persisted server entry (installer-compatible + workspaceId). */
export interface PersistedMcpEntry {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  workspaceId?: string;
  provenance?: MarketplaceMcpProvenance;
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

interface CanonicalMarketplaceMcpProfile {
  packageName: string;
  packageVersion: string;
  config: MarketplaceMcpServerConfig;
  provenance: MarketplaceMcpProvenance;
}

const CANONICAL_MARKETPLACE_SOURCE = {
  name: 'mcp_registry',
  source_type: 'registry',
  is_custom: false,
} as const;

const CANONICAL_MARKETPLACE_MCPS = new Map<string, CanonicalMarketplaceMcpProfile>();
for (const pkg of MCP_SERVERS) {
  const config = pkg.install_manifest?.mcp_config;
  if (!config || !pkg.version) continue;
  CANONICAL_MARKETPLACE_MCPS.set(config.name, {
    packageName: pkg.name,
    packageVersion: pkg.version,
    config,
    provenance: createMarketplaceMcpProvenance(
      CANONICAL_MARKETPLACE_SOURCE,
      { name: pkg.name, version: pkg.version },
      config,
    ),
  });
}
const RESERVED_CATALOG_MCP_NAMES = new Set(MCP_CATALOG.map((server) => server.id));

function sameStrings(left: string[] | undefined, right: string[] | undefined): boolean {
  return JSON.stringify(left ?? []) === JSON.stringify(right ?? []);
}

function validateMarketplaceBinding(name: string, entry: PersistedMcpEntry): string | null {
  const profile = CANONICAL_MARKETPLACE_MCPS.get(name);
  if (!profile) {
    if (RESERVED_CATALOG_MCP_NAMES.has(name)) {
      return 'catalog MCP server name is reserved for a verified marketplace profile';
    }
    return entry.provenance === undefined
      ? null
      : 'marketplace provenance is only valid for a current approved marketplace profile';
  }

  const provenance = entry.provenance as MarketplaceMcpProvenance | undefined;
  if (!provenance) {
    return 'approved marketplace profile requires canonical provenance; reinstall this MCP server';
  }
  if (provenance === null || typeof provenance !== 'object' || Array.isArray(provenance)) {
    return 'marketplace provenance must be an object';
  }
  const expectedKeys = [
    'kind',
    'npmPackage',
    'packageName',
    'packageVersion',
    'profileDigest',
    'schemaVersion',
    'sourceName',
  ];
  if (JSON.stringify(Object.keys(provenance).sort()) !== JSON.stringify(expectedKeys)) {
    return 'marketplace provenance has an unsupported shape';
  }
  if (!/^sha256:[a-f0-9]{64}$/.test(provenance.profileDigest ?? '')) {
    return 'marketplace provenance digest must be a lowercase SHA-256 value';
  }
  const expected = profile.provenance;
  if (
    provenance.kind !== expected.kind
    || provenance.schemaVersion !== expected.schemaVersion
    || provenance.sourceName !== expected.sourceName
    || provenance.packageName !== expected.packageName
    || provenance.packageVersion !== expected.packageVersion
    || provenance.npmPackage !== expected.npmPackage
    || provenance.profileDigest !== expected.profileDigest
  ) {
    return 'marketplace provenance does not match the current approved profile digest';
  }
  if (entry.command !== profile.config.command) {
    return 'marketplace command does not match the current approved profile';
  }
  if (!sameStrings(entry.args, profile.config.args)) {
    return 'marketplace arguments do not match the current approved profile';
  }
  const actualEnvKeys = Object.keys(entry.env ?? {}).sort();
  const expectedEnvKeys = Object.keys(profile.config.env ?? {}).sort();
  if (!sameStrings(actualEnvKeys, expectedEnvKeys)) {
    return 'marketplace environment keys do not match the current approved profile';
  }
  return null;
}

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
  return validateMarketplaceBinding(name, e as PersistedMcpEntry);
}

interface QuarantinedMcpEntry {
  entry: unknown;
  reason: string;
}

function upgradeExactLegacyMarketplaceEntry(name: string, entry: unknown): PersistedMcpEntry | null {
  const profile = CANONICAL_MARKETPLACE_MCPS.get(name);
  if (!profile || entry === null || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const candidate = entry as Partial<PersistedMcpEntry>;
  if (candidate.provenance !== undefined) return null;
  if (candidate.command !== profile.config.command || !sameStrings(candidate.args, profile.config.args)) return null;
  if (candidate.env === null || (candidate.env !== undefined && (
    typeof candidate.env !== 'object'
    || Array.isArray(candidate.env)
    || Object.values(candidate.env).some((value) => typeof value !== 'string')
  ))) return null;
  const actualEnvKeys = Object.keys(candidate.env ?? {}).sort();
  const expectedEnvKeys = Object.keys(profile.config.env ?? {}).sort();
  if (!sameStrings(actualEnvKeys, expectedEnvKeys)) return null;
  return { ...candidate, provenance: profile.provenance } as PersistedMcpEntry;
}

function partitionMcpEntries(raw: Record<string, unknown>): {
  valid: Record<string, PersistedMcpEntry>;
  rejected: Record<string, QuarantinedMcpEntry>;
  upgraded: number;
} {
  const valid: Record<string, PersistedMcpEntry> = {};
  const rejected: Record<string, QuarantinedMcpEntry> = {};
  let upgraded = 0;
  for (const [name, entry] of Object.entries(raw)) {
    const legacyUpgrade = upgradeExactLegacyMarketplaceEntry(name, entry);
    const candidate = legacyUpgrade ?? entry;
    if (legacyUpgrade) upgraded += 1;
    const reason = validateMcpEntry(name, candidate);
    if (reason) rejected[name] = { entry, reason };
    else valid[name] = candidate as PersistedMcpEntry;
  }
  return { valid, rejected, upgraded };
}

function quarantineRejectedEntries(
  dataDir: string,
  valid: Record<string, PersistedMcpEntry>,
  rejected: Record<string, QuarantinedMcpEntry>,
  log?: { warn: (msg: string) => void },
): void {
  if (Object.keys(rejected).length === 0) return;
  const file = mcpConfigPath(dataDir);
  const quarantine = `${file}.quarantine-${Date.now()}-${randomUUID()}.json`;
  try {
    fs.writeFileSync(quarantine, JSON.stringify({
      schemaVersion: 1,
      quarantinedAt: new Date().toISOString(),
      entries: rejected,
    }, null, 2), { encoding: 'utf-8', mode: 0o600 });
  } catch (err) {
    (log?.warn ?? console.warn)(
      `[mcp-config] Rejected unsafe MCP entries but recovery quarantine write failed: ${(err as Error).message}`,
    );
    return;
  }
  try {
    writeMcpConfig(dataDir, { mcpServers: valid });
  } catch (err) {
    try { fs.unlinkSync(quarantine); } catch { /* preserve the original active file */ }
    (log?.warn ?? console.warn)(
      `[mcp-config] Rejected unsafe MCP entries but active config rewrite failed: ${(err as Error).message}`,
    );
    return;
  }
  (log?.warn ?? console.warn)(
    `[mcp-config] Quarantined ${Object.keys(rejected).length} rejected MCP entr${Object.keys(rejected).length === 1 ? 'y' : 'ies'} to ${quarantine}: ${Object.entries(rejected).map(([name, item]) => `${name}: ${item.reason}`).join('; ')}`,
  );
}

function persistLegacyUpgrades(
  dataDir: string,
  valid: Record<string, PersistedMcpEntry>,
  upgraded: number,
  rejected: Record<string, QuarantinedMcpEntry>,
  log?: { warn: (msg: string) => void },
): void {
  if (upgraded === 0 || Object.keys(rejected).length > 0) return;
  try {
    writeMcpConfig(dataDir, { mcpServers: valid });
  } catch (err) {
    (log?.warn ?? console.warn)(
      `[mcp-config] Valid legacy MCP profile migration could not be persisted; continuing safely in memory: ${(err as Error).message}`,
    );
  }
}

/**
 * Read the persisted config. Missing file → empty config. An UNPARSEABLE file
 * is quarantined aside first (rename to `.mcp.json.corrupt-<ts>`) so the
 * user's installed servers stay recoverable on disk — without this, the next
 * read-modify-write save would rewrite the file with only the new entry and
 * permanently destroy every other server. Still never throws (boot-tolerant).
 */
export function loadMcpConfig(
  dataDir: string,
  log?: { warn: (msg: string) => void },
  onRejected?: (name: string, reason: string) => void,
): McpConfigFile {
  const file = mcpConfigPath(dataDir);
  try {
    if (!fs.existsSync(file)) return { mcpServers: {} };
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as Partial<McpConfigFile>;
    if (
      parsed === null
      || typeof parsed !== 'object'
      || Array.isArray(parsed)
      || typeof parsed.mcpServers !== 'object'
      || parsed.mcpServers === null
      || Array.isArray(parsed.mcpServers)
    ) {
      throw new Error('mcpServers must be an object record');
    }
    const { valid, rejected, upgraded } = partitionMcpEntries(parsed.mcpServers as Record<string, unknown>);
    for (const [name, item] of Object.entries(rejected)) onRejected?.(name, item.reason);
    quarantineRejectedEntries(dataDir, valid, rejected, log);
    persistLegacyUpgrades(dataDir, valid, upgraded, rejected, log);
    return { mcpServers: valid };
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
  const waitBuffer = new Int32Array(new SharedArrayBuffer(4));
  try {
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        fs.renameSync(tmpPath, file);
        return;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        const transient = code === 'EPERM' || code === 'EACCES' || code === 'EBUSY';
        if (!transient || attempt === 4) throw error;
        // Windows antivirus and indexers can briefly hold an exclusive handle.
        Atomics.wait(waitBuffer, 0, 0, 25 * attempt);
      }
    }
  } finally {
    try { fs.rmSync(tmpPath, { force: true }); } catch { /* best-effort cleanup */ }
  }
}

/** Upsert one server entry (immutable read-modify-write). */
export function saveMcpServerEntry(dataDir: string, name: string, entry: PersistedMcpEntry): void {
  const invalid = validateMcpEntry(name, entry);
  if (invalid) throw new Error(`Invalid MCP server entry "${name}": ${invalid}`);
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
      (name, reason) => skipped.push({ name, reason }),
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
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)
          || typeof parsed.mcpServers !== 'object' || parsed.mcpServers === null
          || Array.isArray(parsed.mcpServers)) {
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

  const { valid: validDesired, rejected, upgraded } = partitionMcpEntries(desiredRaw);
  const desired = new Map<string, PersistedMcpEntry>(Object.entries(validDesired));
  const skipped = Object.entries(rejected).map(([name, item]) => ({ name, reason: item.reason }));
  quarantineRejectedEntries(
    dataDir,
    validDesired,
    rejected,
    log?.warn ? { warn: (message) => log.warn!(message) } : undefined,
  );
  persistLegacyUpgrades(
    dataDir,
    validDesired,
    upgraded,
    rejected,
    log?.warn ? { warn: (message) => log.warn!(message) } : undefined,
  );

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
