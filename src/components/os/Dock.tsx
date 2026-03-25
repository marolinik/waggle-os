import { motion } from "framer-motion";
import {
  MessageSquare,
  Terminal,
  FileText,
  Settings,
  FolderOpen,
  Globe,
  Music,
  Calculator,
} from "lucide-react";

export type AppId = "ai-chat" | "terminal" | "notes" | "settings" | "files" | "browser" | "music" | "calculator";

interface DockProps {
  onOpenApp: (id: AppId) => void;
  openApps: AppId[];
}

const apps: { id: AppId; icon: React.ElementType; label: string; color: string }[] = [
  { id: "ai-chat", icon: MessageSquare, label: "Waggle AI", color: "text-primary" },
  { id: "terminal", icon: Terminal, label: "Terminal", color: "text-emerald-400" },
  { id: "notes", icon: FileText, label: "Notes", color: "text-amber-300" },
  { id: "files", icon: FolderOpen, label: "Files", color: "text-blue-400" },
  { id: "browser", icon: Globe, label: "Browser", color: "text-sky-400" },
  { id: "calculator", icon: Calculator, label: "Calculator", color: "text-orange-400" },
  { id: "music", icon: Music, label: "Music", color: "text-pink-400" },
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
