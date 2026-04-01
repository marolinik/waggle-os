import { useState, useEffect } from 'react';
import {
  Cpu, Shield, Palette, Save, Loader2, Users, Database,
  Download, Upload, Link2, Building, Wrench, DollarSign, Key, Lock, BarChart3, Trash2,
} from 'lucide-react';
import { useFeatureGate } from '@/hooks/useFeatureGate';
import LockedFeature from '@/components/os/LockedFeature';
import { adapter } from '@/lib/adapter';
import { useProviders } from '@/hooks/useProviders';
import { useOnboarding } from '@/hooks/useOnboarding';
import type { UserTier } from '@/lib/dock-tiers';
import ModelSelector from '@/components/os/ModelSelector';

type SettingsTab = 'general' | 'models' | 'permissions' | 'team' | 'backup' | 'enterprise' | 'advanced';

const tabs: { id: SettingsTab; label: string; icon: React.ElementType }[] = [
  { id: 'general', label: 'General', icon: Palette },
  { id: 'models', label: 'Models', icon: Cpu },
  { id: 'permissions', label: 'Permissions', icon: Shield },
  { id: 'team', label: 'Team', icon: Users },
  { id: 'backup', label: 'Backup', icon: Database },
  { id: 'enterprise', label: 'Enterprise', icon: Building },
  { id: 'advanced', label: 'Advanced', icon: Wrench },
];

