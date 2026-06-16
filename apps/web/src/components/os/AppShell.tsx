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
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Home, MessageSquare, Brain, ListTodo, Library, Network, Plug, Shield } from 'lucide-react';
import wallpaperDark from '@/assets/wallpaper.jpg';
import wallpaperLight from '@/assets/wallpaper-light.jpg';
import BootScreen from './BootScreen';
import StatusBar from './StatusBar';
import ChatHost from './ChatHost';
import CommandCenter from './overlays/CommandCenter';
import Sidebar, { type SidebarNavItem } from './Sidebar';
import AppErrorBoundary from './ErrorBoundary';
import CreateWorkspaceDialog from './overlays/CreateWorkspaceDialog';
import PersonaSwitcher from './overlays/PersonaSwitcher';
import SpawnAgentDialog from './overlays/SpawnAgentDialog';
import WorkspaceSwitcher from './overlays/WorkspaceSwitcher';
import NotificationInbox from './overlays/NotificationInbox';
import KeyboardShortcutsHelp from './overlays/KeyboardShortcutsHelp';
import OnboardingWizard from './overlays/OnboardingWizard';
import OnboardingTooltips from './overlays/OnboardingTooltips';
import LoginBriefing from './overlays/LoginBriefing';
import ContextRail from './overlays/ContextRail';
import UpgradeModal from './overlays/UpgradeModal';
import TrialExpiredModal from './overlays/TrialExpiredModal';
import { adapter } from '@/lib/adapter';
import { stashDeepLink } from '@/lib/app-deeplink';
import { writeLoginBriefingDismissed, writeLoginBriefingLastDismissedAt } from '@/lib/login-briefing';
import { matchNavRoute, queryString, routeFor, routeForSearchResult } from '@/lib/routes';
import { bootWindowStateMigration, indexLandingRoute } from '@/lib/window-state-migration';
import { getDockForTier, type AppId, type DockEntry } from '@/lib/dock-tiers';
import { buildCommandCatalog, type CatalogCommand } from '@/lib/command-catalog';
import { ShellProvider, useShell } from '@/providers/ShellContext';
import { seedChat, useChatWidgetState } from '@/hooks/useChatWidgetState';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useWaggleDance } from '@/hooks/useWaggleDance';
import { useBumpSessionCount } from '@/hooks/useDockLabels';
import { useDockNudge } from '@/hooks/useDockNudge';
import { useToast } from '@/hooks/use-toast';

const BOOT_KEY = 'waggle-booted';

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

const ShellLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    workspaces, activeWorkspace, activeWorkspaceId,
    selectWorkspace, createWorkspace, patchWorkspace, refreshWorkspaces, workspacesError,
    currentTier, billingTier, trialInfo, refreshTier, showTrialExpired, setShowTrialExpired,
    notifications, unreadCount, markRead, markAllRead,
    onboardingState, updateOnboarding, completeOnboarding,
    offline, agentStatus,
    overlays: ov,
    contextRailTarget, setContextRailTarget,
  } = useShell();

  const { allSignals: waggleSignals } = useWaggleDance();
  const waggleUnacknowledged = waggleSignals.filter(s => !s.acknowledged).length;

  // §4.2/§1.2: PersonaSwitcher (Ctrl+Shift+P) targets the ACTIVE workspace's
  // chat widget (focused-window resolution died with focus tracking, §4.3);
  // the patch-the-workspace-record fallback (Desktop.tsx:595-601) stays for
  // the no-real-workspace case. No defaultAutonomy option here — P4
  // inheritance is stamped only when ChatHost actually mounts the widget.
  const hasRealActiveWorkspace = !!activeWorkspaceId && activeWorkspaceId !== 'local-default';
  const { entry: activeChatEntry, setPersona: setActiveChatPersona } =
    useChatWidgetState(activeWorkspaceId ?? 'local-default');

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
      navigate(
        routeFor(detail.appId, { activeWorkspaceId }) +
        queryString({ tab: detail.tab, automationId: detail.automationId, filter: detail.filter }),
      );
      // Two rAFs ≈ the tick after the navigated-to route has committed.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent('waggle:open-app', { detail: { ...detail, redispatch: true } }));
      }));
    };
    window.addEventListener('waggle:open-app', handler);
    return () => window.removeEventListener('waggle:open-app', handler);
  }, [navigate, activeWorkspaceId]);

  // Keyboard shortcuts — every app shortcut is a navigate() now (§2.2).
  // Ctrl+W / Ctrl+Shift+M window handlers retire with the window manager
  // (§3.1); Ctrl+Shift+N navigates to the active workspace's chat tab (§4.2).
  useKeyboardShortcuts({
    onOpenApp: (id) => navigate(routeFor(id, { activeWorkspaceId })),
    onToggleGlobalSearch: ov.toggleGlobalSearch,
    onTogglePersonaSwitcher: ov.togglePersonaSwitcher,
    onToggleWorkspaceSwitcher: ov.toggleWorkspaceSwitcher,
    onToggleKeyboardHelp: ov.toggleKeyboardHelp,
    onNewChatWindow: () => navigate(routeFor('chat', { activeWorkspaceId })),
  });

  // §2.2 row 1: palette result clicks become pure URL navigation. The
  // workspace-selection side effect is parity with Desktop.tsx:258-288.
  const handleSearchNavigate = useCallback((type: string, id: string) => {
    const route = routeForSearchResult(type, id, { activeWorkspaceId });
    if (!route) return;
    if (type === 'workspace') {
      const bareId = id.includes(':') ? id.slice(id.indexOf(':') + 1) : id;
      selectWorkspace(bareId);
    } else if (type === 'session') {
      const [, wsId] = id.split(':');
      if (wsId) selectWorkspace(wsId);
    }
    navigate(route);
  }, [activeWorkspaceId, selectWorkspace, navigate]);

  // Onboarding completion handlers (relocated from Desktop.tsx:290-313).
  const handleOnboardingComplete = useCallback((_serverBaseUrl: string) => {
    completeOnboarding();
    // Atomic start. 409 (trial already started) is fine — refresh state
    // either way so the StatusBar countdown picks up the existing timestamp.
    adapter.startTrial().then(refreshTier).catch(refreshTier);
  }, [completeOnboarding, refreshTier]);

  const handleOnboardingFinish = useCallback((workspaceId: string, workspaceName: string, firstMessage?: string, personaId?: string) => {
    selectWorkspace(workspaceId);
    // §2.2/§4.2: seed the workspace's chat widget with the wizard-chosen
    // persona + QW-1 starter prompt, then land on the chat tab — behavioral
    // parity with Desktop's handleOnboardingFinish (Desktop.tsx:309-313,
    // acceptance check 8). ChatHost consumes the seed on the widget's first
    // mount. The name is resolved live from the workspaces list (refresh
    // below), so the wizard's workspaceName arg is no longer needed.
    void workspaceName;
    seedChat(workspaceId, { personaId, initialMessage: firstMessage });
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
  const surfaceLabel = labelEntries.find(e => e.route === activeRoute)?.label ?? null;

  // Five-place spine + a power-tier "Pinned" group. Chat resolves to the active
  // workspace's chat tab (routeFor falls back to /home with no workspace). The
  // Agents & tasks badge surfaces unacknowledged coordination signals for now;
  // PR3 refines it to the real pending-approvals/tasks count.
  const isPro = currentTier === 'power' || currentTier === 'admin';
  const billingRank = { FREE: 0, TRIAL: 1, PRO: 2, TEAMS: 3, ENTERPRISE: 4 }[billingTier] ?? 0;
  const spine: SidebarNavItem[] = useMemo(() => [
    { key: 'home', label: 'Home', icon: Home, to: '/home', match: ['/home'] },
    { key: 'chat', label: 'Chat', icon: MessageSquare, to: routeFor('chat', { activeWorkspaceId }), match: ['/workspaces'] },
    { key: 'memory', label: 'Memory', icon: Brain, to: '/memory', match: ['/memory'] },
    { key: 'agents', label: 'Agents & tasks', icon: ListTodo, to: '/agents', match: ['/agents', '/automations'], badge: waggleUnacknowledged || undefined },
    { key: 'library', label: 'Library', icon: Library, to: '/artifacts', match: ['/artifacts', '/files', '/skills'] },
  ], [activeWorkspaceId, waggleUnacknowledged]);
  const pinned: SidebarNavItem[] = useMemo(() => {
    if (!isPro) return [];
    const items: SidebarNavItem[] = [
      { key: 'swarm', label: 'Agent swarm', icon: Network, to: '/waggle-dance', match: ['/waggle-dance'] },
      { key: 'connectors', label: 'Connectors', icon: Plug, to: '/connectors', match: ['/connectors'] },
    ];
    // Approvals is a TEAMS-tier surface (parity with dock-tiers minBillingTier).
    if (billingRank >= 3) items.push({ key: 'approvals', label: 'Approvals', icon: Shield, to: '/approvals', match: ['/approvals'] });
    return items;
  }, [isPro, billingRank]);

  // Plan label for the user row (e.g. "Trial · 9d", "Pro").
  const tierLabel = useMemo(() => {
    if (billingTier === 'TRIAL' || (trialInfo.trialDaysRemaining > 0 && !trialInfo.trialExpired)) {
      return trialInfo.trialDaysRemaining > 0 ? `Trial · ${trialInfo.trialDaysRemaining}d` : 'Trial';
    }
    return billingTier.charAt(0) + billingTier.slice(1).toLowerCase();
  }, [billingTier, trialInfo.trialDaysRemaining, trialInfo.trialExpired]);

  // ⌘K curated catalog (Jump to / Do / Power tools + Pro "Pinned") → real routes.
  const commandCatalog = useMemo(
    () => buildCommandCatalog({ chatHref: routeFor('chat', { activeWorkspaceId }), isPro, billingRank }),
    [activeWorkspaceId, isPro, billingRank],
  );
  const handleCatalogSelect = useCallback((cmd: CatalogCommand) => {
    if (cmd.action === 'spawn') { ov.setShowSpawnAgent(true); return; }
    if (cmd.to) navigate(cmd.to);
  }, [navigate, ov]);

  // FR #33: when the onboarding wizard is active, render ONLY the wizard —
  // no nav, no canvas, no overlays (§1.2 OnboardingWizard row: full-screen
  // takeover at the layout level, any URL). Hooks above keep running so
  // completion re-renders with workspaces/personas already populated.
  if (!onboardingState.completed) {
    return (
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

  return (
    <div className="relative w-screen h-screen overflow-hidden select-none">
      <img src={theme === 'light' ? wallpaperLight : wallpaperDark} alt="" className="absolute inset-0 w-full h-full object-cover" width={1920} height={1080} />
      <div className="absolute inset-0 desktop-overlay" />

      <StatusBar workspaceName={activeWorkspace?.name}
        focusedWindowLabel={surfaceLabel}
        model={agentStatus.model !== 'unknown' ? agentStatus.model : activeWorkspace?.model}
        tokensUsed={agentStatus.tokensUsed} costUsd={agentStatus.costUsd} offline={offline}
        unreadNotifications={unreadCount}
        trialDaysRemaining={trialInfo.trialDaysRemaining} trialExpired={trialInfo.trialExpired}
        onSearchClick={() => ov.setShowGlobalSearch(true)} onNotificationClick={ov.toggleNotifications} />

      <div className="absolute inset-x-0 top-8 bottom-0 flex">
        {/* Warm-Hive calm spine (ia.html) — five places + workspace pill +
            ⌘K tile + user row; all remaining depth lives in ⌘K. */}
        <Sidebar
          workspaceName={activeWorkspace?.name ?? null}
          spine={spine}
          pinned={pinned}
          onOpenWorkspaceSwitcher={ov.toggleWorkspaceSwitcher}
          onOpenCommand={() => ov.setShowGlobalSearch(true)}
          onSpawnAgent={() => ov.setShowSpawnAgent(true)}
          userName={null}
          tierLabel={tierLabel}
        />

        {/* Single canvas (§2.1 rule 1). Route wrappers bring their own
            AppErrorBoundary, mirroring Desktop.tsx:556-558. */}
        <main className="relative z-10 flex-1 min-w-0 overflow-hidden">
          {/* §4.2 keep-alive: ChatHost portals one live ChatWindowInstance per
              visited workspace, so navigation can't kill in-flight SSE
              streams. It renders no layout DOM of its own. */}
          <ChatHost />
          <Outlet />
        </main>
      </div>

      {/* Overlays — Desktop.tsx:569-663 relocated; handlers retarget to
          navigate() per §1.2 / §2.2. */}
      {/* P7/D15 B3: the Win+K overlay sits outside the SurfaceBoundary-wrapped
          Outlet, so an un-caught render throw here blanks the whole shell. Wrap
          it in the same AppErrorBoundary the routes use; onClose dismisses it. */}
      <AppErrorBoundary appName="Command Center" onClose={() => ov.setShowGlobalSearch(false)}>
        <CommandCenter
          open={ov.showGlobalSearch}
          onClose={() => ov.setShowGlobalSearch(false)}
          onNavigate={handleSearchNavigate}
          onExecute={() => { /* post-success hook — overlay closes itself; refresh feeds lazily */ }}
          workspaceId={activeWorkspaceId ?? undefined}
          catalog={commandCatalog}
          onCatalogSelect={handleCatalogSelect}
        />
      </AppErrorBoundary>
      <CreateWorkspaceDialog open={ov.showCreateWorkspace} onClose={() => ov.setShowCreateWorkspace(false)} onCreate={createWorkspace} />
      {/* §1.2/§4.2: PersonaSwitcher acts on the active workspace's chat widget
          (widget state, NOT the workspace record — acceptance check 7); the
          workspace-record patch survives as the no-real-workspace fallback. */}
      <PersonaSwitcher open={ov.showPersonaSwitcher} onClose={() => ov.setShowPersonaSwitcher(false)}
        currentPersona={(hasRealActiveWorkspace ? activeChatEntry.personaId : undefined) ?? activeWorkspace?.persona}
        currentGroupId={activeWorkspace?.agentGroupId}
        currentTemplateId={activeWorkspace?.templateId}
        onSelect={(personaId) => {
          if (hasRealActiveWorkspace) {
            setActiveChatPersona(personaId);
          } else if (activeWorkspaceId) {
            patchWorkspace(activeWorkspaceId, { persona: personaId, agentGroupId: undefined });
          }
        }}
        onSelectGroup={(groupId) => { if (activeWorkspaceId) patchWorkspace(activeWorkspaceId, { agentGroupId: groupId, persona: undefined }); }} />
      <WorkspaceSwitcher open={ov.showWorkspaceSwitcher} onClose={() => ov.setShowWorkspaceSwitcher(false)}
        workspaces={workspaces} activeWorkspaceId={activeWorkspaceId}
        error={workspacesError} onRetry={() => { void refreshWorkspaces(); }}
        onCreateNew={() => ov.setShowCreateWorkspace(true)}
        onSelect={(id) => { selectWorkspace(id); navigate(`/workspaces/${id}`); }} />
      <NotificationInbox open={ov.showNotifications} onClose={() => ov.setShowNotifications(false)} notifications={notifications} onMarkRead={markRead} onMarkAllRead={markAllRead} />
      <KeyboardShortcutsHelp open={ov.showKeyboardHelp} onClose={() => ov.setShowKeyboardHelp(false)} />
      <SpawnAgentDialog open={ov.showSpawnAgent} onClose={() => ov.setShowSpawnAgent(false)}
        workspaces={workspaces} activeWorkspaceId={activeWorkspaceId} onWorkspaceCreated={(ws) => selectWorkspace(ws.id)} />
      {onboardingState.completed && !onboardingState.tooltipsDismissed && (
        <OnboardingTooltips
          templateId={onboardingState.templateId}
          onDismiss={() => updateOnboarding({ tooltipsDismissed: true })}
          suppressed={ov.showGlobalSearch}
        />
      )}
      {/* FR #45: one post-onboarding overlay at a time — Tour first, then the
          briefing once Tour is dismissed (gating relocated from Desktop.tsx:621-637).
          Home-only: the greeting belongs to the cockpit — overlaying Memory or
          Skills hides the very surfaces that prove the product's claims. */}
      {onboardingState.completed && onboardingState.tooltipsDismissed && ov.showLoginBriefing
        && location.pathname.startsWith('/home') && (
        <LoginBriefing
          onDismiss={(permanent) => {
            if (permanent) writeLoginBriefingDismissed(true);
            writeLoginBriefingLastDismissedAt();
            ov.setShowLoginBriefing(false);
          }}
          onOpenWorkspace={(wsId) => { writeLoginBriefingLastDismissedAt(); selectWorkspace(wsId); navigate(routeFor('chat', { activeWorkspaceId: wsId })); ov.setShowLoginBriefing(false); }}
        />
      )}

      {/* Phase C.1: Context Rail (owned by the shell; surfaces feed it via
          onContextRail props — §1.2 last row). */}
      <ContextRail target={contextRailTarget} onClose={() => setContextRailTarget(null)} />

      <UpgradeModal
        onStartTrial={() => {
          adapter.startTrial().then(refreshTier).catch(refreshTier);
        }}
        onUpgrade={(tier) => {
          // Checkout-failure fallback retargets to navigate('/settings')
          // (§1.2 — instance of §2.1 rule 3).
          adapter.createCheckoutSession(tier === 'TEAMS' ? 'TEAMS' : 'PRO').catch(() => {
            navigate('/settings');
          });
        }}
      />

      <TrialExpiredModal
        open={showTrialExpired}
        onDismiss={() => setShowTrialExpired(false)}
        onUpgrade={(tier) => {
          setShowTrialExpired(false);
          adapter.createCheckoutSession(tier).catch(() => { navigate('/settings'); });
        }}
      />
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

  const initialBooted = localStorage.getItem(BOOT_KEY) !== null;
  const [booted, setBooted] = useState(initialBooted);
  const [showShell, setShowShell] = useState(initialBooted);

  const handleBootComplete = () => {
    localStorage.setItem(BOOT_KEY, 'true');
    setBooted(true);
  };

  return (
    <>
      <AnimatePresence onExitComplete={() => setShowShell(true)}>
        {!booted && <BootScreen onComplete={handleBootComplete} />}
      </AnimatePresence>
      {showShell && (
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
