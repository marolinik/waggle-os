/**
 * UX Refactor v2.1 P1a Stage B — one-shot `waggle-window-state-v1` migration
 * (conversion plan §3.3, D1 condition 3).
 *
 * Runs once on first AppShell boot, before first render of the canvas
 * (Stage C calls runWindowStateMigration; it applies `initialRoute` only on
 * the index path so typed deep links always win — acceptance check 2):
 *   1. Read + parse the legacy key with the same validation as
 *      loadPersistedWindows (useWindowManager.ts:54-72).
 *   2. Initial-route salvage: highest-zIndex non-minimized window →
 *      routeFor(appId) (chat → /workspaces/:workspaceId/chat; a chat stamped
 *      with the 'local-default' pre-fetch placeholder → /home). No windows /
 *      parse failure → /home.
 *   3. Chat-state salvage into the waggle-chat-state-v1 store —
 *      last-write-wins per workspace; 'local-default'-keyed entries are
 *      written as-is and re-keyed later by rekeyLocalDefaultChatState when
 *      the store first sees the real workspace list (§3.3.3).
 *   4. localStorage.removeItem('waggle-window-state-v1') — UNCONDITIONALLY,
 *      including on parse failure. No dual-format support, ever.
 *
 * computeWindowStateMigration is pure (unit-testable);
 * runWindowStateMigration adds the storage side effects around it.
 */
import { isAppId, routeFor } from '@/lib/routes';
import {
  mergeChatEntries,
  personaLabelFor,
  type AutonomyLevel,
  type ChatWidgetEntry,
} from '@/hooks/useChatWidgetState';

export const WINDOW_STATE_KEY = 'waggle-window-state-v1';

/**
 * Legacy WindowState shape (useWindowManager.ts:11-47) — a local copy of the
 * fields the migration reads, so this module survives the hook's §3.1
 * deletion in Stage C.
 */
export interface LegacyWindowState {
  instanceId: string;
  appId: string;
  workspaceId?: string;
  personaId?: string;
  autonomyLevel?: AutonomyLevel;
  autonomyExpiresAt?: number | null;
  zIndex: number;
  minimized: boolean;
  cascadeOffset: number;
}

/** §3.3 step 1 — same validation as loadPersistedWindows (useWindowManager.ts:54-72). */
function loadLegacyWindows(): LegacyWindowState[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(WINDOW_STATE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { version?: number; windows?: LegacyWindowState[] };
    if (parsed.version !== 1 || !Array.isArray(parsed.windows)) return [];
    // Shallow validation — drop entries missing required fields
    return parsed.windows.filter((w): w is LegacyWindowState =>
      typeof w?.instanceId === 'string'
      && typeof w?.appId === 'string'
      && typeof w?.zIndex === 'number'
      && typeof w?.minimized === 'boolean'
      && typeof w?.cascadeOffset === 'number'
    );
  } catch {
    return [];
  }
}

const AUTONOMY_LEVELS: ReadonlySet<string> = new Set(['normal', 'trusted', 'yolo']);

export interface WindowStateMigrationResult {
  initialRoute: string;
  chatState: Record<string, ChatWidgetEntry>;
}

