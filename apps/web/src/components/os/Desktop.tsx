import { useCallback, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  MessageSquare, LayoutDashboard, Settings, Brain,
  Activity, Package, Radio, Zap, FolderOpen, Bot, Lock, UserCircle, Plug,
  Clock, Store, Mic, Users, Shield,
} from "lucide-react";
import type { UserTier } from "@/lib/dock-tiers";
import type { AppId } from "@/lib/dock-tiers";
import wallpaper from "@/assets/wallpaper.jpg";
import waggleLogo from "@/assets/waggle-logo.jpeg";
import StatusBar from "./StatusBar";
import Dock from "./Dock";
import AppWindow from "./AppWindow";
import AppErrorBoundary from "./ErrorBoundary";
import ChatWindowInstance from "./apps/ChatWindowInstance";
import DashboardApp from "./apps/DashboardApp";
import SettingsApp from "./apps/SettingsApp";
import VaultApp from "./apps/VaultApp";
import UserProfileApp from "./apps/UserProfileApp";
import ConnectorsApp from "./apps/ConnectorsApp";
import MemoryApp from "./apps/MemoryApp";
import EventsApp from "./apps/EventsApp";
import CockpitApp from "./apps/CockpitApp";
import MissionControlApp from "./apps/MissionControlApp";
import CapabilitiesApp from "./apps/CapabilitiesApp";
import WaggleDanceApp from "./apps/WaggleDanceApp";
import AgentsApp from "./apps/AgentsApp";
import FilesApp from "./apps/FilesApp";
import ScheduledJobsApp from "./apps/ScheduledJobsApp";
import MarketplaceApp from "./apps/MarketplaceApp";
import VoiceApp from "./apps/VoiceApp";
import RoomApp from "./apps/RoomApp";
import ApprovalsApp from "./apps/ApprovalsApp";
import GlobalSearch from "./overlays/GlobalSearch";
import CreateWorkspaceDialog from "./overlays/CreateWorkspaceDialog";
import PersonaSwitcher from "./overlays/PersonaSwitcher";
import SpawnAgentDialog from "./overlays/SpawnAgentDialog";
import WorkspaceSwitcher from "./overlays/WorkspaceSwitcher";
import NotificationInbox from "./overlays/NotificationInbox";
import KeyboardShortcutsHelp from "./overlays/KeyboardShortcutsHelp";
import OnboardingWizard from "./overlays/OnboardingWizard";
import OnboardingTooltips from "./overlays/OnboardingTooltips";
import LoginBriefing from "./overlays/LoginBriefing";
import { adapter } from "@/lib/adapter";
import { getSavedPosition } from "@/lib/window-positions";
import { useWorkspaces } from "@/hooks/useWorkspaces";
import { useMemory } from "@/hooks/useMemory";
import { useEvents } from "@/hooks/useEvents";
import { useAgentStatus } from "@/hooks/useAgentStatus";
import { useNotifications } from "@/hooks/useNotifications";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useOnboarding } from "@/hooks/useOnboarding";
import { useOfflineStatus } from "@/hooks/useOfflineStatus";
import { useKnowledgeGraph } from "@/hooks/useKnowledgeGraph";
import { useWaggleDance } from "@/hooks/useWaggleDance";
import { useWindowManager, type WindowState } from "@/hooks/useWindowManager";
import { useOverlayState } from "@/hooks/useOverlayState";

