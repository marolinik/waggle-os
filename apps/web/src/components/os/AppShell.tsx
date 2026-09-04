/**
 * UX Refactor v2.1 P1a — AppShell layout route (conversion plan §2.1 rule 1).
 *
 * Owns: BootScreen gate (FR #23 sequencing ported from the retired
 * pages/Index.tsx), the §3.3 window-state migration boot (one-shot, before the
 * first canvas render), onboarding takeover (§1.2 — wizard renders INSTEAD of
 * nav+canvas), left nav (same getDockForTier/filterByBillingTier data the dock
 * consumed, §1.3), StatusBar, global overlays (the old Desktop.tsx mount block
 * relocated), the `waggle:open-app` shim (§2.3), the keep-alive ChatHost
 * (§4.2), and `<Outlet/>` as the single canvas.
 *
 * Stage C (the flip): this IS the live shell — App.tsx mounts it as the `/`
 * layout route; Desktop.tsx and the window manager are deleted (§3.1).
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Home, MessageSquare, Brain, ListTodo, Library, Network, Plug, Shield } from 'lucide-react';
import wallpaperDark from '@/assets/wallpaper.jpg';
import wallpaperLight from '@/assets/wallpaper-light.jpg';
import BootScreen from './BootScreen';
import StatusBar from './StatusBar';
import RouteTransition from './RouteTransition';
import Sidebar, { type SidebarNavItem } from './Sidebar';
import AppErrorBoundary from './ErrorBoundary';
import UpgradeModal from './overlays/UpgradeModal';
import { adapter } from '@/lib/adapter';
import { stashDeepLink } from '@/lib/app-deeplink';
import { writeLoginBriefingDismissed, writeLoginBriefingLastDismissedAt, readLoginBriefingDismissed, readSkipBriefingParam } from '@/lib/login-briefing';
import { prefetchBriefing, computeAwayDays, BRIEFING_ABSENCE_DAYS } from '@/lib/briefing-source';
import { homeCacheExists } from '@/lib/home-cache';
import {
  resolveReturningUserOnboarding,
  revalidateReturningUserOnboarding,
  isOnboardingStatusKnownSync,
} from '@/hooks/useOnboarding';
import { isTauri, listenDesktopServiceLifecycle } from '@/lib/tauri-bindings';
import { shouldShowCoachMarks, readOnboardedThisSession, readForceTour, clearForceTour } from '@/lib/coach-marks-gate';
import { matchNavRoute, queryString, routeFor, routeForSearchResult } from '@/lib/routes';
import { bootWindowStateMigration, indexLandingRoute } from '@/lib/window-state-migration';
import { getDockForTier, BILLING_TIER_ORDER, type AppId, type DockEntry } from '@/lib/dock-tiers';
import { TIER_LABELS } from '@waggle/shared';
import { buildCommandCatalog, type CatalogCommand } from '@/lib/command-catalog';
import { ShellProvider, useShell } from '@/providers/ShellContext';
import {
  cancelWorkspaceSelectionChatDispatch,
  completeWorkspaceSelectionChatDispatch,
  peekWorkspaceSelectionChatDispatch,
  requestNewChatSession,
  seedChat,
  useChatWidgetState,
  useWorkspaceSelectionChatDispatch,
} from '@/hooks/useChatWidgetState';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useWaggleDance } from '@/hooks/useWaggleDance';
import { useBumpSessionCount } from '@/hooks/useDockLabels';
import { useDockNudge } from '@/hooks/useDockNudge';
import { useToast } from '@/hooks/use-toast';

const BOOT_KEY = 'waggle-booted';

const ChatHost = lazy(() => import('./ChatHost'));
const CommandCenter = lazy(() => import('./overlays/CommandCenter'));
const CreateWorkspaceDialog = lazy(() => import('./overlays/CreateWorkspaceDialog'));
const PersonaSwitcher = lazy(() => import('./overlays/PersonaSwitcher'));
const SpawnAgentDialog = lazy(() => import('./overlays/SpawnAgentDialog'));
const WorkspaceSwitcher = lazy(() => import('./overlays/WorkspaceSwitcher'));
const NotificationInbox = lazy(() => import('./overlays/NotificationInbox'));
const KeyboardShortcutsHelp = lazy(() => import('./overlays/KeyboardShortcutsHelp'));
const OnboardingWizard = lazy(() => import('./overlays/OnboardingWizard'));
const OnboardingTooltips = lazy(() => import('./overlays/OnboardingTooltips'));
const LoginBriefing = lazy(() => import('./overlays/LoginBriefing'));
const ContextRail = lazy(() => import('./overlays/ContextRail'));
const TrialExpiredModal = lazy(() => import('./overlays/TrialExpiredModal'));

const deferredShellElement = (element: ReactNode) => (
  <Suspense fallback={null}>{element}</Suspense>
);

// Exported as the executable boundary between durable onboarding completion
// and trial mutation. Keeping it pure lets the rejection path prove that no
// irreversible billing state changes before the active profile is confirmed.
// eslint-disable-next-line react-refresh/only-export-components
export async function finalizeOnboarding(
  complete: () => Promise<boolean>,
  startTrial: () => Promise<unknown>,
  refreshTier: () => void | Promise<void>,
): Promise<boolean> {
  const completed = await complete();
  if (!completed) return false;

  void startTrial().then(refreshTier).catch(refreshTier);
  return true;
}

export const OnboardingRecoveryNotice = ({
  retrying,
  onRetry,
}: {
  retrying: boolean;
  onRetry: () => void;
}) => (
  <section
    role="status"
    aria-live="polite"
    aria-atomic="true"
    aria-busy={retrying}
    className="fixed bottom-8 left-1/2 z-[10000] w-[min(92vw,30rem)] -translate-x-1/2 rounded-2xl border border-border/80 bg-background/95 p-5 text-center shadow-2xl backdrop-blur"
    onClick={(event) => event.stopPropagation()}
  >
    <h2 className="text-sm font-semibold text-foreground">Waiting for your local Waggle service</h2>
    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
      Your workspace stays protected until Waggle confirms the active profile.
    </p>
    <button
      type="button"
      disabled={retrying}
      onClick={onRetry}
      className="mt-4 min-h-10 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-wait disabled:opacity-60"
    >
      {retrying ? 'Retrying…' : 'Retry Connection'}
    </button>
  </section>
);

type OnboardingProfileGateResolution = 'checking' | 'confirmed' | 'unavailable';

/**
 * Keeps provisional browser state behind the neutral boot surface until the
 * active service generation confirms its logical profile. This gate lives
 * above ShellProvider so it can recover even while the workspace UI is hidden.
 */
