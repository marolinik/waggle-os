import { useState, useMemo, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  MessageSquare, LayoutDashboard, Settings, Brain,
  Activity, Package, Radio,
} from "lucide-react";
import wallpaper from "@/assets/wallpaper.jpg";
import waggleLogo from "@/assets/waggle-logo.jpeg";
import StatusBar from "./StatusBar";
import Dock, { type AppId } from "./Dock";
import AppWindow from "./AppWindow";
import ChatApp from "./apps/ChatApp";
import DashboardApp from "./apps/DashboardApp";
import SettingsApp from "./apps/SettingsApp";
import MemoryApp from "./apps/MemoryApp";
import EventsApp from "./apps/EventsApp";
import CockpitApp from "./apps/CockpitApp";
import MissionControlApp from "./apps/MissionControlApp";
import CapabilitiesApp from "./apps/CapabilitiesApp";
import GlobalSearch from "./overlays/GlobalSearch";
import CreateWorkspaceDialog from "./overlays/CreateWorkspaceDialog";
import PersonaSwitcher from "./overlays/PersonaSwitcher";
import WorkspaceSwitcher from "./overlays/WorkspaceSwitcher";
import NotificationInbox from "./overlays/NotificationInbox";
import KeyboardShortcutsHelp from "./overlays/KeyboardShortcutsHelp";
import OnboardingWizard from "./overlays/OnboardingWizard";
import OnboardingTooltips from "./overlays/OnboardingTooltips";
import { adapter } from "@/lib/adapter";
import { useWorkspaces } from "@/hooks/useWorkspaces";
import { useChat } from "@/hooks/useChat";
import { useSessions } from "@/hooks/useSessions";
import { useMemory } from "@/hooks/useMemory";
import { useEvents } from "@/hooks/useEvents";
import { useAgentStatus } from "@/hooks/useAgentStatus";
import { useNotifications } from "@/hooks/useNotifications";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useOnboarding } from "@/hooks/useOnboarding";
import { useOfflineStatus } from "@/hooks/useOfflineStatus";
import { useKnowledgeGraph } from "@/hooks/useKnowledgeGraph";

interface WindowState {
  id: AppId;
  zIndex: number;
  minimized: boolean;
  cascadeOffset: number;
}

const appConfig: Record<string, { title: string; icon: React.ReactNode; pos: { x: number; y: number }; size: { w: string; h: string } }> = {
  "chat": { title: "Waggle Chat", icon: <MessageSquare className="w-3.5 h-3.5 text-primary" />, pos: { x: 180, y: 40 }, size: { w: "520px", h: "520px" } },
  "dashboard": { title: "Dashboard", icon: <LayoutDashboard className="w-3.5 h-3.5 text-sky-400" />, pos: { x: 100, y: 60 }, size: { w: "560px", h: "440px" } },
  "settings": { title: "Settings", icon: <Settings className="w-3.5 h-3.5 text-muted-foreground" />, pos: { x: 250, y: 80 }, size: { w: "560px", h: "460px" } },
  "memory": { title: "Memory", icon: <Brain className="w-3.5 h-3.5 text-amber-300" />, pos: { x: 120, y: 50 }, size: { w: "640px", h: "460px" } },
  "events": { title: "Events", icon: <Activity className="w-3.5 h-3.5 text-cyan-400" />, pos: { x: 200, y: 70 }, size: { w: "580px", h: "420px" } },
  "cockpit": { title: "Menu", icon: <Activity className="w-3.5 h-3.5 text-emerald-400" />, pos: { x: 300, y: 60 }, size: { w: "520px", h: "520px" } },
  "mission-control": { title: "Mission Control", icon: <Radio className="w-3.5 h-3.5 text-rose-400" />, pos: { x: 220, y: 90 }, size: { w: "520px", h: "440px" } },
  "capabilities": { title: "Skills & Apps", icon: <Package className="w-3.5 h-3.5 text-violet-400" />, pos: { x: 150, y: 80 }, size: { w: "560px", h: "480px" } },
};

