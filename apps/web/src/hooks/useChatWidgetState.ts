/**
 * UX Refactor v2.1 P1a Stage B — per-workspace chat-widget state
 * (conversion plan §3.2 / §4.2).
 *
 * Relocates the SURVIVING slice of useWindowManager (its §3.1 deletion is
 * Stage C): WindowState.personaId/autonomyLevel/autonomyExpiresAt +
 * setWindowPersona/setWindowAutonomy + the 10s autonomy auto-revert interval
 * (useWindowManager.ts:316-361). Logic moves verbatim; the keying changes
 * from instanceId to workspaceId, persisted under the NEW versioned key
 * 'waggle-chat-state-v1' (seeded once by the §3.3 migration,
 * lib/window-state-migration.ts).
 *
 * Also hosts:
 *   - the §4.2 one-shot imperative chat seed API: seedChat(workspaceId,
 *     {personaId?, initialMessage?}) — the post-conversion carrier for what
 *     WindowState.initialMessage/personaId (useWindowManager.ts:30) carried
 *     into ChatWindowInstance's initialPersona/initialMessage props. It is
 *     transient intent, NOT part of the persisted key. Sole conversion-time
 *     caller: the wizard onFinish retarget (§2.2); consumed by ChatHost on
 *     the widget's first mount for that workspace.
 *   - the chat-title composition (§3.2: useWindowManager.ts:428-436 → widget
 *     header label) + the PERSONA_SHORT/TEMPLATE_SHORT maps it derives from.
 *   - the §3.3.3 'local-default' placeholder re-key contract, performed once
 *     when the store first sees the real workspace list (mirrors the deleted
 *     reconciliation sweep, useWindowManager.ts:167-172).
 */
import { useCallback, useEffect, useSyncExternalStore } from 'react';

export const CHAT_STATE_KEY = 'waggle-chat-state-v1';

export type AutonomyLevel = 'normal' | 'trusted' | 'yolo';

/** The persisted per-workspace slice of the old WindowState (§3.2). */
export interface ChatWidgetEntry {
  personaId?: string;
  personaLabel?: string;
  autonomyLevel?: AutonomyLevel;
  autonomyExpiresAt?: number | null;
}

/** §4.2 one-shot seed payload (transient — never persisted). */
export interface ChatSeed {
  personaId?: string;
  initialMessage?: string;
  /** F2: auto-send the initialMessage once the chat is ready (wizard "Let's go"). */
  autoSend?: boolean;
}

// Relocated verbatim from useWindowManager.ts:86-105.
const TEMPLATE_SHORT: Record<string, string> = {
  'sales-pipeline': 'Sales',
  'research-project': 'Research',
  'code-review': 'Code',
  'marketing-campaign': 'Marketing',
  'product-launch': 'Launch',
  'legal-review': 'Legal',
  'agency-consulting': 'Consulting',
};

const PERSONA_SHORT: Record<string, string> = {
  'researcher': 'Researcher',
  'writer': 'Writer',
  'analyst': 'Analyst',
  'coder': 'Coder',
  'project-manager': 'PM',
  'executive-assistant': 'EA',
  'sales-rep': 'Sales',
  'marketer': 'Marketer',
};

// Relocated verbatim from useWindowManager.ts:49-52.
export function personaLabelFor(personaId?: string): string | undefined {
  if (!personaId) return undefined;
  return PERSONA_SHORT[personaId] || personaId;
}

/**
 * §3.2: getWindowTitle's chat-title composition (useWindowManager.ts:428-436)
 * → the widget header label. The template label derives live from the
 * workspace's templateId exactly as openChatForWorkspace stamped it onto the
 * window at creation (useWindowManager.ts:231).
 */
export function composeChatTitle(workspaceName?: string, templateId?: string, personaId?: string): string {
  const parts = [workspaceName || 'Chat'];
  const templateLabel = templateId && templateId !== 'blank'
    ? (TEMPLATE_SHORT[templateId] || templateId)
    : undefined;
  if (templateLabel) parts.push(templateLabel);
  const personaLabel = personaLabelFor(personaId);
  if (personaLabel) parts.push(personaLabel);
  return parts.join(' · ');
}

// ── Persisted store (waggle-chat-state-v1) ────────────────────────────────

