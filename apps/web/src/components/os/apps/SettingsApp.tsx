import { useState, useEffect } from 'react';
import {
  Cpu, Shield, Palette, Save, Loader2, Users, Database,
  Download, Upload, Link2, Building, Wrench, DollarSign, Key, Lock, BarChart3, Trash2,
  RotateCcw, GraduationCap,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFeatureGate } from '@/hooks/useFeatureGate';
import { useBilling } from '@/hooks/useBilling';
import LockedFeature from '@/components/os/LockedFeature';
import { adapter } from '@/lib/adapter';
import { Input } from '@/components/ui/input';
import { HintTooltip } from '@/components/ui/hint-tooltip';
import { useProviders } from '@/hooks/useProviders';
import { useOnboarding } from '@/hooks/useOnboarding';
import { useDeveloperMode } from '@/hooks/useDeveloperMode';
import { useDockLabels } from '@/hooks/useDockLabels';
import {
  readLoginBriefingDismissed,
  writeLoginBriefingDismissed,
} from '@/lib/login-briefing';
import type { UserTier } from '@/lib/dock-tiers';
import ModelSelector from '@/components/os/ModelSelector';
import ModelPilotCard from '@/components/os/ModelPilotCard';

type SettingsTab = 'general' | 'models' | 'billing' | 'permissions' | 'team' | 'backup' | 'enterprise' | 'advanced';

const tabs: { id: SettingsTab; label: string; icon: React.ElementType }[] = [
  { id: 'general', label: 'General', icon: Palette },
  { id: 'models', label: 'Models', icon: Cpu },
  { id: 'billing', label: 'Billing', icon: DollarSign },
  { id: 'permissions', label: 'Permissions', icon: Shield },
  { id: 'team', label: 'Team', icon: Users },
  { id: 'backup', label: 'Backup', icon: Database },
  { id: 'enterprise', label: 'Enterprise', icon: Building },
  { id: 'advanced', label: 'Advanced', icon: Wrench },
];

