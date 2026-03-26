/**
 * SettingsPanel -- tabbed settings container component.
 *
 * Renders a tabbed interface with General, Models & Providers, Vault & Credentials,
 * Permissions, Team, and Advanced tabs.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { WaggleConfig, TeamConnection } from '../../services/types.js';
import { SETTINGS_TABS } from './utils.js';
import { ModelsSection } from './ModelsSection.js';
import { PermissionSection } from './PermissionSection.js';
import { ThemeSection } from './ThemeSection.js';
import { AdvancedSection } from './AdvancedSection.js';
import { TeamSection } from './TeamSection.js';
import { VaultSection } from './VaultSection.js';
import { BackupSection } from './BackupSection.js';
import { KvarkSection } from './KvarkSection.js';

export interface SettingsPanelProps {
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  config: WaggleConfig;
  onConfigUpdate: (config: Partial<WaggleConfig>) => void;
  onTestApiKey?: (provider: string, key: string) => Promise<{ valid: boolean; error?: string }>;
  teamConnection?: TeamConnection | null;
  onTeamConnect?: (serverUrl: string, token: string) => Promise<void>;
  onTeamDisconnect?: () => Promise<void>;
  /** Server base URL for API calls. Defaults to http://127.0.0.1:3333 */
  serverUrl?: string;
}

interface PermissionsData {
  yoloMode: boolean;
  externalGates: string[];
  workspaceOverrides: Record<string, string[]>;
}

export function SettingsPanel({
  activeTab: controlledTab,
  onTabChange,
  config,
  onConfigUpdate,
  onTestApiKey,
  teamConnection,
  onTeamConnect,
  onTeamDisconnect,
  serverUrl: serverUrlProp,
}: SettingsPanelProps) {
  const baseUrl = serverUrlProp ?? 'http://127.0.0.1:3333';
  const [internalTab, setInternalTab] = useState('general');
  const [yoloMode, setYoloMode] = useState(false);
  const [externalGates, setExternalGates] = useState<string[]>([]);
  const activeTab = controlledTab ?? internalTab;

  // Load permissions from server
  useEffect(() => {
    let cancelled = false;
    async function loadPermissions() {
      try {
        const res = await fetch(`${baseUrl}/api/settings/permissions`);
        if (res.ok) {
          const data = (await res.json()) as PermissionsData;
          if (!cancelled) {
            setYoloMode(data.yoloMode);
            setExternalGates(data.externalGates);
          }
        }
      } catch {
        // Use defaults on error
      }
    }
    loadPermissions();
    return () => { cancelled = true; };
  }, []);

  // Save permissions to server
  const savePermissions = useCallback(async (yolo: boolean, gates: string[]) => {
    try {
      await fetch(`${baseUrl}/api/settings/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ yoloMode: yolo, externalGates: gates, workspaceOverrides: {} }),
      });
    } catch {
      // Silent failure — permissions will be retried on next save
    }
  }, []);

  const handleYoloModeChange = useCallback((enabled: boolean) => {
    setYoloMode(enabled);
    savePermissions(enabled, externalGates);
  }, [externalGates, savePermissions]);

  const handleExternalGatesChange = useCallback((gates: string[]) => {
    setExternalGates(gates);
    savePermissions(yoloMode, gates);
  }, [yoloMode, savePermissions]);

  const handleTabChange = (tab: string) => {
    setInternalTab(tab);
    onTabChange?.(tab);
  };

  // Filter tabs based on available connections/config
  const visibleTabs = useMemo(() => {
    return SETTINGS_TABS.filter((tab) => {
      // Hide 'team' tab when no team handlers are provided (solo mode)
      if (tab.id === 'team' && !onTeamConnect) return false;
      return true;
    });
  }, [onTeamConnect]);

  return (
    <div className="settings-panel flex h-full flex-col bg-background text-foreground">
      {/* Tab bar */}
      <div className="settings-panel__tabs flex border-b border-border px-4">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            className={`settings-panel__tab px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => handleTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="settings-panel__content flex-1 overflow-y-auto p-6">
        {activeTab === 'general' && (
          <ThemeSection config={config} onConfigUpdate={onConfigUpdate} />
        )}
        {activeTab === 'models' && (
          <ModelsSection
            config={config}
            onConfigUpdate={onConfigUpdate}
            onTestApiKey={onTestApiKey}
          />
        )}
        {activeTab === 'vault' && (
          <VaultSection />
        )}
        {activeTab === 'permissions' && (
          <PermissionSection
            yoloMode={yoloMode}
            onYoloModeChange={handleYoloModeChange}
            externalGates={externalGates}
            onExternalGatesChange={handleExternalGatesChange}
          />
        )}
        {activeTab === 'team' && onTeamConnect && onTeamDisconnect && (
          <TeamSection
            teamConnection={teamConnection ?? null}
            onConnect={onTeamConnect}
            onDisconnect={onTeamDisconnect}
          />
        )}
        {activeTab === 'backup' && (
          <BackupSection />
        )}
        {activeTab === 'kvark' && (
          <KvarkSection serverUrl={baseUrl} />
        )}
        {activeTab === 'advanced' && (
          <AdvancedSection
            config={config}
            onConfigUpdate={onConfigUpdate}
          />
        )}
      </div>
    </div>
  );
}