// Exported solely as the executable AppShell gate seam; production has one owner.
// eslint-disable-next-line react-refresh/only-export-components
export const useOnboardingProfileGate = () => {
  const [tauriMode] = useState(isTauri);
  const [knownSynchronously] = useState(isOnboardingStatusKnownSync);
  const [resolution, setResolution] = useState<OnboardingProfileGateResolution>(
    knownSynchronously && !tauriMode ? 'confirmed' : 'checking',
  );
  const [recoveryVisible, setRecoveryVisible] = useState(false);
  const mountedRef = useRef(false);
  const resolutionRef = useRef<OnboardingProfileGateResolution>(resolution);
  const runIdRef = useRef(0);
  const timeoutRef = useRef<number | null>(null);
  const successfulConnectSeenRef = useRef(false);
  const tauriRestartPendingRef = useRef(false);
  const lifecycleReadyRef = useRef(!tauriMode);
  const lifecycleRegistrationPendingRef = useRef(false);
  const lifecycleRegistrationIdRef = useRef(0);
  const lifecycleDisposeRef = useRef<(() => void) | null>(null);

  const clearGateTimeout = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const publishResolution = useCallback((next: OnboardingProfileGateResolution) => {
    resolutionRef.current = next;
    setResolution(next);
    if (next === 'unavailable') setRecoveryVisible(true);
    if (next === 'confirmed') setRecoveryVisible(false);
  }, []);

  const beginProtectedHold = useCallback(() => {
    const runId = ++runIdRef.current;
    clearGateTimeout();
    publishResolution('checking');
    timeoutRef.current = window.setTimeout(() => {
      if (mountedRef.current && runIdRef.current === runId) publishResolution('unavailable');
    }, 3000);
    return runId;
  }, [clearGateTimeout, publishResolution]);

  const runProfileCheck = useCallback((forceGeneration = false, replaceInFlight = false) => {
    const runId = beginProtectedHold();
    const request = forceGeneration
      ? revalidateReturningUserOnboarding(replaceInFlight)
      : resolveReturningUserOnboarding();
    void request.then((result) => {
      if (!mountedRef.current || runIdRef.current !== runId) return;
      clearGateTimeout();
      publishResolution(result === 'confirmed' ? 'confirmed' : 'unavailable');
    });
  }, [beginProtectedHold, clearGateTimeout, publishResolution]);

  const registerTauriLifecycle = useCallback((replaceInFlight = false) => {
    if (!tauriMode || lifecycleReadyRef.current) return;
    if (lifecycleRegistrationPendingRef.current && !replaceInFlight) return;
    const registrationId = ++lifecycleRegistrationIdRef.current;
    lifecycleRegistrationPendingRef.current = true;
    beginProtectedHold();
    void listenDesktopServiceLifecycle((event) => {
      if (!mountedRef.current || lifecycleRegistrationIdRef.current !== registrationId) return;
      if (event.status === 'restarting') {
        tauriRestartPendingRef.current = true;
        beginProtectedHold();
      } else if (event.status === 'ready' && tauriRestartPendingRef.current) {
        tauriRestartPendingRef.current = false;
        successfulConnectSeenRef.current = true;
        runProfileCheck(true, true);
      } else if (event.status === 'failed') {
        tauriRestartPendingRef.current = false;
        runIdRef.current += 1;
        clearGateTimeout();
        publishResolution('unavailable');
      }
    }).then((unlisten) => {
      if (!mountedRef.current || lifecycleRegistrationIdRef.current !== registrationId) {
        unlisten();
        return;
      }
      lifecycleRegistrationPendingRef.current = false;
      lifecycleReadyRef.current = true;
      lifecycleDisposeRef.current?.();
      lifecycleDisposeRef.current = unlisten;
      runProfileCheck(true, true);
    }).catch(() => {
      if (!mountedRef.current || lifecycleRegistrationIdRef.current !== registrationId) return;
      lifecycleRegistrationPendingRef.current = false;
      lifecycleReadyRef.current = false;
      runIdRef.current += 1;
      clearGateTimeout();
      publishResolution('unavailable');
    });
  }, [
    beginProtectedHold,
    clearGateTimeout,
    publishResolution,
    runProfileCheck,
    tauriMode,
  ]);

  const retryGate = useCallback(() => {
    if (tauriMode && !lifecycleReadyRef.current) {
      registerTauriLifecycle(resolutionRef.current === 'unavailable');
      return;
    }
    runProfileCheck(true, resolutionRef.current === 'unavailable');
  }, [registerTauriLifecycle, runProfileCheck, tauriMode]);

  useEffect(() => {
    mountedRef.current = true;
    if (tauriMode) registerTauriLifecycle();
    else if (!knownSynchronously) runProfileCheck(true, true);
    return () => {
      mountedRef.current = false;
      runIdRef.current += 1;
      lifecycleRegistrationIdRef.current += 1;
      lifecycleRegistrationPendingRef.current = false;
      lifecycleReadyRef.current = !tauriMode;
      lifecycleDisposeRef.current?.();
      lifecycleDisposeRef.current = null;
      clearGateTimeout();
    };
  }, [clearGateTimeout, knownSynchronously, registerTauriLifecycle, runProfileCheck, tauriMode]);

  // ServiceProvider emits one initial success after boot. It confirms transport,
  // not a new profile generation, so ignore it when the initial profile probe
  // already succeeded. Later successes (or the first success after an offline
  // boot) trigger exactly one profile check here—not in useOnboarding.
  useEffect(() => {
    const onConnectSettled = (event: Event) => {
      const connected = (event as CustomEvent<{ connected?: boolean }>).detail?.connected === true;
      if (!connected) return;
      // In Tauri, the managed lifecycle listener is the sole generation owner.
      // A queued transport-success event may belong to the endpoint being
      // replaced, so it must never reopen or re-probe the protected shell.
      if (tauriMode) return;
      const seenBefore = successfulConnectSeenRef.current;
      successfulConnectSeenRef.current = true;
      if (!seenBefore && resolutionRef.current === 'confirmed') return;
      runProfileCheck(true, resolutionRef.current === 'unavailable');
    };
    window.addEventListener('waggle:connect-settled', onConnectSettled);
    return () => window.removeEventListener('waggle:connect-settled', onConnectSettled);
  }, [runProfileCheck, tauriMode]);

  // Recovery must not depend on ShellProvider because the shell is deliberately
  // unmounted while profile identity is unknown. Keep manual Retry as a fast
  // fallback, but also recover when the browser returns online/focused or after
  // a bounded quiet interval.
  useEffect(() => {
    if (resolution !== 'unavailable' || knownSynchronously) return undefined;
    const retry = () => retryGate();
    const retryWhenVisible = () => {
      if (document.visibilityState === 'visible') retry();
    };
    const timer = window.setTimeout(retry, 5000);
    window.addEventListener('online', retry);
    window.addEventListener('focus', retry);
    document.addEventListener('visibilitychange', retryWhenVisible);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('online', retry);
      window.removeEventListener('focus', retry);
      document.removeEventListener('visibilitychange', retryWhenVisible);
    };
  }, [knownSynchronously, resolution, retryGate]);

  return {
    resolution,
    recoveryVisible,
    retry: retryGate,
  };
};