const SettingsApp = () => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [defaultModel, setDefaultModel] = useState('');
  const [fallbackModel, setFallbackModel] = useState<string | null>(null);
  const [budgetModel, setBudgetModel] = useState<string | null>(null);
  const [budgetThreshold, setBudgetThreshold] = useState(0.8);
  const [dailyBudget, setDailyBudget] = useState<string>('');
  const [tier, setTier] = useState('FREE');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  // Theme
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (document.documentElement.getAttribute('data-theme') as 'dark' | 'light') || 'dark';
  });
  const applyTheme = (t: 'dark' | 'light') => {
    setTheme(t);
    if (t === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    localStorage.setItem('waggle-theme', t);
  };

  // Provider data from single source of truth
  const { providers, search, activeSearch, loading: providersLoading } = useProviders();

  // Dock tier
  const { state: onboardingState, update: updateOnboarding, replayTour, reset: resetOnboarding } = useOnboarding();
  const { toast } = useToast();
  const [showWizardReplayConfirm, setShowWizardReplayConfirm] = useState(false);

  // Billing
  const billing = useBilling();

  // Feature gating
  const { isEnabled } = useFeatureGate();
  const isTeamLocked = !isEnabled('mission-control');
  const isEnterpriseLocked = !isEnabled('audit-trail');

  const LOCKED_TABS: Partial<Record<SettingsTab, { feature: string; label: string; prompt: string }>> = {
    ...(isTeamLocked ? { team: { feature: 'mission-control', label: 'Team Management', prompt: 'Upgrade to Business for team management features' } } : {}),
    ...(isEnterpriseLocked ? { enterprise: { feature: 'audit-trail', label: 'Enterprise Features', prompt: 'Enterprise feature — contact sales for audit trail, compliance, and governance' } } : {}),
  };

  // P4: permissions state. `defaultAutonomy` replaces the old yoloMode
  // binary — it's the inherited level new chat windows start at. Per-window
  // overrides in Chat's AutonomyPicker always beat this.
  type AutonomyLevel = 'normal' | 'trusted' | 'yolo';
  const [defaultAutonomy, setDefaultAutonomy] = useState<AutonomyLevel>('normal');
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
  const [debugLogging, setDebugLogging] = useState(false);
  // M-20 / UX-5: developer mode toggle. Persisted via hook in localStorage.
  const [developerMode, setDeveloperMode] = useDeveloperMode();
  // M-19 / UX-4: dock-label visibility (auto heuristic / pinned always).
  const dockLabels = useDockLabels();
  const dockLabelsPinned = dockLabels.mode === 'always';
  // M-25 / ENG-4: LoginBriefing persistent dismiss. Local state mirrors
  // localStorage so the toggle reflects the current flag without a
  // remount; SettingsApp is the only writer on the Settings side.
  const [loginBriefingDismissed, setLoginBriefingDismissedState] = useState(() => {
    try { return readLoginBriefingDismissed(); } catch { return false; }
  });
  const [telemetryCount, setTelemetryCount] = useState(0);

  // Load settings
  useEffect(() => {
    adapter.getSettings().then((s: { defaultModel?: string; model?: string; dailyBudget?: number; tier?: string; fallbackModel?: string; budgetModel?: string; budgetThreshold?: number }) => {
      setDefaultModel(s.defaultModel ?? s.model ?? '');
      setFallbackModel(s.fallbackModel ?? null);
      setBudgetModel(s.budgetModel ?? null);
      setBudgetThreshold(s.budgetThreshold ?? 0.8);
      setDailyBudget(s.dailyBudget != null ? String(s.dailyBudget) : '');
      setTier(s.tier ?? 'FREE');
    }).catch(() => {});

    // P4: permissions now live on /api/settings/permissions (separate from
    // /api/settings). Load defaultAutonomy + externalGates here.
    adapter.getPermissions().then(p => {
      setDefaultAutonomy(p.defaultAutonomy);
      setExternalGates(p.externalGates);
    }).catch(() => {});

    adapter.getTeamStatus().then(s => setTeamConnected(s.connected)).catch(() => {});

    // M2-7: Load telemetry status
    adapter.getTelemetryStatus().then(s => {
      setTelemetryEnabled(s.enabled);
      setTelemetryCount(s.totalEvents);
    });
  }, []);

  const handleSaveModel = async () => {
    setSaving(true);
    try {
      const updates: Record<string, unknown> = { defaultModel };
      if (fallbackModel !== undefined) updates.fallbackModel = fallbackModel;
      if (budgetModel !== undefined) updates.budgetModel = budgetModel;
      if (budgetThreshold !== undefined) updates.budgetThreshold = budgetThreshold;
      if (dailyBudget) updates.dailyBudget = parseFloat(dailyBudget);
      await adapter.saveSettings(updates);
      setSaveMsg('Saved');
      setTimeout(() => setSaveMsg(''), 2000);
    } catch { setSaveMsg('Failed'); }
    finally { setSaving(false); }
  };

  const handleSavePermissions = async (next?: { defaultAutonomy?: AutonomyLevel; externalGates?: string[] }) => {
    setSaving(true);
    try {
      await adapter.savePermissions(next ?? { defaultAutonomy, externalGates });
      setSaveMsg('Permissions saved');
      setTimeout(() => setSaveMsg(''), 2000);
    } catch { setSaveMsg('Failed to save'); }
    finally { setSaving(false); }
  };

  return (
    <div className="flex h-full">
      {/* Tab sidebar */}
      <div className="w-36 border-r border-border/50 p-2 space-y-0.5 shrink-0 overflow-auto" role="tablist" aria-label="Settings sections">
        {tabs.map(tab => {
          const locked = LOCKED_TABS[tab.id];
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              role="tab"
              aria-selected={activeTab === tab.id}
              tabIndex={activeTab === tab.id ? 0 : -1}
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
      <div className="flex-1 p-4 overflow-auto" role="tabpanel">

        {/* ═══ GENERAL ═══ */}
        {activeTab === 'general' && (
          <div className="space-y-5">
            <h3 className="text-sm font-display font-semibold text-foreground">General</h3>

            {/* Tier */}
            <div className="p-3 rounded-xl bg-secondary/30 border border-border/30">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-display font-medium text-foreground">Tier</p>
                  <p className="text-[11px] text-muted-foreground capitalize">{tier} plan</p>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-display bg-primary/20 text-primary capitalize">{tier}</span>
              </div>
            </div>

            {/* Dock Experience */}
            <div>
              <p className="text-xs font-display font-medium text-foreground mb-2">Dock Experience</p>
              <select
                value={onboardingState.tier || 'simple'}
                onChange={(e) => updateOnboarding({ tier: e.target.value as UserTier })}
                className="w-full bg-muted/50 border border-border/50 rounded-lg px-3 py-1.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <option value="simple">Essential — essentials only</option>
                <option value="professional">Standard — full workspace tools</option>
                <option value="power">Everything — all apps visible</option>
              </select>
              {/* QW-5: dock tier ≠ billing plan. Make that explicit. */}
              <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
                Dock layout — controls which apps appear in your dock. Independent of your Pro/Teams billing plan. All apps remain accessible via Ctrl+K.
              </p>
            </div>

            {/* Theme */}
            <div>
              <p className="text-xs font-display font-medium text-foreground mb-2">Theme</p>
              <div className="flex gap-3">
                <button
                  onClick={() => applyTheme('dark')}
                  className={`flex-1 p-4 rounded-xl bg-[hsl(30,6%,8%)] text-center ${theme === 'dark' ? 'border-2 border-primary/50' : 'border border-border/30'}`}
                >
                  <p className="text-xs font-display text-[hsl(40,20%,92%)] mb-1">Dark</p>
                  <div className="flex gap-1 justify-center">
                    <div className="w-3 h-3 rounded-full bg-[hsl(30,6%,8%)] border border-[hsl(40,6%,20%)]" />
                    <div className="w-3 h-3 rounded-full bg-[hsl(38,92%,50%)]" />
                    <div className="w-3 h-3 rounded-full bg-[hsl(30,6%,15%)]" />
                  </div>
                </button>
                <button
                  onClick={() => applyTheme('light')}
                  className={`flex-1 p-4 rounded-xl bg-[hsl(40,20%,92%)] text-center ${theme === 'light' ? 'border-2 border-[hsl(37,100%,39%)]/50' : 'border border-[hsl(40,8%,81%)]'}`}
                >
                  <p className="text-xs font-display text-[hsl(30,6%,8%)] mb-1">Light</p>
                  <div className="flex gap-1 justify-center">
                    <div className="w-3 h-3 rounded-full bg-[hsl(40,18%,97%)] border border-[hsl(40,8%,81%)]" />
                    <div className="w-3 h-3 rounded-full bg-[hsl(37,100%,39%)]" />
                    <div className="w-3 h-3 rounded-full bg-[hsl(40,10%,89%)]" />
                  </div>
                </button>
              </div>
            </div>

            {/* M2-7: Privacy & Telemetry */}
            <div className="space-y-3">
              <h3 className="text-xs font-display font-semibold text-foreground flex items-center gap-2">
                <BarChart3 className="w-3.5 h-3.5 text-muted-foreground" />
                Privacy & Telemetry
              </h3>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Help improve Waggle by tracking anonymous usage patterns. All data stays on your machine — nothing is sent to any server. No message content, file paths, or personal info is ever recorded.
              </p>
              <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/30 border border-border/30">
                <div>
                  <p className="text-xs font-display font-medium text-foreground">Enable anonymous telemetry</p>
                  <p className="text-[11px] text-muted-foreground">{telemetryCount} events collected</p>
                </div>
                <button
                  onClick={async () => {
                    const next = !telemetryEnabled;
                    setTelemetryEnabled(next);
                    await adapter.toggleTelemetry(next);
                  }}
                  className={`relative w-10 h-5 rounded-full transition-colors ${telemetryEnabled ? 'bg-primary' : 'bg-muted'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${telemetryEnabled ? 'left-5' : 'left-0.5'}`} />
                </button>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={async () => {
                    if (!confirm('Clear all collected telemetry events? This cannot be undone. (Does not delete your memory, workspaces, chats, or vault.)')) return;
                    await adapter.clearTelemetry();
                    setTelemetryCount(0);
                  }}
                  className="flex items-center gap-1.5 text-[11px] text-destructive hover:text-destructive/80 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  Clear telemetry events
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══ MODELS ═══ */}
        {activeTab === 'models' && (
          <div className="space-y-5">
            <ModelPilotCard
              defaultModel={defaultModel}
              fallbackModel={fallbackModel}
              budgetModel={budgetModel}
              budgetThreshold={budgetThreshold}
              dailyBudget={dailyBudget ? parseFloat(dailyBudget) : null}
              providers={providers}
              onUpdate={(fields) => {
                if (fields.defaultModel !== undefined) setDefaultModel(fields.defaultModel);
                if (fields.fallbackModel !== undefined) setFallbackModel(fields.fallbackModel);
                if (fields.budgetModel !== undefined) setBudgetModel(fields.budgetModel);
                if (fields.budgetThreshold !== undefined) setBudgetThreshold(fields.budgetThreshold);
              }}
            />

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
              <Input value={dailyBudget} onChange={e => setDailyBudget(e.target.value)} placeholder="No limit"
                type="number" min="0" step="1"
                className="w-full bg-muted/50 h-auto py-1.5" />
            </div>

            <button onClick={handleSaveModel} disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 disabled:opacity-50 transition-colors">
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save Model Settings
            </button>

            {/* Provider key status */}
            <div className="border-t border-border/30 pt-4">
              <h4 className="text-xs font-display font-semibold text-foreground mb-3">Provider API Keys</h4>

              <div className="flex items-start gap-2.5 p-3 mb-3 rounded-lg bg-primary/10 border border-primary/30">
                <Lock className="w-4 h-4 mt-0.5 text-primary shrink-0" />
                <p className="text-xs text-foreground leading-relaxed">
                  Keys are encrypted in the <strong className="text-primary">Vault</strong>. This list is read-only — to add, update, or remove a key, open the <strong className="text-primary">Vault</strong> app from the dock.
                </p>
              </div>

              <div className="space-y-1.5">
                {providers.filter(p => p.requiresKey).map(p => (
                  <div key={p.id} className="flex items-center justify-between p-2 rounded-lg bg-secondary/30 border border-border/30">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${p.hasKey ? 'bg-emerald-400' : 'bg-muted-foreground'}`} />
                      <span className="text-xs text-foreground">{p.name}</span>
                      {p.badge && <span className="text-[11px] text-primary/60">({p.badge})</span>}
                      <span className="text-[11px] text-muted-foreground">{p.models.length} models</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {p.hasKey ? (
                        <span className="text-[11px] text-emerald-400">✓ Key configured</span>
                      ) : (
                        <span className="text-[11px] text-amber-400">No key</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

            </div>

            {/* Search provider status */}
            <div className="border-t border-border/30 pt-4">
              <h4 className="text-xs font-display font-semibold text-foreground mb-2">Search Providers</h4>
              <p className="text-[11px] text-muted-foreground mb-2">Active: <strong>{activeSearch}</strong> (highest priority with a key)</p>
              <div className="space-y-1">
                {search.map(s => (
                  <div key={s.id} className="flex items-center gap-2 text-xs">
                    <span className="text-[11px] text-muted-foreground w-4">#{s.priority}</span>
                    <div className={`w-1.5 h-1.5 rounded-full ${s.hasKey ? 'bg-emerald-400' : 'bg-muted-foreground'}`} />
                    <span className={s.hasKey ? 'text-foreground' : 'text-muted-foreground'}>{s.name}</span>
                    {!s.hasKey && s.id !== 'duckduckgo' && <span className="text-[11px] text-amber-400">No key</span>}
                    {s.id === 'duckduckgo' && <span className="text-[11px] text-muted-foreground">(free, always available)</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══ BILLING ═══ */}
        {activeTab === 'billing' && (
          <div className="space-y-5">
            <h3 className="text-sm font-display font-semibold text-foreground">Billing & Subscription</h3>

            {/* Current tier badge */}
            <div className="p-4 rounded-xl bg-secondary/30 border border-border/30">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-display font-medium text-foreground">Current Plan</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {billing.tier === 'FREE' && 'Free tier — upgrade to unlock all features'}
                    {billing.tier === 'TRIAL' && 'Trial — 15 days of everything unlocked'}
                    {billing.tier === 'PRO' && '$19/mo — unlimited workspaces, marketplace, all connectors'}
                    {billing.tier === 'TEAMS' && '$49/mo per seat — shared workspaces, WaggleDance, governance'}
                    {billing.tier === 'ENTERPRISE' && 'Enterprise — KVARK sovereign deployment'}
                  </p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-display font-semibold ${
                  billing.tier === 'FREE' ? 'bg-muted text-muted-foreground' :
                  billing.tier === 'TRIAL' ? 'bg-honey/20 text-honey' :
                  billing.tier === 'PRO' ? 'bg-primary/20 text-primary' :
                  billing.tier === 'TEAMS' ? 'bg-violet-500/20 text-violet-400' :
                  'bg-amber-500/20 text-amber-400'
                }`}>
                  {billing.tier}
                </span>
              </div>
            </div>

            {/* Error display */}
            {billing.error && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                <p className="text-[11px] text-destructive">{billing.error}</p>
              </div>
            )}

            {/* Syncing indicator */}
            {billing.syncing && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/10 border border-primary/20">
                <Loader2 className="w-3 h-3 animate-spin text-primary" />
                <p className="text-[11px] text-primary">Confirming your payment...</p>
              </div>
            )}

            {/* Upgrade buttons for FREE / TRIAL users */}
            {(billing.tier === 'FREE' || billing.tier === 'TRIAL') && (
              <div className="space-y-2">
                <p className="text-xs font-display font-medium text-foreground">Upgrade</p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => billing.startCheckout('PRO')}
                    className="p-4 rounded-xl bg-primary/10 border border-primary/30 text-left hover:bg-primary/20 transition-colors"
                  >
                    <p className="text-xs font-display font-semibold text-primary">Pro</p>
                    <p className="text-[11px] text-muted-foreground mt-1">$19/mo</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Unlimited workspaces, marketplace, all connectors</p>
                  </button>
                  <button
                    onClick={() => billing.startCheckout('TEAMS')}
                    className="p-4 rounded-xl bg-violet-500/10 border border-violet-500/30 text-left hover:bg-violet-500/20 transition-colors"
                  >
                    <p className="text-xs font-display font-semibold text-violet-400">Teams</p>
                    <p className="text-[11px] text-muted-foreground mt-1">$49/mo per seat</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Shared workspaces, WaggleDance, governance</p>
                  </button>
                </div>
              </div>
            )}

            {/* Upgrade to Teams for PRO users */}
            {billing.tier === 'PRO' && (
              <div className="space-y-3">
                <button
                  onClick={() => billing.startCheckout('TEAMS')}
                  className="w-full p-4 rounded-xl bg-violet-500/10 border border-violet-500/30 text-left hover:bg-violet-500/20 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-display font-semibold text-violet-400">Upgrade to Teams</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">$49/mo per seat — shared workspaces, governance, KVARK funnel</p>
                    </div>
                    <span className="text-violet-400 text-xs">&#8594;</span>
                  </div>
                </button>
              </div>
            )}

            {/* Manage Subscription for paid users */}
            {(billing.tier === 'PRO' || billing.tier === 'TEAMS') && (
              <div className="pt-2 border-t border-border/30">
                <button
                  onClick={() => billing.openPortal()}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-secondary/50 text-foreground hover:bg-secondary/70 transition-colors"
                >
                  <DollarSign className="w-3 h-3" />
                  Manage Subscription
                </button>
                <p className="text-[11px] text-muted-foreground mt-2">
                  Update payment method, view invoices, or cancel your subscription via the Stripe customer portal.
                </p>
              </div>
            )}

            {/* Enterprise CTA */}
            {billing.tier !== 'ENTERPRISE' && (
              <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
                <p className="text-xs font-display font-medium text-amber-400">Enterprise</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Need sovereign deployment, audit trail, and KVARK integration?
                </p>
                <a
                  href="https://www.kvark.ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-2 text-[11px] text-amber-400 hover:text-amber-300 underline"
                >
                  Contact sales at kvark.ai
                </a>
              </div>
            )}
          </div>
        )}

        {/* ═══ PERMISSIONS ═══ */}
        {activeTab === 'permissions' && (
          <div className="space-y-4">
            <h3 className="text-sm font-display font-semibold text-foreground">Permissions</h3>

            {/* P4: default autonomy for new chat windows (3-level) */}
            <div className="p-3 rounded-xl bg-secondary/30 border border-border/30">
              <p className="text-sm text-foreground mb-1">Default approval level</p>
              <p className="text-[11px] text-muted-foreground mb-3">
                Inherited by <em>new</em> chat windows. Each window has its own per-session override in
                the chat header — change one window without affecting the rest.
              </p>
              <div className="space-y-1.5" role="radiogroup" aria-label="Default approval level">
                {([
                  { value: 'normal',  label: 'Ask every time',      copy: 'Approve every write, edit, and mutating tool call' },
                  { value: 'trusted', label: 'Ask only for risky',  copy: 'Auto-pass writes/edits; still gate git push, install, cross-workspace' },
                  { value: 'yolo',    label: 'Never ask',           copy: 'Auto-pass everything except a hardcoded critical blacklist' },
                ] as const).map(opt => {
                  const active = defaultAutonomy === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => {
                        setDefaultAutonomy(opt.value);
                        handleSavePermissions({ defaultAutonomy: opt.value, externalGates });
                      }}
                      data-testid={`default-autonomy-${opt.value}`}
                      className={`w-full text-left flex items-start gap-2 px-2.5 py-2 rounded-lg border transition-colors ${
                        active
                          ? 'bg-primary/15 border-primary/50'
                          : 'bg-muted/20 border-border/20 hover:border-border/40'
                      }`}
                    >
                      <div className={`mt-0.5 w-3.5 h-3.5 rounded-full border shrink-0 ${active ? 'bg-primary border-primary' : 'border-muted-foreground/40'}`} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-display ${active ? 'text-foreground' : 'text-foreground/80'}`}>{opt.label}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{opt.copy}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* External gates */}
            <div className="p-3 rounded-xl bg-secondary/30 border border-border/30">
              <p className="text-xs font-display font-medium text-foreground mb-2">Mutation Gates</p>
              <p className="text-[11px] text-muted-foreground mb-2">Operations that always require approval, regardless of the default level above</p>
              <div className="space-y-1 mb-2">
                {externalGates.map((gate, i) => (
                  <div key={i} className="flex items-center justify-between px-2 py-1 rounded bg-muted/30">
                    <span className="text-[11px] text-foreground font-mono">{gate}</span>
                    <button onClick={() => setExternalGates(prev => prev.filter((_, idx) => idx !== i))}
                      className="text-[11px] text-destructive hover:text-destructive/80">Remove</button>
                  </div>
                ))}
              </div>
              <div className="flex gap-1.5">
                <Input value={newGate} onChange={e => setNewGate(e.target.value)} placeholder="e.g., git push, rm -rf"
                  className="flex-1 bg-muted/50 text-xs h-auto py-1"
                  onKeyDown={e => { if (e.key === 'Enter' && newGate.trim()) { setExternalGates(prev => [...prev, newGate.trim()]); setNewGate(''); } }} />
                <button onClick={() => { if (newGate.trim()) { setExternalGates(prev => [...prev, newGate.trim()]); setNewGate(''); } }}
                  className="px-2 py-1 text-[11px] rounded-lg bg-secondary text-foreground hover:bg-secondary/70">Add</button>
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
                  <p className="text-[11px] text-amber-400">Connecting to a team server will share workspace data. Ensure you trust the server.</p>
                </div>
              )}
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Team Server URL</label>
                <Input value={teamUrl} onChange={e => setTeamUrl(e.target.value)} placeholder="https://team.waggle.ai"
                  className="w-full bg-muted/50 h-auto py-1.5" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Auth Token</label>
                <Input type="password" value={teamToken} onChange={e => setTeamToken(e.target.value)}
                  className="w-full bg-muted/50 h-auto py-1.5" />
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
                <p className="text-[11px] text-muted-foreground">Download all workspaces, sessions, and memory as a zip</p>
              </div>
            </button>
            <button className="flex items-center gap-2 w-full p-3 rounded-xl bg-secondary/30 border border-border/30 text-left hover:bg-secondary/50 transition-colors">
              <Upload className="w-4 h-4 text-primary" />
              <div>
                <p className="text-xs font-display font-medium text-foreground">Import Data</p>
                <p className="text-[11px] text-muted-foreground">Import from ChatGPT or Claude export</p>
              </div>
            </button>

            {/* Encrypted Backup/Restore */}
            <div className="pt-4 border-t border-border/30">
              <h3 className="text-sm font-display font-semibold text-foreground mb-2">Encrypted Backup</h3>
              <p className="text-[11px] text-muted-foreground mb-3">
                Create an AES-256-GCM encrypted backup of all data. Restore on any machine with the same vault key.
              </p>
              <div className="flex gap-2">
                <button onClick={async () => {
                  try {
                    const res = await fetch(`${adapter.getServerUrl()}/api/backup`, { method: 'POST' });
                    if (!res.ok) { const err = await res.json(); alert(err.error); return; }
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `waggle-backup-${new Date().toISOString().slice(0, 10)}.waggle-backup`;
                    a.click();
                    URL.revokeObjectURL(url);
                  } catch { alert('Backup failed — server unreachable'); }
                }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-display rounded-lg bg-primary/20 text-primary hover:bg-primary/30 transition-colors">
                  <Download className="w-3 h-3" /> Create Backup
                </button>
                <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-display rounded-lg bg-secondary/50 text-foreground hover:bg-secondary/70 transition-colors cursor-pointer">
                  <Upload className="w-3 h-3" /> Restore
                  <input type="file" accept=".waggle-backup" className="hidden" onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (!confirm('Restoring will overwrite current data. Continue?')) return;
                    try {
                      const reader = new FileReader();
                      reader.onload = async () => {
                        const base64 = (reader.result as string).split(',')[1];
                        const res = await fetch(`${adapter.getServerUrl()}/api/restore`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ backup: base64 }),
                        });
                        if (res.ok) { alert('Backup restored successfully. Restart the server to apply.'); }
                        else { const err = await res.json(); alert(err.error ?? 'Restore failed'); }
                      };
                      reader.readAsDataURL(file);
                    } catch { alert('Restore failed — server unreachable'); }
                  }} />
                </label>
              </div>
            </div>
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
                <Input value={kvarkUrl} onChange={e => setKvarkUrl(e.target.value)} placeholder="https://kvark.company.com"
                  className="w-full bg-muted/50 h-auto py-1.5" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">API Token</label>
                <Input type="password" value={kvarkToken} onChange={e => setKvarkToken(e.target.value)}
                  className="w-full bg-muted/50 h-auto py-1.5" />
              </div>
              <button disabled className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-secondary text-muted-foreground opacity-50 cursor-not-allowed">
                <Building className="w-3 h-3" /> Test Connection
              </button>
              <p className="text-[11px] text-muted-foreground">Requires Enterprise tier. Contact sales for access.</p>
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
                <p className="text-[11px] text-muted-foreground font-mono mb-2">{adapter.getServerUrl()}</p>
              </div>
              <div className="p-3 rounded-xl bg-secondary/30 border border-border/30">
                <p className="text-xs font-display font-medium text-foreground mb-1">Data Directory</p>
                <p className="text-[11px] text-muted-foreground font-mono">~/.waggle/</p>
                <p className="text-[11px] text-muted-foreground mt-1">All workspaces, memory, vault, and config live here.</p>
              </div>
              <div className="p-3 rounded-xl bg-secondary/30 border border-border/30" data-testid="login-briefing-setting">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-display font-medium text-foreground">Show login briefing on each launch</p>
                  <button
                    onClick={() => {
                      // The toggle reads as "Show on launch", so ON means NOT
                      // dismissed. We store the INVERSE of the visible label
                      // so the default (no key) means "show briefing".
                      const nextDismissed = !loginBriefingDismissed ? true : false;
                      writeLoginBriefingDismissed(nextDismissed);
                      setLoginBriefingDismissedState(nextDismissed);
                    }}
                    role="switch"
                    aria-checked={!loginBriefingDismissed}
                    aria-label="Show login briefing on each launch"
                    data-testid="login-briefing-toggle"
                    className={`relative w-10 h-5 rounded-full transition-colors ${!loginBriefingDismissed ? 'bg-primary' : 'bg-muted'}`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${!loginBriefingDismissed ? 'left-5' : 'left-0.5'}`} />
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground">On: brief summary appears on each session. Off after clicking "Don't show again" in the briefing.</p>
              </div>
              <div className="p-3 rounded-xl bg-secondary/30 border border-border/30" data-testid="dock-labels-setting">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-display font-medium text-foreground">Always show dock labels</p>
                  <button
                    onClick={() => dockLabels.setMode(dockLabelsPinned ? 'auto' : 'always')}
                    role="switch"
                    aria-checked={dockLabelsPinned}
                    aria-label="Always show dock labels"
                    data-testid="dock-labels-toggle"
                    className={`relative w-10 h-5 rounded-full transition-colors ${dockLabelsPinned ? 'bg-primary' : 'bg-muted'}`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${dockLabelsPinned ? 'left-5' : 'left-0.5'}`} />
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground">Off: labels auto-hide after 20 sessions or 7 days. On: always visible.</p>
              </div>
              <div className="p-3 rounded-xl bg-secondary/30 border border-border/30" data-testid="developer-mode-setting">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-display font-medium text-foreground">Developer Mode</p>
                  <button
                    onClick={() => setDeveloperMode(!developerMode)}
                    role="switch"
                    aria-checked={developerMode}
                    aria-label="Developer mode"
                    data-testid="developer-mode-toggle"
                    className={`relative w-10 h-5 rounded-full transition-colors ${developerMode ? 'bg-primary' : 'bg-muted'}`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${developerMode ? 'left-5' : 'left-0.5'}`} />
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground">Show token counts and per-call cost in the status bar. Off by default.</p>
              </div>
              {/* Phase 1 #6 — Help & Tutorials section. Tour replay clears the
                  OnboardingTooltips localStorage flag + flips tooltipsDismissed
                  so the post-wizard coachmark sequence renders again. Wizard
                  replay is gated behind a confirm dialog because it resets the
                  full setup flow (workspaces / memory / vault stay intact). */}
              <div className="p-3 rounded-xl bg-secondary/30 border border-border/30" data-testid="help-tutorials-section">
                <p className="text-xs font-display font-medium text-foreground mb-2">Help & Tutorials</p>

                <div className="flex items-start gap-3 mb-3">
                  <GraduationCap className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-[11px] font-display font-medium text-foreground">Replay onboarding tour</p>
                    <p className="text-[11px] text-muted-foreground mb-2">
                      Re-show the 4-slide coachmark tour with Waggle's core gestures.
                    </p>
                    <button
                      onClick={() => {
                        replayTour();
                        toast({
                          title: 'Tour restarting…',
                          description: 'The coachmark tour will appear shortly.',
                        });
                      }}
                      data-testid="replay-tour-button"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded-lg bg-muted/50 text-foreground hover:bg-muted transition-colors"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Replay tour
                    </button>
                  </div>
                </div>

                <div className="flex items-start gap-3 pt-3 border-t border-border/30">
                  <RotateCcw className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-[11px] font-display font-medium text-foreground">Replay onboarding wizard (advanced)</p>
                    <p className="text-[11px] text-muted-foreground mb-2">
                      Restart the full 8-step setup. Workspaces, memory, and vault are preserved — only
                      onboarding state resets.
                    </p>
                    {!showWizardReplayConfirm ? (
                      <button
                        onClick={() => setShowWizardReplayConfirm(true)}
                        data-testid="replay-wizard-button"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded-lg bg-muted/50 text-foreground hover:bg-muted transition-colors"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Replay wizard
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-amber-400">Restart the 8-step setup now?</span>
                        <button
                          onClick={() => {
                            resetOnboarding();
                            setShowWizardReplayConfirm(false);
                            toast({
                              title: 'Wizard restarting…',
                              description: 'Setup begins again. Your data is preserved.',
                            });
                          }}
                          data-testid="replay-wizard-confirm"
                          className="px-2 py-1 text-[11px] rounded bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 transition-colors"
                        >
                          Yes, restart
                        </button>
                        <button
                          onClick={() => setShowWizardReplayConfirm(false)}
                          className="px-2 py-1 text-[11px] rounded bg-muted/50 text-muted-foreground hover:bg-muted transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-secondary/30 border border-border/30">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-display font-medium text-foreground">Debug Logging</p>
                  <button
                    onClick={async () => {
                      const next = !debugLogging;
                      setDebugLogging(next);
                      try { await adapter.saveSettings({ debugLogging: next } as any); } catch { /* non-blocking */ }
                    }}
                    role="switch"
                    aria-checked={debugLogging}
                    aria-label="Debug logging"
                    className={`relative w-10 h-5 rounded-full transition-colors ${debugLogging ? 'bg-primary' : 'bg-muted'}`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${debugLogging ? 'left-5' : 'left-0.5'}`} />
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground">Verbose logging for troubleshooting agent behavior.</p>
                <div className="flex gap-2 mt-2">
                  <HintTooltip content="Opens audit events + health snapshot in a new tab. Save with Ctrl+S to attach to a support ticket.">
                    <a
                      href={`${adapter.getServerUrl()}/api/debug/logs`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded-lg bg-muted/50 text-foreground hover:bg-muted transition-colors"
                    >
                      <Download className="w-3 h-3" />
                      View / save logs
                    </a>
                  </HintTooltip>
                  <span className="text-[10px] text-muted-foreground self-center">Attach to support tickets</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Save status toast */}
        {saveMsg && (
          <div className="mt-3 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-400 inline-block">
            {saveMsg}
          </div>
        )}
      </div>
    </div>
  );
};

export default SettingsApp;
