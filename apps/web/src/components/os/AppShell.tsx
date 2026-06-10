/**
 * UX Refactor v2.1 P1a — AppShell layout route (conversion plan §2.1 rule 1).
 *
 * Owns: BootScreen gate (FR #23 sequencing ported from pages/Index.tsx:14-36),
 * onboarding takeover (§1.2 — wizard renders INSTEAD of nav+canvas), left nav
 * (same getDockForTier/filterByBillingTier data the dock consumes, §1.3),
 * StatusBar, global overlays (Desktop.tsx:569-663 mount block relocated),
 * the `waggle:open-app` shim (§2.3), and `<Outlet/>` as the single canvas.
 *
 * Stage A: ADDITIVE — not mounted anywhere yet. Desktop.tsx remains the live
 * shell until the Stage-C flip swaps App.tsx's route tree to:
 *   <Route path="/" element={<AppShell/>}> …route wrappers… </Route>
 *
 * TODO(stage-B): ChatHost keep-alive mounts inside <main> (§4.2) — one hidden
 * ChatWindowInstance per visited workspace so route navigation cannot kill
 * in-flight agent SSE streams. The chat seed API (seedChat) lands with it.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Rocket } from 'lucide-react';
import wallpaperDark from '@/assets/wallpaper.jpg';
import wallpaperLight from '@/assets/wallpaper-light.jpg';
import BootScreen from './BootScreen';
import StatusBar from './StatusBar';
import CommandCenter from './overlays/CommandCenter';
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
import { writeLoginBriefingDismissed } from '@/lib/login-briefing';
import { matchNavRoute, queryString, routeFor, routeForSearchResult } from '@/lib/routes';
import { getDockForTier, type AppId, type DockEntry } from '@/lib/dock-tiers';
import { ShellProvider, useShell } from '@/providers/ShellContext';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useWaggleDance } from '@/hooks/useWaggleDance';
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
    selectWorkspace, createWorkspace, patchWorkspace, refreshWorkspaces,
    currentTier, billingTier, trialInfo, refreshTier, showTrialExpired, setShowTrialExpired,
    notifications, unreadCount, markRead, markAllRead,
    onboardingState, updateOnboarding, completeOnboarding,
    offline, agentStatus,
    overlays: ov,
    contextRailTarget, setContextRailTarget,
  } = useShell();

  const { allSignals: waggleSignals } = useWaggleDance();
  const waggleUnacknowledged = waggleSignals.filter(s => !s.acknowledged).length;

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
        | { appId?: AppId; tab?: string; automationId?: string; redispatch?: boolean }
        | undefined;
      if (!detail?.appId || detail.redispatch) return;
      stashDeepLink({ appId: detail.appId, tab: detail.tab, automationId: detail.automationId });
      navigate(
        routeFor(detail.appId, { activeWorkspaceId }) +
        queryString({ tab: detail.tab, automationId: detail.automationId }),
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
    // TODO(stage-B): seedChat(workspaceId, { personaId, initialMessage: firstMessage })
    // via the ChatHost seed API (§4.2) so the wizard-chosen persona + QW-1
    // starter prompt land in the widget (acceptance check 8). Until ChatHost
    // exists there is no widget to seed — navigation alone keeps the flow alive.
    void workspaceName; void firstMessage; void personaId;
    navigate(`/workspaces/${workspaceId}/chat`);
    refreshWorkspaces();
  }, [selectWorkspace, navigate, refreshWorkspaces]);

  // Nav model = the same data the dock renders (§1.3).
  const navEntries = useMemo(() => getDockForTier(currentTier, billingTier), [currentTier, billingTier]);
  const appEntries = useMemo(() => flattenAppEntries(navEntries), [navEntries]);
  const activeRoute = useMemo(
    () => matchNavRoute(location.pathname, appEntries.map(e => e.route).filter((r): r is string => !!r)),
    [location.pathname, appEntries],
  );
  // §3.1: the StatusBar breadcrumb derives from the matched route's title
  // (buildStatusBarFocus + focused-window state die with the window manager).
  const surfaceLabel = appEntries.find(e => e.route === activeRoute)?.label ?? null;

  const renderNavItem = (entry: DockEntry, indent: boolean) => {
    const Icon = entry.icon!;
    const isActive = !!entry.route && entry.route === activeRoute;
    return (
      <button
        key={entry.key}
        aria-label={entry.label}
        aria-current={isActive ? 'page' : undefined}
        data-testid={`nav-${entry.key}`}
        onClick={() => entry.appId && navigate(routeFor(entry.appId, { activeWorkspaceId }))}
        className={`relative w-full flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs font-display transition-colors ${
          indent ? 'pl-7' : ''
        } ${isActive ? 'bg-muted/60 text-foreground' : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'}`}
      >
        <Icon className={`w-4 h-4 shrink-0 ${entry.color ?? ''}`} />
        <span className="truncate">{entry.label}</span>
        {entry.appId === 'waggle-dance' && waggleUnacknowledged > 0 && (
          <span className="ml-auto min-w-[16px] h-4 flex items-center justify-center text-[10px] font-bold bg-destructive text-destructive-foreground rounded-full px-1">
            {waggleUnacknowledged > 99 ? '99+' : waggleUnacknowledged}
          </span>
        )}
      </button>
    );
  };

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
        {/* Left nav — renders the same zone data the dock renders (§1.3). */}
        <nav aria-label="Primary" className="relative z-10 w-52 shrink-0 glass-strong border-r border-border/30 overflow-y-auto py-3 px-2 flex flex-col gap-0.5">
          {navEntries.map((entry) => {
            if (entry.type === 'separator') {
              return <div key={entry.key} className="h-px bg-border/30 my-1.5 mx-2" />;
            }
            if (entry.type === 'zone-parent') {
              return (
                <div key={entry.key} className="flex flex-col gap-0.5">
                  <div className="px-2.5 pt-2 pb-1 text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground/70">
                    {entry.label}
                  </div>
                  {entry.children?.filter(c => c.type === 'app').map(child => renderNavItem(child, true))}
                </div>
              );
            }
            return renderNavItem(entry, false);
          })}
          {/* Spawn affordance survives the killed mission-control surface (§1.1). */}
          <div className="h-px bg-border/30 my-1.5 mx-2" />
          <button
            aria-label="Spawn Agent"
            data-testid="nav-spawn-agent"
            onClick={() => ov.setShowSpawnAgent(true)}
            className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs font-display text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors"
          >
            <Rocket className="w-4 h-4 shrink-0 text-primary" />
            <span className="truncate">Spawn Agent</span>
          </button>
        </nav>

        {/* Single canvas (§2.1 rule 1). Route wrappers bring their own
            AppErrorBoundary, mirroring Desktop.tsx:556-558. */}
        <main className="relative z-10 flex-1 min-w-0 overflow-hidden">
          {/* TODO(stage-B): <ChatHost/> mounts here (§4.2) — keep-alive
              ChatWindowInstance per visited workspace, hidden off-route. */}
          <Outlet />
        </main>
      </div>

      {/* Overlays — Desktop.tsx:569-663 relocated; handlers retarget to
          navigate() per §1.2 / §2.2. */}
      <CommandCenter
        open={ov.showGlobalSearch}
        onClose={() => ov.setShowGlobalSearch(false)}
        onNavigate={handleSearchNavigate}
        onExecute={() => { /* post-success hook — overlay closes itself; refresh feeds lazily */ }}
        workspaceId={activeWorkspaceId ?? undefined}
      />
      <CreateWorkspaceDialog open={ov.showCreateWorkspace} onClose={() => ov.setShowCreateWorkspace(false)} onCreate={createWorkspace} />
      {/* TODO(stage-C): retarget PersonaSwitcher to the ACTIVE WORKSPACE's chat
          widget via useChatWidgetState (§1.2/§4.2) once ChatHost exists. Until
          then only the no-focused-window fallback branch (patch the workspace
          record, Desktop.tsx:595-601) is wired — focused-window resolution died
          with focus tracking (§4.3). */}
      <PersonaSwitcher open={ov.showPersonaSwitcher} onClose={() => ov.setShowPersonaSwitcher(false)}
        currentPersona={activeWorkspace?.persona} currentGroupId={activeWorkspace?.agentGroupId}
        currentTemplateId={activeWorkspace?.templateId}
        onSelect={(personaId) => {
          if (activeWorkspaceId) {
            patchWorkspace(activeWorkspaceId, { persona: personaId, agentGroupId: undefined });
          }
        }}
        onSelectGroup={(groupId) => { if (activeWorkspaceId) patchWorkspace(activeWorkspaceId, { agentGroupId: groupId, persona: undefined }); }} />
      <WorkspaceSwitcher open={ov.showWorkspaceSwitcher} onClose={() => ov.setShowWorkspaceSwitcher(false)}
        workspaces={workspaces} activeWorkspaceId={activeWorkspaceId}
        onSelect={(id) => { selectWorkspace(id); navigate(`/workspaces/${id}`); }} />
      <NotificationInbox open={ov.showNotifications} onClose={() => ov.setShowNotifications(false)} notifications={notifications} onMarkRead={markRead} onMarkAllRead={markAllRead} />
      <KeyboardShortcutsHelp open={ov.showKeyboardHelp} onClose={() => ov.setShowKeyboardHelp(false)} />
      <SpawnAgentDialog open={ov.showSpawnAgent} onClose={() => ov.setShowSpawnAgent(false)}
        workspaces={workspaces} activeWorkspaceId={activeWorkspaceId} onWorkspaceCreated={(ws) => selectWorkspace(ws.id)} />
      {onboardingState.completed && !onboardingState.tooltipsDismissed && (
        <OnboardingTooltips
          templateId={onboardingState.templateId}
          onDismiss={() => updateOnboarding({ tooltipsDismissed: true })}
        />
      )}
      {/* FR #45: one post-onboarding overlay at a time — Tour first, then the
          briefing once Tour is dismissed (gating relocated from Desktop.tsx:621-637). */}
      {onboardingState.completed && onboardingState.tooltipsDismissed && ov.showLoginBriefing && (
        <LoginBriefing
          onDismiss={(permanent) => {
            if (permanent) writeLoginBriefingDismissed(true);
            ov.setShowLoginBriefing(false);
          }}
          onOpenWorkspace={(wsId) => { selectWorkspace(wsId); navigate(routeFor('chat', { activeWorkspaceId: wsId })); ov.setShowLoginBriefing(false); }}
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

export default AppShell;
