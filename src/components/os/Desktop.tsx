import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { MessageSquare, Terminal, FileText, Calculator } from "lucide-react";
import wallpaper from "@/assets/wallpaper.jpg";
import StatusBar from "./StatusBar";
import Dock, { type AppId } from "./Dock";
import AppWindow from "./AppWindow";
import AIChatApp from "./apps/AIChatApp";
import TerminalApp from "./apps/TerminalApp";
import NotesApp from "./apps/NotesApp";
import CalculatorApp from "./apps/CalculatorApp";

interface WindowState {
  id: AppId;
  zIndex: number;
}

const appConfig: Record<string, { title: string; icon: React.ReactNode; pos: { x: number; y: number }; size: { w: string; h: string } }> = {
  "ai-chat": { title: "Waggle AI", icon: <MessageSquare className="w-3.5 h-3.5 text-primary" />, pos: { x: 200, y: 80 }, size: { w: "420px", h: "480px" } },
  terminal: { title: "Terminal", icon: <Terminal className="w-3.5 h-3.5 text-emerald-400" />, pos: { x: 350, y: 100 }, size: { w: "520px", h: "360px" } },
  notes: { title: "Notes", icon: <FileText className="w-3.5 h-3.5 text-amber-300" />, pos: { x: 150, y: 120 }, size: { w: "500px", h: "380px" } },
  calculator: { title: "Calculator", icon: <Calculator className="w-3.5 h-3.5 text-orange-400" />, pos: { x: 500, y: 100 }, size: { w: "280px", h: "400px" } },
};

const appComponents: Partial<Record<AppId, React.ReactNode>> = {
  "ai-chat": <AIChatApp />,
  terminal: <TerminalApp />,
  notes: <NotesApp />,
  calculator: <CalculatorApp />,
};

const Desktop = () => {
  const [windows, setWindows] = useState<WindowState[]>([]);
  const [topZ, setTopZ] = useState(10);

  const openApp = (id: AppId) => {
    if (!appComponents[id]) return;
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

  return (
    <div className="relative w-screen h-screen overflow-hidden select-none">
      {/* Wallpaper */}
      <img src={wallpaper} alt="" className="absolute inset-0 w-full h-full object-cover" width={1920} height={1080} />
      <div className="absolute inset-0 bg-background/20" />

      <StatusBar />

      {/* Windows */}
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
              {appComponents[win.id]}
            </AppWindow>
          );
        })}
      </AnimatePresence>

      <Dock onOpenApp={openApp} openApps={windows.map((w) => w.id)} />
    </div>
  );
};

export default Desktop;
