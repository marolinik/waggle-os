import { useState, useMemo } from "react";
import { AnimatePresence } from "framer-motion";
import {
  MessageSquare, LayoutDashboard, Settings, Brain,
  Activity, Package, Radio,
} from "lucide-react";
import wallpaper from "@/assets/wallpaper.jpg";
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
import { useWorkspaces } from "@/hooks/useWorkspaces";
import { useChat } from "@/hooks/useChat";
import { useSessions } from "@/hooks/useSessions";
import { useMemory } from "@/hooks/useMemory";
import { useEvents } from "@/hooks/useEvents";

interface WindowState {
  id: AppId;
  zIndex: number;
}

const appConfig: Record<string, { title: string; icon: React.ReactNode; pos: { x: number; y: number }; size: { w: string; h: string } }> = {
  "chat": { title: "Waggle Chat", icon: <MessageSquare className="w-3.5 h-3.5 text-primary" />, pos: { x: 180, y: 40 }, size: { w: "520px", h: "520px" } },
  "dashboard": { title: "Dashboard", icon: <LayoutDashboard className="w-3.5 h-3.5 text-sky-400" />, pos: { x: 100, y: 60 }, size: { w: "560px", h: "440px" } },
  "settings": { title: "Settings", icon: <Settings className="w-3.5 h-3.5 text-muted-foreground" />, pos: { x: 250, y: 80 }, size: { w: "520px", h: "420px" } },
  "memory": { title: "Memory", icon: <Brain className="w-3.5 h-3.5 text-amber-300" />, pos: { x: 120, y: 50 }, size: { w: "600px", h: "440px" } },
  "events": { title: "Events", icon: <Activity className="w-3.5 h-3.5 text-cyan-400" />, pos: { x: 200, y: 70 }, size: { w: "560px", h: "400px" } },
  "cockpit": { title: "Cockpit", icon: <Activity className="w-3.5 h-3.5 text-emerald-400" />, pos: { x: 300, y: 60 }, size: { w: "480px", h: "500px" } },
  "mission-control": { title: "Mission Control", icon: <Radio className="w-3.5 h-3.5 text-rose-400" />, pos: { x: 220, y: 90 }, size: { w: "500px", h: "400px" } },
  "capabilities": { title: "Skills & Apps", icon: <Package className="w-3.5 h-3.5 text-violet-400" />, pos: { x: 150, y: 80 }, size: { w: "520px", h: "460px" } },
};

const Desktop = () => {
  const [windows, setWindows] = useState<WindowState[]>([]);
  const [topZ, setTopZ] = useState(10);

  // Core hooks
  const { workspaces, activeWorkspace, activeWorkspaceId, selectWorkspace, createWorkspace } = useWorkspaces();
  const { sessions, activeSessionId, setActiveSessionId, createSession } = useSessions(activeWorkspaceId);
  const { messages, isLoading, sendMessage, clearHistory, pendingApproval, approveAction } = useChat({
    workspaceId: activeWorkspaceId,
    sessionId: activeSessionId,
  });
  const memory = useMemory(activeWorkspaceId);
  const events = useEvents(activeWorkspaceId);

  const openApp = (id: AppId) => {
    if (windows.find((w) => w.id === id)) {
      focusWindow(id);
      return;
    }
    setTopZ((z) => z + 1);
    setWindows((prev) => [...prev, { id, zIndex: topZ + 1 }]);
  };

  const closeApp = (id: AppId) => {
    setWindows((prev) => prev.filter((w) => w.id !== id));
  };

  const focusWindow = (id: AppId) => {
    setTopZ((z) => z + 1);
    setWindows((prev) => prev.map((w) => (w.id === id ? { ...w, zIndex: topZ + 1 } : w)));
  };

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
          />
        );
      case 'dashboard':
        return (
          <DashboardApp
            workspaces={workspaces}
            activeWorkspaceId={activeWorkspaceId}
            onSelectWorkspace={(id) => {
              selectWorkspace(id);
              openApp('chat');
            }}
            onCreateWorkspace={() => createWorkspace({ name: 'New Workspace', group: 'Personal' })}
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

      <StatusBar
        workspaceName={activeWorkspace?.name}
        model={activeWorkspace?.model}
      />

      <AnimatePresence>
        {windows.map((win) => {
          const config = appConfig[win.id];
          if (!config) return null;
          return (
            <AppWindow
              key={win.id}
              title={config.title}
              icon={config.icon}
              onClose={() => closeApp(win.id)}
              defaultPosition={config.pos}
              defaultSize={config.size}
              zIndex={win.zIndex}
              onFocus={() => focusWindow(win.id)}
            >
              {renderAppContent(win.id)}
            </AppWindow>
          );
        })}
      </AnimatePresence>

      <Dock onOpenApp={openApp} openApps={windows.map((w) => w.id)} />
    </div>
  );
};

export default Desktop;
