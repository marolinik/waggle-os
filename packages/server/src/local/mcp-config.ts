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
import { randomUUID } from 'node:crypto';
import type { McpRuntime } from '@waggle/agent';

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
