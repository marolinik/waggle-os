import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { WifiOff, Search, Bell, Brain } from "lucide-react";
import waggleLogoDark from "@/assets/waggle-logo.jpeg";
import waggleLogoLight from "@/assets/waggle-logo.png";
import { useIsLightTheme } from "@/hooks/useIsLightTheme";
import { HintTooltip } from "@/components/ui/hint-tooltip";
import { useDeveloperMode } from "@/hooks/useDeveloperMode";
import { useProviders } from "@/hooks/useProviders";
import { formatModelLabel } from "@/lib/model-label";
import { adapter } from "@/lib/adapter";
import { DATE_LOCALE } from "@/lib/date-locale";

interface StatusBarProps {
  workspaceName?: string;
  /**
   * P39 → P1a: the active surface's breadcrumb label. Derived by AppShell
   * from the matched route's nav title (replaces the old status-bar focus
   * builder, which died with the window manager — conversion plan §3.1).
   */
  focusedWindowLabel?: string | null;
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

const StatusBar = ({ workspaceName, focusedWindowLabel, model, tokensUsed, costUsd, offline, unreadNotifications = 0, trialDaysRemaining: trialDays, trialExpired, onSearchClick, onNotificationClick }: StatusBarProps) => {
  const [time, setTime] = useState(new Date());
  const navigate = useNavigate();
  const isLight = useIsLightTheme();
  const waggleLogo = isLight ? waggleLogoLight : waggleLogoDark;
  // M-20 / UX-5: token + cost are developer-facing signal. Hidden by
  // default; Settings → Advanced → Developer mode flips them on.
  const [developerMode] = useDeveloperMode();
  // W2C: format the raw model id into a friendly display name via the shared
  // formatter (catalog lookup + heuristic). The chip means "model this
  // workspace's chat will use"; the tooltip carries the raw id + where to change it.
  const { providers } = useProviders();
  const modelLabel = formatModelLabel(model, providers);
  // F2 from the 2026-05-28 addictiveness audit — surface accumulated
  // memory count as a visible "trophy" so users see their investment
  // compounding (rubric dim 8). Hidden when the count is zero (a
  // brand-new user is better served by the LoginBriefing demo hook).
  const [memoryFrameCount, setMemoryFrameCount] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      adapter.getMemoryStats()
        .then(stats => {
          if (cancelled) return;
          // adapter.getMemoryStats normalises to { personal, workspace,
          // total } with `frames` on each bucket — same shape that powers
          // the LoginBriefing brag line.
          const n = stats?.total?.frames ?? 0;
          setMemoryFrameCount(n > 0 ? n : null);
        })
        .catch(() => { /* silent — leave count hidden */ });
    };
    load();
    // Refresh every 60s so the trophy ticks up during active use.
    const id = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (d: Date) =>
    d.toLocaleTimeString(DATE_LOCALE, { hour: "2-digit", minute: "2-digit", hour12: false });
  const formatDate = (d: Date) =>
    d.toLocaleDateString(DATE_LOCALE, { weekday: "short", month: "short", day: "numeric" });

