import { motion } from "framer-motion";
import {
  MessageSquare, Terminal, LayoutDashboard, Settings,
  Brain, Activity, Package, Radio,
} from "lucide-react";

export type AppId = "chat" | "dashboard" | "memory" | "events" | "capabilities" | "cockpit" | "mission-control" | "settings" | "terminal" | "calculator" | "notes";

interface DockProps {
  onOpenApp: (id: AppId) => void;
  openApps: AppId[];
}

const apps: { id: AppId; icon: React.ElementType; label: string; color: string }[] = [
  { id: "dashboard", icon: LayoutDashboard, label: "Dashboard", color: "text-sky-400" },
  { id: "chat", icon: MessageSquare, label: "Chat", color: "text-primary" },
  { id: "capabilities", icon: Package, label: "Skills", color: "text-violet-400" },
  { id: "cockpit", icon: Activity, label: "Cockpit", color: "text-emerald-400" },
  { id: "mission-control", icon: Radio, label: "Mission Control", color: "text-rose-400" },
  { id: "memory", icon: Brain, label: "Memory", color: "text-amber-300" },
  { id: "events", icon: Activity, label: "Events", color: "text-cyan-400" },
  { id: "settings", icon: Settings, label: "Settings", color: "text-muted-foreground" },
];

const Dock = ({ onOpenApp, openApps }: DockProps) => {
  return (
    <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-50">
      <div className="glass-strong rounded-2xl px-3 py-2 flex items-center gap-1">
        {apps.map((app) => (
          <motion.button
            key={app.id}
            onClick={() => onOpenApp(app.id)}
            className="relative flex flex-col items-center group p-2 rounded-xl hover:bg-muted/50 transition-colors"
            whileHover={{ scale: 1.2, y: -8 }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
          >
            <app.icon className={`w-6 h-6 ${app.color}`} />
            <span className="absolute -top-7 text-[10px] text-foreground bg-card px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap font-display">
              {app.label}
            </span>
            {openApps.includes(app.id) && (
              <div className="absolute -bottom-0.5 w-1 h-1 rounded-full bg-primary" />
            )}
          </motion.button>
        ))}
      </div>
    </div>
  );
};

export default Dock;