const AUTONOMY_LEVELS: ReadonlySet<string> = new Set(['normal', 'trusted', 'yolo']);

/** Shallow per-field validation — drop unknown shapes, keep valid fields. */
function sanitizeEntry(value: unknown): ChatWidgetEntry | null {
  if (!value || typeof value !== 'object') return null;
  const rec = value as Record<string, unknown>;
  const entry: ChatWidgetEntry = {};
  if (typeof rec.personaId === 'string') entry.personaId = rec.personaId;
  if (typeof rec.personaLabel === 'string') entry.personaLabel = rec.personaLabel;
  if (typeof rec.autonomyLevel === 'string' && AUTONOMY_LEVELS.has(rec.autonomyLevel)) {
    entry.autonomyLevel = rec.autonomyLevel as AutonomyLevel;
  }
  const expiresAt = rec.autonomyExpiresAt;
  if (typeof expiresAt === 'number') {
    entry.autonomyExpiresAt = expiresAt;
  } else if (expiresAt === null) {
    entry.autonomyExpiresAt = null;
  }
  return entry;
}

function parseChatState(raw: string | null): Record<string, ChatWidgetEntry> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as { version?: number; chats?: Record<string, unknown> };
    if (parsed.version !== 1 || !parsed.chats || typeof parsed.chats !== 'object') return {};
    const chats: Record<string, ChatWidgetEntry> = {};
    for (const [wsId, value] of Object.entries(parsed.chats)) {
      const entry = sanitizeEntry(value);
      if (entry) chats[wsId] = entry;
    }
    return chats;
  } catch {
    return {};
  }
}

// Read-through cache keyed on the raw string so getSnapshot returns a stable
// reference between writes (useSyncExternalStore requirement) while direct
// localStorage resets (tests, fresh sessions) still invalidate naturally.
let cacheRaw: string | null = null;
let cache: Record<string, ChatWidgetEntry> | null = null;

const listeners = new Set<() => void>();

