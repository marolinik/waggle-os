/**
 * UX Refactor v2.1 P1a — ShellContext (conversion plan §5.1).
 *
 * Relocates Desktop.tsx's cross-cutting integrator state (Desktop.tsx:119-230)
 * into a provider so AppShell (StatusBar + nav + overlays) and the route
 * wrappers consume ONE instance of each hook. The SHAPE is Desktop's, moved —
 * no new state is invented here:
 *   - useWorkspaces bundle (Desktop.tsx:119, flattened exactly as Desktop
 *     destructures it, incl. the `refresh` → `refreshWorkspaces` rename)
 *   - UI-complexity tier (Desktop.tsx:129)
 *   - billing tier + trial info + refreshTier (Desktop.tsx:141-158)
 *   - P4 default autonomy (Desktop.tsx:160-167 — consumed by the Stage-B
 *     ChatHost / useChatWidgetState, §4.2)
 *   - useNotifications / useOnboarding / useOfflineStatus / useAgentStatus
 *     (Desktop.tsx:122-125)
 *   - useOverlayState bundle (Desktop.tsx:214 — overlays mount in AppShell,
 *     wrappers trigger them, e.g. HomeCockpit's onCreateWorkspace)
 *   - Context Rail target (Desktop.tsx:226 — rail mounts in AppShell,
 *     surfaces feed it via onContextRail)
 *
 * Surface-local hooks (useMemory / useKnowledgeGraph / useEvents) deliberately
 * do NOT live here — they move into their route wrappers (§5.1 table).
 *
 * Desktop.tsx itself is untouched at this stage; it keeps hosting its own
 * copies until the Stage-C flip mounts AppShell.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { adapter } from '@/lib/adapter';
import {
  shouldAutoOpenTrialModal,
  readOnboardingCompletionSnapshot,
  readTrialModalLastAutoOpenedAt,
  writeTrialModalLastAutoOpenedAt,
} from '@/lib/trial-expired-gate';
import type { BillingTier, UserTier } from '@/lib/dock-tiers';
import type { ContextRailTarget } from '@/components/os/overlays/ContextRail';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { useAgentStatus } from '@/hooks/useAgentStatus';
import { useNotifications } from '@/hooks/useNotifications';
import { useOnboarding } from '@/hooks/useOnboarding';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { useOverlayState } from '@/hooks/useOverlayState';
import { useRevalidateOnError } from '@/hooks/useRevalidateOnError';

type WorkspacesBundle = ReturnType<typeof useWorkspaces>;
type AgentStatusBundle = ReturnType<typeof useAgentStatus>;
type NotificationsBundle = ReturnType<typeof useNotifications>;
type OnboardingBundle = ReturnType<typeof useOnboarding>;
type OverlayBundle = ReturnType<typeof useOverlayState>;

export interface TrialInfo {
  trialDaysRemaining?: number;
  trialExpired?: boolean;
}

export interface ShellContextValue {
  // ── Workspaces (Desktop.tsx:119) ──
  workspaces: WorkspacesBundle['workspaces'];
  activeWorkspace: WorkspacesBundle['activeWorkspace'];
  activeWorkspaceId: WorkspacesBundle['activeWorkspaceId'];
  selectWorkspace: WorkspacesBundle['selectWorkspace'];
  createWorkspace: WorkspacesBundle['createWorkspace'];
  patchWorkspace: WorkspacesBundle['patchWorkspace'];
  /** G3 (UX-Northstar 2026-06-13): existed in useWorkspaces but was never
   *  forwarded by the P1a provider extraction — workspace delete was
   *  unreachable from any UI. */
  deleteWorkspace: WorkspacesBundle['deleteWorkspace'];
  refreshWorkspaces: WorkspacesBundle['refresh'];
  /** P1b D3: load-failure surface — an errored empty list must not render as "no workspaces". */
  workspacesError: WorkspacesBundle['error'];
  // ── Tier (Desktop.tsx:129, 141-158) ──
  currentTier: UserTier;
  billingTier: BillingTier;
  /** P1b D3-4: false until a getTier() round-trip SUCCEEDS. While false,
   *  billingTier's 'FREE' default is a fail-closed capability gate (nav
   *  hiding) — it must never be rendered as the user's actual plan. */
  tierResolved: boolean;
  tierError: string | null;
  trialInfo: TrialInfo;
  refreshTier: () => Promise<void>;
  showTrialExpired: boolean;
  setShowTrialExpired: (open: boolean) => void;
  // ── P4 default autonomy (Desktop.tsx:160-167) ──
  defaultAutonomy: 'normal' | 'trusted' | 'yolo';
  // ── Notifications (Desktop.tsx:123) ──
  notifications: NotificationsBundle['notifications'];
  unreadCount: NotificationsBundle['unreadCount'];
  markRead: NotificationsBundle['markRead'];
  markAllRead: NotificationsBundle['markAllRead'];
  // ── Onboarding (Desktop.tsx:124) ──
  onboardingState: OnboardingBundle['state'];
  updateOnboarding: OnboardingBundle['update'];
  completeOnboarding: OnboardingBundle['complete'];
  // ── Offline / agent status (Desktop.tsx:122, 125) ──
  offline: boolean;
  agentStatus: AgentStatusBundle;
  // ── Overlay open/close state (Desktop.tsx:214) ──
  overlays: OverlayBundle;
  // ── Context Rail (Desktop.tsx:226) ──
  contextRailTarget: ContextRailTarget | null;
  setContextRailTarget: (target: ContextRailTarget | null) => void;
}

