import { useState, useEffect } from "react";
import { WifiOff, Search, Bell } from "lucide-react";
import waggleLogo from "@/assets/waggle-logo.jpeg";

interface StatusBarProps {
  workspaceName?: string;
  model?: string;
  tokensUsed?: number;
  costUsd?: number;
  offline?: boolean;
  unreadNotifications?: number;
  trialDaysRemaining?: number;
  trialExpired?: boolean;
  onSearchClick?: () => void;
  onNotificationClick?: () => void;
}

const StatusBar = ({ workspaceName, model, tokensUsed, costUsd, offline, unreadNotifications = 0, trialDaysRemaining: trialDays, trialExpired, onSearchClick, onNotificationClick }: StatusBarProps) => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (d: Date) =>
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
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
        {trialDays !== undefined && trialDays > 0 && (
          <span className={`text-[10px] font-display font-semibold px-2 py-0.5 rounded-full ${trialDays <= 3 ? 'bg-destructive/20 text-destructive' : 'bg-primary/15 text-primary'}`}>
            Trial: {trialDays}d left
          </span>
        )}
        {trialExpired && (
          <span className="text-[10px] font-display font-semibold px-2 py-0.5 rounded-full bg-destructive/20 text-destructive">
            Trial expired
          </span>
        )}
        <button
          onClick={onSearchClick}
          className="flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-border/40 bg-secondary/40 text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors"
          aria-label="Search"
          title="Search (Ctrl+K)"
        >
          <Search className="w-3 h-3" />
          <span className="text-[10px] font-display">Search</span>
          <kbd className="text-[9px] px-1 py-0.5 rounded bg-muted border border-border/40 font-mono">Ctrl K</kbd>
        </button>
        <button onClick={onNotificationClick} className="relative text-muted-foreground hover:text-primary transition-colors" aria-label="Notifications">
          <Bell className="w-3.5 h-3.5" />
          {unreadNotifications > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] rounded-full bg-destructive text-[9px] leading-none text-destructive-foreground flex items-center justify-center font-bold px-0.5">
              {unreadNotifications > 9 ? '9+' : unreadNotifications}
            </span>
          )}
        </button>
        {offline && (
          <div className="relative group">
            <button className="flex items-center gap-1 text-destructive" title="Backend offline — messages will be queued">
              <WifiOff className="w-3.5 h-3.5" />
              <span className="text-[10px] font-display animate-pulse">Offline</span>
            </button>
            <div className="absolute top-full right-0 mt-2 w-48 p-2.5 rounded-xl glass-strong border border-border/50 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
              <p className="text-[11px] font-display font-semibold text-foreground mb-1">Backend Unreachable</p>
              <p className="text-[10px] text-muted-foreground">Messages will be queued and sent when the connection is restored.</p>
            </div>
          </div>
        )}
        <span className="text-xs text-muted-foreground">{formatDate(time)}</span>
        <span className="text-xs text-foreground font-medium">{formatTime(time)}</span>
      </div>
    </div>
  );
};

export default StatusBar;