function subscribeChatState(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function loadChatEntries(): Record<string, ChatWidgetEntry> {
  if (typeof window === 'undefined' || !window.localStorage) return cache ?? {};
  const raw = window.localStorage.getItem(CHAT_STATE_KEY);
  if (cache === null || raw !== cacheRaw) {
    cacheRaw = raw;
    cache = parseChatState(raw);
  }
  return cache;
}

function persistChatEntries(chats: Record<string, ChatWidgetEntry>): void {
  try {
    window.localStorage.setItem(CHAT_STATE_KEY, JSON.stringify({ version: 1, chats }));
  } catch {
    // Quota exceeded / Safari private mode — non-fatal; the in-memory cache
    // still serves this session (parity with savePersistedWindows,
    // useWindowManager.ts:74-84).
  }
  cacheRaw = window.localStorage.getItem(CHAT_STATE_KEY);
  cache = chats;
  listeners.forEach(l => l());
}

/** Immutable per-workspace patch write (the store's single mutation path). */
export function writeChatEntry(workspaceId: string, patch: Partial<ChatWidgetEntry>): void {
  const chats = loadChatEntries();
  persistChatEntries({ ...chats, [workspaceId]: { ...chats[workspaceId], ...patch } });
}

/**
 * §3.3 step 3 writer for the migration: merge salvaged entries into the
 * store. Migrated entries win per workspace (last-write-wins).
 */
export function mergeChatEntries(entries: Record<string, ChatWidgetEntry>): void {
  persistChatEntries({ ...loadChatEntries(), ...entries });
}

/**
 * §3.3.3: one-shot legacy re-key mirroring the deleted reconciliation sweep
 * (useWindowManager.ts:167-172) — an entry stamped with the 'local-default'
 * pre-fetch placeholder moves onto the first REAL workspace when the store
 * first sees the workspace list (ChatHost calls this). If the real workspace
 * already has its own entry, that more-specific entry wins and the
 * placeholder is dropped. New widget state is never placeholder-stamped, so
 * this re-key dies with the §2.3 shim cleanup.
 */
export function rekeyLocalDefaultChatState(firstRealWorkspaceId: string): void {
  const chats = loadChatEntries();
  const placeholder = chats['local-default'];
  if (!placeholder) return;
  const rest = Object.fromEntries(
    Object.entries(chats).filter(([wsId]) => wsId !== 'local-default'),
  ) as Record<string, ChatWidgetEntry>;
  persistChatEntries(
    rest[firstRealWorkspaceId] ? rest : { ...rest, [firstRealWorkspaceId]: placeholder },
  );
}

// ── §4.2 one-shot imperative seed API ─────────────────────────────────────

const pendingSeeds = new Map<string, ChatSeed>();

/** Stage a one-shot seed for a workspace's chat widget (wizard onFinish, §2.2). */
export function seedChat(workspaceId: string, seed: ChatSeed): void {
  pendingSeeds.set(workspaceId, seed);
}

/** Destructive read — returns the pending seed exactly once, then clears it. */
export function takeChatSeed(workspaceId: string): ChatSeed | undefined {
  const seed = pendingSeeds.get(workspaceId);
  pendingSeeds.delete(workspaceId);
  return seed;
}

// ── Repeatable imperative chat dispatch API ───────────────────────────────

export interface ChatDispatchRequest {
  id: string;
  content: string;
}

const pendingDispatches = new Map<string, readonly ChatDispatchRequest[]>();
const dispatchListeners = new Map<string, Set<() => void>>();
let dispatchSequence = 0;
let pendingDispatchCount = 0;

export const MAX_CHAT_DISPATCH_CONTENT_CHARS = 50_000;
export const MAX_CHAT_DISPATCHES_PER_WORKSPACE = 20;
export const MAX_CHAT_DISPATCHES_TOTAL = 100;

function notifyDispatchListeners(workspaceId: string): void {
  dispatchListeners.get(workspaceId)?.forEach(listener => listener());
}

/** Queue a transient prompt for the named workspace without persisting user content. */
export function enqueueChatDispatch(workspaceId: string, content: string): ChatDispatchRequest {
  const trimmed = content.trim();
  if (!workspaceId || !trimmed) throw new Error('workspaceId and content are required');
  if (trimmed.length > MAX_CHAT_DISPATCH_CONTENT_CHARS) {
    throw new Error(`Chat dispatch content exceeds ${MAX_CHAT_DISPATCH_CONTENT_CHARS} characters`);
  }
  const workspaceQueue = pendingDispatches.get(workspaceId) ?? [];
  if (workspaceQueue.length >= MAX_CHAT_DISPATCHES_PER_WORKSPACE) {
    throw new Error('Workspace chat dispatch queue is full');
  }
  if (pendingDispatchCount >= MAX_CHAT_DISPATCHES_TOTAL) {
    throw new Error('Chat dispatch queue is full');
  }
  const request = {
    id: globalThis.crypto?.randomUUID?.()
      ?? `chat-dispatch-${Date.now()}-${++dispatchSequence}`,
    content: trimmed,
  };
  pendingDispatches.set(workspaceId, [...workspaceQueue, request]);
  pendingDispatchCount += 1;
  notifyDispatchListeners(workspaceId);
  return request;
}

/** Non-destructive FIFO head read used by ChatHost and deterministic tests. */
export function peekChatDispatch(workspaceId: string): ChatDispatchRequest | null {
  return pendingDispatches.get(workspaceId)?.[0] ?? null;
}

/** Remove only the current FIFO head for the exact workspace and request id. */
export function acknowledgeChatDispatch(workspaceId: string, dispatchId: string): boolean {
  const queue = pendingDispatches.get(workspaceId);
  if (!queue?.length || queue[0].id !== dispatchId) return false;
  const rest = queue.slice(1);
  if (rest.length) pendingDispatches.set(workspaceId, rest);
  else pendingDispatches.delete(workspaceId);
  pendingDispatchCount -= 1;
  notifyDispatchListeners(workspaceId);
  return true;
}

/** Reactive FIFO head for a kept-alive workspace chat. */
export function usePendingChatDispatch(workspaceId: string): ChatDispatchRequest | null {
  const subscribe = useCallback((listener: () => void) => {
    let listeners = dispatchListeners.get(workspaceId);
    if (!listeners) {
      listeners = new Set();
      dispatchListeners.set(workspaceId, listeners);
    }
    listeners.add(listener);
    return () => {
      listeners?.delete(listener);
      if (listeners?.size === 0) dispatchListeners.delete(workspaceId);
    };
  }, [workspaceId]);
  const getSnapshot = useCallback(() => peekChatDispatch(workspaceId), [workspaceId]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

// ── The hook ──────────────────────────────────────────────────────────────

export interface UseChatWidgetStateOptions {
  /**
   * P4 (relocated from useWindowManager.ts:107-115 + openChatForWorkspace's
   * inheritAutonomy stamp, :249-264): default autonomy inherited the FIRST
   * time a workspace gets a chat widget (no persisted autonomy level yet —
   * a persona-only entry does NOT count as "seen"). 'normal' is treated as
   * "no inheritance"; any elevated level is stamped with expiresAt:null so
   * it sticks until explicitly lowered (the widget-world equivalent of the
   * per-window "Until I close" TTL choice — restored windows persisted their
   * elevated grants the same way; the §3.3 migration stamps them with an
   * explicit autonomyLevel:'normal' marker so they never retro-inherit).
   */
  defaultAutonomy?: AutonomyLevel;
}

const EMPTY_ENTRY: ChatWidgetEntry = {};

export function useChatWidgetState(workspaceId: string, opts: UseChatWidgetStateOptions = {}) {
  const { defaultAutonomy = 'normal' } = opts;
  const chats = useSyncExternalStore(subscribeChatState, loadChatEntries);
  const entry = chats[workspaceId] ?? EMPTY_ENTRY;

  // P4 inheritance for a workspace that has never carried an autonomy level
  // (option doc above). The gate is autonomy-specific, NOT entry-existence:
  // a persona-only entry (PersonaSwitcher can write one for a never-visited
  // workspace, AppShell §1.2) must not count as "seen" and permanently skip
  // inheritance — migrated chats carry an explicit 'normal' marker instead
  // (§3.3). defaultAutonomy is in the deps because ShellContext fetches it
  // asynchronously (getPermissions): a widget mounted before the fetch
  // resolves (deep-link boot) receives the stamp when the elevated value
  // arrives; the autonomy-exists guard keeps that late stamp from overriding
  // migrated or user-set state.
  useEffect(() => {
    if (defaultAutonomy === 'normal') return;
    if (loadChatEntries()[workspaceId]?.autonomyLevel !== undefined) return;
    writeChatEntry(workspaceId, { autonomyLevel: defaultAutonomy, autonomyExpiresAt: null });
  }, [workspaceId, defaultAutonomy]);

  /**
   * Phase A.2 (relocated verbatim from setWindowPersona,
   * useWindowManager.ts:316-320, re-keyed instanceId → workspaceId): update
   * the persona on this widget without touching the underlying workspace
   * record. Used by PersonaSwitcher and ChatWindowInstance's inline picker.
   */
  const setPersona = useCallback((personaId: string) => {
    writeChatEntry(workspaceId, { personaId, personaLabel: personaLabelFor(personaId) });
  }, [workspaceId]);

  /**
   * Phase B.5 (relocated verbatim from setWindowAutonomy,
   * useWindowManager.ts:327-338): elevated levels (trusted / yolo)
   * auto-revert to 'normal' after `ttlMinutes` unless ttlMinutes is null.
   */
  const setAutonomy = useCallback((
    level: AutonomyLevel,
    ttlMinutes: number | null = 30,
  ) => {
    const expiresAt = level === 'normal' || ttlMinutes === null
      ? null
      : Date.now() + ttlMinutes * 60_000;
    writeChatEntry(workspaceId, { autonomyLevel: level, autonomyExpiresAt: expiresAt });
  }, [workspaceId]);

  // Phase B.5 (relocated from useWindowManager.ts:340-361): auto-revert
  // expired autonomy grants. Runs every 10 seconds so the elevated banner in
  // ChatApp's header always reflects reality.
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const e = loadChatEntries()[workspaceId];
      if (
        e?.autonomyLevel && e.autonomyLevel !== 'normal'
        && e.autonomyExpiresAt && e.autonomyExpiresAt < now
      ) {
        writeChatEntry(workspaceId, { autonomyLevel: 'normal', autonomyExpiresAt: null });
      }
    }, 10_000);
    return () => clearInterval(interval);
  }, [workspaceId]);

  return { entry, setPersona, setAutonomy };
}
