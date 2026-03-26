import { motion } from "framer-motion";
import {
  MessageSquare, Terminal, LayoutDashboard, Settings,
  Brain, Activity, Package, Radio, Rocket, Zap, FolderOpen, Bot,
} from "lucide-react";

export type AppId = "chat" | "dashboard" | "memory" | "events" | "capabilities" | "cockpit" | "mission-control" | "settings" | "terminal" | "calculator" | "notes" | "waggle-dance" | "files" | "agents";

interface DockProps {
  onOpenApp: (id: AppId) => void;
  openApps: AppId[];
  minimizedApps?: AppId[];
  onSpawnAgent?: () => void;
  waggleBadgeCount?: number;
}

const apps: { id: AppId; icon: React.ElementType; label: string; color: string }[] = [
  { id: "dashboard", icon: LayoutDashboard, label: "Dashboard", color: "text-sky-400" },
  { id: "chat", icon: MessageSquare, label: "Chat", color: "text-primary" },
  { id: "agents", icon: Bot, label: "Agents", color: "text-orange-400" },
  { id: "capabilities", icon: Package, label: "Skills", color: "text-violet-400" },
  { id: "cockpit", icon: Activity, label: "Cockpit", color: "text-emerald-400" },
  { id: "mission-control", icon: Radio, label: "Mission Control", color: "text-rose-400" },
  { id: "memory", icon: Brain, label: "Memory", color: "text-amber-300" },
  { id: "events", icon: Activity, label: "Events", color: "text-cyan-400" },
  { id: "waggle-dance", icon: Zap, label: "Waggle Dance", color: "text-amber-400" },
  { id: "files", icon: FolderOpen, label: "Files", color: "text-amber-300" },
  { id: "settings", icon: Settings, label: "Settings", color: "text-muted-foreground" },
];

const Dock = ({ onOpenApp, openApps, minimizedApps = [], onSpawnAgent, waggleBadgeCount = 0 }: DockProps) => {
  return (
    <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-50">
      <div className="glass-strong rounded-2xl px-3 py-2 flex items-center gap-1">
        {apps.map((app) => {
          const isMinimized = minimizedApps.includes(app.id);
          const isOpen = openApps.includes(app.id);

          return (
            <motion.button
              key={app.id}
              onClick={() => onOpenApp(app.id)}
              className="relative flex flex-col items-center group p-2 rounded-xl hover:bg-muted/50 transition-colors"
              whileHover={{ scale: 1.2, y: -8 }}
              whileTap={{ scale: 0.95 }}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
              animate={
                isMinimized
                  ? { y: [0, -12, 0, -6, 0], transition: { duration: 0.5, ease: "easeOut" } }
                  : {}
              }
            >
              <app.icon className={`w-6 h-6 ${app.color}`} />
              {app.id === 'waggle-dance' && waggleBadgeCount > 0 && (
                <span className="absolute -top-1 -right-0.5 min-w-[16px] h-4 flex items-center justify-center text-[9px] font-bold bg-destructive text-destructive-foreground rounded-full px-1">
                  {waggleBadgeCount > 99 ? '99+' : waggleBadgeCount}
                </span>
              )}
              <span className="absolute -top-7 text-[10px] text-foreground bg-card px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap font-display">
                {app.label}
              </span>
              {isOpen && (
                <div className={`absolute -bottom-0.5 w-1 h-1 rounded-full ${isMinimized ? "bg-primary/50" : "bg-primary"}`} />
              )}
            </motion.button>
          );
        })}

        {/* Separator + Spawn shortcut */}
        {onSpawnAgent && (
          <>
            <div className="w-px h-6 bg-border/30 mx-1" />
            <motion.button
              onClick={onSpawnAgent}
              className="relative flex flex-col items-center group p-2 rounded-xl hover:bg-muted/50 transition-colors"
              whileHover={{ scale: 1.2, y: -8 }}
              whileTap={{ scale: 0.95 }}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
            >
              <Rocket className="w-6 h-6 text-primary" />
              <span className="absolute -top-7 text-[10px] text-foreground bg-card px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap font-display">
                Spawn Agent
              </span>
            </motion.button>
          </>
        )}
      </div>
    </div>
  );
};

export default Dock;
