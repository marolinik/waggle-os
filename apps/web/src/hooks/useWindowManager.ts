import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import type { AppId } from '@/lib/dock-tiers';
import type { Workspace } from '@/lib/types';

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
  zIndex: number;
  minimized: boolean;
  cascadeOffset: number;
}

function personaLabelFor(personaId?: string): string | undefined {
  if (!personaId) return undefined;
  return PERSONA_SHORT[personaId] || personaId;
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
  const [windows, setWindows] = useState<WindowState[]>([]);
  const topZRef = useRef(10);
  const cascadeCounter = useRef(0);
  const [focusedInstanceId, setFocusedInstanceId] = useState<string | null>(null);

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
    setWindowPersona,
    closeTopWindow, minimizeTopWindow,
    openAppIds, minimizedAppIds, getWindowTitle,
  };
}