  return (
    <div className="fixed top-0 left-0 right-0 z-50 h-8 glass-strong flex items-center justify-between px-4 select-none">
      <div className="flex items-center gap-3 min-w-0">
        <img src={waggleLogo} alt="Waggle" className="w-4 h-4 rounded-sm shrink-0" />
        <span className="text-xs font-display font-semibold text-foreground whitespace-nowrap shrink-0">Waggle AI</span>
        {/* L-02: hide workspace + model below md (~768px) so the logo
            + "Waggle AI" stay visible on narrow windows. */}
        {workspaceName && (
          <>
            <span className="text-muted-foreground text-[11px] hidden lg:inline">·</span>
            <span className="text-[11px] text-muted-foreground hidden lg:inline">{workspaceName}</span>
          </>
        )}
        {focusedWindowLabel && (
          <>
            <span className="text-muted-foreground text-[11px] hidden lg:inline">·</span>
            <HintTooltip content={focusedWindowLabel}>
              <span
                className="text-[11px] text-foreground/80 font-display hidden lg:inline truncate max-w-[240px]"
                data-testid="statusbar-focused-window"
                tabIndex={0}
              >
                {focusedWindowLabel}
              </span>
            </HintTooltip>
          </>
        )}
        {model && (
          <>
            <span className="text-muted-foreground text-[11px] hidden lg:inline">·</span>
            {/* I1 fix 3: "Default:" prefix — an open chat can run a different
                model (shown in its own header), so this chip and the thread
                chip must read as two different things, not a contradiction. */}
            <HintTooltip content={`${modelLabel} (${model}) — default model for new chats in this workspace. An open chat may use its own model (shown in the chat header); the global default lives in Settings → Models.`}>
              <span
                className="text-[11px] text-honey/80 font-display hidden lg:inline cursor-help"
                data-testid="statusbar-model"
                tabIndex={0}
              >
                Default: {modelLabel}
              </span>
            </HintTooltip>
          </>
        )}
        {memoryFrameCount !== null && (
          <>
            <span className="text-muted-foreground text-[11px] hidden lg:inline">·</span>
            <HintTooltip content={`${memoryFrameCount.toLocaleString()} memory frames across all minds (personal + every workspace). This grows every time you chat — it's why Waggle gets better the more you use it.`}>
              <span
                className="text-[11px] text-honey/80 font-display hidden lg:inline-flex items-center gap-1 cursor-help"
                data-testid="statusbar-memory-count"
                aria-label={`${memoryFrameCount.toLocaleString()} memory frames across all minds`}
              >
                <Brain className="w-3 h-3" aria-hidden="true" />
                {memoryFrameCount.toLocaleString()}
              </span>
            </HintTooltip>
          </>
        )}
        {developerMode && tokensUsed !== undefined && tokensUsed > 0 && (
          <>
            <span className="text-muted-foreground text-[11px]">·</span>
            <span className="text-[11px] text-muted-foreground" data-testid="statusbar-tokens">{tokensUsed.toLocaleString()} tok</span>
          </>
        )}
        {developerMode && costUsd !== undefined && costUsd > 0 && (
          <span className="text-[11px] text-muted-foreground" data-testid="statusbar-cost">${costUsd.toFixed(4)}</span>
        )}
      </div>

      <div className="flex items-center gap-2 lg:gap-4 shrink-0">
        {trialDays !== undefined && trialDays > 0 && (
          <span className={`text-[10px] font-display font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${trialDays <= 3 ? 'bg-destructive/20 text-destructive' : 'bg-primary/15 text-honey'}`}>
            Trial: {trialDays}d left
          </span>
        )}
        {trialExpired && (
          <button
            type="button"
            onClick={() => navigate('/settings?tab=billing')}
            className="text-[10px] font-display font-semibold px-2 py-0.5 rounded-full bg-primary/15 text-honey whitespace-nowrap transition-colors hover:bg-primary/25"
            title="Your trial ended — you're on the free Solo plan. See plans."
          >
            Trial ended · Solo
          </button>
        )}
        <HintTooltip content="Search (Ctrl+K)">
          <button
            onClick={onSearchClick}
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-border/40 bg-secondary/40 text-muted-foreground hover:text-honey hover:border-primary/40 transition-colors"
            aria-label="Search"
          >
            <Search className="w-3 h-3" />
            <span className="text-[10px] font-display">Search</span>
            <kbd className="text-[9px] px-1 py-0.5 rounded bg-muted border border-border/40 font-mono">Ctrl K</kbd>
          </button>
        </HintTooltip>
        <button onClick={onNotificationClick} className="relative text-muted-foreground hover:text-honey transition-colors" aria-label="Notifications">
          <Bell className="w-3.5 h-3.5" />
          {/* Round-5: warm-family badge (alarm-red clashed with the palette) +
              a background ring so it reads as sitting OVER the bell, never
              colliding with the glyph or the clock to its right. */}
          {unreadNotifications > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 rounded-full bg-[var(--honey)] text-[9px] leading-none text-[#1a1407] ring-2 ring-background flex items-center justify-center font-bold px-1 whitespace-nowrap">
              {unreadNotifications > 9 ? '9+' : unreadNotifications}
            </span>
          )}
        </button>
        {offline && (
          <div className="relative group">
            <button className="flex items-center gap-1 text-destructive" aria-label="Backend offline — messages will be queued">
              <WifiOff className="w-3.5 h-3.5" />
              <span className="text-[10px] font-display animate-pulse">Offline</span>
            </button>
            <div className="absolute top-full right-0 mt-2 w-48 p-2.5 rounded-xl glass-strong border border-border/50 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
              <p className="text-[11px] font-display font-semibold text-foreground mb-1">Backend Unreachable</p>
              <p className="text-[10px] text-muted-foreground">Messages will be queued and sent when the connection is restored.</p>
            </div>
          </div>
        )}
        <span className="text-xs text-muted-foreground hidden lg:inline">{formatDate(time)}</span>
        <span className="text-xs text-foreground font-medium">{formatTime(time)}</span>
      </div>
    </div>
  );
};

export default StatusBar;
