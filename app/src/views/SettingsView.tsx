/**
 * SettingsView — Wrapper around SettingsPanel from @waggle/ui.
 */

import { useState, useEffect } from 'react';
import type { WaggleConfig, TeamConnection } from '@waggle/ui';
import { SettingsPanel } from '@waggle/ui';
import { Skeleton } from '@/components/ui/skeleton';

export interface SettingsViewProps {
  config: WaggleConfig | null;
  onConfigUpdate: (updates: Partial<WaggleConfig>) => void;
  onTestApiKey: (provider: string, key: string) => Promise<{ valid: boolean; error?: string }>;
  teamConnection?: TeamConnection | null;
  onTeamConnect?: (serverUrl: string, token: string) => Promise<void>;
  onTeamDisconnect?: () => Promise<void>;
  /** F5: Controlled active tab for ContextPanel sync */
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  /** Server base URL for API calls (passed through to SettingsPanel) */
  serverUrl?: string;
}

export default function SettingsView({
  config,
  onConfigUpdate,
  onTestApiKey,
  teamConnection,
  onTeamConnect,
  onTeamDisconnect,
  activeTab,
  onTabChange,
  serverUrl,
}: SettingsViewProps) {
  const [timedOut, setTimedOut] = useState(false);

  // After 10 seconds of null config, show error state
  useEffect(() => {
    if (config) {
      setTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setTimedOut(true), 10_000);
    return () => clearTimeout(timer);
  }, [config]);

  if (!config) {
    if (timedOut) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 py-16">
          <div className="text-muted-foreground text-sm">
            Unable to load settings. Check your connection and try again.
          </div>
          <button
            onClick={() => { setTimedOut(false); }}
            className="px-4 py-2 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Retry
          </button>
        </div>
      );
    }
    return (
      <div className="p-6 max-w-[700px] mx-auto">
        <Skeleton className="h-5 w-32 mb-6" />
        <div className="flex gap-2 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-20 rounded-md" />
          ))}
        </div>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-10 w-full rounded-md" />
          <Skeleton className="h-10 w-full rounded-md" />
          <Skeleton className="h-10 w-3/4 rounded-md" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden">
      <SettingsPanel
        config={config}
        onConfigUpdate={onConfigUpdate}
        onTestApiKey={onTestApiKey}
        teamConnection={teamConnection}
        onTeamConnect={onTeamConnect}
        onTeamDisconnect={onTeamDisconnect}
        activeTab={activeTab}
        onTabChange={onTabChange}
        serverUrl={serverUrl}
      />
    </div>
  );
}