/* ── App config: position, size, title, icon per AppId ── */
const appConfig: Record<string, { title: string; icon: React.ReactNode; pos: { x: number; y: number }; size: { w: string; h: string } }> = {
  "chat": { title: "Waggle Chat", icon: <MessageSquare className="w-3.5 h-3.5 text-primary" />, pos: { x: 180, y: 40 }, size: { w: "520px", h: "520px" } },
  "dashboard": { title: "Dashboard", icon: <LayoutDashboard className="w-3.5 h-3.5 text-sky-400" />, pos: { x: 100, y: 60 }, size: { w: "560px", h: "440px" } },
  "settings": { title: "Settings", icon: <Settings className="w-3.5 h-3.5 text-muted-foreground" />, pos: { x: 250, y: 80 }, size: { w: "560px", h: "460px" } },
  "memory": { title: "Memory", icon: <Brain className="w-3.5 h-3.5 text-amber-300" />, pos: { x: 120, y: 50 }, size: { w: "640px", h: "460px" } },
  "events": { title: "Events", icon: <Activity className="w-3.5 h-3.5 text-cyan-400" />, pos: { x: 200, y: 70 }, size: { w: "580px", h: "420px" } },
  "cockpit": { title: "Cockpit", icon: <Activity className="w-3.5 h-3.5 text-emerald-400" />, pos: { x: 300, y: 60 }, size: { w: "520px", h: "520px" } },
  "mission-control": { title: "Mission Control", icon: <Radio className="w-3.5 h-3.5 text-rose-400" />, pos: { x: 220, y: 90 }, size: { w: "520px", h: "440px" } },
  "capabilities": { title: "Skills & Apps", icon: <Package className="w-3.5 h-3.5 text-violet-400" />, pos: { x: 150, y: 80 }, size: { w: "560px", h: "480px" } },
  "waggle-dance": { title: "Waggle Dance", icon: <Zap className="w-3.5 h-3.5 text-amber-400" />, pos: { x: 160, y: 50 }, size: { w: "580px", h: "460px" } },
  "files": { title: "Files", icon: <FolderOpen className="w-3.5 h-3.5 text-amber-300" />, pos: { x: 140, y: 55 }, size: { w: "620px", h: "440px" } },
  "agents": { title: "Agents", icon: <Bot className="w-3.5 h-3.5 text-orange-400" />, pos: { x: 170, y: 65 }, size: { w: "640px", h: "480px" } },
  "vault": { title: "Vault", icon: <Lock className="w-3.5 h-3.5 text-amber-400" />, pos: { x: 240, y: 70 }, size: { w: "560px", h: "480px" } },
  "profile": { title: "My Profile", icon: <UserCircle className="w-3.5 h-3.5 text-sky-400" />, pos: { x: 200, y: 60 }, size: { w: "560px", h: "520px" } },
  "connectors": { title: "Connectors", icon: <Plug className="w-3.5 h-3.5 text-emerald-400" />, pos: { x: 220, y: 80 }, size: { w: "580px", h: "500px" } },
  "scheduled-jobs": { title: "Scheduled Jobs", icon: <Clock className="w-3.5 h-3.5 text-amber-400" />, pos: { x: 200, y: 70 }, size: { w: "600px", h: "460px" } },
  "marketplace": { title: "Marketplace", icon: <Store className="w-3.5 h-3.5 text-orange-400" />, pos: { x: 250, y: 80 }, size: { w: "640px", h: "500px" } },
  "voice": { title: "Voice", icon: <Mic className="w-3.5 h-3.5 text-rose-400" />, pos: { x: 300, y: 90 }, size: { w: "480px", h: "400px" } },
  "room": { title: "Room", icon: <Users className="w-3.5 h-3.5 text-violet-400" />, pos: { x: 260, y: 75 }, size: { w: "640px", h: "520px" } },
  "approvals": { title: "Approvals", icon: <Shield className="w-3.5 h-3.5 text-amber-400" />, pos: { x: 280, y: 85 }, size: { w: "520px", h: "560px" } },
};

