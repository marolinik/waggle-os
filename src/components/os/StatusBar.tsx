import { useState, useEffect } from "react";
import { Wifi, Battery, Volume2, Search } from "lucide-react";
import waggleLogo from "@/assets/waggle-logo.jpeg";

interface StatusBarProps {
  workspaceName?: string;
  model?: string;
}

const StatusBar = ({ workspaceName, model }: StatusBarProps) => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (d: Date) =>
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const formatDate = (d: Date) =>
    d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });

  return (
    <div className="fixed top-0 left-0 right-0 z-50 h-8 glass-strong flex items-center justify-between px-4 select-none">
      <div className="flex items-center gap-3">
        <img src={waggleLogo} alt="Waggle" className="w-4 h-4" />
        <span className="text-xs font-display font-semibold text-foreground">
          Waggle AI
        </span>
        {workspaceName && (
          <>
            <span className="text-muted-foreground text-[10px]">·</span>
            <span className="text-[10px] text-muted-foreground">{workspaceName}</span>
          </>
        )}
        {model && (
          <>
            <span className="text-muted-foreground text-[10px]">·</span>
            <span className="text-[10px] text-primary/80 font-display">{model}</span>
          </>
        )}
      </div>

      <div className="flex items-center gap-4">
        <Search className="w-3.5 h-3.5 text-muted-foreground hover:text-primary transition-colors cursor-pointer" />
        <Wifi className="w-3.5 h-3.5 text-muted-foreground" />
        <Volume2 className="w-3.5 h-3.5 text-muted-foreground" />
        <Battery className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">{formatDate(time)}</span>
        <span className="text-xs text-foreground font-medium">{formatTime(time)}</span>
      </div>
    </div>
  );
};

export default StatusBar;
