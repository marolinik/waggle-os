/**
 * StatusBar — bottom status bar showing model, workspace, tokens, cost, mode.
 * Model name is clickable — opens a dropdown to switch models.
 * PM-6: Offline indicator with queued message count.
 */

import { useState, useRef, useEffect, memo } from 'react';
import { formatTokenCount, formatCost } from './utils.js';

/** PM-6: Offline state passed from the app */
export interface OfflineStatus {
  offline: boolean;
  since: string | null;
  queuedMessages: number;
}

export interface StatusBarProps {
  model: string;
  workspace: string;
  tokens: number;
  cost: number;
  mode: 'local' | 'team';
  availableModels?: string[];
  onModelSelect?: (model: string) => void;
  /** PM-6: Current offline state */
  offlineStatus?: OfflineStatus;
}

/** PM-6: Wifi-off SVG icon (inline, no dependency) */
function WifiOffIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="align-middle mr-1"
    >
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
      <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
      <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
      <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <line x1="12" y1="20" x2="12.01" y2="20" />
    </svg>
  );
}

export const StatusBar = memo(function StatusBar({
  model,
  workspace,
  tokens,
  cost,
  mode,
  availableModels,
  onModelSelect,
  offlineStatus,
}: StatusBarProps) {
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showOfflineTooltip, setShowOfflineTooltip] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const offlineRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!showModelPicker && !showOfflineTooltip) return;
    const handler = (e: MouseEvent) => {
      if (showModelPicker && pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowModelPicker(false);
      }
      if (showOfflineTooltip && offlineRef.current && !offlineRef.current.contains(e.target as Node)) {
        setShowOfflineTooltip(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showModelPicker, showOfflineTooltip]);

  const canPickModel = availableModels && availableModels.length > 0 && onModelSelect;
  const isOffline = offlineStatus?.offline === true;

  return (
    <footer
      className="waggle-statusbar flex items-center justify-between h-7 px-3 text-xs font-mono"
      style={{ backgroundColor: 'var(--hive-950)', borderTop: '1px solid var(--hive-700)', color: 'var(--hive-400)', fontSize: '11px' }}
    >
      <div className="flex gap-4 items-center">
        <span>{workspace}</span>
        <span>{mode === 'team' ? 'Team' : 'Local'}</span>

        {/* PM-6: Offline indicator */}
        {isOffline && (
          <div ref={offlineRef} className="relative">
            <button
              className="waggle-offline-indicator inline-flex items-center gap-1 bg-primary text-primary-foreground border-none rounded px-2 py-0.5 text-[11px] font-semibold cursor-pointer animate-[waggle-offline-pulse_2s_ease-in-out_infinite]"
              onClick={() => setShowOfflineTooltip(prev => !prev)}
              title="LLM connection lost"
            >
              <WifiOffIcon />
              Offline
              {offlineStatus.queuedMessages > 0 && (
                <span
                  className="waggle-offline-badge inline-flex items-center justify-center bg-primary-foreground text-primary rounded-full w-4 h-4 text-[10px] font-bold ml-0.5"
                >
                  {offlineStatus.queuedMessages}
                </span>
              )}
            </button>

            {showOfflineTooltip && (
              <div
                className="absolute bottom-7 left-0 min-w-[260px] bg-card border border-border rounded-md shadow-[0_-4px_16px_rgba(0,0,0,0.5)] z-[1000] px-3.5 py-2.5 text-xs text-foreground"
              >
                <div className="font-semibold mb-1.5 text-primary">
                  LLM Connection Lost
                </div>
                <div className="mb-1 text-muted-foreground">
                  Local tools (file ops, git, memory search) still work.
                </div>
                {offlineStatus.queuedMessages > 0 && (
                  <div className="mt-1.5">
                    {offlineStatus.queuedMessages} message{offlineStatus.queuedMessages === 1 ? '' : 's'} queued.
                  </div>
                )}
                {offlineStatus.since && (
                  <div className="mt-1 text-[11px] text-muted-foreground/60">
                    Since {new Date(offlineStatus.since).toLocaleTimeString()}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="flex gap-4 items-center">
        {/* Model picker */}
        <div ref={pickerRef} className="relative">
          <button
            onClick={() => canPickModel && setShowModelPicker(prev => !prev)}
            className={`bg-transparent border-none text-[length:inherit] font-[family-name:inherit] px-0.5 rounded-sm ${
              canPickModel ? 'text-primary cursor-pointer' : 'text-inherit cursor-default'
            }`}
            title={canPickModel ? 'Click to switch model' : model}
          >
            {model}{canPickModel ? ' \u25BE' : ''}
          </button>

          {showModelPicker && availableModels && onModelSelect && (
            <div
              className="absolute bottom-6 right-0 min-w-[220px] max-h-[300px] overflow-y-auto bg-card border border-border rounded-md shadow-[0_-4px_16px_rgba(0,0,0,0.5)] z-[1000] py-1"
            >
              {availableModels.map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    onModelSelect(m);
                    setShowModelPicker(false);
                  }}
                  className={`block w-full text-left px-3 py-1.5 border-none cursor-pointer text-xs font-mono ${
                    m === model
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-transparent text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          )}
        </div>

        <span>{formatTokenCount(tokens)} tokens</span>
        <span>{formatCost(cost)}</span>
      </div>
    </footer>
  );
});