const Desktop = () => {
  // Domain hooks
  const { workspaces, activeWorkspace, activeWorkspaceId, selectWorkspace, createWorkspace, patchWorkspace } = useWorkspaces();
  const memory = useMemory(activeWorkspaceId);
  const events = useEvents(activeWorkspaceId);
  const agentStatus = useAgentStatus();
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const { state: onboardingState, update: updateOnboarding, complete: completeOnboarding } = useOnboarding();
  const offline = useOfflineStatus();
  const kg = useKnowledgeGraph(activeWorkspaceId);
  const { allSignals: waggleSignals } = useWaggleDance();
  const waggleUnacknowledged = waggleSignals.filter(s => !s.acknowledged).length;
  const currentTier: UserTier = onboardingState.tier || 'simple';

  // Window management (extracted hook)
  const wm = useWindowManager(workspaces);

  // Phase B.1: the Files app has its own "active" workspace separate from
  // the global activeWorkspace, so browsing another workspace's files
  // doesn't disrupt the active chat. Null falls back to activeWorkspaceId.
  const [filesViewWorkspaceId, setFilesViewWorkspaceId] = useState<string | null>(null);

  // Overlay state (extracted hook)
  const ov = useOverlayState();

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onOpenApp: wm.openApp,
    onToggleGlobalSearch: ov.toggleGlobalSearch,
    onTogglePersonaSwitcher: ov.togglePersonaSwitcher,
    onToggleWorkspaceSwitcher: ov.toggleWorkspaceSwitcher,
    onToggleKeyboardHelp: ov.toggleKeyboardHelp,
    onCloseTopWindow: wm.closeTopWindow,
    onMinimizeTopWindow: wm.minimizeTopWindow,
  });

  // Navigation handlers
  const handleSearchNavigate = useCallback((type: string, id: string) => {
    if (type === 'command') wm.openApp(id as AppId);
    else if (type === 'workspace') {
      selectWorkspace(id);
      const ws = workspaces.find(w => w.id === id);
      wm.openChatForWorkspace(id, ws?.name);
    }
    else if (type === 'memory') wm.openApp('memory');
  }, [wm.openApp, selectWorkspace, wm.openChatForWorkspace, workspaces]);

  const handleOnboardingComplete = useCallback((_serverBaseUrl: string) => { completeOnboarding(); }, [completeOnboarding]);
  const handleOnboardingFinish = useCallback((workspaceId: string) => {
    selectWorkspace(workspaceId);
    const ws = workspaces.find(w => w.id === workspaceId);
    wm.openChatForWorkspace(workspaceId, ws?.name);
  }, [selectWorkspace, workspaces, wm.openChatForWorkspace]);

  // Render app content inside windows
  const renderAppContent = (win: WindowState) => {
    switch (win.appId) {
      case 'chat': {
        const wsId = win.workspaceId || activeWorkspaceId || 'local-default';
        const ws = workspaces.find(w => w.id === wsId);
        return (
          <ChatWindowInstance
            workspaceId={wsId}
            workspaceName={win.workspaceName}
            templateId={ws?.templateId}
            initialPersona={win.personaId}
            onPersonaChange={(personaId) => wm.setWindowPersona(win.instanceId, personaId)}
          />
        );
      }
      case 'dashboard':
        return (
          <DashboardApp workspaces={workspaces} activeWorkspaceId={activeWorkspaceId}
            onSelectWorkspace={(id) => { selectWorkspace(id); const ws = workspaces.find(w => w.id === id); wm.openChatForWorkspace(id, ws?.name); }}
            onCreateWorkspace={() => ov.setShowCreateWorkspace(true)} />
        );
      case 'settings': return <SettingsApp />;
      case 'vault': return <VaultApp />;
      case 'profile': return <UserProfileApp />;
      case 'connectors': return <ConnectorsApp />;
      case 'memory':
        return (
          <MemoryApp frames={memory.frames} selectedFrame={memory.selectedFrame} onSelectFrame={memory.setSelectedFrame}
            searchQuery={memory.filters.searchQuery} onSearchChange={(q) => memory.setFilters({ ...memory.filters, searchQuery: q })}
            onDeleteFrame={memory.deleteFrame} loading={memory.loading} stats={memory.stats}
            typeFilters={memory.filters.types} onTypeFiltersChange={(types) => memory.setFilters({ ...memory.filters, types })}
            minImportance={memory.filters.minImportance} onMinImportanceChange={(val) => memory.setFilters({ ...memory.filters, minImportance: val })}
            knowledgeGraph={{ nodes: kg.nodes, edges: kg.edges }} onRefreshKG={kg.refresh} />
        );
      case 'events':
        return (
          <EventsApp steps={events.steps} autoScroll={events.autoScroll} onToggleAutoScroll={events.toggleAutoScroll}
            filter={events.filter} onFilterChange={events.setFilter}
            onAbort={() => { if (activeWorkspaceId) adapter.abortAgent(activeWorkspaceId).catch(() => {}); }} />
        );
      case 'cockpit': return <CockpitApp />;
      case 'mission-control': return <MissionControlApp onSpawnOpen={() => ov.setShowSpawnAgent(true)} />;
      case 'capabilities': return <CapabilitiesApp />;
      case 'waggle-dance': return <WaggleDanceApp />;
      case 'agents': return <AgentsApp />;
      case 'files': {
        // Phase B.1: prefer the files-view's locally-chosen workspace,
        // falling back to the global active one on first open.
        const wsId = filesViewWorkspaceId ?? activeWorkspaceId ?? 'local-default';
        const ws = workspaces.find(w => w.id === wsId);
        return (
          <FilesApp
            workspaceId={wsId}
            workspaceName={ws?.name}
            storageType={ws?.storageType}
            workspaces={workspaces}
            onSelectWorkspace={setFilesViewWorkspaceId}
          />
        );
      }
      case 'scheduled-jobs': return <ScheduledJobsApp />;
      case 'marketplace': return <MarketplaceApp />;
      case 'voice': return <VoiceApp />;
      case 'room': {
        // Phase A.3: build a workspace name lookup for the Room tiles.
        const wsNames: Record<string, string> = {};
        for (const w of workspaces) wsNames[w.id] = w.name;
        return <RoomApp workspaceNames={wsNames} />;
      }
      case 'approvals': return <ApprovalsApp />;
      default: return <div className="p-4 text-sm text-muted-foreground">Coming soon...</div>;
    }
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden select-none">
      <img src={wallpaper} alt="" className="absolute inset-0 w-full h-full object-cover" width={1920} height={1080} />
      <div className="absolute inset-0 bg-background/20" />

      {/* Desktop logo hero */}
      {wm.windows.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center pointer-events-none z-[1]" style={{ paddingTop: "3vh" }}>
          <div className="relative w-40 h-40">
            <img src={waggleLogo} alt="Waggle AI" className="w-40 h-40 mix-blend-screen"
              style={{ borderRadius: 0, background: "transparent",
                maskImage: "radial-gradient(circle, rgba(0,0,0,0.8) 30%, rgba(0,0,0,0.3) 60%, transparent 80%)",
                WebkitMaskImage: "radial-gradient(circle, rgba(0,0,0,0.8) 30%, rgba(0,0,0,0.3) 60%, transparent 80%)" }} />
          </div>
          <motion.h1 initial={{ opacity: 0, y: 14, letterSpacing: "0.35em" }} animate={{ opacity: 1, y: 0, letterSpacing: "0.15em" }}
            transition={{ delay: 0.4, duration: 0.9, ease: "easeOut" }} className="mt-4 text-6xl font-display font-bold tracking-widest"
            style={{ color: "hsl(40, 15%, 92%)", textShadow: "0 0 40px hsl(var(--primary) / 0.2), 0 2px 4px hsl(0 0% 0% / 0.8)" }}>
            Waggle AI
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 0.9, y: 0 }} transition={{ delay: 0.7, duration: 0.7 }}
            className="text-sm font-display mt-2 tracking-[0.3em] uppercase"
            style={{ color: "hsl(38, 50%, 65%)", textShadow: "0 1px 4px hsl(0 0% 0% / 0.8)" }}>
            Autonomous Agent OS
          </motion.p>
          <motion.div initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.95, duration: 0.8, ease: "easeOut" }}
            className="w-20 h-px mt-3" style={{ background: "linear-gradient(90deg, transparent, hsl(var(--primary) / 0.3), transparent)" }} />
          {offline && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.5 }} className="mt-6 px-4 py-2 rounded-xl glass-strong">
              <p className="text-xs text-muted-foreground">
                <span className="inline-block w-2 h-2 rounded-full bg-amber-400 mr-2" />Running in offline mode — connect a backend server in Settings
              </p>
            </motion.div>
          )}
        </div>
      )}

      {wm.windows.length === 0 && (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: [0, 0.5, 0.35, 0.5] }}
          transition={{ delay: 1.2, duration: 5, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-20 left-0 right-0 text-center text-sm font-mono tracking-wide pointer-events-none z-[1]"
          style={{ color: "hsl(30, 8%, 50%)", textShadow: "0 1px 3px hsl(0 0% 0% / 0.7)" }}>
          Click an app in the dock · Ctrl+` to switch windows
        </motion.p>
      )}

      <StatusBar workspaceName={activeWorkspace?.name}
        model={agentStatus.model !== 'unknown' ? agentStatus.model : activeWorkspace?.model}
        tokensUsed={agentStatus.tokensUsed} costUsd={agentStatus.costUsd} offline={offline}
        unreadNotifications={unreadCount}
        onSearchClick={() => ov.setShowGlobalSearch(true)} onNotificationClick={ov.toggleNotifications} />

      <AnimatePresence>
        {wm.windows.map((win) => {
          const config = appConfig[win.appId];
          if (!config) return null;
          const saved = win.appId !== 'chat' ? getSavedPosition(win.appId) : null;
          const pos = saved ? { x: saved.x, y: saved.y } : { x: config.pos.x + win.cascadeOffset * 30, y: config.pos.y + win.cascadeOffset * 30 };
          const size = saved ? { w: `${saved.width}px`, h: `${saved.height}px` } : config.size;
          return (
            <AppWindow key={win.instanceId} appId={win.appId} title={wm.getWindowTitle(win, config.title)} icon={config.icon}
              onClose={() => wm.closeApp(win.instanceId)} onMinimize={() => wm.minimizeApp(win.instanceId)}
              isMinimized={win.minimized} isFocused={win.instanceId === wm.focusedInstanceId}
              defaultPosition={pos} defaultSize={size} zIndex={win.zIndex} onFocus={() => wm.focusWindow(win.instanceId)}>
              <AppErrorBoundary appName={config.title} onClose={() => wm.closeApp(win.instanceId)}>
                {renderAppContent(win)}
              </AppErrorBoundary>
            </AppWindow>
          );
        })}
      </AnimatePresence>

      <Dock tier={currentTier}
        onOpenApp={(id) => id === 'chat' ? wm.openChatForWorkspace(activeWorkspaceId || 'local-default', activeWorkspace?.name) : wm.openApp(id)}
        openApps={wm.openAppIds} minimizedApps={wm.minimizedAppIds}
        onSpawnAgent={() => ov.setShowSpawnAgent(true)} waggleBadgeCount={waggleUnacknowledged} />

      {/* Overlays */}
      <GlobalSearch open={ov.showGlobalSearch} onClose={() => ov.setShowGlobalSearch(false)} onNavigate={handleSearchNavigate} />
      <CreateWorkspaceDialog open={ov.showCreateWorkspace} onClose={() => ov.setShowCreateWorkspace(false)} onCreate={createWorkspace} />
      {(() => {
        // Phase A.2: PersonaSwitcher operates on the focused chat window's
        // persona when one is focused; otherwise falls back to patching
        // the workspace as before. This lets two chat windows on the same
        // workspace have independent personas.
        const focusedWin = wm.windows.find(w => w.instanceId === wm.focusedInstanceId);
        const focusedChatWin = focusedWin?.appId === 'chat' ? focusedWin : undefined;
        const currentPersonaForSwitcher = focusedChatWin?.personaId ?? activeWorkspace?.persona;
        return (
          <PersonaSwitcher open={ov.showPersonaSwitcher} onClose={() => ov.setShowPersonaSwitcher(false)}
            currentPersona={currentPersonaForSwitcher} currentGroupId={activeWorkspace?.agentGroupId}
            onSelect={(personaId) => {
              if (focusedChatWin) {
                wm.setWindowPersona(focusedChatWin.instanceId, personaId);
              } else if (activeWorkspaceId) {
                patchWorkspace(activeWorkspaceId, { persona: personaId, agentGroupId: undefined });
              }
            }}
            onSelectGroup={(groupId) => { if (activeWorkspaceId) patchWorkspace(activeWorkspaceId, { agentGroupId: groupId, persona: undefined }); }} />
        );
      })()}
      <WorkspaceSwitcher open={ov.showWorkspaceSwitcher} onClose={() => ov.setShowWorkspaceSwitcher(false)}
        workspaces={workspaces} activeWorkspaceId={activeWorkspaceId}
        onSelect={(id) => { selectWorkspace(id); const ws = workspaces.find(w => w.id === id); wm.openChatForWorkspace(id, ws?.name); }} />
      <NotificationInbox open={ov.showNotifications} onClose={() => ov.setShowNotifications(false)} notifications={notifications} onMarkRead={markRead} onMarkAllRead={markAllRead} />
      <KeyboardShortcutsHelp open={ov.showKeyboardHelp} onClose={() => ov.setShowKeyboardHelp(false)} />
      <SpawnAgentDialog open={ov.showSpawnAgent} onClose={() => ov.setShowSpawnAgent(false)}
        workspaces={workspaces} activeWorkspaceId={activeWorkspaceId} onWorkspaceCreated={(ws) => selectWorkspace(ws.id)} />
      {!onboardingState.completed && (
        <OnboardingWizard serverBaseUrl={adapter.getServerUrl()} state={onboardingState} onUpdate={updateOnboarding}
          onComplete={handleOnboardingComplete} onDismiss={completeOnboarding} onFinish={handleOnboardingFinish} />
      )}
      {onboardingState.completed && !onboardingState.tooltipsDismissed && (
        <OnboardingTooltips
          templateId={onboardingState.templateId}
          onDismiss={() => updateOnboarding({ tooltipsDismissed: true })}
        />
      )}
      {onboardingState.completed && ov.showLoginBriefing && (
        <LoginBriefing onDismiss={() => ov.setShowLoginBriefing(false)}
          onOpenWorkspace={(wsId) => { selectWorkspace(wsId); wm.openChatForWorkspace(wsId); ov.setShowLoginBriefing(false); }} />
      )}
    </div>
  );
};

export default Desktop;
