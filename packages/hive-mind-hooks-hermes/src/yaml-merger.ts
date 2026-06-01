/**
 * Bespoke YAML codec + additive register/unregister for the Hermes
 * shell-hooks `config.yaml`.
 *
 * Hermes's hook config is NOT JSON — it is a top-level `hooks:` block in
 * `~/.hermes/config.yaml`, so it cannot use the shared `jsonRegister`
 * helper. This module is the hermes-only equivalent: parse/serialize via
 * the `yaml` dep, and additively merge marker-tagged hive entries into the
 * `hooks:` block while preserving the user's existing entries verbatim.
 *
 * Reversibility note: YAML re-serialization is NOT byte-identical (comments
 * and key ordering are lost on round-trip), so uninstall does NOT rely on
 * re-serializing a diff. Instead the installer writes a LITERAL
 * byte-identical backup of the original `config.yaml` and uninstall restores
 * those exact bytes (see install-core `backupByteIdentical` /
 * `restoreFromBackup`). This module only produces the merged YAML we WRITE
 * on install; the marker just lets re-install dedup our own entries in
 * place rather than duplicating them.
 *
 * Marker strategy: YAML comments do not survive a parse→serialize round
 * trip, so the marker is a STRUCTURAL sentinel key (`_hive_mind`) stamped on
 * each entry we add, backed up by a recognizable command-path prefix. We
 * detect our own entries by the sentinel; dedup matches on (eventKey,
 * command).
 *
 * Immutability: every function returns a NEW config object and never
 * mutates its input (mirrors the `jsonRegister` contract).
 */

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

/** Structural marker stamped on every hook entry we add. */
export const HIVE_MIND_MARKER = '@hive-mind/hermes-hooks';

/** Top-level YAML key holding the shell-hooks map. */
export const HOOKS_KEY = 'hooks';

/**
 * A single Hermes shell-hook entry. Hermes honors `command` + `timeout`
 * on lifecycle events; `matcher` is honored ONLY on pre/post_tool_call and
 * is stripped-with-warning elsewhere, so we never set it on our events.
 */
export interface HermesHookEntry {
  command: string;
  timeout?: number;
  /** Structural marker so re-install/uninstall can find our own entries. */
  _hive_mind?: string;
}

/** One entry to register: which native event key, plus the command + timeout. */
export interface HermesRegisterEntry {
  /** Native Hermes event key, e.g. 'on_session_start' / 'pre_llm_call' / 'post_llm_call'. */
  eventKey: string;
  command: string;
  timeout: number;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asEntryArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

/** True iff a parsed hook entry carries our structural marker. */
export function isHiveEntry(entry: unknown): boolean {
  const e = asRecord(entry);
  return !!e && e['_hive_mind'] === HIVE_MIND_MARKER;
}

function entryCommand(entry: unknown): string | undefined {
  const e = asRecord(entry);
  const cmd = e?.['command'];
  return typeof cmd === 'string' ? cmd : undefined;
}

/**
 * Parse a `config.yaml` string into a plain object. Returns `{}` for an
 * empty/whitespace string (create-if-missing). Throws on malformed YAML so
 * the installer fails loudly rather than silently clobbering a user config.
 */
export function parseConfig(raw: string): Record<string, unknown> {
  if (!raw || raw.trim().length === 0) return {};
  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    throw new Error(
      'failed to parse ~/.hermes/config.yaml as YAML: ' +
      (err instanceof Error ? err.message : String(err)),
    );
  }
  const record = asRecord(parsed);
  // A top-level scalar/array YAML doc is not a valid hermes config shape;
  // treat it as empty rather than crashing (the original bytes are backed
  // up regardless, so nothing is lost).
  return record ?? {};
}

/** Serialize a config object back to YAML text (trailing newline). */
export function serializeConfig(config: Record<string, unknown>): string {
  const text = stringifyYaml(config);
  return text.endsWith('\n') ? text : text + '\n';
}

/**
 * Returns a NEW config object with hive-mind shell-hook entries registered
 * under each supplied native event key. Existing non-hive entries are
 * preserved verbatim. A hive entry for the same (eventKey, command) is
 * replaced in place rather than duplicated, so re-running install upgrades
 * cleanly.
 */
export function yamlRegister(
  config: Record<string, unknown> | undefined,
  entries: readonly HermesRegisterEntry[],
): Record<string, unknown> {
  const next: Record<string, unknown> = config ? { ...config } : {};
  const existingHooks = asRecord(next[HOOKS_KEY]);
  const nextHooks: Record<string, unknown> = existingHooks ? { ...existingHooks } : {};

  for (const entry of entries) {
    const arr = asEntryArray(nextHooks[entry.eventKey]).slice();
    const newEntry: HermesHookEntry = {
      command: entry.command,
      timeout: entry.timeout,
      _hive_mind: HIVE_MIND_MARKER,
    };

    let replaced = false;
    for (let i = 0; i < arr.length; i += 1) {
      if (isHiveEntry(arr[i]) && entryCommand(arr[i]) === entry.command) {
        arr[i] = newEntry as unknown as Record<string, unknown>;
        replaced = true;
        break;
      }
    }
    if (!replaced) arr.push(newEntry as unknown as Record<string, unknown>);

    nextHooks[entry.eventKey] = arr;
  }

  next[HOOKS_KEY] = nextHooks;
  return next;
}

/**
 * Returns a NEW config object with all marker-tagged hive entries stripped
 * from every event array. Non-hive entries are preserved verbatim; empty
 * event arrays are left in place (minimal-touch). Never mutates input.
 *
 * Note: uninstall normally restores the literal byte-identical backup, so
 * this is used for verify/diagnostics and for the (rare) backup-less path.
 */
export function yamlUnregister(
  config: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const next: Record<string, unknown> = config ? { ...config } : {};
  const existingHooks = asRecord(next[HOOKS_KEY]);
  if (!existingHooks) return next;

  const nextHooks: Record<string, unknown> = {};
  for (const [eventKey, value] of Object.entries(existingHooks)) {
    const arr = asEntryArray(value);
    if (arr.length === 0) {
      nextHooks[eventKey] = value;
      continue;
    }
    nextHooks[eventKey] = arr.filter((e) => !isHiveEntry(e));
  }
  next[HOOKS_KEY] = nextHooks;
  return next;
}

/** True iff at least one event array carries a marker-tagged hive entry. */
export function hasHiveEntries(config: Record<string, unknown> | undefined): boolean {
  if (!config) return false;
  const hooks = asRecord(config[HOOKS_KEY]);
  if (!hooks) return false;
  for (const value of Object.values(hooks)) {
    if (asEntryArray(value).some((e) => isHiveEntry(e))) return true;
  }
  return false;
}
