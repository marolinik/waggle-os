/**
 * UX Refactor v2.1 P1a Stage B — ChatHost keep-alive (conversion plan §4.2,
 * deviation §9.12).
 *
 * Mounts ONE ChatWindowInstance (component untouched) per workspace VISITED
 * this session (i.e. whose /workspaces/:id/chat route has been active), keyed
 * by workspaceId, and keeps it ALIVE — hidden, not unmounted — when the route
 * is elsewhere, so in-flight useChat SSE streams survive navigation. This is
 * the conversion's only behavioral guarantee carried over from windowing: an
 * agent run must survive the user navigating to /memory and back.
 *
 * Mechanism — portal container swap: each instance renders through a React
 * portal into a stable per-workspace container <div>. The container's DOM
 * parent swaps between a hidden module-level holding element and the chat-tab
 * slot (`ChatSlot` — the §5.2 seam-b node WorkspaceRoute passes into
 * WorkspaceDesktopApp's `chatSlot` prop) whenever /workspaces/:id/chat is
 * active. Re-parenting a portal container moves DOM without remounting the
 * React subtree, so component state, timers and SSE streams are preserved.
 *
 * Stage C mounts this with a one-liner inside AppShell's <main>: <ChatHost />.
 * ChatWindowInstance props are byte-identical to Desktop.tsx:341-358, sourced
 * from useChatWidgetState + ShellContext (§4.2); the window's stamped
 * workspaceName/templateLabel resolve live from the workspaces list instead.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { matchPath, useLocation, useNavigate } from 'react-router-dom';
import ChatWindowInstance from './apps/ChatWindowInstance';
import { useShell } from '@/providers/ShellContext';
import { queryString, routeFor } from '@/lib/routes';
import {
  rekeyLocalDefaultChatState,
  takeChatSeed,
  useChatWidgetState,
  type ChatSeed,
} from '@/hooks/useChatWidgetState';

// ── Portal container registry ─────────────────────────────────────────────
// Module-level so ChatSlot can adopt containers without coupling to
// ChatHost's render cycle (the slot may mount before or after the host).

const containers = new Map<string, HTMLDivElement>();
let holdingHost: HTMLDivElement | null = null;

/** Hidden off-screen parent for containers no slot currently claims. */
function getHoldingHost(): HTMLDivElement {
  if (!holdingHost) {
    holdingHost = document.createElement('div');
    holdingHost.setAttribute('data-chat-host-holding', 'true');
    holdingHost.style.display = 'none';
    document.body.appendChild(holdingHost);
  }
  return holdingHost;
}

/** Stable per-workspace portal container; parked in the holding host until a ChatSlot adopts it. */
function getChatContainer(workspaceId: string): HTMLDivElement {
  let el = containers.get(workspaceId);
  if (!el) {
    el = document.createElement('div');
    el.setAttribute('data-chat-container', workspaceId);
    el.style.height = '100%';
    getHoldingHost().appendChild(el);
    containers.set(workspaceId, el);
  }
  return el;
}

/** Return a container to the hidden holding host (slot unmounted or switched workspace). */
function parkChatContainer(workspaceId: string): void {
  const el = containers.get(workspaceId);
  if (el && el.parentElement !== getHoldingHost()) {
    getHoldingHost().appendChild(el);
  }
}

// ── ChatSlot — the §5.2 seam-b node ───────────────────────────────────────

/**
 * The chat-tab slot WorkspaceRoute passes into WorkspaceDesktopApp's
 * `chatSlot` prop. On mount it adopts the workspace's portal container
 * (re-parenting, not remounting); on unmount it parks the container back in
 * the hidden holding host so the widget keeps running off-route.
 */
export const ChatSlot = ({ workspaceId }: { workspaceId: string }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.appendChild(getChatContainer(workspaceId));
    return () => parkChatContainer(workspaceId);
  }, [workspaceId]);
  return <div ref={ref} className="h-full" data-testid="chat-widget-slot" data-workspace-id={workspaceId} />;
};

// ── Per-workspace widget instance ─────────────────────────────────────────

interface ChatHostInstanceProps {
  workspaceId: string;
  preferredSessionId?: string | null;
  onSessionNavigate?: (
    workspaceId: string,
    sessionId: string,
    options?: { replace?: boolean },
  ) => void;
}