const SettingsApp = () => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [defaultModel, setDefaultModel] = useState('');
  const [dailyBudget, setDailyBudget] = useState<string>('');
  const [tier, setTier] = useState('solo');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  // Provider data from single source of truth
  const { providers, search, activeSearch, loading: providersLoading } = useProviders();

  // Dock tier
  const { state: onboardingState, update: updateOnboarding } = useOnboarding();

  // Feature gating
  const { isEnabled } = useFeatureGate();
  const isTeamLocked = !isEnabled('mission-control');
  const isEnterpriseLocked = !isEnabled('audit-trail');

  const LOCKED_TABS: Partial<Record<SettingsTab, { feature: string; label: string; prompt: string }>> = {
    ...(isTeamLocked ? { team: { feature: 'mission-control', label: 'Team Management', prompt: 'Upgrade to Business for team management features' } } : {}),
    ...(isEnterpriseLocked ? { enterprise: { feature: 'audit-trail', label: 'Enterprise Features', prompt: 'Enterprise feature — contact sales for audit trail, compliance, and governance' } } : {}),
  };

  // Permissions state
  const [yoloMode, setYoloMode] = useState(false);
  const [externalGates, setExternalGates] = useState<string[]>([]);
  const [newGate, setNewGate] = useState('');

  // Team state
  const [teamUrl, setTeamUrl] = useState('');
  const [teamToken, setTeamToken] = useState('');
  const [teamConnected, setTeamConnected] = useState(false);
  const [teamConnecting, setTeamConnecting] = useState(false);

  // KVARK state
  const [kvarkUrl, setKvarkUrl] = useState('');
  const [kvarkToken, setKvarkToken] = useState('');

  // M2-7: Telemetry state
  const [telemetryEnabled, setTelemetryEnabled] = useState(false);
  const [telemetryCount, setTelemetryCount] = useState(0);

  // Load settings
  useEffect(() => {
    adapter.getSettings().then((s: any) => {
      setDefaultModel(s.defaultModel ?? s.model ?? '');
      setDailyBudget(s.dailyBudget != null ? String(s.dailyBudget) : '');
      setTier(s.tier ?? 'solo');
      setYoloMode(s.yoloMode ?? false);
    }).catch(() => {});

    adapter.getTeamStatus().then(s => setTeamConnected(s.connected)).catch(() => {});

    // M2-7: Load telemetry status
    fetch(`${adapter.getServerUrl()}/api/telemetry/status`)
      .then(r => r.json())
      .then((s: { enabled: boolean; totalEvents: number }) => {
        setTelemetryEnabled(s.enabled);
        setTelemetryCount(s.totalEvents);
      })
      .catch(() => {});
  }, []);

  const handleSaveModel = async () => {
    setSaving(true);
    try {
      const updates: Record<string, unknown> = { defaultModel };
      if (dailyBudget) updates.dailyBudget = parseFloat(dailyBudget);
      await adapter.saveSettings(updates);
      setSaveMsg('Saved');
      setTimeout(() => setSaveMsg(''), 2000);
    } catch { setSaveMsg('Failed'); }
    finally { setSaving(false); }
  };

  const handleSavePermissions = async () => {
    setSaving(true);
    try {
      // TODO: wire to PUT /api/settings/permissions when needed
      setSaveMsg('Permissions saved');
      setTimeout(() => setSaveMsg(''), 2000);
    } catch { setSaveMsg('Failed'); }
    finally { setSaving(false); }
  };

  return (
    <div className="flex h-full">
      {/* Tab sidebar */}
      <div className="w-36 border-r border-border/50 p-2 space-y-0.5 shrink-0 overflow-auto">
        {tabs.map(tab => {
          const locked = LOCKED_TABS[tab.id];
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${
                activeTab === tab.id ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
              {locked && <Lock className="w-3 h-3 ml-auto text-muted-foreground/50" />}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 p-4 overflow-auto">

        {/* ═══ GENERAL ═══ */}
        {activeTab === 'general' && (
          <div className="space-y-5">
            <h3 className="text-sm font-display font-semibold text-foreground">General</h3>

            {/* Tier */}
            <div className="p-3 rounded-xl bg-secondary/30 border border-border/30">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-display font-medium text-foreground">Tier</p>
                  <p className="text-[10px] text-muted-foreground capitalize">{tier} plan</p>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-display bg-primary/20 text-primary capitalize">{tier}</span>
              </div>
            </div>

            {/* Dock Experience */}
            <div>
              <p className="text-xs font-display font-medium text-foreground mb-2">Dock Experience</p>
              <select
                value={onboardingState.tier || 'simple'}
                onChange={(e) => updateOnboarding({ tier: e.target.value as UserTier })}
                className="w-full bg-muted/50 border border-border/50 rounded-lg px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary/50"
              >
                <option value="simple">Simple — essentials only</option>
                <option value="professional">Professional — full workspace tools</option>
                <option value="power">Full Control — everything visible</option>
              </select>
              <p className="text-[10px] text-muted-foreground mt-1.5">Controls which apps appear in the dock. All apps remain accessible via Ctrl+K.</p>
            </div>

            {/* Theme */}
            <div>
              <p className="text-xs font-display font-medium text-foreground mb-2">Theme</p>
              <div className="flex gap-3">
                <button className="flex-1 p-4 rounded-xl bg-[hsl(30,6%,8%)] border-2 border-primary/50 text-center">
                  <p className="text-xs font-display text-foreground mb-1">Dark</p>
                  <div className="flex gap-1 justify-center">
                    <div className="w-3 h-3 rounded-full bg-background border border-border" />
                    <div className="w-3 h-3 rounded-full bg-primary" />
                    <div className="w-3 h-3 rounded-full bg-secondary" />
                  </div>
                </button>
                <button className="flex-1 p-4 rounded-xl bg-[hsl(40,20%,92%)] border border-border/30 text-center opacity-40 cursor-not-allowed">
                  <p className="text-xs font-display text-[hsl(30,6%,8%)] mb-1">Light</p>
                  <p className="text-[9px] text-[hsl(30,6%,30%)]">Coming soon</p>
                </button>
              </div>
            </div>

            {/* M2-7: Privacy & Telemetry */}
            <div className="space-y-3">
              <h3 className="text-xs font-display font-semibold text-foreground flex items-center gap-2">
                <BarChart3 className="w-3.5 h-3.5 text-muted-foreground" />
                Privacy & Telemetry
              </h3>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Help improve Waggle by tracking anonymous usage patterns. All data stays on your machine — nothing is sent to any server. No message content, file paths, or personal info is ever recorded.
              </p>
              <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/30 border border-border/30">
                <div>
                  <p className="text-xs font-display font-medium text-foreground">Enable anonymous telemetry</p>
                  <p className="text-[10px] text-muted-foreground">{telemetryCount} events collected</p>
                </div>
                <button
                  onClick={async () => {
                    const next = !telemetryEnabled;
                    setTelemetryEnabled(next);
                    await fetch(`${adapter.getServerUrl()}/api/telemetry/toggle`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ enabled: next }),
                    }).catch(() => {});
                  }}
                  className={`relative w-10 h-5 rounded-full transition-colors ${telemetryEnabled ? 'bg-primary' : 'bg-muted'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${telemetryEnabled ? 'left-5' : 'left-0.5'}`} />
                </button>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={async () => {
                    if (!confirm('Delete all collected telemetry data? This cannot be undone.')) return;
                    await fetch(`${adapter.getServerUrl()}/api/telemetry/events`, { method: 'DELETE' }).catch(() => {});
                    setTelemetryCount(0);
                  }}
                  className="flex items-center gap-1.5 text-[10px] text-destructive hover:text-destructive/80 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  Delete all data
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══ MODELS ═══ */}
        {activeTab === 'models' && (
          <div className="space-y-5">
            <h3 className="text-sm font-display font-semibold text-foreground">Model Configuration</h3>

            {/* Default model selector — from /api/providers */}
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">Default Model</label>
              <ModelSelector value={defaultModel} onChange={setDefaultModel} providers={providers} variant="dropdown" />
            </div>

            {/* Daily budget */}
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                <DollarSign className="w-3 h-3 inline mr-1" />Daily Budget (USD)
              </label>
              <input value={dailyBudget} onChange={e => setDailyBudget(e.target.value)} placeholder="No limit"
                type="number" min="0" step="1"
                className="w-full bg-muted/50 border border-border/50 rounded-lg px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary/50" />
            </div>

            <button onClick={handleSaveModel} disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 disabled:opacity-50 transition-colors">
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save Model Settings
            </button>

            {/* Provider key status */}
            <div className="border-t border-border/30 pt-4">
              <h4 className="text-xs font-display font-semibold text-foreground mb-3">Provider API Keys</h4>
              <p className="text-[10px] text-muted-foreground mb-3">Keys are encrypted in the Vault. Click <Lock className="w-3 h-3 inline" /> to manage keys.</p>

              <div className="space-y-1.5">
                {providers.filter(p => p.requiresKey).map(p => (
                  <div key={p.id} className="flex items-center justify-between p-2 rounded-lg bg-secondary/30 border border-border/30">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${p.hasKey ? 'bg-emerald-400' : 'bg-muted-foreground'}`} />
                      <span className="text-xs text-foreground">{p.name}</span>
                      {p.badge && <span className="text-[9px] text-primary/60">({p.badge})</span>}
                      <span className="text-[10px] text-muted-foreground">{p.models.length} models</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {p.hasKey ? (
                        <span className="text-[10px] text-emerald-400">✓ Key configured</span>
                      ) : (
                        <span className="text-[10px] text-amber-400">No key</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-[10px] text-muted-foreground mt-3">
                <Key className="w-3 h-3 inline mr-1" />
                To add or update API keys, open the <strong>Vault</strong> app from the dock.
              </p>
            </div>

            {/* Search provider status */}
            <div className="border-t border-border/30 pt-4">
              <h4 className="text-xs font-display font-semibold text-foreground mb-2">Search Providers</h4>
              <p className="text-[10px] text-muted-foreground mb-2">Active: <strong>{activeSearch}</strong> (highest priority with a key)</p>
              <div className="space-y-1">
                {search.map(s => (
                  <div key={s.id} className="flex items-center gap-2 text-xs">
                    <span className="text-[10px] text-muted-foreground w-4">#{s.priority}</span>
                    <div className={`w-1.5 h-1.5 rounded-full ${s.hasKey ? 'bg-emerald-400' : 'bg-muted-foreground'}`} />
                    <span className={s.hasKey ? 'text-foreground' : 'text-muted-foreground'}>{s.name}</span>
                    {!s.hasKey && s.id !== 'duckduckgo' && <span className="text-[9px] text-amber-400">No key</span>}
                    {s.id === 'duckduckgo' && <span className="text-[9px] text-muted-foreground">(free, always available)</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══ PERMISSIONS ═══ */}
        {activeTab === 'permissions' && (
          <div className="space-y-4">
            <h3 className="text-sm font-display font-semibold text-foreground">Permissions</h3>

            {/* YOLO mode */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/30 border border-border/30">
              <div>
                <p className="text-sm text-foreground">Auto-Approve Mode</p>
                <p className="text-xs text-muted-foreground">Skip approval gates for all tool calls</p>
              </div>
              <button onClick={() => { setYoloMode(!yoloMode); handleSavePermissions(); }}
                className={`w-10 h-5 rounded-full transition-colors ${yoloMode ? 'bg-primary' : 'bg-muted'}`}>
                <div className={`w-4 h-4 rounded-full bg-foreground transition-transform mx-0.5 ${yoloMode ? 'translate-x-5' : ''}`} />
              </button>
            </div>

            {/* External gates */}
            <div className="p-3 rounded-xl bg-secondary/30 border border-border/30">
              <p className="text-xs font-display font-medium text-foreground mb-2">Mutation Gates</p>
              <p className="text-[10px] text-muted-foreground mb-2">Operations that always require approval (even in auto-approve mode)</p>
              <div className="space-y-1 mb-2">
                {externalGates.map((gate, i) => (
                  <div key={i} className="flex items-center justify-between px-2 py-1 rounded bg-muted/30">
                    <span className="text-[11px] text-foreground font-mono">{gate}</span>
                    <button onClick={() => setExternalGates(prev => prev.filter((_, idx) => idx !== i))}
                      className="text-[10px] text-destructive hover:text-destructive/80">Remove</button>
                  </div>
                ))}
              </div>
              <div className="flex gap-1.5">
                <input value={newGate} onChange={e => setNewGate(e.target.value)} placeholder="e.g., git push, rm -rf"
                  className="flex-1 bg-muted/50 border border-border/50 rounded-lg px-2 py-1 text-xs text-foreground outline-none"
                  onKeyDown={e => { if (e.key === 'Enter' && newGate.trim()) { setExternalGates(prev => [...prev, newGate.trim()]); setNewGate(''); } }} />
                <button onClick={() => { if (newGate.trim()) { setExternalGates(prev => [...prev, newGate.trim()]); setNewGate(''); } }}
                  className="px-2 py-1 text-[10px] rounded-lg bg-secondary text-foreground hover:bg-secondary/70">Add</button>
              </div>
            </div>
          </div>
        )}

        {/* ═══ TEAM ═══ */}
        {activeTab === 'team' && LOCKED_TABS.team && (
          <LockedFeature featureName={LOCKED_TABS.team.label} upgradePrompt={LOCKED_TABS.team.prompt} />
        )}
        {activeTab === 'team' && !LOCKED_TABS.team && (
          <div className="space-y-4">
            <h3 className="text-sm font-display font-semibold text-foreground">Team Server</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-2 h-2 rounded-full ${teamConnected ? 'bg-emerald-400' : 'bg-muted-foreground'}`} />
                <span className="text-xs text-muted-foreground">{teamConnected ? 'Connected' : 'Disconnected'}</span>
              </div>
              {!teamConnected && (
                <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <p className="text-[10px] text-amber-400">Connecting to a team server will share workspace data. Ensure you trust the server.</p>
                </div>
              )}
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Team Server URL</label>
                <input value={teamUrl} onChange={e => setTeamUrl(e.target.value)} placeholder="https://team.waggle.ai"
                  className="w-full bg-muted/50 border border-border/50 rounded-lg px-3 py-1.5 text-sm text-foreground outline-none" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Auth Token</label>
                <input type="password" value={teamToken} onChange={e => setTeamToken(e.target.value)}
                  className="w-full bg-muted/50 border border-border/50 rounded-lg px-3 py-1.5 text-sm text-foreground outline-none" />
              </div>
              <div className="flex gap-2">
                {!teamConnected ? (
                  <button onClick={async () => {
                    setTeamConnecting(true);
                    try { await adapter.teamConnect(teamUrl, teamToken); setTeamConnected(true); } catch { /* ignore */ }
                    finally { setTeamConnecting(false); }
                  }} disabled={teamConnecting || !teamUrl}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 disabled:opacity-50 transition-colors">
                    {teamConnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />} Connect
                  </button>
                ) : (
                  <button onClick={async () => {
                    try { await adapter.teamDisconnect(); setTeamConnected(false); } catch { /* ignore */ }
                  }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-destructive text-foreground hover:bg-destructive/80 transition-colors">
                    Disconnect
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══ BACKUP ═══ */}
        {activeTab === 'backup' && (
          <div className="space-y-4">
            <h3 className="text-sm font-display font-semibold text-foreground">Backup & Export</h3>
            <button onClick={async () => {
              try {
                const blob = await fetch(`${adapter.getServerUrl()}/api/export`, { method: 'POST' }).then(r => r.blob());
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `waggle-export-${new Date().toISOString().slice(0, 10)}.zip`;
                a.click();
                URL.revokeObjectURL(url);
              } catch { /* ignore */ }
            }}
              className="flex items-center gap-2 w-full p-3 rounded-xl bg-secondary/30 border border-border/30 text-left hover:bg-secondary/50 transition-colors">
              <Download className="w-4 h-4 text-primary" />
              <div>
                <p className="text-xs font-display font-medium text-foreground">Export Data</p>
                <p className="text-[10px] text-muted-foreground">Download all workspaces, sessions, and memory as a zip</p>
              </div>
            </button>
            <button className="flex items-center gap-2 w-full p-3 rounded-xl bg-secondary/30 border border-border/30 text-left hover:bg-secondary/50 transition-colors">
              <Upload className="w-4 h-4 text-primary" />
              <div>
                <p className="text-xs font-display font-medium text-foreground">Import Data</p>
                <p className="text-[10px] text-muted-foreground">Import from ChatGPT or Claude export</p>
              </div>
            </button>
          </div>
        )}

        {/* ═══ ENTERPRISE ═══ */}
        {activeTab === 'enterprise' && LOCKED_TABS.enterprise && (
          <LockedFeature featureName={LOCKED_TABS.enterprise.label} upgradePrompt={LOCKED_TABS.enterprise.prompt} />
        )}
        {activeTab === 'enterprise' && !LOCKED_TABS.enterprise && (
          <div className="space-y-4">
            <h3 className="text-sm font-display font-semibold text-foreground">Enterprise (KVARK)</h3>
            <p className="text-xs text-muted-foreground">Connect to KVARK for enterprise document retrieval, compliance, and governance features.</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">KVARK Server URL</label>
                <input value={kvarkUrl} onChange={e => setKvarkUrl(e.target.value)} placeholder="https://kvark.company.com"
                  className="w-full bg-muted/50 border border-border/50 rounded-lg px-3 py-1.5 text-sm text-foreground outline-none" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">API Token</label>
                <input type="password" value={kvarkToken} onChange={e => setKvarkToken(e.target.value)}
                  className="w-full bg-muted/50 border border-border/50 rounded-lg px-3 py-1.5 text-sm text-foreground outline-none" />
              </div>
              <button disabled className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-secondary text-muted-foreground opacity-50 cursor-not-allowed">
                <Building className="w-3 h-3" /> Test Connection
              </button>
              <p className="text-[10px] text-muted-foreground">Requires Enterprise tier. Contact sales for access.</p>
            </div>
          </div>
        )}

        {/* ═══ ADVANCED ═══ */}
        {activeTab === 'advanced' && (
          <div className="space-y-4">
            <h3 className="text-sm font-display font-semibold text-foreground">Advanced</h3>
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-secondary/30 border border-border/30">
                <p className="text-xs font-display font-medium text-foreground mb-1">Server URL</p>
                <p className="text-[10px] text-muted-foreground font-mono mb-2">{adapter.getServerUrl()}</p>
              </div>
              <div className="p-3 rounded-xl bg-secondary/30 border border-border/30">
                <p className="text-xs font-display font-medium text-foreground mb-1">Data Directory</p>
                <p className="text-[10px] text-muted-foreground font-mono">~/.waggle/</p>
              </div>
              <div className="p-3 rounded-xl bg-secondary/30 border border-border/30">
                <p className="text-xs font-display font-medium text-foreground mb-1">Debug Logging</p>
                <p className="text-[10px] text-muted-foreground">Verbose logging for troubleshooting agent behavior</p>
              </div>
            </div>
          </div>
        )}

        {/* Save status toast */}
        {saveMsg && (
          <div className="mt-3 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[10px] text-emerald-400 inline-block">
            {saveMsg}
          </div>
        )}
      </div>
    </div>
  );
};

export default SettingsApp;
