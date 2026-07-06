import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Cpu, Shield, Palette, Save, Loader2, Users, Database,
  Download, Upload, Link2, Building, Wrench, DollarSign, Key, Lock, BarChart3, Trash2,
  RotateCcw, GraduationCap, HelpCircle, AlertTriangle,
} from 'lucide-react';
import PlanCards from '@/components/os/billing/PlanCards';
import { useToast } from '@/hooks/use-toast';
import { useBilling } from '@/hooks/useBilling';
import { parseTier, tierSatisfies, TIER_LABELS, type Tier } from '@waggle/shared';
import LockedFeature from '@/components/os/LockedFeature';
import { adapter } from '@/lib/adapter';
import { Input } from '@/components/ui/input';
import { HintTooltip } from '@/components/ui/hint-tooltip';
import { useProviders } from '@/hooks/useProviders';
import { useTheme } from '@/providers/ThemeProvider';
import { useOnboarding } from '@/hooks/useOnboarding';
import { useDeveloperMode } from '@/hooks/useDeveloperMode';
import { useDockLabels } from '@/hooks/useDockLabels';
import {
  readLoginBriefingDismissed,
  writeLoginBriefingDismissed,
} from '@/lib/login-briefing';
import type { UserTier } from '@/lib/dock-tiers';
import {
  getSettingsTabsForTier,
  resolveActiveSettingsTab,
} from '@/lib/settings-tier-filter';
import { requiresYoloConfirm } from '@/lib/autonomy-confirm';
import ModelSelector from '@/components/os/ModelSelector';
import ModelPilotCard from '@/components/os/ModelPilotCard';
import { ModelGate } from '@/components/os/model-gate/ModelGate';
import EraseDataDialog from '@/components/os/overlays/EraseDataDialog';
import TelegramDigestCard from '@/components/os/settings/TelegramDigestCard';
import CoverageCompassCard from '@/components/os/settings/CoverageCompassCard';
import { AVAILABLE_SHAPES, useSelectedShape, type PromptShape } from '@/lib/shape-selection';
import { SectionLabel } from '@/components/os/warm';

type SettingsTab = 'general' | 'models' | 'billing' | 'permissions' | 'team' | 'backup' | 'enterprise' | 'advanced';

const tabs: { id: SettingsTab; label: string; icon: React.ElementType }[] = [
  { id: 'general', label: 'General', icon: Palette },
  { id: 'models', label: 'Models', icon: Cpu },
  { id: 'billing', label: 'Plan', icon: DollarSign },
  { id: 'permissions', label: 'Permissions', icon: Shield },
  { id: 'team', label: 'Team', icon: Users },
  { id: 'backup', label: 'Backup', icon: Database },
  { id: 'enterprise', label: 'Enterprise', icon: Building },
  { id: 'advanced', label: 'Advanced', icon: Wrench },
];