const ChatHostInstance = ({
  workspaceId,
  preferredSessionId,
  onSessionNavigate,
}: ChatHostInstanceProps) => {
  const { workspaces, defaultAutonomy, setContextRailTarget } = useShell();
  const ws = workspaces.find(w => w.id === workspaceId);
  const { entry, setPersona, setAutonomy } = useChatWidgetState(workspaceId, { defaultAutonomy });

  // §4.2 one-shot seed: taken exactly once on this widget's first mount.
  // Lazy ref init survives StrictMode double-render, and the instance never
  // remounts while visited (keep-alive), so the seed cannot replay.
  const seedRef = useRef<ChatSeed | null | undefined>(undefined);
  if (seedRef.current === undefined) seedRef.current = takeChatSeed(workspaceId) ?? null;
  const seed = seedRef.current;

  // Persist the seeded persona the way openChatForWorkspace stamped
  // personaOverride onto the new window (useWindowManager.ts:230,257).
  // Mount-only, mirroring window creation.
  useEffect(() => {
    if (seed?.personaId) setPersona(seed.personaId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Window-creation parity for the starting persona (useWindowManager.ts:230):
  // widget state first, then the seed override, then the workspace's persona.
  const personaId = entry.personaId ?? seed?.personaId ?? ws?.persona;

  return createPortal(
    <div className="h-full flex flex-col" data-testid={`chat-widget-${workspaceId}`}>
      {/* UX gold-standard H1: the composeChatTitle breadcrumb row is gone —
          it duplicated workspace + persona info already shown in the
          WorkspaceDesktopApp header and ChatApp's agent chip row. */}
      <div className="flex-1 min-h-0">
        <ChatWindowInstance
          workspaceId={workspaceId}
          workspaceName={ws?.name}
          templateId={ws?.templateId}
          storageType={ws?.storageType}
          initialPersona={personaId}
          initialModel={ws?.model}
          initialMessage={seed?.initialMessage}
          autoSendInitial={seed?.autoSend ?? false}
          onPersonaChange={setPersona}
          autonomyLevel={entry.autonomyLevel ?? 'normal'}
          autonomyExpiresAt={entry.autonomyExpiresAt ?? null}
          onAutonomyChange={setAutonomy}
          onContextRail={(target) => setContextRailTarget({ ...target, workspaceId })}
          preferredSessionId={preferredSessionId}
          onSessionNavigate={onSessionNavigate
            ? (sessionId, options) => onSessionNavigate(workspaceId, sessionId, options)
            : undefined}
        />
      </div>
    </div>,
    getChatContainer(workspaceId),
  );
};

// ── ChatHost ──────────────────────────────────────────────────────────────

const ChatHost = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { workspaces } = useShell();
  const [visited, setVisited] = useState<string[]>([]);
  const activeChatMatch = matchPath('/workspaces/:workspaceId/chat', location.pathname);
  const activeChatWorkspaceId = activeChatMatch?.params.workspaceId;
  const routedSessionId = activeChatWorkspaceId
    ? new URLSearchParams(location.search).get('session')
    : null;

  const navigateToSession = useCallback((
    workspaceId: string,
    sessionId: string,
    options?: { replace?: boolean },
  ) => {
    if (workspaceId !== activeChatWorkspaceId) return;
    const next = `${routeFor('chat', { activeWorkspaceId: workspaceId })}${queryString({ session: sessionId })}`;
    if (`${location.pathname}${location.search}` === next) return;
    navigate(next, { replace: options?.replace });
  }, [activeChatWorkspaceId, location.pathname, location.search, navigate]);

  // §3.3.3: one-shot 'local-default' placeholder re-key when the store first
  // sees the REAL workspace list — mirrors the deleted reconciliation sweep
  // (useWindowManager.ts:155-183), incl. its skip of the pre-fetch
  // placeholder-only list.
  const rekeyedRef = useRef(false);
  useEffect(() => {
    if (rekeyedRef.current) return;
    if (workspaces.length === 0) return;
    if (workspaces.length === 1 && workspaces[0].id === 'local-default') return;
    rekeyedRef.current = true;
    rekeyLocalDefaultChatState(workspaces[0].id);
  }, [workspaces]);

  // A workspace becomes "visited" when its chat tab route is active; its
  // instance then stays mounted for the rest of the session (keep-alive).
  useEffect(() => {
    const match = matchPath('/workspaces/:workspaceId/chat', location.pathname);
    const wsId = match?.params.workspaceId;
    if (!wsId || wsId === 'local-default') return;
    setVisited(prev => (prev.includes(wsId) ? prev : [...prev, wsId]));
  }, [location.pathname]);

  return (
    <>
      {visited.map(wsId => (
        <ChatHostInstance
          key={wsId}
          workspaceId={wsId}
          preferredSessionId={wsId === activeChatWorkspaceId ? routedSessionId : undefined}
          onSessionNavigate={wsId === activeChatWorkspaceId ? navigateToSession : undefined}
        />
      ))}
    </>
  );
};

export default ChatHost;