const Desktop = () => {
  const [windows, setWindows] = useState<WindowState[]>([]);
  const [topZ, setTopZ] = useState(10);
  const cascadeCounter = useRef(0);

  // Overlay states
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [showPersonaSwitcher, setShowPersonaSwitcher] = useState(false);
  const [showWorkspaceSwitcher, setShowWorkspaceSwitcher] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);

  // Core hooks
  const { workspaces, activeWorkspace, activeWorkspaceId, selectWorkspace, createWorkspace } = useWorkspaces();
  const { sessions, activeSessionId, setActiveSessionId, createSession } = useSessions(activeWorkspaceId);
  const { messages, isLoading, sendMessage, clearHistory, pendingApproval, approveAction } = useChat({
    workspaceId: activeWorkspaceId,
    sessionId: activeSessionId,
  });
  const memory = useMemory(activeWorkspaceId);
  const events = useEvents(activeWorkspaceId);
  const agentStatus = useAgentStatus();
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const { state: onboardingState, update: updateOnboarding, complete: completeOnboarding } = useOnboarding();
  const offline = useOfflineStatus();
  const kg = useKnowledgeGraph(activeWorkspaceId);

  const openApp = useCallback((id: AppId) => {
    setWindows(prev => {
      const existing = prev.find(w => w.id === id);
      if (existing) {
        setTopZ(z => z + 1);
        return prev.map(w => w.id === id ? { ...w, zIndex: topZ + 1, minimized: false } : w);
      }
      const offset = cascadeCounter.current;
      cascadeCounter.current = (cascadeCounter.current + 1) % 10;
      setTopZ(z => z + 1);
      return [...prev, { id, zIndex: topZ + 1, minimized: false, cascadeOffset: offset }];
    });
  }, [topZ]);

  const closeApp = useCallback((id: AppId) => {
    setWindows(prev => prev.filter(w => w.id !== id));
  }, []);

  const minimizeApp = useCallback((id: AppId) => {
    setWindows(prev => prev.map(w => w.id === id ? { ...w, minimized: true } : w));
  }, []);

  const focusWindow = useCallback((id: AppId) => {
    setTopZ(z => z + 1);
    setWindows(prev => prev.map(w => w.id === id ? { ...w, zIndex: topZ + 1 } : w));
  }, [topZ]);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onOpenApp: openApp,
    onToggleGlobalSearch: () => setShowGlobalSearch(p => !p),
    onTogglePersonaSwitcher: () => setShowPersonaSwitcher(p => !p),
    onToggleWorkspaceSwitcher: () => setShowWorkspaceSwitcher(p => !p),
    onToggleKeyboardHelp: () => setShowKeyboardHelp(p => !p),
  });

  const handleSearchNavigate = useCallback((type: string, id: string) => {
    if (type === 'command') openApp(id as AppId);
    else if (type === 'workspace') { selectWorkspace(id); openApp('chat'); }
    else if (type === 'memory') openApp('memory');
  }, [openApp, selectWorkspace]);

  const handleOnboardingComplete = useCallback((serverBaseUrl: string) => {
    completeOnboarding();
  }, [completeOnboarding]);

  const handleOnboardingFinish = useCallback((workspaceId: string, _firstMessage: string) => {
    selectWorkspace(workspaceId);
    openApp('dashboard');
  }, [selectWorkspace, openApp]);

  const renderAppContent = (appId: AppId) => {
    switch (appId) {
      case 'chat':
        return (
          <ChatApp
            messages={messages}
            isLoading={isLoading}
            onSendMessage={sendMessage}
            onClearHistory={clearHistory}
            pendingApproval={pendingApproval}
            onApprove={approveAction}
            currentPersona={activeWorkspace?.persona}
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSelectSession={setActiveSessionId}
            onNewSession={createSession}
            workspaceId={activeWorkspaceId}
          />
        );
      case 'dashboard':
        return (
          <DashboardApp
            workspaces={workspaces}
            activeWorkspaceId={activeWorkspaceId}
            onSelectWorkspace={(id) => { selectWorkspace(id); openApp('chat'); }}
            onCreateWorkspace={() => setShowCreateWorkspace(true)}
          />
        );
      case 'settings':
        return <SettingsApp />;
      case 'memory':
        return (
          <MemoryApp
            frames={memory.frames}
            selectedFrame={memory.selectedFrame}
            onSelectFrame={memory.setSelectedFrame}
            searchQuery={memory.filters.searchQuery}
            onSearchChange={(q) => memory.setFilters({ ...memory.filters, searchQuery: q })}
            onDeleteFrame={memory.deleteFrame}
            loading={memory.loading}
            stats={memory.stats}
            typeFilters={memory.filters.types}
            onTypeFiltersChange={(types) => memory.setFilters({ ...memory.filters, types })}
            minImportance={memory.filters.minImportance}
            onMinImportanceChange={(val) => memory.setFilters({ ...memory.filters, minImportance: val })}
            knowledgeGraph={{ nodes: kg.nodes, edges: kg.edges }}
            onRefreshKG={kg.refresh}
          />
        );
      case 'events':
        return (
          <EventsApp
            steps={events.steps}
            autoScroll={events.autoScroll}
            onToggleAutoScroll={events.toggleAutoScroll}
            filter={events.filter}
            onFilterChange={events.setFilter}
          />
        );
      case 'cockpit':
        return <CockpitApp />;
      case 'mission-control':
        return <MissionControlApp />;
      case 'capabilities':
        return <CapabilitiesApp />;
      default:
        return <div className="p-4 text-sm text-muted-foreground">Coming soon...</div>;
    }
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden select-none">
      <img src={wallpaper} alt="" className="absolute inset-0 w-full h-full object-cover" width={1920} height={1080} />
      <div className="absolute inset-0 bg-background/20" />

      {/* Desktop logo hero — naturally blended into the hexagonal wallpaper */}
      {windows.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center pointer-events-none z-[1]" style={{ paddingTop: "3vh" }}>

          {/* Logo — no glow, bigger */}
          <div className="relative w-40 h-40">
            <img
              src={waggleLogo}
              alt="Waggle AI"
              className="w-40 h-40 mix-blend-screen"
              style={{
                borderRadius: 0,
                background: "transparent",
                maskImage: "radial-gradient(circle, rgba(0,0,0,0.8) 30%, rgba(0,0,0,0.3) 60%, transparent 80%)",
                WebkitMaskImage: "radial-gradient(circle, rgba(0,0,0,0.8) 30%, rgba(0,0,0,0.3) 60%, transparent 80%)",
              }}
            />
          </div>

          {/* Title */}
          <motion.h1
            initial={{ opacity: 0, y: 14, letterSpacing: "0.35em" }}
            animate={{ opacity: 1, y: 0, letterSpacing: "0.15em" }}
            transition={{ delay: 0.4, duration: 0.9, ease: "easeOut" }}
            className="mt-4 text-6xl font-display font-bold tracking-widest"
            style={{
              color: "hsl(40, 15%, 92%)",
              textShadow: "0 0 40px hsl(var(--primary) / 0.2), 0 2px 4px hsl(0 0% 0% / 0.8)",
            }}
          >
            Waggle AI
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 0.9, y: 0 }}
            transition={{ delay: 0.7, duration: 0.7 }}
            className="text-sm font-display mt-2 tracking-[0.3em] uppercase"
            style={{
              color: "hsl(38, 50%, 65%)",
              textShadow: "0 1px 4px hsl(0 0% 0% / 0.8)",
            }}
          >
            Autonomous Agent OS
          </motion.p>

          {/* Divider */}
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 0.95, duration: 0.8, ease: "easeOut" }}
            className="w-20 h-px mt-3"
            style={{ background: "linear-gradient(90deg, transparent, hsl(var(--primary) / 0.3), transparent)" }}
          />

        </div>
      )}

      {/* Hint — positioned just above the dock */}
      {windows.length === 0 && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.5, 0.35, 0.5] }}
          transition={{ delay: 1.2, duration: 5, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-20 left-0 right-0 text-center text-sm font-mono tracking-wide pointer-events-none z-[1]"
          style={{
            color: "hsl(30, 8%, 50%)",
            textShadow: "0 1px 3px hsl(0 0% 0% / 0.7)",
          }}
        >
          Click an app in the dock to get started
        </motion.p>
      )}



      <StatusBar
        workspaceName={activeWorkspace?.name}
        model={agentStatus.model !== 'unknown' ? agentStatus.model : activeWorkspace?.model}
        tokensUsed={agentStatus.tokensUsed}
        costUsd={agentStatus.costUsd}
        offline={offline}
        unreadNotifications={unreadCount}
        onSearchClick={() => setShowGlobalSearch(true)}
        onNotificationClick={() => setShowNotifications(p => !p)}
      />

      <AnimatePresence>
        {windows.map((win) => {
          const config = appConfig[win.id];
          if (!config) return null;
          const cascadedPos = {
            x: config.pos.x + win.cascadeOffset * 30,
            y: config.pos.y + win.cascadeOffset * 30,
          };
          return (
            <AppWindow
              key={win.id}
              title={config.title}
              icon={config.icon}
              onClose={() => closeApp(win.id)}
              onMinimize={() => minimizeApp(win.id)}
              isMinimized={win.minimized}
              defaultPosition={cascadedPos}
              defaultSize={config.size}
              zIndex={win.zIndex}
              onFocus={() => focusWindow(win.id)}
            >
              {renderAppContent(win.id)}
            </AppWindow>
          );
        })}
      </AnimatePresence>

      <Dock onOpenApp={openApp} openApps={windows.map(w => w.id)} minimizedApps={windows.filter(w => w.minimized).map(w => w.id)} />

      {/* Overlays */}
      <GlobalSearch open={showGlobalSearch} onClose={() => setShowGlobalSearch(false)} onNavigate={handleSearchNavigate} />
      <CreateWorkspaceDialog open={showCreateWorkspace} onClose={() => setShowCreateWorkspace(false)} onCreate={createWorkspace} />
      <PersonaSwitcher open={showPersonaSwitcher} onClose={() => setShowPersonaSwitcher(false)} currentPersona={activeWorkspace?.persona} onSelect={() => {}} />
      <WorkspaceSwitcher open={showWorkspaceSwitcher} onClose={() => setShowWorkspaceSwitcher(false)} workspaces={workspaces} activeWorkspaceId={activeWorkspaceId} onSelect={(id) => { selectWorkspace(id); openApp('chat'); }} />
      <NotificationInbox open={showNotifications} onClose={() => setShowNotifications(false)} notifications={notifications} onMarkRead={markRead} onMarkAllRead={markAllRead} />
      <KeyboardShortcutsHelp open={showKeyboardHelp} onClose={() => setShowKeyboardHelp(false)} />
      {!onboardingState.completed && (
        <OnboardingWizard
          serverBaseUrl={adapter.getServerUrl()}
          state={onboardingState}
          onUpdate={updateOnboarding}
          onComplete={handleOnboardingComplete}
          onDismiss={completeOnboarding}
          onFinish={handleOnboardingFinish}
        />
      )}
      {onboardingState.completed && <OnboardingTooltips />}
    </div>
  );
};

export default Desktop;