/**
 * F32: workspace sub-tab → breadcrumb label. Mirrors WorkspaceRoute.WS_TABS +
 * WorkspaceDesktopApp.TABS so the StatusBar crumb reflects the ACTIVE tab
 * instead of collapsing every /workspaces/:id/* path to the dock's 'Chat'
 * entry (the only dock route that prefix-matches them). A tab absent from this
 * map falls back to 'Overview' (fail-safe, never a wrong crumb) — keep it in
 * sync if a tab is added to those two lists.
 */
const WORKSPACE_TAB_LABELS: Record<string, string> = {
  overview: 'Overview', chat: 'Chat', memory: 'Memory',
  artifacts: 'Artifacts', files: 'Files', team: 'Team', tasks: 'Tasks',
};

/** Flatten zone-parents so nav active-state/title lookups see every app entry. */
function flattenAppEntries(entries: DockEntry[]): DockEntry[] {
  const out: DockEntry[] = [];
  for (const e of entries) {
    if (e.type === 'app') out.push(e);
    if (e.type === 'zone-parent' && e.children) {
      out.push(...e.children.filter(c => c.type === 'app'));
    }
  }
  return out;
}

/**
 * Wave U Lane B (item 1) — briefing-landing state machine (pure, unit-tested).
 *
 * The "Catching you up" briefing is the session's OPENING greeting: it may fire
 * only during the initial landing visit, and only when that landing surface is
 * Home. This reducer derives that discipline from the live pathname stream so the
 * gate never reads the raw pathname at render (which re-popped the modal on any
 * in-session navigation to Home — s02: Settings→Home — the "double catch-up"):
 *   - 'pending' — pre-decision; the bare index '/' is transitional (IndexRedirect
 *                 replaces it at once) so it never decides the landing.
 *   - 'armed'   — the first real surface was Home and we have not since left it.
 *   - 'spent'   — the landing surface was not Home, OR we have since left Home; a
 *                 later return to Home can never re-arm it. Terminal.
 * Held in React state ⇒ resets per app session (a fresh launch greets again),
 * never persisted to localStorage.
 */
export type BriefingLanding = 'pending' | 'armed' | 'spent';

// Exported (not a component) so the discipline is unit-tested without mounting the
// shell — the lane owns no separate lib file to host it. Fast-refresh is a non-
// concern for this top-level route module.
// eslint-disable-next-line react-refresh/only-export-components
export function nextBriefingLanding(prev: BriefingLanding, pathname: string): BriefingLanding {
  if (pathname === '/') return prev;            // transitional index — no decision yet
  if (prev === 'spent') return 'spent';         // opportunity already gone this session
  return pathname.startsWith('/home') ? 'armed' : 'spent';
}

const ShellLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    workspaces, activeWorkspace, activeWorkspaceId,
    selectWorkspace, createWorkspace, patchWorkspace, refreshWorkspaces, workspacesError,
    workspacesLoading,
    currentTier, billingTier, trialInfo, refreshTier, showTrialExpired, setShowTrialExpired,
    notifications, unreadCount, markRead, markAllRead,
    onboardingState, updateOnboarding, completeOnboarding,
    offline, agentStatus,
    overlays: ov,
    contextRailTarget, setContextRailTarget,
  } = useShell();

  const { allSignals: waggleSignals } = useWaggleDance();
  const overlaysRef = useRef(ov);
  useEffect(() => {
    overlaysRef.current = ov;
  }, [ov]);
  const waggleUnacknowledged = waggleSignals.filter(s => !s.acknowledged).length;
  // W2A: no implicit workspaces[0] fallback — the chrome shows a workspace only
  // when one was explicitly selected. Sidebar/StatusBar accept null names; the
  // Chat spine item opens the WorkspaceSwitcher when there is no real selection.
  const effectiveActiveWorkspaceId =
    activeWorkspaceId && activeWorkspaceId !== 'local-default'
      ? activeWorkspaceId
      : null;
  const effectiveActiveWorkspace =
    activeWorkspace ?? workspaces.find(ws => ws.id === effectiveActiveWorkspaceId) ?? null;
  const firstAvailableWorkspaceId = useMemo(
    () => workspaces.find(ws => ws.status !== 'archived')?.id ?? null,
    [workspaces],
  );
  const chatShortcutWorkspaceId = useMemo(() => {
    const activeWorkspaceStillExists = effectiveActiveWorkspaceId
      && workspaces.some(ws => ws.id === effectiveActiveWorkspaceId && ws.status !== 'archived');
    return activeWorkspaceStillExists ? effectiveActiveWorkspaceId : firstAvailableWorkspaceId;
  }, [effectiveActiveWorkspaceId, firstAvailableWorkspaceId, workspaces]);
  const [pendingChatShortcut, setPendingChatShortcut] = useState<'navigate' | 'new-session' | null>(null);
  const openActiveChat = useCallback((action: 'navigate' | 'new-session') => {
    if (workspacesLoading && !workspacesError) {
      setPendingChatShortcut(current => current === 'new-session' ? current : action);
      return;
    }
    if (chatShortcutWorkspaceId) {
      if (action === 'new-session') requestNewChatSession(chatShortcutWorkspaceId);
      selectWorkspace(chatShortcutWorkspaceId);
      ov.setShowWorkspaceSwitcher(false);
      navigate(routeFor('chat', { activeWorkspaceId: chatShortcutWorkspaceId }));
      return;
    }
    // No workspace exists yet; ask the user to create or pick one.
    ov.toggleWorkspaceSwitcher();
  }, [chatShortcutWorkspaceId, navigate, ov, selectWorkspace, workspacesError, workspacesLoading]);
  const navigateToActiveChat = useCallback(() => openActiveChat('navigate'), [openActiveChat]);
  const startNewChat = useCallback(() => openActiveChat('new-session'), [openActiveChat]);

  useEffect(() => {
    if (!pendingChatShortcut) return;
    if (workspacesLoading) return;
    if (chatShortcutWorkspaceId) {
      const action = pendingChatShortcut;
      setPendingChatShortcut(null);
      if (action === 'new-session') requestNewChatSession(chatShortcutWorkspaceId);
      selectWorkspace(chatShortcutWorkspaceId);
      ov.setShowWorkspaceSwitcher(false);
      navigate(routeFor('chat', { activeWorkspaceId: chatShortcutWorkspaceId }));
      return;
    }
    if (!workspacesLoading) {
      setPendingChatShortcut(null);
      ov.toggleWorkspaceSwitcher();
    }
  }, [chatShortcutWorkspaceId, navigate, ov, pendingChatShortcut, selectWorkspace, workspacesLoading]);

  // §4.2/§1.2: PersonaSwitcher (Ctrl+Shift+P) targets the ACTIVE workspace's
  // chat widget (focused-window resolution died with focus tracking, §4.3);
  // the patch-the-workspace-record fallback (Desktop.tsx:595-601) stays for
  // the no-real-workspace case. No defaultAutonomy option here — P4
  // inheritance is stamped only when ChatHost actually mounts the widget.
  const hasRealActiveWorkspace = !!effectiveActiveWorkspaceId && effectiveActiveWorkspaceId !== 'local-default';
  const { entry: activeChatEntry, setPersona: setActiveChatPersona } =
    useChatWidgetState(effectiveActiveWorkspaceId ?? 'local-default');

  // User display name for the sidebar user row (PR1 LOW #2). Best-effort via the
  // existing identity surface; re-fetched on connect-settle because the first
  // call can race the session-token attach and 401 → name:null. Falls back to
  // "Account" in the row when unconfigured.
  const [userName, setUserName] = useState<string | null>(null);
  // F5: the UpgradeModal self-opens on a window event, so the shell can't see
  // its open state without this. Feeds `anyModalOpen` so coach-marks hide under it.
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const loadIdentity = () => {
      adapter.getIdentity()
        .then(r => { if (!cancelled) setUserName(r.name ?? null); })
        .catch(() => { /* identity is optional — the row degrades to "Account" */ });
    };
    loadIdentity();
    window.addEventListener('waggle:connect-settled', loadIdentity);
    return () => { cancelled = true; window.removeEventListener('waggle:connect-settled', loadIdentity); };
  }, []);

  // Theme reactivity — watch for data-theme mutations on <html>
  // (relocated from Desktop.tsx:131-139).
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') ?? 'dark');
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setTheme(document.documentElement.getAttribute('data-theme') ?? 'dark');
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  // Session counter (waggle:session-count) — bumped once per page load. The
  // retired Dock did this via its useDockLabels mount; the bump relocates here
  // so the M-24/ENG-3 milestones below keep ticking. Called BEFORE useDockNudge
  // so the bump effect runs first (Dock-child-before-Desktop-parent parity).
  useBumpSessionCount();

  // M-24 / ENG-3 zone nudges (relocated verbatim from Desktop.tsx:218-223 —
  // the IA zones it points at survive as nav zones, §3.2).
  const { toast } = useToast();
  useDockNudge({
    onNudge: (_milestone, copy) => {
      toast({ title: copy.title, description: copy.description });
    },
  });

  const pendingWorkspaceAsk = useWorkspaceSelectionChatDispatch();
  const keepWorkspaceSwitcherOpenRef = useRef(false);
  const deliverPendingWorkspaceAsk = useCallback((workspaceId: string): boolean => {
    const pending = peekWorkspaceSelectionChatDispatch();
    if (!pending) return false;
    try {
      const delivered = completeWorkspaceSelectionChatDispatch(
        workspaceId,
        pending.id,
        () => {
          navigate(routeFor('chat', { activeWorkspaceId: workspaceId }));
          selectWorkspace(workspaceId);
          ov.setShowWorkspaceSwitcher(false);
        },
      );
      if (!delivered) return false;
      return true;
    } catch {
      toast({
        title: 'Message not sent',
        description: 'The workspace chat could not open. Your draft is still on Home.',
        variant: 'destructive',
      });
      return false;
    }
  }, [navigate, ov, selectWorkspace, toast]);

  useEffect(() => {
    if (!pendingWorkspaceAsk || workspacesLoading) return;
    if (workspacesError) {
      if (cancelWorkspaceSelectionChatDispatch(pendingWorkspaceAsk.id)) {
        ov.setShowWorkspaceSwitcher(false);
        toast({
          title: 'Workspace list unavailable',
          description: 'Your Home draft was not sent. Retry when workspaces are available.',
          variant: 'destructive',
        });
      }
      return;
    }
    const validActiveWorkspace = activeWorkspaceId
      ? workspaces.some(workspace => workspace.id === activeWorkspaceId)
      : false;
    if (activeWorkspaceId && validActiveWorkspace) {
      deliverPendingWorkspaceAsk(activeWorkspaceId);
    } else if (workspaces.length > 0) {
      ov.setShowWorkspaceSwitcher(true);
    } else {
      cancelWorkspaceSelectionChatDispatch(pendingWorkspaceAsk.id);
      ov.setShowCreateWorkspace(true);
    }
  }, [
    activeWorkspaceId,
    deliverPendingWorkspaceAsk,
    ov,
    pendingWorkspaceAsk,
    toast,
    workspaces,
    workspacesError,
    workspacesLoading,
  ]);

  // §2.3: the ONE `waggle:open-app` listener (replaces Desktop.tsx:178-190).
  // Stashes the intent for mount-time consumers (AutomationCenterApp), then
  // navigates to the canonical URL. Live-listener consumers (UserProfileApp)
  // only mount on the next render under the single canvas, so the same event
  // is re-dispatched once after the target route has rendered — marked
  // `redispatch: true` so this shim ignores its own re-dispatches.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { appId?: AppId; tab?: string; automationId?: string; filter?: string; redispatch?: boolean }
        | undefined;
      if (!detail?.appId || detail.redispatch) return;
      stashDeepLink({ appId: detail.appId, tab: detail.tab, automationId: detail.automationId, filter: detail.filter });
      ov.setShowWorkspaceSwitcher(false);
      navigate(
        routeFor(detail.appId, { activeWorkspaceId: effectiveActiveWorkspaceId }) +
        queryString({ tab: detail.tab, automationId: detail.automationId, filter: detail.filter }),
      );
      // Two rAFs ≈ the tick after the navigated-to route has committed.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent('waggle:open-app', { detail: { ...detail, redispatch: true } }));
      }));
    };
    window.addEventListener('waggle:open-app', handler);
    return () => window.removeEventListener('waggle:open-app', handler);
  }, [navigate, effectiveActiveWorkspaceId, ov]);

  // Keyboard shortcuts — every app shortcut is a navigate() now (§2.2).
  // Ctrl+W / Ctrl+Shift+M window handlers retire with the window manager
  // (§3.1); Ctrl+Shift+N starts a real session in the active workspace.
  useKeyboardShortcuts({
    onOpenApp: (id) => {
      ov.setShowWorkspaceSwitcher(false);
      navigate(routeFor(id, { activeWorkspaceId: effectiveActiveWorkspaceId }));
    },
    onToggleGlobalSearch: ov.toggleGlobalSearch,
    onTogglePersonaSwitcher: ov.togglePersonaSwitcher,
    onToggleWorkspaceSwitcher: ov.toggleWorkspaceSwitcher,
    onToggleKeyboardHelp: ov.toggleKeyboardHelp,
    onNewChatWindow: startNewChat,
  });

  // §2.2 row 1: palette result clicks become pure URL navigation. The
  // workspace-selection side effect is parity with Desktop.tsx:258-288.
  const handleSearchNavigate = useCallback((type: string, id: string) => {
    const route = routeForSearchResult(type, id, { activeWorkspaceId: effectiveActiveWorkspaceId });
    if (!route) return;
    if (type === 'workspace') {
      const bareId = id.includes(':') ? id.slice(id.indexOf(':') + 1) : id;
      selectWorkspace(bareId);
    } else if (type === 'session') {
      const [, wsId] = id.split(':');
      if (wsId) selectWorkspace(wsId);
    }
    ov.setShowWorkspaceSwitcher(false);
    navigate(route);
  }, [effectiveActiveWorkspaceId, selectWorkspace, navigate, ov]);

  // Onboarding completion handlers (relocated from Desktop.tsx:290-313).
  const handleOnboardingComplete = useCallback((_serverBaseUrl: string) => (
    finalizeOnboarding(
      completeOnboarding,
      () => adapter.startTrial(),
      refreshTier,
    )
  ), [completeOnboarding, refreshTier]);

  const handleOnboardingFinish = useCallback((workspaceId: string, workspaceName: string, firstMessage?: string, personaId?: string) => {
    selectWorkspace(workspaceId);
    // §2.2/§4.2: seed the workspace's chat widget with the wizard-chosen
    // persona + QW-1 starter prompt, then land on the chat tab — behavioral
    // parity with Desktop's handleOnboardingFinish (Desktop.tsx:309-313,
    // acceptance check 8). ChatHost consumes the seed on the widget's first
    // mount. The name is resolved live from the workspaces list (refresh
    // below), so the wizard's workspaceName arg is no longer needed.
    void workspaceName;
    // F2: auto-send the wizard's first task so "Let's go" lands the user in a
    // live conversation instead of a pre-filled-but-unsent composer.
    seedChat(workspaceId, { personaId, initialMessage: firstMessage, autoSend: true });
    // P2 fix (acceptance check 8 live-run): the wizard usually finishes at
    // pathname '/', and completing onboarding (normal-priority state) commits
    // BEFORE this navigate (a v7_startTransition update) — so the shell
    // mounts at '/', IndexRedirect fires, and its '/home' navigation queues
    // after ours and wins. Hand the landing target to IndexRedirect so both
    // navigation authorities agree; the navigate below remains the primary
    // path when the wizard finishes at a non-index URL.
    pendingWizardLanding = `/workspaces/${workspaceId}/chat`;
    navigate(`/workspaces/${workspaceId}/chat`);
    refreshWorkspaces();
  }, [selectWorkspace, navigate, refreshWorkspaces]);

  // Warm-Hive calm spine (ia.html): the always-visible nav is five fixed places;
  // everything else lives one keystroke away in ⌘K. The StatusBar breadcrumb
  // still derives from the full dock route table — every route is now reachable
  // via ⌘K regardless of tier, so the label map must cover them all.
  const labelEntries = useMemo(() => flattenAppEntries(getDockForTier('power', billingTier)), [billingTier]);
  const activeRoute = useMemo(
    () => matchNavRoute(location.pathname, labelEntries.map(e => e.route).filter((r): r is string => !!r)),
    [location.pathname, labelEntries],
  );
  // F32: on a workspace sub-route the breadcrumb reflects the active tab (read
  // straight from the pathname — the URL is the tab-state authority, see
  // WorkspaceRoute). Every other route keeps the dock-route lookup. The regex
  // requires an :id segment, so the bare /workspaces grid falls through to the
  // dock entry (a pre-existing 'Chat' label, out of F32 scope).
  const surfaceLabel = useMemo(() => {
    const wsMatch = /^\/workspaces\/([^/]+)(?:\/([^/]+))?/.exec(location.pathname);
    if (wsMatch) return WORKSPACE_TAB_LABELS[wsMatch[2] ?? 'overview'] ?? 'Overview';
    return labelEntries.find(e => e.route === activeRoute)?.label ?? null;
  }, [location.pathname, activeRoute, labelEntries]);

  // F32: close any shell-level detail rail on a real route change, so a rail
  // opened from a memory frame/entity, file, or chat message can't pin over the
  // next page. Keyed on pathname (not search) so it survives same-surface
  // sub-tab switches (e.g. /memory ?tab=timeline→graph).
  useEffect(() => {
    setContextRailTarget(null);
  }, [location.pathname, setContextRailTarget]);

  // Route changes should dismiss route-independent selection overlays. Without
  // this, a workspace picker opened during a prior navigation can sit above the
  // next surface and intercept sidebar clicks.
  useEffect(() => {
    const overlays = overlaysRef.current;
    if (overlays.showWorkspaceSwitcher) overlays.setShowWorkspaceSwitcher(false);
  }, [location.pathname, location.search]);

  // Wave U Lane B (item 1): drive the briefing gate off the pathname STREAM via
  // nextBriefingLanding, not the live pathname at render — so an in-session
  // navigation to Home (Settings→Home) can never re-open the modal. The home hero
  // already carries the catch-up when the landing surface wasn't Home.
  const [briefingLanding, setBriefingLanding] = useState<BriefingLanding>('pending');
  useEffect(() => {
    setBriefingLanding(prev => nextBriefingLanding(prev, location.pathname));
  }, [location.pathname]);

  // Lane H item 4 — the "double catch-up collapse": the everyday catch-up is the
  // home hero's recall strip, so the full modal is reserved for ≥7-day absences.
  // Away time is derived from the SAME workspace lastActive stream the hero
  // greeting reads (user activity, not machine cron writes); 0 when there is no
  // activity yet, so a brand-new account never triggers it.
  const briefingAwayDays = useMemo(() => computeAwayDays(workspaces), [workspaces]);

  // Five-place spine + a power-tier "Pinned" group. Chat resolves to the active
  // workspace's chat tab (routeFor falls back to /home with no workspace). The
  // Agents & tasks badge surfaces unacknowledged coordination signals for now;
  // PR3 refines it to the real pending-approvals/tasks count.
  const isPro = currentTier === 'power' || currentTier === 'admin';
  const billingRank = BILLING_TIER_ORDER[billingTier] ?? 0;
  const spine: SidebarNavItem[] = useMemo(() => [
    { key: 'home', label: 'Home', icon: Home, to: '/home', match: ['/home'] },
    // Chat resolves to the active workspace's chat tab; with no real workspace,
    // routeFor falls back to /home (which Home already owns → the click feels
    // dead, PR1 LOW #1). In that case open the workspace switcher instead so the
    // user picks a workspace to chat in.
    {
      key: 'chat', label: 'Chat', icon: MessageSquare,
      to: routeFor('chat', { activeWorkspaceId: effectiveActiveWorkspaceId }),
      // F8: only the chat TAB (/workspaces/:id/chat) marks Chat active — a
      // static '/workspaces' prefix wrongly lit Chat on Overview and every
      // other workspace tab. Workspace-agnostic regex, no id coupling.
      match: [], activeWhen: (p: string) => /^\/workspaces\/[^/]+\/chat(\/|$)/.test(p),
      onClick: navigateToActiveChat,
    },
    { key: 'memory', label: 'Memory', icon: Brain, to: '/memory', match: ['/memory'] },
    { key: 'agents', label: 'Agents', icon: ListTodo, to: '/agents', match: ['/agents', '/automations'], badge: waggleUnacknowledged || undefined },
    { key: 'library', label: 'Library', icon: Library, to: '/artifacts', match: ['/artifacts', '/files', '/skills'] },
  ], [effectiveActiveWorkspaceId, navigateToActiveChat, waggleUnacknowledged]);
  const pinned: SidebarNavItem[] = useMemo(() => {
    if (!isPro) return [];
    const items: SidebarNavItem[] = [
      { key: 'swarm', label: 'Agent swarm', icon: Network, to: '/waggle-dance', match: ['/waggle-dance'] },
      { key: 'connectors', label: 'Connectors', icon: Plug, to: '/connectors', match: ['/connectors'] },
    ];
    // Approvals is a TEAMS-tier surface (parity with dock-tiers minBillingTier).
    if (billingRank >= BILLING_TIER_ORDER.TEAMS) items.push({ key: 'approvals', label: 'Approvals', icon: Shield, to: '/approvals', match: ['/approvals'] });
    return items;
  }, [isPro, billingRank]);

  // Plan label for the user row (e.g. "Trial · 9d", "Solo", "Team").
  const tierLabel = useMemo(() => {
    if (billingTier === 'TRIAL' || (trialInfo.trialDaysRemaining > 0 && !trialInfo.trialExpired)) {
      return trialInfo.trialDaysRemaining > 0 ? `Trial · ${trialInfo.trialDaysRemaining}d` : 'Trial';
    }
    return TIER_LABELS[billingTier];
  }, [billingTier, trialInfo.trialDaysRemaining, trialInfo.trialExpired]);

  // ⌘K curated catalog (Jump to / Do / Power tools + Pro "Pinned") → real routes.
  const commandCatalog = useMemo(
    () => buildCommandCatalog({ chatHref: routeFor('chat', { activeWorkspaceId: effectiveActiveWorkspaceId }), isPro, billingRank }),
    [effectiveActiveWorkspaceId, isPro, billingRank],
  );
  const handleCatalogSelect = useCallback((cmd: CatalogCommand) => {
    if (cmd.action === 'spawn') { ov.setShowSpawnAgent(true); return; }
    if (cmd.to) {
      ov.setShowWorkspaceSwitcher(false);
      navigate(cmd.to);
    }
  }, [navigate, ov]);

  // FR #33: when the onboarding wizard is active, render ONLY the wizard —
  // no nav, no canvas, no overlays (§1.2 OnboardingWizard row: full-screen
  // takeover at the layout level, any URL). Hooks above keep running so
  // completion re-renders with workspaces/personas already populated.
  if (!onboardingState.completed) {
    return deferredShellElement(
      <OnboardingWizard
        serverBaseUrl={adapter.getServerUrl()}
        state={onboardingState}
        onUpdate={updateOnboarding}
        onComplete={handleOnboardingComplete}
        onDismiss={completeOnboarding}
        onFinish={handleOnboardingFinish}
      />
    );
  }

  // F5: any shell overlay open ⇒ suppress the coach-mark carousel (hide-but-keep
  // tour state, per OnboardingTooltips' `suppressed` contract). Includes the
  // event-driven UpgradeModal (via upgradeOpen) and the trial paywall.
  const anyModalOpen =
    ov.showGlobalSearch || ov.showCreateWorkspace || ov.showPersonaSwitcher ||
    ov.showWorkspaceSwitcher || ov.showNotifications || ov.showKeyboardHelp ||
    ov.showSpawnAgent || showTrialExpired || upgradeOpen;

  return (
    <div className="relative w-screen h-screen overflow-hidden select-none">
      <img src={theme === 'light' ? wallpaperLight : wallpaperDark} alt="" className="absolute inset-0 w-full h-full object-cover" width={1920} height={1080} />
      <div className="absolute inset-0 desktop-overlay" />

      <StatusBar workspaceName={effectiveActiveWorkspace?.name}
        focusedWindowLabel={surfaceLabel}
        // W2C: workspace-first precedence — the chip means "the model this
        // workspace's chat will use" (chat.ts: request ?? workspace.model ??
        // config default), falling back to the global runtime model.
        model={effectiveActiveWorkspace?.model ?? (agentStatus.model !== 'unknown' ? agentStatus.model : undefined)}
        tokensUsed={agentStatus.tokensUsed} costUsd={agentStatus.costUsd} offline={offline}
        unreadNotifications={unreadCount}
        trialDaysRemaining={trialInfo.trialDaysRemaining} trialExpired={trialInfo.trialExpired}
        onSearchClick={() => ov.setShowGlobalSearch(true)} onNotificationClick={ov.toggleNotifications} />

      <div className="absolute inset-x-0 top-8 bottom-0 flex">
        {/* Warm-Hive calm spine (ia.html) — five places + workspace pill +
            ⌘K tile + user row; all remaining depth lives in ⌘K. */}
        <Sidebar
          workspaceName={effectiveActiveWorkspace?.name ?? null}
          spine={spine}
          pinned={pinned}
          onOpenWorkspaceSwitcher={ov.toggleWorkspaceSwitcher}
          onOpenCommand={() => ov.setShowGlobalSearch(true)}
          onSpawnAgent={() => ov.setShowSpawnAgent(true)}
          userName={userName}
          tierLabel={tierLabel}
        />

        {/* Single canvas (§2.1 rule 1). Route wrappers bring their own
            AppErrorBoundary, mirroring Desktop.tsx:556-558. */}
        <main className="relative z-10 flex-1 min-w-0 overflow-hidden">
          {/* §4.2 keep-alive: ChatHost portals one live ChatWindowInstance per
              visited workspace, so navigation can't kill in-flight SSE
              streams. It renders no layout DOM of its own. NOTE: it stays a
              SIBLING of RouteTransition (never wrapped) so the crossfade can
              never remount it and kill an in-flight stream. */}
          {deferredShellElement(<ChatHost />)}
          {/* Pillar 1.1 · Lane RT: the default fade-through crossfade + persistent
              chrome for top-level route changes. Wraps ONLY the Outlet; the
              sidebar + StatusBar above are outside this subtree, so they persist.
              Feature-flagged + reduced-motion-aware; focus/AT ships inside it. */}
          <RouteTransition />
        </main>
      </div>

      {/* Overlays — Desktop.tsx:569-663 relocated; handlers retarget to
          navigate() per §1.2 / §2.2. */}
      {/* P7/D15 B3: the Win+K overlay sits outside the SurfaceBoundary-wrapped
          Outlet, so an un-caught render throw here blanks the whole shell. Wrap
          it in the same AppErrorBoundary the routes use; onClose dismisses it. */}
      {ov.showGlobalSearch && deferredShellElement(
        <AppErrorBoundary appName="Command Center" onClose={() => ov.setShowGlobalSearch(false)}>
          <CommandCenter
            open
            onClose={() => ov.setShowGlobalSearch(false)}
            onNavigate={handleSearchNavigate}
            onExecute={() => { /* post-success hook — overlay closes itself; refresh feeds lazily */ }}
            workspaceId={effectiveActiveWorkspaceId ?? undefined}
            catalog={commandCatalog}
            onCatalogSelect={handleCatalogSelect}
          />
        </AppErrorBoundary>
      )}
      {ov.showCreateWorkspace && deferredShellElement(
        <CreateWorkspaceDialog open onClose={() => ov.setShowCreateWorkspace(false)} onCreate={createWorkspace} />
      )}
      {/* §1.2/§4.2: PersonaSwitcher acts on the active workspace's chat widget
          (widget state, NOT the workspace record — acceptance check 7); the
          workspace-record patch survives as the no-real-workspace fallback. */}
      {ov.showPersonaSwitcher && deferredShellElement(
        <PersonaSwitcher open onClose={() => ov.setShowPersonaSwitcher(false)}
          currentPersona={(hasRealActiveWorkspace ? activeChatEntry.personaId : undefined) ?? effectiveActiveWorkspace?.persona}
          currentGroupId={effectiveActiveWorkspace?.agentGroupId}
          currentTemplateId={effectiveActiveWorkspace?.templateId}
          onSelect={(personaId) => {
            if (hasRealActiveWorkspace) {
              setActiveChatPersona(personaId);
            } else if (effectiveActiveWorkspaceId) {
              patchWorkspace(effectiveActiveWorkspaceId, { persona: personaId, agentGroupId: undefined });
            }
          }}
          onSelectGroup={(groupId) => { if (effectiveActiveWorkspaceId) patchWorkspace(effectiveActiveWorkspaceId, { agentGroupId: groupId, persona: undefined }); }} />
      )}
      {ov.showWorkspaceSwitcher && deferredShellElement(
          <WorkspaceSwitcher open onClose={() => {
            if (keepWorkspaceSwitcherOpenRef.current) {
              keepWorkspaceSwitcherOpenRef.current = false;
              return;
            }
            cancelWorkspaceSelectionChatDispatch();
            ov.setShowWorkspaceSwitcher(false);
        }}
          workspaces={workspaces} activeWorkspaceId={effectiveActiveWorkspaceId}
          error={workspacesError} onRetry={() => { void refreshWorkspaces(); }}
          onCreateNew={() => {
            cancelWorkspaceSelectionChatDispatch();
            ov.setShowWorkspaceSwitcher(false);
            ov.setShowCreateWorkspace(true);
          }}
          onViewAll={() => {
              if (peekWorkspaceSelectionChatDispatch()) {
                keepWorkspaceSwitcherOpenRef.current = true;
                toast({ description: 'Choose a workspace here to send your Home message.' });
                return;
            }
            ov.setShowWorkspaceSwitcher(false);
            navigate('/workspaces');
          }}
            onSelect={(id) => {
              if (peekWorkspaceSelectionChatDispatch()) {
                if (!deliverPendingWorkspaceAsk(id)) {
                  keepWorkspaceSwitcherOpenRef.current = true;
                }
                return;
            }
            selectWorkspace(id);
            ov.setShowWorkspaceSwitcher(false);
            navigate(`/workspaces/${id}`);
          }} />
      )}
      {ov.showNotifications && deferredShellElement(
        <NotificationInbox open onClose={() => ov.setShowNotifications(false)} notifications={notifications} onMarkRead={markRead} onMarkAllRead={markAllRead} />
      )}
      {ov.showKeyboardHelp && deferredShellElement(
        <KeyboardShortcutsHelp open onClose={() => ov.setShowKeyboardHelp(false)} />
      )}
      {ov.showSpawnAgent && deferredShellElement(
        <SpawnAgentDialog open onClose={() => ov.setShowSpawnAgent(false)}
          workspaces={workspaces} activeWorkspaceId={effectiveActiveWorkspaceId} onWorkspaceCreated={(ws) => selectWorkspace(ws.id)}
          onSpawned={({ roomId, runId }) => {
            ov.setShowSpawnAgent(false);
            navigate(`/room?room=${encodeURIComponent(roomId)}&run=${encodeURIComponent(runId)}`);
          }} />
      )}
      {shouldShowCoachMarks({
        completed: onboardingState.completed,
        tooltipsDismissed: !!onboardingState.tooltipsDismissed,
        completedAt: onboardingState.completedAt ?? null,
        completedThisSession: readOnboardedThisSession(),
        forceTour: readForceTour(),
      }) && deferredShellElement(
        <OnboardingTooltips
          templateId={onboardingState.templateId}
          onDismiss={() => { clearForceTour(); updateOnboarding({ tooltipsDismissed: true }); }}
          suppressed={anyModalOpen}
        />
      )}
      {/* FR #45: one post-onboarding overlay at a time — Tour first, then the
          briefing once Tour is dismissed (gating relocated from Desktop.tsx:621-637).
          Home-only: the greeting belongs to the cockpit — overlaying Memory or
          Skills hides the very surfaces that prove the product's claims.
          Wave Q Lane A (item 2 — one problem, one voice): when the sidecar is
          unreachable the SAME root cause already surfaces as Home's own error
          state + the NoModelBanner, so suppress the briefing entirely rather than
          stack a third symptom on top. The connection problem is announced once.
          Wave U Lane B (item 1 — interruption discipline): gate on briefingLanding
          ('armed' = Home was the session's landing surface AND we haven't left it),
          NOT the live pathname alone — so a mid-session Settings→Home never re-pops
          it. The trailing pathname check absorbs the one-frame effect lag.
          Lane H item 4: additionally require a ≥7-day absence — otherwise the home
          hero's recall strip is the catch-up, and this modal stays closed. */}
      {onboardingState.completed && onboardingState.tooltipsDismissed && ov.showLoginBriefing
        && briefingLanding === 'armed' && location.pathname.startsWith('/home') && !offline
        && briefingAwayDays >= BRIEFING_ABSENCE_DAYS && (
        deferredShellElement(
          <LoginBriefing
            onDismiss={(permanent) => {
              if (permanent) writeLoginBriefingDismissed(true);
              writeLoginBriefingLastDismissedAt();
              ov.setShowLoginBriefing(false);
            }}
            onOpenWorkspace={(wsId) => { writeLoginBriefingLastDismissedAt(); selectWorkspace(wsId); navigate(routeFor('chat', { activeWorkspaceId: wsId })); ov.setShowLoginBriefing(false); }}
          />
        )
      )}

      {/* Phase C.1: Context Rail (owned by the shell; surfaces feed it via
          onContextRail props — §1.2 last row). */}
      {contextRailTarget && deferredShellElement(
        <ContextRail target={contextRailTarget} onClose={() => setContextRailTarget(null)} />
      )}

      <UpgradeModal
        onOpenChange={setUpgradeOpen}
        onStartTrial={() => {
          adapter.startTrial().then(refreshTier).catch(refreshTier);
        }}
        onUpgrade={(tier) => {
          // PR7a: navigate to hosted Stripe Checkout (the URL was previously
          // discarded — a dead happy path). Same-tab assign rather than a deferred
          // window.open: the open happens after an awaited round-trip, outside the
          // user-gesture window, so a popup blocker / Tauri WebView could swallow it.
          // Hosted Checkout redirects back to /payment-success on completion.
          adapter.createCheckoutSession(tier)
            .then(({ url }) => { if (url) window.location.assign(url); })
            .catch(() => { navigate('/settings?tab=billing'); });
        }}
      />

      {showTrialExpired && deferredShellElement(
        <TrialExpiredModal
          open
          onDismiss={() => setShowTrialExpired(false)}
          onUpgrade={(tier) => {
            setShowTrialExpired(false);
            // PR7a: same-tab navigate to hosted Checkout (avoids the deferred-popup
            // blocker; redirects back to /payment-success). Plan-tab fallback on failure.
            adapter.createCheckoutSession(tier)
              .then(({ url }) => { if (url) window.location.assign(url); })
              .catch(() => { navigate('/settings?tab=billing'); });
          }}
        />
      )}
    </div>
  );
};

