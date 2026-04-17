import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import type { AppId } from '@/lib/dock-tiers';
import type { Workspace } from '@/lib/types';

// Phase A.4 — full window-list persistence. localStorage key is versioned
// so schema changes can drop the stored state safely.
const WINDOW_STATE_KEY = 'waggle-window-state-v1';

export type AutonomyLevel = 'normal' | 'trusted' | 'yolo';

export interface WindowState {
  instanceId: string;
  appId: AppId;
  workspaceId?: string;
  workspaceName?: string;
  /**
   * Phase A.2: per-window persona override. Defaults to the workspace's
   * persona at window creation, but changes inside this window do NOT
   * bleed into the workspace record — every chat window on the same
   * workspace can run a different persona simultaneously.
   */
  personaId?: string;
  personaLabel?: string;
  templateLabel?: string;
  /**
   * QW-1: optional starter prompt for chat windows. Consumed once on first
   * render of ChatApp to prefill the input. Used by the onboarding wizard
   * so the user lands in chat with the template's "hint" pre-typed.
   */
  initialMessage?: string;
  /**
   * Phase B.5: per-window autonomy override. Controls how hard the
   * approval gate hits — 'normal' gates every write, 'trusted' lets
   * writes through but still gates git/install/cross-workspace,
   * 'yolo' passes everything except a critical blacklist.
   * Defaults to 'normal' on every new window.
   */
  autonomyLevel?: AutonomyLevel;
  /**
   * Epoch ms after which an elevated autonomy auto-reverts to 'normal'.
   * null = until window closes. Undefined when autonomy is 'normal'.
   */
  autonomyExpiresAt?: number | null;
  zIndex: number;
  minimized: boolean;
  cascadeOffset: number;
}

function personaLabelFor(personaId?: string): string | undefined {
  if (!personaId) return undefined;
  return PERSONA_SHORT[personaId] || personaId;
}

