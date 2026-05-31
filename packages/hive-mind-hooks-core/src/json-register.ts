/**
 * Generalized additive JSON-config register/unregister helper.
 *
 * Generalizes the frozen Wave 1 claude-code `mergeHiveHooks`
 * (settings-merger.ts:72-101) for any JSON-config tool whose event keys
 * map to ARRAYS of hook groups (codex `{matcher,hooks:[]}`, cursor
 * `{command,type,timeout}`). Additive merge + marker tag + dedup /
 * replace-in-place.
 *
 * Immutability contract: every function returns a NEW object and never
 * mutates its input (mirrors the CC settings-merger contract). Used by
 * codex, codex-desktop (via codex), and cursor. Hermes (YAML) and
 * OpenClaw (JSON5 + dirs) have bespoke codecs and do NOT use this.
 */

import type { Lifecycle } from './event-adapter.js';

/** Base marker; per-tool suffix appended, e.g. '@hive-mind/codex-hooks'. */
export const HIVE_MIND_MARKER_BASE = '@hive-mind';

export interface JsonRegisterEntry {
  lifecycle: Lifecycle;
  command: string;
  timeout: number;
}

export interface JsonRegisterSpec {
  /** Top-level object key holding the per-event map (e.g. 'hooks'). */
  hooksKey: string;
  /** Canonical lifecycle → tool event-key map (from EventAdapter.eventName). */
  eventName: Record<Lifecycle, string | undefined>;
  /**
   * Build the tool-shaped group object for one hook entry. Must stamp the
   * marker so `isHiveGroup` can later detect our own entries for
   * replace/remove (codex uses {matcher,hooks:[...]}; cursor uses a flat
   * {command,type,timeout}).
   */
  buildGroup(lifecycle: Lifecycle, command: string, timeout: number): Record<string, unknown>;
  /** Reads the marker off a group to detect our own entries. */
  isHiveGroup(group: unknown): boolean;
  /**
   * Reads the command string out of a group so dedup can match by
   * (eventKey, command). Returns undefined when the group has no command.
   */
  groupCommand(group: unknown): string | undefined;
  /** Optional skeleton seed (e.g. cursor needs {version:1}). */
  ensureSkeleton?(root: Record<string, unknown>): Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asGroupArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

/**
 * Returns a NEW config object with hive-mind hook entries registered
 * under each tool event key. Existing non-hive entries are preserved
 * verbatim. If a hive entry for the same (eventKey, command) already
 * exists it is replaced in place rather than duplicated — supports
 * re-running install for upgrades.
 */
export function jsonRegister(
  config: Record<string, unknown> | undefined,
  entries: readonly JsonRegisterEntry[],
  spec: JsonRegisterSpec,
): Record<string, unknown> {
  // Shallow-copy the root, then apply the optional skeleton seed.
  let next: Record<string, unknown> = config ? { ...config } : {};
  if (spec.ensureSkeleton) next = spec.ensureSkeleton(next);

  const existingHooks = asRecord(next[spec.hooksKey]);
  const nextHooks: Record<string, unknown> = existingHooks ? { ...existingHooks } : {};

  for (const entry of entries) {
    const eventKey = spec.eventName[entry.lifecycle];
    if (eventKey === undefined) continue; // tool has no native event for this lifecycle

    const existingArr = asGroupArray(nextHooks[eventKey]).slice();
    const newGroup = spec.buildGroup(entry.lifecycle, entry.command, entry.timeout);

    let replaced = false;
    for (let i = 0; i < existingArr.length; i += 1) {
      const g = existingArr[i];
      if (spec.isHiveGroup(g) && spec.groupCommand(g) === entry.command) {
        existingArr[i] = newGroup;
        replaced = true;
        break;
      }
    }
    if (!replaced) existingArr.push(newGroup);

    nextHooks[eventKey] = existingArr;
  }

  next[spec.hooksKey] = nextHooks;
  return next;
}

/**
 * Returns a NEW config object with all marker-tagged hive groups stripped
 * from every event array. Non-hive entries are preserved verbatim. Empty
 * event arrays are left in place (minimal-touch). Never mutates input.
 */
export function jsonUnregister(
  config: Record<string, unknown> | undefined,
  spec: JsonRegisterSpec,
): Record<string, unknown> {
  const next: Record<string, unknown> = config ? { ...config } : {};
  const existingHooks = asRecord(next[spec.hooksKey]);
  if (!existingHooks) return next;

  const nextHooks: Record<string, unknown> = {};
  for (const [eventKey, value] of Object.entries(existingHooks)) {
    const arr = asGroupArray(value);
    if (arr.length === 0) {
      nextHooks[eventKey] = value;
      continue;
    }
    nextHooks[eventKey] = arr.filter((g) => !spec.isHiveGroup(g));
  }
  next[spec.hooksKey] = nextHooks;
  return next;
}

/** True iff at least one event array carries a marker-tagged hive group. */
export function hasHiveEntries(
  config: Record<string, unknown> | undefined,
  spec: JsonRegisterSpec,
): boolean {
  if (!config) return false;
  const hooks = asRecord(config[spec.hooksKey]);
  if (!hooks) return false;
  for (const value of Object.values(hooks)) {
    if (asGroupArray(value).some((g) => spec.isHiveGroup(g))) return true;
  }
  return false;
}