/**
 * Boot gate (FR #23, ported from pages/Index.tsx:14-36): the boot signal is
 * split into "boot finished" (gates BootScreen exit animation) and "show
 * shell" (gates the layout + its overlays) so the exit transition finishes
 * BEFORE the shell mounts. ShellProvider mounts inside the gate so its hooks
 * start fetching post-boot, exactly when Desktop's hooks start today.
 */
const AppShell = () => {
  // §3.3: one-shot `waggle-window-state-v1` migration, run on the first shell
  // render — BEFORE the first canvas render (the Outlet only mounts inside
  // ShellLayout below). The salvage side effects (chat-state merge + key
  // removal) run on every entry path; the salvaged initialRoute is applied
  // only via IndexRedirect when the app ENTERED on '/' (a typed deep link
  // always wins — acceptance check 2).
  useState(() => bootWindowStateMigration(window.location.pathname));

  // Wave T Lane A (item 2): warm the LoginBriefing payload cache while the boot
  // sequence runs (~4s), so the briefing greets with content instead of opening
  // as a bare spinner. Skipped when the user turned the briefing off. Fire-and-
  // forget; the adapter's connect gate defers the requests until the sidecar is
  // reachable, and prefetchBriefing swallows its own rejection.
  useEffect(() => {
    if (!readLoginBriefingDismissed() && !readSkipBriefingParam()) prefetchBriefing();
  }, []);

  const [initialBooted] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const shouldSkipBoot = params.get('skipOnboarding') === 'true' || params.get('skipBoot') === 'true';
    if (shouldSkipBoot) {
      localStorage.setItem(BOOT_KEY, 'true');
      return true;
    }
    return localStorage.getItem(BOOT_KEY) !== null;
  });

  // Wave T Lane A (item 1): the onboarding wizard flashes for ~1s for a
  // server-onboarded user whose webview localStorage is fresh — the P4
  // /api/onboarding/status probe only resolves AFTER the shell mounts, so the
  // wizard paints before the auto-complete lands. Hold boot until the decision
  // is KNOWN: sync only for explicit test overrides; all ordinary cached
  // progress is provisional and reconciled with the current server profile
  // After 3s, expose a clear recovery action while keeping provisional cache
  // behind the neutral boot surface. A timeout is not profile confirmation.
  const {
    resolution: onboardingResolution,
    recoveryVisible: onboardingRecoveryVisible,
    retry: retryOnboardingResolution,
  } = useOnboardingProfileGate();
  const onboardingResolved = onboardingResolution === 'confirmed';

  const [booted, setBooted] = useState(initialBooted);
  const [showShell, setShowShell] = useState(() => initialBooted && isOnboardingStatusKnownSync());
  // Lane H item 5: a warm session (returning user WITH a cache-first Home payload
  // to paint behind the boot screen) shortens the brand flash to ≤500ms. A cold /
  // day-0 launch (nothing cached to paint) keeps the full brand moment.
  const [warmBoot] = useState(() => initialBooted && homeCacheExists());

  // A service-generation change must revoke the old shell immediately. Once
  // the replacement profile is confirmed, AnimatePresence restores the shell
  // only after the neutral boot surface has completed its exit.
  useEffect(() => {
    if (!onboardingResolved) setShowShell(false);
  }, [onboardingResolved]);

  const handleBootComplete = () => {
    localStorage.setItem(BOOT_KEY, 'true');
    setBooted(true);
  };

  // Hold the BootScreen until BOTH the boot sequence finished AND onboarding
  // status is known (item 1) — only then may it animate out and the shell mount.
  const bootComplete = booted && onboardingResolved;

  return (
    <>
      {/* Wave U Lane D: `ready` shortens the boot floor. The boot screen shows
          its brand moment then exits the instant the shell's deps resolve —
          onboarding resolution is the one genuinely-slow pre-boot dependency (a
          server probe capped at 3s above). The briefing prefetch is fire-and-
          forget on mount, and the workspace store warms inside ShellProvider
          (post-boot), so neither can gate the floor. While onboarding is
          unresolved the boot holds past the floor rather than flash the wizard. */}
      <AnimatePresence onExitComplete={() => setShowShell(true)}>
        {!bootComplete && <BootScreen onComplete={handleBootComplete} ready={onboardingResolved} warm={warmBoot} />}
      </AnimatePresence>
      {!onboardingResolved && onboardingRecoveryVisible && (
        <OnboardingRecoveryNotice
          retrying={onboardingResolution === 'checking'}
          onRetry={retryOnboardingResolution}
        />
      )}
      {showShell && onboardingResolved && (
        <ShellProvider>
          <ShellLayout />
        </ShellProvider>
      )}
    </>
  );
};

/**
 * Index-route element (`/`): redirects to the §3.3 salvaged route exactly
 * once (the boot entry), '/home' on every later visit. Replaces the old
 * Desktop.tsx:192-206 launch-flip (§2.2 — the index redirect subsumes it).
 */
/** One-shot landing target set by handleOnboardingFinish — see the P2 note
 *  there. Read (not cleared) in IndexRedirect's initializer so a StrictMode
 *  double-run stays consistent; cleared in its mount effect. */
let pendingWizardLanding: string | null = null;

export const IndexRedirect = () => {
  const [to] = useState(() => pendingWizardLanding ?? indexLandingRoute());
  useEffect(() => { pendingWizardLanding = null; }, []);
  return <Navigate to={to} replace />;
};

export default AppShell;