const ShellContext = createContext<ShellContextValue | null>(null);

export const useShell = () => {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error('useShell must be used within ShellProvider');
  return ctx;
};

export const ShellProvider = ({ children }: { children: ReactNode }) => {
  const {
    workspaces, activeWorkspace, activeWorkspaceId,
    selectWorkspace, createWorkspace, patchWorkspace, deleteWorkspace, refresh: refreshWorkspaces,
    error: workspacesError,
  } = useWorkspaces();
  const agentStatus = useAgentStatus();
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const { state: onboardingState, update: updateOnboarding, complete: completeOnboarding } = useOnboarding();
  const offline = useOfflineStatus();
  const currentTier: UserTier = onboardingState.tier || 'simple';

  // Trial info from backend (relocated from Desktop.tsx:141-158)
  const [trialInfo, setTrialInfo] = useState<TrialInfo>({});
  const [billingTier, setBillingTier] = useState<BillingTier>('FREE');
  const [tierResolved, setTierResolved] = useState(false);
  const [tierError, setTierError] = useState<string | null>(null);
  const [showTrialExpired, setShowTrialExpired] = useState(false);
  // F1: auto-open the paywall at most once per page-load session. The gate
  // (localStorage-backed 7d snooze + post-onboarding quiet window) plus this
  // ref make refreshTier's mount/focus/online/connect-settled re-runs harmless.
  const trialModalShownThisSessionRef = useRef(false);
  // Extracted so post-action paths (start-trial, post-checkout-redirect)
  // can re-pull tier/trial state without duplicating the fetch+parse logic.
  // P1b D3-4: getTier now THROWS on HTTP failure (adapter chokepoint), so the
  // catch is the single failure path — it must touch NEITHER billingTier NOR
  // trialInfo (a failed refresh used to actively reset a paying user to FREE
  // and wipe the trial countdown). tierResolved flips true on ANY successful
  // round-trip, even an unrecognized tier string — resolution is about the
  // server answering, not the value parsing.
  const refreshTier = useCallback(async () => {
    try {
      const data = await adapter.getTier();
      setTrialInfo({ trialDaysRemaining: data.trialDaysRemaining, trialExpired: data.trialExpired });
      const t = String(data.tier ?? 'FREE').toUpperCase();
      if (t === 'FREE' || t === 'TRIAL' || t === 'PRO' || t === 'TEAMS' || t === 'ENTERPRISE') {
        setBillingTier(t);
      }
      setTierResolved(true);
      setTierError(null);
      // F1: gate the auto-open. Reads flow through localStorage/refs so this
      // []-dep callback never closes over stale onboarding state. Stamp at OPEN
      // time (not dismiss) so a reload while the modal is up can't re-fire it.
      if (data.trialExpired) {
        const ob = readOnboardingCompletionSnapshot();
        if (shouldAutoOpenTrialModal({
          trialExpired: true,
          onboardingCompleted: ob.completed,
          onboardingCompletedAt: ob.completedAt,
          lastAutoOpenedAt: readTrialModalLastAutoOpenedAt(),
          shownThisSession: trialModalShownThisSessionRef.current,
          now: Date.now(),
        })) {
          trialModalShownThisSessionRef.current = true;
          writeTrialModalLastAutoOpenedAt();
          setShowTrialExpired(true);
        }
      }
    } catch (e) {
      setTierError(e instanceof Error ? e.message : 'Tier lookup failed');
    }
  }, []);
  useEffect(() => { refreshTier(); }, [refreshTier]);
  // D3 plus-clause: an errored tier revalidates on focus/visibility/online
  // and on connect-settled (the only signal on an already-focused desktop).
  useRevalidateOnError(tierError !== null, refreshTier);

  // P4: default autonomy inherited by new chat widgets (relocated from
  // Desktop.tsx:160-167). Fetched once on mount; SettingsApp writes via
  // /api/settings/permissions, so a flipped setting takes effect on the next
  // fresh chat widget. Existing widgets keep their own state.
  const [defaultAutonomy, setDefaultAutonomy] = useState<'normal' | 'trusted' | 'yolo'>('normal');
  useEffect(() => {
    adapter.getPermissions().then(p => setDefaultAutonomy(p.defaultAutonomy)).catch(() => {});
  }, []);

  // Overlay state (relocated from Desktop.tsx:214)
  const overlays = useOverlayState();

  // Phase C.1 Context Rail target (relocated from Desktop.tsx:226)
  const [contextRailTarget, setContextRailTarget] = useState<ContextRailTarget | null>(null);

  return (
    <ShellContext.Provider value={{
      workspaces, activeWorkspace, activeWorkspaceId,
      selectWorkspace, createWorkspace, patchWorkspace, deleteWorkspace, refreshWorkspaces, workspacesError,
      currentTier, billingTier, tierResolved, tierError, trialInfo, refreshTier, showTrialExpired, setShowTrialExpired,
      defaultAutonomy,
      notifications, unreadCount, markRead, markAllRead,
      onboardingState, updateOnboarding, completeOnboarding,
      offline, agentStatus,
      overlays,
      contextRailTarget, setContextRailTarget,
    }}>
      {children}
    </ShellContext.Provider>
  );
};