const SettingsApp = () => {
  // PR5 §11 "Models leads" — Settings opens on Models (the model gate + failover
  // chain), the primary thing a user configures. 'models' is Essential-tier, so it
  // is always visible regardless of the dock disclosure level.
  const [activeTab, setActiveTab] = useState<SettingsTab>('models');
  const [defaultModel, setDefaultModel] = useState('');
  const [fallbackModel, setFallbackModel] = useState<string | null>(null);
  const [budgetModel, setBudgetModel] = useState<string | null>(null);
  const [budgetThreshold, setBudgetThreshold] = useState(0.8);
  const [dailyBudget, setDailyBudget] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  // CC Session A §2.2 — Phase 1 GEPA prompt shape selection. Persisted in
  // localStorage; threaded into adapter.sendMessage body. Sidecar honors it
  // once A3.1 ships (currently ignored — selection still survives reloads).
  const [selectedShape, setSelectedShape] = useSelectedShape();

  // Theme — owned by ThemeProvider (single source of truth: data-theme + localStorage).
  // `theme` is the resolved value; `applyTheme` accepts 'dark' | 'light' (a subset
  // of ThemeMode), so the existing theme-card onClick handlers are unchanged.
  const { resolvedTheme: theme, setTheme: applyTheme } = useTheme();

  // Provider data from single source of truth
  const { providers, search, activeSearch, loading: providersLoading, refresh: refreshProviders } = useProviders();

  // Dock tier
  const { state: onboardingState, update: updateOnboarding, replayTour, reset: resetOnboarding } = useOnboarding();
  // Phase 4.1: filter tab sidebar by user's chosen UserTier so the Settings
  // surface area matches the dock disclosure level. Spec: docs/ux-disclosure-levels.md.
  const userTier: UserTier = (onboardingState.tier ?? 'simple');
  const visibleTabs = getSettingsTabsForTier(userTier, tabs);
  // Snap activeTab back to a visible tab if the user's tier changes (e.g. they
  // drop from Standard to Essential while sitting on the Advanced tab).
  useEffect(() => {
    const next = resolveActiveSettingsTab(userTier, activeTab, tabs);
    if (next && next !== activeTab) {
      setActiveTab(next as SettingsTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userTier]);

  // PR7a/D12: `?tab=` deep-link reader. Upgrade entry points route to
  // `/settings?tab=billing`; this also fixes the pre-existing `?tab=backup`
  // deep-link (routes.ts:52) that opened Models because there was no reader.
  // Snaps to a KNOWN tab, respecting the tier filter (e.g. an Essential user
  // deep-linked to `advanced` falls back to general, never a half-shipped tab).
  const [searchParams] = useSearchParams();
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (!tabParam || !tabs.some(t => t.id === tabParam)) return;
    const next = resolveActiveSettingsTab(userTier, tabParam, tabs);
    if (next) setActiveTab(next as SettingsTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  const { toast } = useToast();
  const [showWizardReplayConfirm, setShowWizardReplayConfirm] = useState(false);

  // Billing
  const billing = useBilling();

  // Tier gating — canonical resolution off the billing tier (never null: a
  // legacy/unknown value falls back to Solo/FREE, never locking a user out).
  const tier: Tier = parseTier(billing.tier) ?? 'FREE';
  const isTeamLocked = !tierSatisfies(tier, 'TEAMS');
  const isEnterpriseLocked = !tierSatisfies(tier, 'ENTERPRISE');

  const LOCKED_TABS: Partial<Record<SettingsTab, { feature: string; label: string; prompt: string }>> = {
    ...(isTeamLocked ? { team: { feature: 'team', label: 'Team Management', prompt: 'Upgrade to Team for shared workspaces and governance' } } : {}),
    ...(isEnterpriseLocked ? { enterprise: { feature: 'enterprise', label: 'Enterprise Features', prompt: 'Enterprise feature — contact sales for audit trail, compliance, and governance' } } : {}),
  };

  // P4: permissions state. `defaultAutonomy` replaces the old yoloMode
  // binary — it's the inherited level new chat windows start at. Per-window
  // overrides in Chat's AutonomyPicker always beat this.
  type AutonomyLevel = 'normal' | 'trusted' | 'yolo';
  const [defaultAutonomy, setDefaultAutonomy] = useState<AutonomyLevel>('normal');
  const [externalGates, setExternalGates] = useState<string[]>([]);
  const [newGate, setNewGate] = useState('');
  // F18: pending in-app confirmation for the transition into `yolo` ("Never
  // ask"). Replaces the native window.confirm() with an inline confirm-row that
  // matches the app's visual language and is focus-trapped/testable in-idiom.
  const [pendingYolo, setPendingYolo] = useState(false);

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
  // Phase 4.1: GDPR Art. 17 erasure flow. Visible at all tiers — erasure
  // can't be tier-gated. Dialog handles the typed-phrase confirmation gate
  // + presents the receipt + relaunch instruction on success.
  const [showEraseDialog, setShowEraseDialog] = useState(false);
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
    }).catch(() => {});

    // P4: permissions now live on /api/settings/permissions (separate from
    // /api/settings). Load defaultAutonomy + externalGates here.
    adapter.getPermissions().then(p => {
      setDefaultAutonomy(p.defaultAutonomy);
      setExternalGates(p.externalGates);
    }).catch(() => {});

    adapter.getTeamStatus().then(s => setTeamConnected(s.connected)).catch(() => {});

    // M2-7: Load telemetry status. P7/D15 B5: this was the ONE loader missing a
    // .catch — a getTelemetryStatus rejection became an unhandled promise
    // rejection (its three siblings above all swallow). Match the local pattern.
    adapter.getTelemetryStatus().then(s => {
      setTelemetryEnabled(s.enabled);
      setTelemetryCount(s.totalEvents);
    }).catch(() => {});
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
      {/* Tab sidebar — tabs scroll; the density control is anchored to its foot
          (Wave P: it gates which tabs exist, so it lives with what it controls). */}
      <div className="w-36 border-r border-border/50 shrink-0 flex flex-col">
        <div className="flex-1 overflow-auto p-2 space-y-0.5" role="tablist" aria-label="Settings sections">
          {visibleTabs.map(tab => {
            const locked = LOCKED_TABS[tab.id];
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                role="tab"
                aria-selected={activeTab === tab.id}
                tabIndex={activeTab === tab.id ? 0 : -1}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${
                  activeTab === tab.id ? 'bg-primary/20 text-honey' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
                {locked && <Lock className="w-3 h-3 ml-auto text-muted-foreground/50" />}
              </button>
            );
          })}
        </div>

        {/* PR5 D6 / Wave P — the "Show" disclosure control. Anchored to the foot
            of the rail it governs (was a floating top-right segmented control).
            One dial governs both the dock and this Settings rail's depth; reuses
            useOnboarding().tier — no second key. */}
        <div className="border-t border-border/50 p-2 space-y-1.5">
          <span className="block px-0.5 text-[11px] font-medium text-muted-foreground">Show</span>
          {/* R9: a real bordered-track segmented control (was a bare stack that
              read as stray text) — one track, one filled active cell. Same aria +
              tier mechanics. */}
          <div
            className="flex flex-col gap-0.5 rounded-lg border border-[var(--line-soft)] bg-muted/40 p-1"
            role="group"
            aria-label="Settings detail level"
          >
            {([
              { id: 'simple', label: 'Essential' },
              { id: 'professional', label: 'Standard' },
              { id: 'power', label: 'Everything' },
            ] as const).map(opt => {
              const active = (onboardingState.tier || 'simple') === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => updateOnboarding({ tier: opt.id as UserTier })}
                  className={`w-full text-left px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                    active
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 overflow-auto" role="tabpanel">

        {/* ═══ GENERAL ═══ */}
        {activeTab === 'general' && (
          <div className="space-y-5">
            <h3 className="text-sm font-display font-semibold text-foreground">General</h3>

            {/* Tier. P1b D3-4: single-sourced from the resolved billing state
                (was a separate getSettings-fed copy that defaulted to 'FREE'
                on failure and could disagree with the Billing tab). Unresolved
                renders a neutral placeholder, never 'FREE plan' as fact. */}
            <div className="p-3 rounded-xl bg-secondary/30 border border-border/30">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-display font-medium text-foreground">Tier</p>
                  <p className="text-[11px] text-muted-foreground">
                    {billing.tierResolved ? `${TIER_LABELS[tier]} plan` : 'Confirming plan…'}
                  </p>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-display bg-primary/20 text-honey">
                  {billing.tierResolved ? TIER_LABELS[tier] : '…'}
                </span>
              </div>
            </div>

            {/* PR5 D10 — local-first reassurance + the dock/plan distinction. The
                disclosure selector that used to live here is now the "Show"
                control at the foot of the settings rail (D6/Wave P); QW-5's
                "dock tier ≠ billing plan" note is preserved here so the
                distinction isn't lost. */}
            <div className="p-3 rounded-xl bg-secondary/30 border border-border/30">
              <p className="text-xs font-display font-medium text-foreground mb-1">Local-first</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Waggle runs on your machine — your memory and data stay local, always. The <strong className="text-foreground">Show</strong> control (at the foot of the settings sidebar) sets how much of the app and these settings you see; it’s independent of your Pro/Teams plan, and every app stays reachable via Ctrl+K.
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

            {/* M2-7: Privacy & Telemetry — Phase 4.1: hidden at Essential per ux-disclosure-levels.md
              §"Settings at Essential" (telemetry surfaced only at Standard+, where the user is
              already opting into more advanced surface area). */}
            {userTier !== 'simple' && (
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
            )}

            {/* Phase 4.1: Erase All Data — visible at ALL tiers (GDPR Art. 17
                cannot be tier-gated, so this stays on General rather than
                moving to the Everything-only Advanced tab). Closes the only
                "roadmap NOT implemented" gap from
                docs/pilot/data-handling-policy.md § 7. Marker-file pattern
                means the click writes <dataDir>/.erase-pending.json and the
                destructive wipe runs at next service startup before any DB
                opens — see packages/server/src/local/data-erase-helpers.ts.
                F17: set apart in a bordered danger zone (the last thing in
                General) so it no longer reads as just another setting sitting
                directly under the theme picker. */}
            <section className="mt-1 p-3 rounded-xl border border-destructive/40 bg-destructive/5 space-y-3" data-testid="settings-danger-zone">
              <h3 className="text-xs font-display font-semibold text-destructive flex items-center gap-2">
                <Trash2 className="w-3.5 h-3.5" />
                Danger Zone · Erase All Data
              </h3>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Schedule a complete wipe of every memory frame, workspace, session, vault entry, and config file in your data dir. The wipe runs at next launch and is unrecoverable from the app — keep a recent <span className="font-mono">.waggle-backup</span> if you might want to restore. Data already sent to cloud providers or Teams servers is not erased — handle those separately per the data-handling policy.
              </p>
              <button
                onClick={() => setShowEraseDialog(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-destructive/30 text-destructive text-[11px] font-display font-medium hover:bg-destructive/10 transition-colors"
                data-testid="settings-erase-all-data"
              >
                <Trash2 className="w-3 h-3" />
                Erase all my data…
              </button>
            </section>
          </div>
        )}

        {/* ═══ MODELS ═══ */}
        {activeTab === 'models' && (
          <div className="space-y-5">
            {/* PR5 — the shared ModelGate leads Models: BYO cloud key (live-validated
                → vault) OR a local model, with the "≥1 working model" banner. onModelReady
                refreshes this app's provider list so ModelPilotCard + the key list below
                reflect a just-added key. */}
            <ModelGate variant="settings" onModelReady={() => { void refreshProviders(); }} />

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

            <SectionLabel>Model Configuration</SectionLabel>

            {/* Default model selector — from /api/providers */}
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">Default Model</label>
              <ModelSelector value={defaultModel} onChange={setDefaultModel} providers={providers} variant="dropdown" />
            </div>

            {/* CC Session A §2.2 — Phase 1 GEPA prompt shape selector */}
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">
                Prompt Shape
                <HintTooltip
                  content="Phase 1 GEPA-evolved prompt variant. Threaded into chat requests; sidecar honors it once the A3.1 server patch lands."
                >
                  <HelpCircle className="w-3 h-3 inline ml-1 text-muted-foreground" />
                </HintTooltip>
              </label>
              <select
                value={selectedShape}
                onChange={(e) => setSelectedShape(e.target.value as PromptShape)}
                className="w-full bg-muted/50 border border-border/30 rounded-lg px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
              >
                {AVAILABLE_SHAPES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground mt-1">
                {AVAILABLE_SHAPES.find((s) => s.id === selectedShape)?.description}
              </p>
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

            {/* Provider keys — Wave P: the per-provider status list repeated the
                ModelGate tile grid above 1:1, so it's collapsed to the Vault
                pointer (the padlock note is the whole zone now). */}
            <div className="border-t border-border/30 pt-4 space-y-3">
              <SectionLabel>Provider Keys</SectionLabel>
              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-primary/10 border border-primary/30">
                <Lock className="w-4 h-4 mt-0.5 text-honey shrink-0" />
                <p className="text-xs text-foreground leading-relaxed">
                  Keys live in the <strong className="text-honey">Vault</strong> — manage them above or in the <strong className="text-honey">Vault</strong> app from the dock.
                </p>
              </div>
            </div>

            {/* Search provider status */}
            <div className="border-t border-border/30 pt-4 space-y-2">
              <SectionLabel>Search Providers</SectionLabel>
              <p className="text-[11px] text-muted-foreground">Active: <strong>{activeSearch}</strong> (highest priority with a key)</p>
              <div className="space-y-1">
                {search.map(s => (
                  <div key={s.id} className="flex items-center gap-2 text-xs">
                    <span className="text-[11px] text-muted-foreground w-4">#{s.priority}</span>
                    <div className={`w-1.5 h-1.5 rounded-full ${s.hasKey ? 'bg-primary' : 'bg-muted-foreground/40'}`} />
                    <span className={s.hasKey ? 'text-foreground' : 'text-muted-foreground'}>{s.name}</span>
                    {!s.hasKey && s.id !== 'duckduckgo' && <span className="text-[11px] text-muted-foreground">No key</span>}
                    {s.id === 'duckduckgo' && <span className="text-[11px] text-muted-foreground">(free, always available)</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══ BILLING (PR7a — screen 14, themed over the REAL useBilling→Stripe flow) ═══ */}
        {activeTab === 'billing' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-display font-semibold text-foreground">Plan & Subscription</h3>
              {/* §14 load-bearing positioning copy — honestly satisfiable under the
                  ratified Option A (BYO-key + flat subscription): Pro/Teams unlock
                  scale, never feature-count paywalls on memory. */}
              <p className="text-[11px] text-[var(--text-muted)] mt-1">
                Memory is free forever. You only pay for scale — no feature-count games.
              </p>
            </div>

            {/* F4 from the 2026-05-28 addictiveness audit — visible value-prop
                framing so users see they're replacing 7-ish subscription tools,
                not adding an 8th. */}
            <CoverageCompassCard />

            {/* Current tier badge. F7: while the tier is unresolved (boot race /
                sidecar down) render an explicit unresolved state — NEVER the
                default 'FREE' as fact. */}
            {!billing.tierResolved ? (
              <div className="p-4 rounded-[14px] bg-[var(--surface-2)] border border-[var(--line-soft)]" data-testid="billing-tier-unresolved">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-display font-medium text-foreground">Current Plan</p>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                      {billing.error ? 'Couldn’t reach the server to confirm your plan — retrying automatically.' : 'Confirming your plan…'}
                    </p>
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-display font-semibold bg-muted text-muted-foreground">…</span>
                </div>
              </div>
            ) : (
            <div className="p-4 rounded-[14px] bg-[var(--surface)] border border-[var(--line-soft)]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-display font-medium text-foreground">Current Plan</p>
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                    {billing.tier === 'FREE' && 'Solo — every individual feature, free forever'}
                    {billing.tier === 'TRIAL' && 'Trial — 15 days of Team features, then Solo'}
                    {billing.tier === 'TEAMS' && '$49/mo per seat — shared workspaces, WaggleDance, governance'}
                    {billing.tier === 'ENTERPRISE' && 'Enterprise — KVARK sovereign deployment'}
                  </p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-display font-semibold ${
                  billing.tier === 'FREE' ? 'bg-muted text-muted-foreground' :
                  billing.tier === 'TRIAL' ? 'bg-[var(--honey-wash)] text-honey' :
                  billing.tier === 'TEAMS' ? 'bg-[var(--intel-wash)] text-[var(--intel)]' :
                  'bg-[var(--work-wash)] text-[var(--work)]'
                }`}>
                  {TIER_LABELS[tier]}
                </span>
              </div>
            </div>
            )}

            {/* Error display (F8 — honest, e.g. STRIPE_NOT_CONFIGURED 503; never a fake subscribe) */}
            {billing.error && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                <p className="text-[11px] text-destructive">{billing.error}</p>
              </div>
            )}

            {/* Syncing indicator */}
            {billing.syncing && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/10 border border-primary/20">
                <Loader2 className="w-3 h-3 animate-spin text-honey" />
                <p className="text-[11px] text-honey">Confirming your payment...</p>
              </div>
            )}

            {/* Plans grid — tiers that still have an upgrade path (FREE/TRIAL/PRO).
                Choosing a plan hands off to hosted Stripe Checkout (D5); the
                Monthly/Annual toggle resolves the REAL annual price (D8/F9), not
                a cosmetic client discount. Only on a RESOLVED tier (F7). */}
            {billing.tierResolved && (billing.tier === 'FREE' || billing.tier === 'TRIAL' || billing.tier === 'PRO') && (
              <PlanCards
                currentTier={billing.tier}
                onChoose={(tier, period) => billing.startCheckout(tier, period)}
                disabled={!billing.checkoutAvailable}
              />
            )}

            {/* Manage — paid tiers. Hosted Stripe Customer Portal launchpad (D6).
                The mock's invoice list / "VISA ···4242" / next-charge date are
                GATED OFF (F2/F3/F4) — there is no data source; the Portal is the
                real surface for payment method, invoices, plan change, cancel. */}
            {billing.tierResolved && (billing.tier === 'PRO' || billing.tier === 'TEAMS') && (
              <div className="p-5 rounded-[18px] bg-[var(--surface)] border border-[var(--honey-line)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[15px] font-display font-semibold text-foreground">Waggle {billing.tier === 'PRO' ? 'Pro (legacy)' : 'Team'}</p>
                    <p className="text-[12px] text-[var(--text-muted)] mt-0.5">Subscription managed securely via Stripe.</p>
                  </div>
                  <span className="text-[11.5px] font-[650] text-honey bg-[var(--honey-wash)] border border-[var(--honey-line)] px-3 py-1.5 rounded-full whitespace-nowrap">● Active</span>
                </div>
                <div className="mt-4 pt-4 border-t border-[var(--line-soft)]">
                  <button
                    onClick={() => billing.openPortal()}
                    className="flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-[650] rounded-[10px] bg-[var(--surface-2)] text-[var(--text-2)] border border-[var(--line-strong)] hover:border-[var(--honey-line)] hover:text-honey transition-colors"
                  >
                    <DollarSign className="w-3.5 h-3.5" />
                    Manage subscription
                  </button>
                  <p className="text-[11px] text-[var(--text-muted)] mt-2">
                    Update payment method, view invoices, switch to annual, or cancel — all via the Stripe customer portal.
                  </p>
                </div>
              </div>
            )}

            {/* Enterprise CTA — the KVARK funnel. Only on a RESOLVED tier (F7). */}
            {billing.tierResolved && billing.tier !== 'ENTERPRISE' && (
              <div className="p-4 rounded-[14px] bg-[var(--work-wash)] border border-[var(--line-soft)]">
                <p className="text-xs font-display font-medium text-[var(--work)]">Enterprise</p>
                <p className="text-[11px] text-[var(--text-muted)] mt-1">
                  Need sovereign deployment, audit trail, and KVARK integration?
                </p>
                <a
                  href="https://www.kvark.ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-2 text-[11px] text-[var(--work)] hover:text-honey underline"
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
                  // F18: `yolo` ("Never ask") auto-passes every mutating tool
                  // call — flag it so it gets danger styling when active and a
                  // one-time confirmation on the transition into it.
                  const isDanger = opt.value === 'yolo';
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => {
                        // F18: route the into-yolo transition through the inline
                        // confirm-row below instead of applying immediately.
                        if (requiresYoloConfirm(defaultAutonomy, opt.value)) {
                          setPendingYolo(true);
                          return;
                        }
                        setPendingYolo(false); // a safe selection cancels a pending Never-ask confirm
                        setDefaultAutonomy(opt.value);
                        handleSavePermissions({ defaultAutonomy: opt.value, externalGates });
                      }}
                      data-testid={`default-autonomy-${opt.value}`}
                      className={`w-full text-left flex items-start gap-2 px-2.5 py-2 rounded-lg border transition-colors ${
                        active
                          ? (isDanger ? 'bg-amber-500/15 border-amber-500/60' : 'bg-primary/15 border-primary/50')
                          : 'bg-muted/20 border-border/20 hover:border-border/40'
                      }`}
                    >
                      <div className={`mt-0.5 w-3.5 h-3.5 rounded-full border shrink-0 ${active ? (isDanger ? 'bg-amber-500 border-amber-500' : 'bg-primary border-primary') : 'border-muted-foreground/40'}`} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-display ${active ? (isDanger ? 'text-amber-300' : 'text-foreground') : 'text-foreground/80'}`}>{opt.label}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{opt.copy}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
              {/* F18: inline confirm-row for the into-"Never ask" transition —
                  replaces window.confirm() with an in-idiom, focus-visible,
                  testable step. Only the yolo path routes here (see onClick). */}
              {pendingYolo && (
                <div
                  role="alertdialog"
                  aria-labelledby="yolo-confirm-title"
                  className="mt-2 p-3 rounded-xl border border-amber-500/50 bg-amber-500/10 space-y-2"
                  data-testid="yolo-confirm-row"
                >
                  <p id="yolo-confirm-title" className="text-xs font-display font-semibold text-amber-300 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Turn on “Never ask”?
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Agents will auto-run every write, edit, and mutating tool call — including deletes — with no prompt (only a hardcoded critical blacklist still blocks). You can switch back any time.
                  </p>
                  <div className="flex items-center justify-end gap-2 pt-0.5">
                    <button
                      type="button"
                      onClick={() => setPendingYolo(false)}
                      className="px-3 py-1.5 rounded-lg text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                      data-testid="yolo-confirm-cancel"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDefaultAutonomy('yolo');
                        handleSavePermissions({ defaultAutonomy: 'yolo', externalGates });
                        setPendingYolo(false);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/60 text-amber-200 text-[11px] font-display font-semibold hover:bg-amber-500/30 transition-colors"
                      data-testid="yolo-confirm-accept"
                    >
                      Turn on Never ask
                    </button>
                  </div>
                </div>
              )}
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
              <Download className="w-4 h-4 text-honey" />
              <div>
                <p className="text-xs font-display font-medium text-foreground">Export Data</p>
                <p className="text-[11px] text-muted-foreground">Download all workspaces, sessions, and memory as a zip</p>
              </div>
            </button>
            <button className="flex items-center gap-2 w-full p-3 rounded-xl bg-secondary/30 border border-border/30 text-left hover:bg-secondary/50 transition-colors">
              <Upload className="w-4 h-4 text-honey" />
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
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-display rounded-lg bg-primary/20 text-honey hover:bg-primary/30 transition-colors">
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
              <TelegramDigestCard />
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
                  <GraduationCap className="w-4 h-4 text-honey shrink-0 mt-0.5" />
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
          <div className="mt-3 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-[11px] text-honey inline-block">
            {saveMsg}
          </div>
        )}
      </div>

      {/* Phase 4.1 erasure dialog — mounted at root so the modal layer
          escapes the settings tab content (z-[220] > all other surfaces). */}
      <EraseDataDialog open={showEraseDialog} onClose={() => setShowEraseDialog(false)} />
    </div>
  );
};

export default SettingsApp;
