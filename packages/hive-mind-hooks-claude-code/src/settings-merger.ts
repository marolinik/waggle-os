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

function firstCommand(group: HookGroup | undefined): string | undefined {
  if (!group || !Array.isArray(group.hooks)) return undefined;
  const command = group.hooks[0]?.command;
  return typeof command === 'string' ? command : undefined;
}

export function isHiveHookCommand(command: string | undefined, basename?: HookBasename): boolean {
  return hiveHookScriptPath(command, basename) !== undefined;
}

export function generatedHookScriptPath(
  command: string | undefined,
  basename?: HookBasename,
): string | undefined {
  if (!command) return undefined;

  const pathNode = /^node\s+"([^"]+)"(?:\s|$)/i.exec(command);
  const pinnedNode = /^"([^"]+)"\s+"([^"]+)"(?:\s|$)/.exec(command);
  let scriptPath = pathNode?.[1];
  if (!scriptPath && pinnedNode?.[1] && pinnedNode[2]) {
    const executable = pinnedNode[1].replace(/\\/g, '/').split('/').at(-1)?.toLowerCase();
    if (executable === 'node' || executable === 'node.exe') scriptPath = pinnedNode[2];
  }
  if (!scriptPath) return undefined;

  const normalized = scriptPath.replace(/\\/g, '/').toLowerCase();
  const basenames = basename ? [basename] : allHookBasenames();
  const generated = basenames.some((candidate) => normalized.endsWith(`/${candidate}.js`));
  return generated ? scriptPath : undefined;
}

export function hiveHookScriptPath(
  command: string | undefined,
  basename?: HookBasename,
): string | undefined {
  const scriptPath = generatedHookScriptPath(command, basename);
  if (!scriptPath) return undefined;

  const normalized = scriptPath.replace(/\\/g, '/').toLowerCase();
  const basenames = basename ? [basename] : allHookBasenames();
  const owned = basenames.some((candidate) => normalized.endsWith(
    `/hive-mind-hooks-claude-code/dist/hooks/${candidate}.js`,
  ));
  return owned ? scriptPath : undefined;
}

export function isOwnedHiveGroup(group: HookGroup | undefined, basename?: HookBasename): boolean {
  return !!group && (
    group._hiveMindShim === HIVE_MIND_MARKER
    || isHiveHookCommand(firstCommand(group), basename)
  );
}

/**
 * Returns a NEW settings object with hive-mind hook entries appended to
 * each Claude Code event array. Existing entries are preserved.
 *
 * If a hive-mind entry for a given event is already present, its marker is
 * the ownership boundary, so it is replaced in place rather than
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

    const ownedIndex = existingArr.findIndex((group) => isOwnedHiveGroup(group, spec.basename));
    if (ownedIndex === -1) {
      existingArr.push(newGroup);
    } else {
      existingArr[ownedIndex] = newGroup;
      for (let i = existingArr.length - 1; i > ownedIndex; i -= 1) {
        if (isOwnedHiveGroup(existingArr[i], spec.basename)) existingArr.splice(i, 1);
      }
    }

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
    if (Array.isArray(groups) && groups.some((group) => isOwnedHiveGroup(group))) return true;
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
