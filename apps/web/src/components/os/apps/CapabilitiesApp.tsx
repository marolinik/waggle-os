import { useState, useEffect, useCallback } from 'react';
import { Package, Download, CheckCircle2, Shield, Star, Search, Loader2, Store, Grid3X3, List, FlaskConical, X, Plus, FileCode2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { adapter } from '@/lib/adapter';
import { useService } from '@/providers/ServiceProvider';
import type { SkillPack, Skill } from '@/lib/types';
import {
  describeTrust,
  summariseSkills,
} from '@/lib/skill-pack-display';
import { dedupePacks } from '@/lib/dedupe-packs';
import { HintTooltip } from '@/components/ui/hint-tooltip';
import SkillRow from './skills/SkillRow';
import SkillEditorDrawer from './skills/SkillEditorDrawer';
import SkillBuilder from './skills/SkillBuilder';
import InstallAuditPanel from './extend/InstallAuditPanel';

/**
 * Skills Hub (UX-Refactor Phase 3B, S06). Browse / install / author / test
 * reusable skills. PRD tab vocabulary: My Skills · Marketplace · Custom ·
 * Workspace, with Packs / Tools / Audit kept as secondary panels. Acceptance:
 * a user can understand what a skill does and what access it has.
 *  - Test = C37 PREVIEW-ONLY (injected prompt + parsed metadata, no LLM call).
 *  - Install = the per-source dispatcher (starter | pack | marketplace) —
 *    capability packs no longer mis-route through the starter installer.
 *  - The PRO tier gate stays load-bearing: 403 → 'waggle:tier-insufficient'
 *    → UpgradeModal.
 */

const trustBadges: Record<string, { color: string; icon: React.ElementType }> = {
  verified: { color: 'text-emerald-400', icon: CheckCircle2 },
  community: { color: 'text-sky-400', icon: Star },
  experimental: { color: 'text-amber-400', icon: Shield },
};

const categoryColors: Record<string, string> = {
  research: 'bg-violet-500/20 text-violet-400',
  writing: 'bg-amber-500/20 text-amber-400',
  planning: 'bg-sky-500/20 text-sky-400',
  team: 'bg-emerald-500/20 text-emerald-400',
  decision: 'bg-rose-500/20 text-rose-400',
};

/** Pack tagged with which installer owns it (per-source dispatcher). */
type CatalogPack = SkillPack & { installSource?: 'starter' | 'pack' };

type HubTab = 'my-skills' | 'marketplace' | 'custom' | 'workspace' | 'starter' | 'tools' | 'audit';

const TAB_LABELS: Record<HubTab, string> = {
  'my-skills': 'My Skills',
  marketplace: 'Marketplace',
  custom: 'Custom',
  workspace: 'Workspace',
  starter: 'Packs',
  tools: 'Tools',
  audit: 'Audit',
};

const TAB_HINTS: Record<HubTab, string> = {
  'my-skills': 'Every skill installed on this machine — test or edit any of them',
  marketplace: 'The Marketplace is now ONE consolidated surface in the Extend zone — this tab points there.',
  custom: 'Skills you authored locally (not from any catalog)',
  workspace: 'Workspace-scoped skills (scope metadata lands with the backend ?scope= filter)',
  starter: 'Curated skill packs that ship with Waggle — starter packs + capability packs',
  tools: 'Low-level tools agents can call (read_file, bash, etc.). Waggle selects only the relevant set for each task.',
  audit: 'Install / uninstall history — who added what and when',
};

const CapabilitiesApp = () => {
  // Cold-load race guard (same fix as HomeCockpit): wait for the adapter's
  // initial connect() to settle so a restored window doesn't fire authed
  // catalog calls before the session token exists.
  const { connecting } = useService();
  const [packs, setPacks] = useState<CatalogPack[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [installing, setInstalling] = useState<string | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  const [tab, setTab] = useState<HubTab>('my-skills');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [testResult, setTestResult] = useState<{ name: string; preview: string; metadata?: Record<string, unknown> } | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  /** §D2 — name of the skill currently being run-and-graded by the audit loop. */
  const [verifying, setVerifying] = useState<string | null>(null);
  /** M-45 / P29 — pack detail drawer target. Null when closed. */
  const [selectedPack, setSelectedPack] = useState<SkillPack | null>(null);
  const [editingSkill, setEditingSkill] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  /** C37 preview-only test via the 3A :id route — no execution, no LLM call. */
  const handleTestSkill = async (skillName: string) => {
    setTesting(skillName);
    try {
      const res = await adapter.testSkill(skillName);
      setTestResult({ name: skillName, preview: res.wouldInject ?? 'No preview available', metadata: res.skill });
    } catch (err) {
      // Surface the failure in the preview panel — a silent stop on a
      // first-class row action reads as a dead button.
      const message = err instanceof Error ? err.message : 'server unreachable';
      setTestResult({ name: skillName, preview: `Preview unavailable — ${message}` });
    }
    finally { setTesting(null); }
  };

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.allSettled([
      adapter.getSkills(),
      adapter.getStarterPacks(),
      adapter.getMarketplacePacks(),
      adapter.getCapabilityPacks(),
    ])
      .then(([skillsRes, starters, marketplace, caps]) => {
        // Build set of installed skill names + every catalog-known skill name
        // (catalog ids AND their bundled skill lists) so user-authored skills
        // can be told apart (Custom tab). Marketplace packs get their own set
        // so marketplace-installed skills classify as 'marketplace', never as
        // "skills you authored locally".
        const installedNames = new Set<string>();
        const catalogNames = new Set<string>();
        const marketplaceNames = new Set<string>();
        if (skillsRes.status === 'fulfilled') {
          skillsRes.value.forEach(s => installedNames.add(s.id || s.name));
        }

        // Mark starters and caps as installed if they match, tagging each pack
        // with the installer that owns it (starter-pack vs capability-pack).
        const all: CatalogPack[] = [];
        if (starters.status === 'fulfilled') {
          starters.value.forEach(s => {
            catalogNames.add(s.id || s.name);
            (s.skills ?? []).forEach(n => catalogNames.add(n));
            all.push({ ...s, id: s.id || s.name, installed: installedNames.has(s.id || s.name) || s.installed, installSource: 'starter' });
          });
        }
        if (caps.status === 'fulfilled') {
          caps.value.forEach(s => {
            catalogNames.add(s.id || s.name);
            (s.skills ?? []).forEach(n => catalogNames.add(n));
            all.push({ ...s, id: s.id || s.name, installed: installedNames.has(s.id || s.name) || s.installed, installSource: 'pack' });
          });
        }
        // L-17 C4 — de-dup by id||name (the catalogs can overlap).
        setPacks(dedupePacks(all) as CatalogPack[]);
        if (marketplace.status === 'fulfilled') {
          // Phase 4B: the marketplace pack GRID moved to the consolidated S21
          // surface; the catalog stays load-bearing here for classification.
          marketplace.value.forEach(p => {
            marketplaceNames.add(p.id || p.name);
            (p.skills ?? []).forEach(n => marketplaceNames.add(n));
          });
        }

        // 'custom' is a DERIVED claim ("not in any catalog") — it is only safe
        // when every catalog actually loaded. On a partial catalog failure
        // degrade to 'installed' instead of mislabeling everything custom.
        const catalogsKnown = starters.status === 'fulfilled'
          && caps.status === 'fulfilled'
          && marketplace.status === 'fulfilled';

        if (skillsRes.status === 'fulfilled') {
          setSkills(skillsRes.value.map((s) => {
            const name = s.id || s.name;
            const meta = s as SkillPack & { preview?: string; initiator?: 'agent' | 'user' | 'built-in'; source?: string; verified?: boolean; confidence?: number };
            return {
              name,
              preview: meta.preview,
              // §D2: the run-and-grade "verified" badge rides the same GET /api/skills row.
              verified: meta.verified === true,
              confidence: meta.confidence,
              // P5/D4: agent provenance is authoritative — an agent-authored skill
              // is badged regardless of catalog membership.
              initiator: meta.initiator ?? 'user',
              source: meta.source,
              // Review #5: agent provenance supersedes the name-heuristic 'custom'
              // class (D4(iv)) — an agent skill reads as 'installed' + carries the
              // 'agent · review' badge, never the user-authored 'custom' label.
              status: meta.initiator === 'agent' || !catalogsKnown || catalogNames.has(name)
                ? 'installed'
                : (marketplaceNames.has(name) ? 'marketplace' : 'custom'),
            } satisfies Skill;
          }));
        } else {
          setError('Failed to load skills — server may be unreachable');
        }
      })
      .finally(() => setLoading(false));
  }, []);

  // Defer until the adapter's initial connect attempt has settled (gates on
  // `connecting`, not `connected`, so a failed connect still reaches the
  // error/Retry UI instead of a permanent skeleton).
  useEffect(() => {
    if (connecting) return;
    load();
  }, [load, connecting]);

  /**
   * §D2 — run the run-and-grade audit for ONE skill (scoped POST = a few LLM
   * calls), then reload so a freshly-minted "verified" badge appears. A 403
   * (non-PRO tier) throws AdapterHttpError and is routed to the UpgradeModal by
   * the fetch chokepoint; any other failure surfaces in the result panel.
   */
  const handleVerifySkill = async (skillName: string) => {
    setVerifying(skillName);
    try {
      const { report } = await adapter.auditSkills([skillName]);
      const verdict = report.verified.includes(skillName)
        ? 'verified ✓'
        : report.flagged.includes(skillName) ? 'flagged for review (injection)'
        : report.inconclusive.includes(skillName) ? 'inconclusive — try again'
        : 'did not pass verification';
      setTestResult({ name: skillName, preview: `Audit result: ${verdict}` });
      load(); // refresh the badge
    } catch (err) {
      const message = err instanceof Error ? err.message : 'server unreachable';
      setTestResult({ name: skillName, preview: `Verification unavailable — ${message}` });
    }
    finally { setVerifying(null); }
  };

  // Shared 403→UpgradeModal routing. Other errors fall through to the caller
  // so they can show a toast or inline state without duplicating tier logic.
  const handleInstallError = (err: unknown, packName: string): boolean => {
    const e = err as { status?: number; message?: string; body?: { required?: string; actual?: string } };
    if (e.status === 403) {
      window.dispatchEvent(new CustomEvent('waggle:tier-insufficient', {
        detail: {
          required: e.body?.required ?? 'TEAMS',
          actual: e.body?.actual ?? 'FREE',
          message: `Installing "${packName}" needs the Team plan or an active trial.`,
        },
      }));
      return true;
    }
    return false;
  };

  /** Per-source install dispatcher (3A): starter-pack ids install via the
   *  starter route, capability-pack ids via the pack route. A pack install
   *  with per-skill failures comes back 422 — surfaced inline, not swallowed. */
  const handleInstall = async (pack: CatalogPack) => {
    const packId = pack.id || pack.name;
    setInstalling(packId);
    setInstallError(null);
    try {
      await adapter.installSkill(packId, pack.installSource ?? 'starter');
      setPacks(prev => prev.map(p => (p.id || p.name) === packId ? { ...p, installed: true } : p));
      // Reconcile the per-skill list (My Skills/Custom + classification) —
      // the optimistic pack flip alone leaves freshly installed skills
      // invisible until the window is reopened.
      load();
    } catch (err) {
      if (!handleInstallError(err, packId)) {
        setInstallError(err instanceof Error ? err.message : `Failed to install "${packId}"`);
      }
    } finally { setInstalling(null); }
  };

  const q = search.toLowerCase();
  // Phase 4B (S21 consolidation): the Marketplace tab no longer renders its
  // own pack grid — it points at the single Marketplace surface. The
  // getMarketplacePacks read above stays load-bearing for skill classification.
  const filtered = packs.filter(p =>
    (p.name ?? '').toLowerCase().includes(q) ||
    (p.description ?? '').toLowerCase().includes(q)
  );
  const skillRows = (tab === 'custom' ? skills.filter(s => s.status === 'custom') : skills)
    .filter(s => !q || s.name.toLowerCase().includes(q) || (s.preview ?? '').toLowerCase().includes(q));

  const isSkillTab = tab === 'my-skills' || tab === 'custom' || tab === 'workspace';
  const isPackTab = tab === 'starter';

  const PackCard = ({ pack, onInstall }: { pack: CatalogPack; onInstall: (pack: CatalogPack) => void }) => {
    const trust = trustBadges[pack.trust] || trustBadges.community;
    const TrustIcon = trust.icon;
    return (
      <button
        type="button"
        onClick={() => setSelectedPack(pack)}
        data-testid="skill-pack-card"
        className="w-full text-left p-3 rounded-xl bg-secondary/30 border border-border/30 hover:border-primary/40 hover:bg-secondary/50 transition-colors"
      >
        <div className="flex items-start justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-honey" />
            <span className="text-sm font-display font-medium text-foreground">{pack.name}</span>
          </div>
          <TrustIcon className={`w-3 h-3 ${trust.color}`} />
        </div>
        <p className="text-xs text-muted-foreground mb-2">{pack.description}</p>
        {pack.skills && pack.skills.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {pack.skills.slice(0, 3).map(s => (
              <HintTooltip key={s} content={`Preview skill: ${s} (nothing executes)`}>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleTestSkill(s); }}
                  disabled={testing === s}
                  className="px-1.5 py-0.5 rounded text-[11px] bg-muted text-muted-foreground hover:bg-primary/20 hover:text-honey transition-colors"
                >
                  {testing === s ? '...' : s}
                </button>
              </HintTooltip>
            ))}
            {pack.skills.length > 3 && <span className="text-[11px] text-muted-foreground">+{pack.skills.length - 3}</span>}
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className={`px-2 py-0.5 rounded text-[11px] font-display capitalize ${categoryColors[pack.category] || 'bg-muted text-muted-foreground'}`}>
            {pack.category}
          </span>
          {pack.installed ? (
            <span className="text-[11px] text-emerald-400 flex items-center gap-0.5"><CheckCircle2 className="w-3 h-3" /> Installed</span>
          ) : (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onInstall(pack); }}
              disabled={installing === (pack.id || pack.name)}
              className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-lg bg-primary/20 text-honey hover:bg-primary/30 disabled:opacity-50 transition-colors"
            >
              {installing === pack.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
              Install
            </button>
          )}
        </div>
      </button>
    );
  };

  // M-45 / P29 — detail drawer content. Rendered as a fixed overlay so
  // it doesn't affect list layout.
  const PackDetail = ({ pack }: { pack: CatalogPack }) => {
    const trust = describeTrust(pack.trust);
    return (
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm flex items-center justify-center p-6"
        onClick={() => setSelectedPack(null)}
        data-testid="skill-pack-detail-backdrop"
      >
        <div
          className="w-full max-w-lg bg-card border border-border rounded-2xl shadow-xl p-5 space-y-4"
          onClick={(e) => e.stopPropagation()}
          data-testid="skill-pack-detail"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Package className="w-5 h-5 text-honey shrink-0" />
              <h3 className="text-base font-display font-semibold text-foreground truncate">{pack.name}</h3>
            </div>
            <button
              type="button"
              onClick={() => setSelectedPack(null)}
              className="p-1 rounded hover:bg-muted/50 text-muted-foreground"
              aria-label="Close detail"
              data-testid="skill-pack-detail-close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-sm text-foreground/90">{pack.description || 'No description provided.'}</p>
          <div className="flex flex-wrap gap-2 text-[11px]">
            <span className={`px-2 py-0.5 rounded font-display capitalize ${categoryColors[pack.category] || 'bg-muted text-muted-foreground'}`}>
              {pack.category || 'uncategorised'}
            </span>
            <HintTooltip content={trust.explainer}>
              <span className="px-2 py-0.5 rounded font-display bg-muted/50 text-muted-foreground" tabIndex={0}>
                {trust.label}
              </span>
            </HintTooltip>
            <span className="px-2 py-0.5 rounded font-display bg-muted/50 text-muted-foreground">
              {summariseSkills(pack.skills)}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground">{trust.explainer}</p>
          {pack.skills && pack.skills.length > 0 && (
            <div>
              <p className="text-[11px] font-display uppercase tracking-wide text-muted-foreground mb-1.5">Bundled skills</p>
              <div className="flex flex-wrap gap-1">
                {pack.skills.map(s => (
                  <HintTooltip key={s} content={`Preview skill: ${s} (nothing executes)`}>
                    <button
                      type="button"
                      onClick={() => { handleTestSkill(s); }}
                      disabled={testing === s}
                      className="px-2 py-0.5 rounded text-[11px] bg-muted text-muted-foreground hover:bg-primary/20 hover:text-honey transition-colors"
                    >
                      {testing === s ? '...' : s}
                    </button>
                  </HintTooltip>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-center justify-end gap-2 pt-1">
            {pack.installed ? (
              <span className="text-[11px] text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Installed</span>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setSelectedPack(null);
                  void handleInstall(pack);
                }}
                disabled={installing === (pack.id || pack.name)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 disabled:opacity-50 transition-colors font-display"
                data-testid="skill-pack-detail-install"
              >
                <Download className="w-3 h-3" /> Install
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="h-full overflow-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-display font-semibold text-foreground">Skills Hub</h2>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
            data-testid="skills-hub-create"
          >
            <Plus className="w-3 h-3" /> Create Skill
          </button>
          <button
            onClick={() => setViewMode('grid')}
            aria-label="Grid view"
            className={`p-1 rounded transition-colors ${viewMode === 'grid' ? 'text-honey' : 'text-muted-foreground'}`}
          >
            <Grid3X3 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            aria-label="List view"
            className={`p-1 rounded transition-colors ${viewMode === 'list' ? 'text-honey' : 'text-muted-foreground'}`}
          >
            <List className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Tabs — PRD primary vocabulary + secondary panels */}
      <div className="flex gap-1 mb-4 p-0.5 rounded-lg bg-muted/50 w-fit flex-wrap" role="tablist" aria-label="Skills Hub sections">
        {(Object.keys(TAB_LABELS) as HubTab[]).map(t => (
          <HintTooltip key={t} content={TAB_HINTS[t]}>
            <button
              onClick={() => setTab(t)}
              role="tab"
              aria-selected={tab === t}
              tabIndex={tab === t ? 0 : -1}
              className={`px-3 py-1.5 text-xs rounded-md font-display transition-colors ${
                tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t === 'marketplace' && <Store className="w-3 h-3 inline mr-1" />}
              {TAB_LABELS[t]}
            </button>
          </HintTooltip>
        ))}
      </div>

      <div className="flex items-center gap-1.5 bg-muted/50 rounded-lg border border-[var(--line)] px-2 py-1.5 mb-4 transition-colors focus-within:border-[var(--honey-line)] focus-within:shadow-[var(--shadow-honey)]">
        <Search className="w-3.5 h-3.5 text-muted-foreground" />
        <Input
          aria-label="Search skills"
          name="skillSearch"
          autoComplete="off"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search skills..."
          className="flex-1 bg-transparent text-xs border-0 p-0 h-auto focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      </div>

      {installError && (
        <div role="alert" className="mb-3 flex items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1.5">
          <span className="text-[11px] text-destructive">{installError}</span>
          <button onClick={() => setInstallError(null)} aria-label="Dismiss install error" className="shrink-0 text-muted-foreground hover:text-foreground"><X className="w-3 h-3" /></button>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12" role="status" aria-live="polite">
          <Loader2 className="w-6 h-6 text-honey animate-spin" />
        </div>
      )}

      {/* Per-skill tabs: My Skills / Custom / Workspace */}
      {!loading && isSkillTab && (
        tab === 'workspace' ? (
          <div className="text-center py-8">
            <FileCode2 className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No workspace-scoped skills to show.</p>
            <p className="text-[11px] text-muted-foreground/70 mt-1 max-w-sm mx-auto">
              Skills declaring <code className="font-mono">scope: workspace</code> will appear here once the
              backend exposes scope metadata.
            </p>
          </div>
        ) : error && skillRows.length === 0 ? (
          <div role="alert" className="text-center py-8">
            <p className="text-xs text-destructive mb-2">{error}</p>
            <button onClick={() => load()} className="text-xs text-honey hover:underline">Retry</button>
          </div>
        ) : skillRows.length === 0 ? (
          <div className="text-center py-8" role="status">
            <FileCode2 className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">
              {tab === 'custom'
                ? (q ? 'No custom skills match your search.' : 'No custom skills yet — Create Skill to author one.')
                : (q ? 'No skills match your search.' : 'No skills installed yet — browse Packs or the Marketplace.')}
            </p>
          </div>
        ) : (
          <ul className="space-y-1">
            {skillRows.map(s => (
              <SkillRow
                key={s.name}
                skill={s}
                testing={testing === s.name}
                verifying={verifying === s.name}
                onTest={(sk) => void handleTestSkill(sk.name)}
                onEdit={(sk) => setEditingSkill(sk.name)}
                onVerify={(sk) => void handleVerifySkill(sk.name)}
              />
            ))}
          </ul>
        )
      )}

      {/* Marketplace tab — Phase 4B (S21): points at the ONE consolidated
          Marketplace surface instead of duplicating its grid here. */}
      {tab === 'marketplace' && (
        <div className="text-center py-10 max-w-sm mx-auto" data-testid="marketplace-pointer">
          <Store className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-xs text-foreground font-display font-medium mb-1">The Marketplace has moved</p>
          <p className="text-[11px] text-muted-foreground mb-3">
            Skills, agents, connectors, MCPs, models and templates now live in one consolidated
            Marketplace under the dock&rsquo;s Extend zone.
          </p>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('waggle:open-app', { detail: { appId: 'marketplace' } }))}
            className="px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 transition-colors font-display"
          >
            Open Marketplace
          </button>
        </div>
      )}

      {/* Pack tab: starter + capability packs */}
      {isPackTab && (
        <>
          <div className={viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 gap-2' : 'space-y-2'}>
            {filtered.map((pack, index) => (
              <PackCard
                key={`${pack.id || pack.name}-${pack.category || 'uncategorized'}-${index}`}
                pack={pack}
                onInstall={(p) => void handleInstall(p)}
              />
            ))}
          </div>
          {!loading && filtered.length === 0 && (
            <div className="text-center py-8">
              <Package className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">No catalog packs found</p>
            </div>
          )}
        </>
      )}

      {/* Tools tab — representative, read-only overview of agent capabilities */}
      {tab === 'tools' && (
        <div className="space-y-3">
          <p className="text-[11px] text-muted-foreground mb-3">
            These are common built-in tools. Waggle gives the model a compact, task-specific set instead of loading every tool at once. Some require workspace access, an active connection, a Vault credential, or approval before they can run.
          </p>
          {[
            { category: 'File Operations', tools: ['read_file', 'write_file', 'edit_file', 'multi_edit', 'search_files'], desc: 'Read, write, edit, and find files in the workspace' },
            { category: 'Code & Shell', tools: ['bash', 'search_content', 'run_code', 'get_task_output', 'kill_task'], desc: 'Run commands or code, search content, and manage background tasks' },
            { category: 'Web & Search', tools: ['web_search', 'web_fetch', 'perplexity_search', 'tavily_search', 'brave_search'], desc: 'Search the web, fetch pages, get real-time information' },
            { category: 'Memory', tools: ['save_memory', 'search_memory', 'get_awareness', 'query_knowledge'], desc: 'Remember facts, search past conversations, and query workspace knowledge' },
            { category: 'Documents', tools: ['generate_docx', 'generate_pdf', 'generate_xlsx', 'generate_pptx'], desc: 'Create Word, PDF, spreadsheet, and presentation files' },
            { category: 'Git', tools: ['git_status', 'git_diff', 'git_log', 'git_branch', 'git_commit', 'git_push'], desc: 'Inspect and manage workspace version control' },
            { category: 'Planning', tools: ['create_plan', 'add_plan_step', 'execute_step', 'show_plan'], desc: 'Break down tasks, record results, and track step status' },
            { category: 'Skills', tools: ['list_skills', 'read_skill', 'search_skills', 'create_skill', 'suggest_skill'], desc: 'Discover, inspect, and create reusable skills' },
            { category: 'Agents', tools: ['spawn_agent', 'list_agents', 'get_agent_result'], desc: 'Launch specialists, coordinate parallel work, and collect results' },
            { category: 'Browser (optional)', tools: ['browser_navigate', 'browser_snapshot', 'browser_screenshot', 'browser_click', 'browser_fill', 'browser_evaluate'], desc: 'Requires an optional Playwright runtime; not included in Windows Solo' },
            { category: 'Connectors', tools: ['find_connector', 'list_connector_categories'], desc: 'Discover integrations; connected services add their own task-specific actions' },
          ].map(group => (
            <div key={group.category} className="p-2.5 rounded-lg bg-secondary/30 border border-border/30">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-display font-medium text-foreground">{group.category}</span>
                <span className="text-[11px] text-muted-foreground">{group.tools.length} tool{group.tools.length > 1 ? 's' : ''}</span>
              </div>
              <p className="text-[11px] text-muted-foreground mb-1.5">{group.desc}</p>
              <div className="flex flex-wrap gap-1">
                {group.tools.map(t => (
                  <span key={t} translate="no" className="px-1.5 py-0.5 text-[11px] rounded bg-muted/50 text-muted-foreground font-mono">{t}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {/* Audit tab — the C18 shared install-audit feed (Phase 4B). The feed
          spans EVERY capability type, so the copy says so and the type
          filter is exposed (claiming "skills and packs" over a mixed feed
          would be dishonest). */}
      {tab === 'audit' && (
        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground">Capability install history — skills, packs, MCPs, connectors and marketplace packages. Filter by type.</p>
          <InstallAuditPanel showFilter limit={25} />
        </div>
      )}

      {/* M-45 / P29 — pack detail drawer */}
      {selectedPack && <PackDetail pack={selectedPack} />}

      {/* Skill markdown editor (PATCH /api/skills/:id) */}
      <SkillEditorDrawer
        skillName={editingSkill}
        onOpenChange={(o) => { if (!o) setEditingSkill(null); }}
        onSaved={() => load()}
      />

      {/* S19 Skill Builder (Phase 3C) — create lands in My Skills and opens
          the editor drawer so the new skill is immediately inspectable. */}
      {showCreate && (
        <SkillBuilder
          onCreated={(name) => { setShowCreate(false); load(); setEditingSkill(name); }}
          // Refresh on close too: the C14 partial-failure path creates the
          // skill on disk even when the user Escapes/Cancels instead of
          // pressing Done — the Hub must reflect the file that now exists.
          onCancel={() => { setShowCreate(false); load(); }}
          onTierError={handleInstallError}
        />
      )}

      {/* Skill Test Preview — C37: preview only, nothing executes */}
      {testResult && (
        <div className="border-t border-border/30 p-3 max-h-48 overflow-auto bg-muted/30" data-testid="skill-test-preview">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <FlaskConical className="w-3.5 h-3.5 text-honey" />
              <span className="text-xs font-display font-medium text-foreground">Test: {testResult.name}</span>
              <span className="text-[10px] text-muted-foreground">Preview only — nothing was executed</span>
            </div>
            <button onClick={() => setTestResult(null)} aria-label="Close test preview" className="p-0.5 rounded hover:bg-muted/50">
              <X className="w-3 h-3 text-muted-foreground" />
            </button>
          </div>
          <pre className="text-[11px] font-mono text-muted-foreground whitespace-pre-wrap leading-relaxed">{testResult.preview.slice(0, 500)}{testResult.preview.length > 500 ? '...' : ''}</pre>
        </div>
      )}
    </div>
  );
};

export default CapabilitiesApp;