/** Pure §3.3 steps 2-3 over an already-parsed window list. */
export function computeWindowStateMigration(
  windows: readonly LegacyWindowState[],
): WindowStateMigrationResult {
  // §3.3 step 2 — initial-route salvage: highest-zIndex non-minimized window.
  // All-minimized counts as "no candidate" → /home.
  let initialRoute = '/home';
  const visible = windows.filter(w => !w.minimized);
  if (visible.length > 0) {
    const top = visible.reduce((a, b) => (a.zIndex > b.zIndex ? a : b));
    if (isAppId(top.appId)) {
      // routeFor implements the chat rules exactly once (§2.3): chat →
      // /workspaces/:workspaceId/chat; a 'local-default'-stamped or
      // workspace-less chat → /home; killed ids retarget per §2.2.
      initialRoute = routeFor(top.appId, { activeWorkspaceId: top.workspaceId });
    }
  }

  // §3.3 step 3 — chat-state salvage keyed by workspaceId. Iteration order is
  // array order, so the LAST window on a workspace wins (the multi-instance
  // case collapses per §4). A migrated chat without an elevated grant is
  // stamped with an EXPLICIT autonomyLevel:'normal' marker — the P4
  // inheritance gate (useChatWidgetState) is autonomy-specific, so the
  // marker is what keeps a migrated normal-autonomy chat from later
  // inheriting an elevated default the way a brand-new widget would, while a
  // persona-only live write (PersonaSwitcher pre-visit) stays inheritable.
  const chatState: Record<string, ChatWidgetEntry> = {};
  for (const w of windows) {
    if (w.appId !== 'chat') continue;
    if (typeof w.workspaceId !== 'string' || !w.workspaceId) continue;
    const entry: ChatWidgetEntry = {};
    if (typeof w.personaId === 'string' && w.personaId) {
      entry.personaId = w.personaId;
      entry.personaLabel = personaLabelFor(w.personaId);
    }
    if (typeof w.autonomyLevel === 'string' && AUTONOMY_LEVELS.has(w.autonomyLevel)) {
      entry.autonomyLevel = w.autonomyLevel;
      entry.autonomyExpiresAt = typeof w.autonomyExpiresAt === 'number' ? w.autonomyExpiresAt : null;
    } else {
      entry.autonomyLevel = 'normal';
      entry.autonomyExpiresAt = null;
    }
    chatState[w.workspaceId] = entry;
  }

  return { initialRoute, chatState };
}

/**
 * The one-shot migration entry point (Stage C calls this on first AppShell
 * boot, before the first canvas render). Never throws: parse failures
 * degrade to `{ initialRoute: '/home', chatState: {} }` and the legacy key
 * is still removed.
 */
export function runWindowStateMigration(): WindowStateMigrationResult {
  const result = computeWindowStateMigration(loadLegacyWindows());

  // §3.3 step 3 — write the salvage into the waggle-chat-state-v1 store.
  if (Object.keys(result.chatState).length > 0) {
    mergeChatEntries(result.chatState);
  }

  // §3.3 step 4 — remove the legacy key UNCONDITIONALLY (incl. parse failure).
  try {
    window.localStorage.removeItem(WINDOW_STATE_KEY);
  } catch {
    // Storage unavailable — nothing to remove.
  }

  return result;
}

// ── Stage C boot wrapper ───────────────────────────────────────────────────
// The migration's side effects (chat-state salvage + key removal) run on
// EVERY boot path, but the salvaged initialRoute is applied EXACTLY once and
// ONLY when the app ENTERED on the index path '/' — a typed deep link always
// wins (acceptance check 2).

let bootResult: WindowStateMigrationResult | null = null;
let initialRouteConsumed = false;

/**
 * Idempotent boot entry — AppShell calls this on its first render (before the
 * first canvas render). A deep-link entry (`entryPathname !== '/'`) marks the
 * salvaged route consumed so a later visit to '/' lands on /home as normal.
 */
export function bootWindowStateMigration(entryPathname: string): void {
  if (bootResult) return;
  bootResult = runWindowStateMigration();
  if (entryPathname !== '/') initialRouteConsumed = true;
}

/**
 * The index route's landing target: the salvaged §3.3 route on its first
 * (entry) use, '/home' on every use after — typing '/' mid-session must not
 * replay the salvage.
 */
export function indexLandingRoute(): string {
  if (!bootResult || initialRouteConsumed) return '/home';
  initialRouteConsumed = true;
  return bootResult.initialRoute;
}

/** Test-only reset for the boot singleton above. */
export function resetWindowStateMigrationForTests(): void {
  bootResult = null;
  initialRouteConsumed = false;
}
