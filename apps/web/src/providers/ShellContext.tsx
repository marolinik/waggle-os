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
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { adapter } from '@/lib/adapter';
import type { BillingTier, UserTier } from '@/lib/dock-tiers';
import type { ContextRailTarget } from '@/components/os/overlays/ContextRail';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { useAgentStatus } from '@/hooks/useAgentStatus';
import { useNotifications } from '@/hooks/useNotifications';
import { useOnboarding } from '@/hooks/useOnboarding';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { useOverlayState } from '@/hooks/useOverlayState';

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
  refreshWorkspaces: WorkspacesBundle['refresh'];
  // ── Tier (Desktop.tsx:129, 141-158) ──
  currentTier: UserTier;
  billingTier: BillingTier;
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
    selectWorkspace, createWorkspace, patchWorkspace, refresh: refreshWorkspaces,
  } = useWorkspaces();
  const agentStatus = useAgentStatus();
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const { state: onboardingState, update: updateOnboarding, complete: completeOnboarding } = useOnboarding();
  const offline = useOfflineStatus();
  const currentTier: UserTier = onboardingState.tier || 'simple';

  // Trial info from backend (relocated from Desktop.tsx:141-158)
  const [trialInfo, setTrialInfo] = useState<TrialInfo>({});
  const [billingTier, setBillingTier] = useState<BillingTier>('FREE');
  const [showTrialExpired, setShowTrialExpired] = useState(false);
  // Extracted so post-action paths (start-trial, post-checkout-redirect)
  // can re-pull tier/trial state without duplicating the fetch+parse logic.
  const refreshTier = useCallback(async () => {
    try {
      const data = await adapter.getTier();
      setTrialInfo({ trialDaysRemaining: data.trialDaysRemaining, trialExpired: data.trialExpired });
      const t = String(data.tier ?? 'FREE').toUpperCase();
      if (t === 'FREE' || t === 'TRIAL' || t === 'PRO' || t === 'TEAMS' || t === 'ENTERPRISE') {
        setBillingTier(t);
      }
      if (data.trialExpired) setShowTrialExpired(true);
    } catch { /* offline — keep last known state */ }
  }, []);
  useEffect(() => { refreshTier(); }, [refreshTier]);

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
      selectWorkspace, createWorkspace, patchWorkspace, refreshWorkspaces,
      currentTier, billingTier, trialInfo, refreshTier, showTrialExpired, setShowTrialExpired,
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
