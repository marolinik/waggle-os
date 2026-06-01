/**
 * Bespoke JSON5 codec + minimal-touch register/unregister for OpenClaw's
 * `~/.openclaw/openclaw.json`.
 *
 * OpenClaw's config is JSON5 (comments, trailing commas, `$include` merges,
 * `${ENV}` substitution). Naive `JSON.parse`→`JSON.stringify` DESTROYS user
 * comments and trailing commas, so we do NOT re-serialize the whole file for
 * fidelity. Instead:
 *   - the actual hook IMPLEMENTATION lives in a managed DIRECTORY
 *     (`~/.openclaw/hooks/hive-mind/{HOOK.md, handler.js}`), written by
 *     install.ts;
 *   - this module performs a MINIMAL-TOUCH edit of openclaw.json — flip
 *     `hooks.internal.enabled = true` and add an
 *     `hooks.internal.entries["hive-mind"] = { enabled: true }` entry — so the
 *     gateway discovers + activates our hook dir;
 *   - reversibility relies on the LITERAL byte-identical backup the installer
 *     writes (install-core `backupByteIdentical` / `restoreFromBackup`), NOT
 *     on re-serialization fidelity. This module only produces the merged
 *     object we WRITE on install.
 *
 * Parse priority: strict `JSON.parse` FIRST (fast, exact), then `JSON5.parse`
 * fallback (tolerates comments / trailing commas). Both fail → throw so the
 * installer fails loudly rather than clobbering a user config.
 *
 * Immutability: every function returns a NEW config object and never mutates
 * its input (mirrors the `jsonRegister` contract).
 */

import JSON5 from 'json5';

/** Logical entry key under `hooks.internal.entries` identifying our hook. */
export const HIVE_ENTRY_KEY = 'hive-mind';

/** Top-level JSON5 key holding the hooks subsystem. */
export const HOOKS_KEY = 'hooks';

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * Parse an `openclaw.json` string into a plain object. Returns `{}` for an
 * empty/whitespace string (create-if-missing). Tries strict JSON first, then
 * JSON5; throws only if BOTH fail.
 */
export function parseConfig(raw: string): Record<string, unknown> {
  if (!raw || raw.trim().length === 0) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    try {
      parsed = JSON5.parse(raw);
    } catch (err) {
      throw new Error(
        'failed to parse ~/.openclaw/openclaw.json as JSON or JSON5: ' +
        (err instanceof Error ? err.message : String(err)),
      );
    }
  }
  const record = asRecord(parsed);
  // A top-level scalar/array doc is not a valid openclaw config shape; treat
  // it as empty rather than crashing (the original bytes are backed up
  // regardless, so nothing is lost on uninstall).
  return record ?? {};
}

/**
 * Serialize a config object back to JSON (2-space, trailing newline). NOTE:
 * this is LOSSY for JSON5 sources (comments / trailing commas are dropped) —
 * which is exactly why uninstall restores the literal byte-identical backup
 * instead of re-serializing. We use plain `JSON.stringify` (not JSON5) so the
 * written file is valid strict JSON, which OpenClaw's JSON5 parser also
 * accepts.
 */
export function serializeConfig(config: Record<string, unknown>): string {
  return JSON.stringify(config, null, 2) + '\n';
}

/** The minimal env block our entry carries (workspace context for the handler). */
export interface HiveEntryEnv {
  [key: string]: string;
}

export interface RegisterOptions {
  /** Optional env to attach to the entry (e.g. WAGGLE_WORKSPACE_ID). */
  env?: HiveEntryEnv;
}

/**
 * Returns a NEW config object with the internal-hooks subsystem enabled and a
 * marker entry pointing the gateway at our managed `hive-mind` hook dir.
 * Existing config (including any other `hooks.internal.entries`) is preserved
 * verbatim. Re-running install replaces OUR entry in place (idempotent
 * upgrade) rather than duplicating.
 *
 * Touched keys (recorded by the caller in the pointer.extra so uninstall —
 * the rare backup-less path — knows exactly what to strip):
 *   - hooks.internal.enabled = true
 *   - hooks.internal.entries["hive-mind"] = { enabled: true, env? }
 */
export function jsonRegister(
  config: Record<string, unknown> | undefined,
  opts: RegisterOptions = {},
): Record<string, unknown> {
  const next: Record<string, unknown> = config ? { ...config } : {};

  const hooks = asRecord(next[HOOKS_KEY]);
  const nextHooks: Record<string, unknown> = hooks ? { ...hooks } : {};

  const internal = asRecord(nextHooks['internal']);
  const nextInternal: Record<string, unknown> = internal ? { ...internal } : {};
  nextInternal['enabled'] = true;

  const entries = asRecord(nextInternal['entries']);
  const nextEntries: Record<string, unknown> = entries ? { ...entries } : {};
  const entry: Record<string, unknown> = { enabled: true };
  if (opts.env && Object.keys(opts.env).length > 0) entry['env'] = { ...opts.env };
  nextEntries[HIVE_ENTRY_KEY] = entry;
  nextInternal['entries'] = nextEntries;

  nextHooks['internal'] = nextInternal;
  next[HOOKS_KEY] = nextHooks;
  return next;
}

/**
 * Returns a NEW config object with our `hive-mind` entry removed from
 * `hooks.internal.entries`. Leaves `hooks.internal.enabled` as-is (other hooks
 * may rely on it — minimal-touch). Non-hive entries preserved verbatim. Never
 * mutates input.
 *
 * Note: uninstall normally restores the literal byte-identical backup, so this
 * is used for verify/diagnostics and the (rare) backup-less path.
 */
export function jsonUnregister(
  config: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const next: Record<string, unknown> = config ? { ...config } : {};
  const hooks = asRecord(next[HOOKS_KEY]);
  if (!hooks) return next;
  const nextHooks: Record<string, unknown> = { ...hooks };

  const internal = asRecord(nextHooks['internal']);
  if (!internal) {
    next[HOOKS_KEY] = nextHooks;
    return next;
  }
  const nextInternal: Record<string, unknown> = { ...internal };

  const entries = asRecord(nextInternal['entries']);
  if (entries) {
    const nextEntries: Record<string, unknown> = { ...entries };
    delete nextEntries[HIVE_ENTRY_KEY];
    nextInternal['entries'] = nextEntries;
  }

  nextHooks['internal'] = nextInternal;
  next[HOOKS_KEY] = nextHooks;
  return next;
}

/** True iff `hooks.internal.entries["hive-mind"]` is present. */
export function hasHiveEntries(config: Record<string, unknown> | undefined): boolean {
  if (!config) return false;
  const hooks = asRecord(config[HOOKS_KEY]);
  const internal = asRecord(hooks?.['internal']);
  const entries = asRecord(internal?.['entries']);
  return !!entries && Object.prototype.hasOwnProperty.call(entries, HIVE_ENTRY_KEY);
}
