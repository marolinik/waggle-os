import { useState, useEffect } from "react";
import { Wifi, WifiOff, Search, Bell } from "lucide-react";
import waggleLogo from "@/assets/waggle-logo.jpeg";

interface StatusBarProps {
  workspaceName?: string;
  model?: string;
  tokensUsed?: number;
  costUsd?: number;
  offline?: boolean;
  unreadNotifications?: number;
  onSearchClick?: () => void;
  onNotificationClick?: () => void;
}

const StatusBar = ({ workspaceName, model, tokensUsed, costUsd, offline, unreadNotifications = 0, onSearchClick, onNotificationClick }: StatusBarProps) => {
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
        <img src={waggleLogo} alt="Waggle" className="w-4 h-4 rounded-sm" />
        <span className="text-xs font-display font-semibold text-foreground">Waggle AI</span>
        {workspaceName && (
          <>
            <span className="text-muted-foreground text-[11px]">·</span>
            <span className="text-[11px] text-muted-foreground">{workspaceName}</span>
          </>
        )}
        {model && (
          <>
            <span className="text-muted-foreground text-[11px]">·</span>
            <span className="text-[11px] text-primary/80 font-display">{model}</span>
          </>
        )}
        {tokensUsed !== undefined && tokensUsed > 0 && (
          <>
            <span className="text-muted-foreground text-[11px]">·</span>
            <span className="text-[11px] text-muted-foreground">{tokensUsed.toLocaleString()} tok</span>
          </>
        )}
        {costUsd !== undefined && costUsd > 0 && (
          <span className="text-[11px] text-muted-foreground">${costUsd.toFixed(4)}</span>
        )}
      </div>

      <div className="flex items-center gap-4">
        <button onClick={onSearchClick} className="text-muted-foreground hover:text-primary transition-colors" aria-label="Search" title="Search (⌘K)">
          <Search className="w-3.5 h-3.5" />
        </button>
        <button onClick={onNotificationClick} className="relative text-muted-foreground hover:text-primary transition-colors" aria-label="Notifications">
          <Bell className="w-3.5 h-3.5" />
          {unreadNotifications > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] rounded-full bg-destructive text-[9px] leading-none text-destructive-foreground flex items-center justify-center font-bold px-0.5">
              {unreadNotifications > 9 ? '9+' : unreadNotifications}
            </span>
          )}
        </button>
        {offline ? (
          <WifiOff className="w-3.5 h-3.5 text-destructive" />
        ) : (
          <Wifi className="w-3.5 h-3.5 text-emerald-400" />
        )}
        <span className="text-xs text-muted-foreground">{formatDate(time)}</span>
        <span className="text-xs text-foreground font-medium">{formatTime(time)}</span>
      </div>
    </div>
  );
};

export default StatusBar;
