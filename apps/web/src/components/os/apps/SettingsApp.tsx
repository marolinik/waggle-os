import { useState, useEffect } from 'react';
import { Key, Cpu, Shield, Palette, Server, Save, TestTube, CheckCircle, Loader2, Users, Database, Download, Upload, Lock, Link2 } from 'lucide-react';
import { adapter } from '@/lib/adapter';

type SettingsTab = 'models' | 'apikeys' | 'advanced' | 'team' | 'theme' | 'permissions' | 'backup' | 'vault';

const tabs: { id: SettingsTab; label: string; icon: React.ElementType }[] = [
  { id: 'models', label: 'Models', icon: Cpu },
  { id: 'apikeys', label: 'API Keys', icon: Key },
  { id: 'advanced', label: 'Advanced', icon: Shield },
  { id: 'team', label: 'Team', icon: Users },
  { id: 'theme', label: 'Theme', icon: Palette },
  { id: 'permissions', label: 'Permissions', icon: Shield },
  { id: 'backup', label: 'Backup', icon: Database },
  { id: 'vault', label: 'Vault', icon: Lock },
];

const SettingsApp = () => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('models');
  const [serverUrl, setServerUrl] = useState(adapter.getServerUrl());
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [provider, setProvider] = useState('openai');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [teamUrl, setTeamUrl] = useState('');
  const [teamToken, setTeamToken] = useState('');
  const [yoloMode, setYoloMode] = useState(false);
  const [teamConnected, setTeamConnected] = useState(false);
  const [teamConnecting, setTeamConnecting] = useState(false);
  const [vaultSecrets, setVaultSecrets] = useState<{key: string}[]>([]);
  const [newVaultKey, setNewVaultKey] = useState('');
  const [newVaultValue, setNewVaultValue] = useState('');

  useEffect(() => {
    adapter.getSettings().then(s => {
      setModel(s.model || '');
      setProvider(s.provider || 'openai');
      setYoloMode(s.yoloMode || false);
      setTeamUrl(s.teamServerUrl || '');
      setTeamToken(s.teamToken || '');
    }).catch(() => {});
    adapter.getModels().then(setModels).catch(() => {});
    adapter.getTeamStatus().then(s => setTeamConnected(s.connected)).catch(() => {});
    adapter.getVault().then(v => {
      if (Array.isArray(v)) setVaultSecrets(v as {key: string}[]);
    }).catch(() => {});
  }, []);

  const handleTestKey = async () => {
    setTesting(true);
    try {
      const result = await adapter.testApiKey(provider, apiKey);
      setTestResult(result.valid);
    } catch { setTestResult(false); }
    finally { setTesting(false); }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      adapter.setServerUrl(serverUrl);
      await adapter.saveSettings({ model, provider, yoloMode, teamServerUrl: teamUrl, teamToken });
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  const handleTeamConnect = async () => {
    setTeamConnecting(true);
    try {
      await adapter.teamConnect(teamUrl, teamToken);
      setTeamConnected(true);
    } catch { /* ignore */ }
    finally { setTeamConnecting(false); }
  };

  const handleTeamDisconnect = async () => {
    try {
      await adapter.teamDisconnect();
      setTeamConnected(false);
    } catch { /* ignore */ }
  };

  const handleAddVaultSecret = async () => {
    if (!newVaultKey.trim()) return;
    try {
      await adapter.addVaultSecret({ key: newVaultKey, value: newVaultValue });
      setVaultSecrets(prev => [...prev, { key: newVaultKey }]);
      setNewVaultKey('');
      setNewVaultValue('');
    } catch { /* ignore */ }
  };

  return (
    <div className="flex h-full">
      {/* Tab sidebar */}
      <div className="w-36 border-r border-border/50 p-2 space-y-0.5 shrink-0 overflow-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${
              activeTab === tab.id ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 p-4 overflow-auto">
        {activeTab === 'models' && (
          <div className="space-y-4">
            <h3 className="text-sm font-display font-semibold text-foreground">Model Configuration</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Server URL</label>
                <input value={serverUrl} onChange={e => setServerUrl(e.target.value)}
                  className="w-full bg-muted/50 border border-border/50 rounded-lg px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary/50" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Active Model</label>
                <select value={model} onChange={e => setModel(e.target.value)}
                  className="w-full bg-muted/50 border border-border/50 rounded-lg px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary/50">
                  {models.length > 0 ? models.map(m => (
                    <option key={m} value={m}>{m}</option>
                  )) : (
                    <option value={model}>{model || 'Loading...'}</option>
                  )}
                </select>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'apikeys' && (
          <div className="space-y-4">
            <h3 className="text-sm font-display font-semibold text-foreground">API Keys</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Provider</label>
                <select value={provider} onChange={e => setProvider(e.target.value)}
                  className="w-full bg-muted/50 border border-border/50 rounded-lg px-3 py-1.5 text-sm text-foreground outline-none">
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="google">Google</option>
                  <option value="local">Local</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">API Key</label>
                <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="sk-..."
                  className="w-full bg-muted/50 border border-border/50 rounded-lg px-3 py-1.5 text-sm text-foreground outline-none" />
              </div>
              <button onClick={handleTestKey} disabled={!apiKey || testing}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-secondary text-foreground hover:bg-secondary/70 disabled:opacity-50 transition-colors">
                {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : <TestTube className="w-3 h-3" />} Test Key
              </button>
              {testResult !== null && (
                <p className={`text-xs ${testResult ? 'text-emerald-400' : 'text-destructive'}`}>
                  {testResult ? '✓ Key valid' : '✗ Key invalid'}
                </p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'advanced' && (
          <div className="space-y-4">
            <h3 className="text-sm font-display font-semibold text-foreground">Advanced Settings</h3>
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-secondary/30 border border-border/30">
                <p className="text-xs font-display font-medium text-foreground mb-1">Mind File</p>
                <p className="text-[10px] text-muted-foreground">System prompt and identity configuration</p>
              </div>
              <div className="p-3 rounded-xl bg-secondary/30 border border-border/30">
                <p className="text-xs font-display font-medium text-foreground mb-1">Cache</p>
                <p className="text-[10px] text-muted-foreground">Prompt and response caching settings</p>
              </div>
              <div className="p-3 rounded-xl bg-secondary/30 border border-border/30">
                <p className="text-xs font-display font-medium text-foreground mb-1">Debug Mode</p>
                <p className="text-[10px] text-muted-foreground">Enable verbose logging and diagnostics</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'team' && (
          <div className="space-y-4">
            <h3 className="text-sm font-display font-semibold text-foreground">Team Server</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-2 h-2 rounded-full ${teamConnected ? 'bg-emerald-400' : 'bg-muted-foreground'}`} />
                <span className="text-xs text-muted-foreground">{teamConnected ? 'Connected' : 'Disconnected'}</span>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Team Server URL</label>
                <input value={teamUrl} onChange={e => setTeamUrl(e.target.value)} placeholder="https://team.waggle.ai"
                  className="w-full bg-muted/50 border border-border/50 rounded-lg px-3 py-1.5 text-sm text-foreground outline-none" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Team Token</label>
                <input type="password" value={teamToken} onChange={e => setTeamToken(e.target.value)}
                  className="w-full bg-muted/50 border border-border/50 rounded-lg px-3 py-1.5 text-sm text-foreground outline-none" />
              </div>
              <div className="flex gap-2">
                {!teamConnected ? (
                  <button onClick={handleTeamConnect} disabled={teamConnecting || !teamUrl}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 disabled:opacity-50 transition-colors">
                    {teamConnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />} Connect
                  </button>
                ) : (
                  <button onClick={handleTeamDisconnect}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-destructive text-foreground hover:bg-destructive/80 transition-colors">
                    Disconnect
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'theme' && (
          <div className="space-y-4">
            <h3 className="text-sm font-display font-semibold text-foreground">Theme</h3>
            <div className="space-y-3">
              <div className="flex gap-3">
                <button className="flex-1 p-4 rounded-xl bg-[hsl(30,6%,8%)] border-2 border-primary/50 text-center">
                  <p className="text-xs font-display text-foreground mb-1">Dark</p>
                  <div className="flex gap-1 justify-center">
                    <div className="w-3 h-3 rounded-full bg-background border border-border" />
                    <div className="w-3 h-3 rounded-full bg-primary" />
                    <div className="w-3 h-3 rounded-full bg-secondary" />
                  </div>
                </button>
                <button className="flex-1 p-4 rounded-xl bg-[hsl(40,20%,92%)] border border-border/30 text-center opacity-50">
                  <p className="text-xs font-display text-[hsl(30,6%,8%)] mb-1">Light</p>
                  <div className="flex gap-1 justify-center">
                    <div className="w-3 h-3 rounded-full bg-[hsl(40,20%,92%)] border border-border" />
                    <div className="w-3 h-3 rounded-full bg-primary" />
                    <div className="w-3 h-3 rounded-full bg-[hsl(30,8%,16%)]" />
                  </div>
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground">Hive design system (dark mode active)</p>
            </div>
          </div>
        )}

        {activeTab === 'permissions' && (
          <div className="space-y-4">
            <h3 className="text-sm font-display font-semibold text-foreground">Permissions</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/30 border border-border/30">
                <div>
                  <p className="text-sm text-foreground">YOLO Mode</p>
                  <p className="text-xs text-muted-foreground">Skip approval gates for all tool calls</p>
                </div>
                <button onClick={() => setYoloMode(!yoloMode)}
                  className={`w-10 h-5 rounded-full transition-colors ${yoloMode ? 'bg-primary' : 'bg-muted'}`}>
                  <div className={`w-4 h-4 rounded-full bg-foreground transition-transform mx-0.5 ${yoloMode ? 'translate-x-5' : ''}`} />
                </button>
              </div>
              <div className="p-3 rounded-xl bg-secondary/30 border border-border/30">
                <p className="text-xs font-display font-medium text-foreground mb-1">Mutation Gates</p>
                <p className="text-[10px] text-muted-foreground">Require approval for filesystem, network, and database operations</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'backup' && (
          <div className="space-y-4">
            <h3 className="text-sm font-display font-semibold text-foreground">Backup & Export</h3>
            <div className="space-y-3">
              <button className="flex items-center gap-2 w-full p-3 rounded-xl bg-secondary/30 border border-border/30 text-left hover:bg-secondary/50 transition-colors">
                <Download className="w-4 h-4 text-primary" />
                <div>
                  <p className="text-xs font-display font-medium text-foreground">Export Sessions</p>
                  <p className="text-[10px] text-muted-foreground">Download all sessions as markdown</p>
                </div>
              </button>
              <button className="flex items-center gap-2 w-full p-3 rounded-xl bg-secondary/30 border border-border/30 text-left hover:bg-secondary/50 transition-colors">
                <Upload className="w-4 h-4 text-primary" />
                <div>
                  <p className="text-xs font-display font-medium text-foreground">Import Sessions</p>
                  <p className="text-[10px] text-muted-foreground">Import from ChatGPT or Claude export</p>
                </div>
              </button>
            </div>
          </div>
        )}

        {activeTab === 'vault' && (
          <div className="space-y-4">
            <h3 className="text-sm font-display font-semibold text-foreground">Vault (Encrypted Credentials)</h3>
            <div className="space-y-2">
              {vaultSecrets.map((s, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-secondary/30 border border-border/30">
                  <div className="flex items-center gap-2">
                    <Lock className="w-3 h-3 text-muted-foreground" />
                    <span className="text-xs text-foreground">{s.key}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">••••••</span>
                </div>
              ))}
              {vaultSecrets.length === 0 && <p className="text-xs text-muted-foreground">No vault secrets</p>}
            </div>
            <div className="space-y-2 pt-2 border-t border-border/30">
              <input value={newVaultKey} onChange={e => setNewVaultKey(e.target.value)} placeholder="Key name"
                className="w-full bg-muted/50 border border-border/50 rounded-lg px-3 py-1.5 text-sm text-foreground outline-none" />
              <input type="password" value={newVaultValue} onChange={e => setNewVaultValue(e.target.value)} placeholder="Value"
                className="w-full bg-muted/50 border border-border/50 rounded-lg px-3 py-1.5 text-sm text-foreground outline-none" />
              <button onClick={handleAddVaultSecret} disabled={!newVaultKey.trim()}
                className="px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 disabled:opacity-50 transition-colors">
                Add Secret
              </button>
            </div>
          </div>
        )}

        {/* Save button */}
        <div className="mt-6 pt-4 border-t border-border/30">
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-display rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 disabled:opacity-50 transition-colors">
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save Settings
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsApp;
