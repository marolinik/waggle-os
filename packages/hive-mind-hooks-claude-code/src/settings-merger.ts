/**
 * Pure-functional helpers for additively merging hive-mind hook entries
 * into a Claude Code `settings.json` object.
 *
 * Design contract:
 *   - `mergeHiveHooks(settings, entries)` returns a new object; the
 *     caller-supplied settings are NEVER mutated in place.
 *   - Existing hook entries are preserved verbatim (preserves Marko's
 *     gsd-context-monitor.js etc.).
 *   - hive-mind entries are tagged with the marker key `_hiveMindShim:
 *     "@hive-mind/claude-code-hooks"` on the group so a future install
 *     can detect duplicates / upgrade in place.
 */

import { allHookBasenames, type HookBasename } from './paths.js';

export const HIVE_MIND_MARKER = '@hive-mind/claude-code-hooks';

export type HookGroup = {
  hooks: Array<{
    type: 'command';
    command: string;
    timeout?: number;
  }>;
  matcher?: string;
  /** Marker our installer drops on every group it adds, used by uninstall. */
  _hiveMindShim?: string;
};

export type ClaudeCodeSettings = Record<string, unknown> & {
  hooks?: Record<string, HookGroup[]>;
};

/** Maps our four canonical hook basenames to the Claude Code `hooks.<event>` key. */
export const HOOK_EVENT_BY_BASENAME: Record<HookBasename, string> = {
  'session-start': 'SessionStart',
  'user-prompt-submit': 'UserPromptSubmit',
  'stop': 'Stop',
  'pre-compact': 'PreCompact',
};

export interface HookEntrySpec {
  basename: HookBasename;
  command: string;
  timeout?: number;
}

function buildGroup(spec: HookEntrySpec): HookGroup {
  const group: HookGroup = {
    hooks: [{
      type: 'command',
      command: spec.command,
      ...(spec.timeout !== undefined ? { timeout: spec.timeout } : {}),
    }],
    _hiveMindShim: HIVE_MIND_MARKER,
  };
  return group;
}

function isHiveGroup(group: HookGroup | undefined): boolean {
  return !!group && group._hiveMindShim === HIVE_MIND_MARKER;
}

/**
 * Returns a NEW settings object with hive-mind hook entries appended to
 * each Claude Code event array. Existing entries are preserved.
 *
 * If a hive-mind entry for a given event is already present (matching
 * marker AND command path), it is replaced in place rather than
 * duplicated — supports re-running install for upgrades.
 */
export function mergeHiveHooks(
  settings: ClaudeCodeSettings | undefined,
  entries: readonly HookEntrySpec[],
): ClaudeCodeSettings {
  // Deep-copy starting structure (settings + settings.hooks + each event array).
  const next: ClaudeCodeSettings = settings ? { ...settings } : {};
  const nextHooks: Record<string, HookGroup[]> = next.hooks ? { ...next.hooks } : {};

  for (const spec of entries) {
    const eventKey = HOOK_EVENT_BY_BASENAME[spec.basename];
    const existingArr = nextHooks[eventKey] ? [...nextHooks[eventKey]] : [];
    const newGroup = buildGroup(spec);

    let replaced = false;
    for (let i = 0; i < existingArr.length; i += 1) {
      const g = existingArr[i];
      if (isHiveGroup(g) && g.hooks[0]?.command === spec.command) {
        existingArr[i] = newGroup;
        replaced = true;
        break;
      }
    }
    if (!replaced) existingArr.push(newGroup);

    nextHooks[eventKey] = existingArr;
  }

  next.hooks = nextHooks;
  return next;
}

/**
 * Detect whether a settings object already has hive-mind hooks installed.
 * True iff at least one event array has a group bearing the marker.
 */
export function hasHiveHooks(settings: ClaudeCodeSettings | undefined): boolean {
  if (!settings || !settings.hooks) return false;
  for (const groups of Object.values(settings.hooks)) {
    if (Array.isArray(groups) && groups.some(isHiveGroup)) return true;
  }
  return false;
}

/**
 * Build the canonical 4-entry spec list for the four hooks we install,
 * given the hooksDir and a shared timeout.
 */
export function defaultHookEntries(
  hooksDir: string,
  timeoutSeconds: number,
  cmdBuilder: (hooksDir: string, basename: HookBasename, cliPath?: string) => string,
  cliPath?: string,
): HookEntrySpec[] {
  return allHookBasenames().map((basename) => ({
    basename,
    command: cmdBuilder(hooksDir, basename, cliPath),
    timeout: timeoutSeconds,
  }));
}