function loadPersistedWindows(): WindowState[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(WINDOW_STATE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { version?: number; windows?: WindowState[] };
    if (parsed.version !== 1 || !Array.isArray(parsed.windows)) return [];
    // Shallow validation — drop entries missing required fields
    return parsed.windows.filter((w): w is WindowState =>
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

function savePersistedWindows(windows: WindowState[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(
      WINDOW_STATE_KEY,
      JSON.stringify({ version: 1, windows }),
    );
  } catch {
    // Quota exceeded / Safari private mode — non-fatal, skip save
  }
}

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

export function useWindowManager(workspaces: Workspace[]) {
  // Phase A.4: restore the window list synchronously on first render so there
  // is no empty-desktop flicker between mount and the restoration effect.
  const [windows, setWindows] = useState<WindowState[]>(() => loadPersistedWindows());
  const topZRef = useRef(10);
  const cascadeCounter = useRef(0);
  const [focusedInstanceId, setFocusedInstanceId] = useState<string | null>(null);
  // Tracks whether the "drop stale chat windows" sweep has run once the
  // workspaces prop becomes available. Runs exactly once per session.
  const validatedRef = useRef(false);

  // Bump the zIndex counter past any restored windows so new windows always
  // land on top. Runs once at mount.
  useEffect(() => {
    if (windows.length > 0) {
      const maxZ = Math.max(...windows.map(w => w.zIndex));
      if (maxZ >= topZRef.current) topZRef.current = maxZ + 1;
      // Focus the window with the highest zIndex so keyboard shortcuts target
      // a sensible default after restoration.
      const top = windows.reduce((a, b) => (a.zIndex > b.zIndex ? a : b));
      setFocusedInstanceId(top.instanceId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When the REAL workspaces list arrives, reconcile restored chat windows:
  //   1. Skip running against the fake placeholder list (pre-fetch state
  //      where useWorkspaces only has the `local-default` entry).
  //   2. Migrate chat windows bound to the `local-default` placeholder
  //      onto the first real workspace — this handles the race where a
  //      user clicked the dock Chat button before the sidecar fetch
  //      completed and the window got stamped with the placeholder id.
  //   3. Never delete a chat window just because its workspaceId isn't
  //      in the current list. Log a warning and leave it in place — if
  //      the workspace is truly gone, the next send will fail visibly
  //      and the user can close the window themselves. Deleting state
  //      here destroyed Phase A.4 restoration repeatedly.
  useEffect(() => {
    if (validatedRef.current) return;
    if (workspaces.length === 0) return;
    // Pre-fetch placeholder — skip until the real list arrives.
    if (workspaces.length === 1 && workspaces[0].id === 'local-default') return;
    validatedRef.current = true;

    const firstReal = workspaces[0];
    setWindows(prev => {
      let changed = false;
      const next = prev.map(w => {
        if (w.appId !== 'chat') return w;
        if (w.workspaceId === 'local-default') {
          changed = true;
          console.info(
            `[useWindowManager] migrating chat ${w.instanceId} from 'local-default' to '${firstReal.id}'`
          );
          return { ...w, workspaceId: firstReal.id, workspaceName: firstReal.name };
        }
        if (w.workspaceId && !workspaces.some(ws => ws.id === w.workspaceId)) {
          console.warn(
            `[useWindowManager] chat ${w.instanceId} references missing workspace '${w.workspaceId}' — keeping window, next send will fail visibly`
          );
        }
        return w;
      });
      return changed ? next : prev;
    });
  }, [workspaces]);

  // Persist the full window list on every change.
  useEffect(() => {
    savePersistedWindows(windows);
  }, [windows]);

  const nextZ = () => { topZRef.current += 1; return topZRef.current; };

  const openApp = useCallback((id: AppId) => {
    setWindows(prev => {
      if (id !== 'chat') {
        const existing = prev.find(w => w.appId === id);
        if (existing) {
          const z = nextZ();
          setFocusedInstanceId(existing.instanceId);
          return prev.map(w => w.instanceId === existing.instanceId ? { ...w, zIndex: z, minimized: false } : w);
        }
      }
      const offset = cascadeCounter.current;
      cascadeCounter.current = (cascadeCounter.current + 1) % 10;
      const z = nextZ();
      const instanceId = `${id}-${Date.now()}`;
      setFocusedInstanceId(instanceId);
      return [...prev, { instanceId, appId: id, zIndex: z, minimized: false, cascadeOffset: offset }];
    });
  }, []);

  /**
   * Open a chat window for a workspace.
   *
   * Phase A.2: an optional `personaId` override seeds the new window with a
   * specific persona. If omitted, the window inherits the workspace's current
   * persona as its starting point. Either way, the persona lives on the
   * window from here on — not on the workspace.
   *
   * Multiple windows on the same workspace are allowed ONLY when an explicit
   * personaId is provided (the user deliberately wants a second specialist).
   * Without a personaId override, the existing window is focused instead.
   */
  const openChatForWorkspace = useCallback((
    workspaceId: string,
    workspaceName?: string,
    personaOverride?: string,
    initialMessage?: string,
  ) => {
    const ws = workspaces.find(w => w.id === workspaceId);
    const initialPersonaId = personaOverride ?? ws?.persona ?? undefined;
    const templateLabel = ws?.templateId && ws.templateId !== 'blank' ? (TEMPLATE_SHORT[ws.templateId] || ws.templateId) : undefined;

    setWindows(prev => {
      // If the caller didn't explicitly ask for a persona override, reuse
      // the existing window for this workspace (legacy behavior).
      if (!personaOverride) {
        const existing = prev.find(w => w.appId === 'chat' && w.workspaceId === workspaceId);
        if (existing) {
          const z = nextZ();
          setFocusedInstanceId(existing.instanceId);
          return prev.map(w => w.instanceId === existing.instanceId ? { ...w, zIndex: z, minimized: false } : w);
        }
      }
      const offset = cascadeCounter.current;
      cascadeCounter.current = (cascadeCounter.current + 1) % 10;
      const z = nextZ();
      const instanceId = `chat-${workspaceId}-${Date.now()}`;
      setFocusedInstanceId(instanceId);
      return [...prev, {
        instanceId, appId: 'chat' as AppId,
        workspaceId, workspaceName,
        personaId: initialPersonaId,
        personaLabel: personaLabelFor(initialPersonaId),
        templateLabel,
        initialMessage,
        zIndex: z, minimized: false, cascadeOffset: offset,
      }];
    });
  }, [workspaces]);

  /**
   * Phase A.2: update the persona on a specific window without touching
   * the underlying workspace record. Used by PersonaSwitcher and by
   * ChatWindowInstance's inline persona picker.
   */
  const setWindowPersona = useCallback((instanceId: string, personaId: string) => {
    setWindows(prev => prev.map(w => w.instanceId === instanceId
      ? { ...w, personaId, personaLabel: personaLabelFor(personaId) }
      : w));
  }, []);

  /**
   * Phase B.5: update autonomy on a specific window. Elevated levels
   * (trusted / yolo) auto-revert to 'normal' after `ttlMinutes` unless
   * ttlMinutes is null (meaning "until this window closes").
   */
  const setWindowAutonomy = useCallback((
    instanceId: string,
    level: AutonomyLevel,
    ttlMinutes: number | null = 30,
  ) => {
    const expiresAt = level === 'normal' || ttlMinutes === null
      ? null
      : Date.now() + ttlMinutes * 60_000;
    setWindows(prev => prev.map(w => w.instanceId === instanceId
      ? { ...w, autonomyLevel: level, autonomyExpiresAt: expiresAt }
      : w));
  }, []);

  // Phase B.5: auto-revert expired autonomy grants. Runs every 10 seconds
  // so the elevated banner in ChatApp's header always reflects reality.
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setWindows(prev => {
        let changed = false;
        const next = prev.map(w => {
          if (
            w.autonomyLevel && w.autonomyLevel !== 'normal'
            && w.autonomyExpiresAt && w.autonomyExpiresAt < now
          ) {
            changed = true;
            return { ...w, autonomyLevel: 'normal' as AutonomyLevel, autonomyExpiresAt: null };
          }
          return w;
        });
        return changed ? next : prev;
      });
    }, 10_000);
    return () => clearInterval(interval);
  }, []);

  const closeApp = useCallback((instanceId: string) => {
    setWindows(prev => prev.filter(w => w.instanceId !== instanceId));
  }, []);

  const minimizeApp = useCallback((instanceId: string) => {
    setWindows(prev => prev.map(w => w.instanceId === instanceId ? { ...w, minimized: true } : w));
  }, []);

  const focusWindow = useCallback((instanceId: string) => {
    const z = nextZ();
    setFocusedInstanceId(instanceId);
    setWindows(prev => prev.map(w => w.instanceId === instanceId ? { ...w, zIndex: z, minimized: false } : w));
  }, []);

  const cycleWindowFocus = useCallback(() => {
    setWindows(prev => {
      const visible = prev.filter(w => !w.minimized);
      if (visible.length <= 1) return prev;
      const sorted = [...visible].sort((a, b) => b.zIndex - a.zIndex);
      const nextWindow = sorted[1];
      const z = nextZ();
      setFocusedInstanceId(nextWindow.instanceId);
      return prev.map(w => w.instanceId === nextWindow.instanceId ? { ...w, zIndex: z } : w);
    });
  }, []);

  const closeTopWindow = useCallback(() => {
    if (focusedInstanceId) closeApp(focusedInstanceId);
  }, [focusedInstanceId, closeApp]);

  const minimizeTopWindow = useCallback(() => {
    if (focusedInstanceId) minimizeApp(focusedInstanceId);
  }, [focusedInstanceId, minimizeApp]);

  // Ctrl+` to cycle windows
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        e.preventDefault();
        cycleWindowFocus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [cycleWindowFocus]);

  const getWindowTitle = useCallback((win: WindowState, appConfigTitle: string) => {
    if (win.appId === 'chat') {
      const parts = [win.workspaceName || 'Chat'];
      if (win.templateLabel) parts.push(win.templateLabel);
      if (win.personaLabel) parts.push(win.personaLabel);
      return parts.join(' · ');
    }
    return appConfigTitle || win.appId;
  }, []);

  const openAppIds = useMemo(() => [...new Set(windows.map(w => w.appId))], [windows]);
  const minimizedAppIds = useMemo(() => {
    const grouped = new Map<AppId, boolean[]>();
    windows.forEach(w => {
      const list = grouped.get(w.appId) || [];
      list.push(w.minimized);
      grouped.set(w.appId, list);
    });
    const result: AppId[] = [];
    grouped.forEach((statuses, appId) => {
      if (statuses.every(m => m)) result.push(appId);
    });
    return result;
  }, [windows]);

  return {
    windows, focusedInstanceId,
    openApp, openChatForWorkspace, closeApp, minimizeApp, focusWindow,
    setWindowPersona, setWindowAutonomy,
    closeTopWindow, minimizeTopWindow,
    openAppIds, minimizedAppIds, getWindowTitle,
  };
}
