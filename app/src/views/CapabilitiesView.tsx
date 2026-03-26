/**
 * CapabilitiesView — Top-level view surfacing capability packs, marketplace
 * browsing with search/filter/sort, and individual skills.
 *
 * Wave 1.7: Promoted from buried Settings tab to top-level navigation.
 * Task A2: Pack reconciliation — Recommended (5 Waggle packs) + Community
 *          (marketplace packs) tiers with bulk install + progress tracking.
 * Wave 9A: Marketplace polish — search filters, install badges, uninstall,
 *          type/category/sort chips, improved UX.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { InstallCenter } from '@waggle/ui';
import { getServerBaseUrl, authFetch } from '../lib/ipc';

// ── Types ────────────────────────────────────────────────────────────────

interface PackSkillState {
  id: string;
  state: string;
}

interface PackEntry {
  id: string;
  name: string;
  description: string;
  skills: string[];
  skillStates: PackSkillState[];
  packState: 'available' | 'incomplete' | 'complete';
  installedCount: number;
  totalCount: number;
}

/** Shape returned by GET /api/marketplace/packs */
export interface MarketplacePackSummary {
  id: number;
  slug: string;
  display_name: string;
  description: string;
  target_roles: string;
  icon: string;
  priority: 'core' | 'recommended' | 'optional';
  connectors_needed: string[];
  created_at: string;
}

/** Shape returned by GET /api/marketplace/packs/:slug */
export interface MarketplacePackDetail {
  pack: MarketplacePackSummary;
  packages: MarketplacePackageEntry[];
}

export interface MarketplacePackageEntry {
  id: number;
  name: string;
  display_name: string;
  description: string;
  waggle_install_type: 'skill' | 'plugin' | 'mcp';
  category: string;
}

/** Package shape from GET /api/marketplace/search (annotated with installed) */
export interface MarketplaceSearchPackage {
  id: number;
  name: string;
  display_name: string;
  description: string;
  author: string;
  waggle_install_type: 'skill' | 'plugin' | 'mcp';
  category: string;
  stars: number;
  downloads: number;
  rating: number;
  rating_count: number;
  version: string;
  installed: boolean;
  updated_at: string;
}

/** Search result shape from GET /api/marketplace/search */
export interface MarketplaceSearchResult {
  packages: MarketplaceSearchPackage[];
  total: number;
  facets: {
    types: Record<string, number>;
    categories: Record<string, number>;
    sources: Record<string, number>;
  };
}

/** Bulk install progress state for a single community pack */
export interface BulkInstallProgress {
  installing: boolean;
  current: number;
  total: number;
  currentName: string;
  errors: string[];
  done: boolean;
}

// ── Filter types ─────────────────────────────────────────────────────────

type InstallTypeFilter = 'all' | 'skill' | 'plugin' | 'mcp';
type SortOption = 'relevance' | 'popular' | 'updated' | 'name';

// ── Helpers (exported for testing) ───────────────────────────────────────

export function createInitialProgress(): BulkInstallProgress {
  return { installing: false, current: 0, total: 0, currentName: '', errors: [], done: false };
}

export function priorityLabel(priority: string): string {
  switch (priority) {
    case 'core': return 'Core';
    case 'recommended': return 'Recommended';
    case 'optional': return 'Optional';
    default: return priority;
  }
}

export function priorityColor(priority: string): string {
  switch (priority) {
    case 'core': return 'text-primary';
    case 'recommended': return 'text-blue-500';
    case 'optional': return 'text-muted-foreground';
    default: return 'text-muted-foreground';
  }
}

export function installTypeLabel(type: string): string {
  switch (type) {
    case 'skill': return 'Skill';
    case 'plugin': return 'Plugin';
    case 'mcp': return 'MCP Server';
    default: return type;
  }
}

export function installTypeColor(type: string): string {
  switch (type) {
    case 'skill': return 'text-green-500';
    case 'plugin': return 'text-blue-500';
    case 'mcp': return 'text-primary';
    default: return 'text-muted-foreground';
  }
}

export function formatDownloads(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

// ── Tailwind helper: install-type badge colors by type ────────────────────

function installTypeBadgeClasses(type: string): string {
  switch (type) {
    case 'skill': return 'bg-green-500/10 text-green-500 border-green-500/20';
    case 'plugin': return 'bg-primary/10 text-primary border-primary/20';
    case 'mcp': return 'bg-primary/10 text-primary border-primary/20';
    default: return 'bg-muted/10 text-muted-foreground border-border';
  }
}

// ── Tailwind helper: status badge classes ──────────────────────────────────

function statusBadgeClasses(state: string): string {
  if (state === 'complete' || state === 'installed') {
    return 'bg-green-500/15 text-green-500';
  }
  if (state === 'incomplete') {
    return 'bg-yellow-600/15 text-yellow-600';
  }
  return 'bg-primary/15 text-primary';
}

// ── Tailwind helper: skill dot color ──────────────────────────────────────

function skillDotClasses(state: string): string {
  if (state === 'active') return 'bg-green-500';
  if (state === 'installed') return 'bg-primary';
  return 'bg-muted-foreground/60';
}

function skillLabelClasses(state: string): string {
  if (state === 'active') return 'text-green-500';
  if (state === 'installed') return 'text-primary';
  return 'text-muted-foreground';
}

// ── Post-install example prompts per category ────────────────────────────

const INSTALL_GUIDE_PROMPTS: Record<string, string[]> = {
  research_analyst: ['Research [topic]', 'Compare [A] vs [B]'],
  research: ['Research [topic]', 'Compare [A] vs [B]'],
  document_master: ['Draft a [document type]', 'Review this contract'],
  document: ['Draft a [document type]', 'Review this contract'],
  writing: ['Draft a [document type]', 'Review this contract'],
  developer_workspace: ['Review this code', 'Find bugs in [file]'],
  developer: ['Review this code', 'Find bugs in [file]'],
  coding: ['Review this code', 'Find bugs in [file]'],
  collaboration_hub: ['Set up my Slack integration', 'Check my GitHub notifications'],
  collaboration: ['Set up my Slack integration', 'Check my GitHub notifications'],
  productivity: ['Create a daily standup summary', 'Organize my tasks'],
  analytics: ['Analyze this dataset', 'Create a dashboard for [metric]'],
  security: ['Audit this configuration', 'Check for vulnerabilities'],
};

function getGuidePrompts(category: string): string[] {
  const lower = category.toLowerCase().replace(/[^a-z_]/g, '_');
  return INSTALL_GUIDE_PROMPTS[lower]
    ?? INSTALL_GUIDE_PROMPTS[lower.split('_')[0]]
    ?? ['Ask your agent to use this new capability', 'Type /skills to see what changed'];
}

// ── Star rating display helper ───────────────────────────────────────────

function renderStarRating(rating: number): string {
  const full = Math.floor(rating);
  const remainder = rating - full;
  let stars = '';
  for (let i = 0; i < 5; i++) {
    if (i < full) stars += '\u2605';        // filled star
    else if (i === full && remainder >= 0.5) stars += '\u2605'; // half rounds up
    else stars += '\u2606';                   // empty star
  }
  return stars;
}

// ── Props ─────────────────────────────────────────────────────────────────

interface CapabilitiesViewProps {
  /** Navigate to another view, optionally with a settings tab target */
  onNavigate?: (view: string, tab?: string) => void;
}

// ── Component ────────────────────────────────────────────────────────────

export default function CapabilitiesView({ onNavigate }: CapabilitiesViewProps) {
  const [activeTab, setActiveTab] = useState<'recommended' | 'browse'>('recommended');

  // ── Create Skill panel state ──
  const [showCreateSkill, setShowCreateSkill] = useState(false);
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillDescription, setNewSkillDescription] = useState('');
  const [newSkillSteps, setNewSkillSteps] = useState<string[]>(['']);
  const [newSkillCategory, setNewSkillCategory] = useState('general');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  // ── Recommended packs (existing 5 Waggle packs) ──
  const [packs, setPacks] = useState<PackEntry[]>([]);
  const [packsLoading, setPacksLoading] = useState(true);
  const [installingPack, setInstallingPack] = useState<string | null>(null);
  const [packError, setPackError] = useState<string | null>(null);
  const [fetchFailed, setFetchFailed] = useState(false);

  // ── Community packs (marketplace) ──
  const [communityPacks, setCommunityPacks] = useState<MarketplacePackSummary[]>([]);
  const [communityLoading, setCommunityLoading] = useState(true);
  const [communityError, setCommunityError] = useState<string | null>(null);
  const [communityInstallProgress, setCommunityInstallProgress] = useState<Record<string, BulkInstallProgress>>({});
  const [installedSlugs, setInstalledSlugs] = useState<Set<string>>(new Set());

  // ── Marketplace search/browse state ──
  const [marketplacePackages, setMarketplacePackages] = useState<MarketplaceSearchPackage[]>([]);
  const [marketplaceLoading, setMarketplaceLoading] = useState(false);
  const [marketplaceError, setMarketplaceError] = useState<string | null>(null);
  const [marketplaceFacets, setMarketplaceFacets] = useState<MarketplaceSearchResult['facets'] | null>(null);
  const [marketplaceTotal, setMarketplaceTotal] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<InstallTypeFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortOption, setSortOption] = useState<SortOption>('popular');
  const [installingPackageId, setInstallingPackageId] = useState<number | null>(null);
  const [uninstallingPackageId, setUninstallingPackageId] = useState<number | null>(null);

  // ── Post-install capability guide card ──
  const [installToast, setInstallToast] = useState<string | null>(null);
  const [installGuide, setInstallGuide] = useState<{ name: string; category: string } | null>(null);
  const installToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const baseUrl = getServerBaseUrl();

  // Abort controller ref for cleanup
  const abortRef = useRef<AbortController | null>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fetch recommended packs ──
  const fetchPacks = useCallback(async () => {
    setPacksLoading(true);
    setFetchFailed(false);
    try {
      const res = await authFetch(`${baseUrl}/api/skills/capability-packs/catalog`);
      if (res.ok) {
        const data = await res.json();
        setPacks(data.packs ?? []);
      } else {
        setFetchFailed(true);
      }
    } catch {
      setFetchFailed(true);
    } finally {
      setPacksLoading(false);
    }
  }, []);

  // ── Fetch community packs from marketplace ──
  const fetchCommunityPacks = useCallback(async () => {
    setCommunityLoading(true);
    setCommunityError(null);
    try {
      const res = await authFetch(`${baseUrl}/api/marketplace/packs`);
      if (res.ok) {
        const data = await res.json();
        setCommunityPacks(data.packs ?? []);
      } else if (res.status === 503) {
        setCommunityPacks([]);
      } else {
        setCommunityError('Unable to load community packs. Please try again.');
      }
    } catch {
      setCommunityPacks([]);
    } finally {
      setCommunityLoading(false);
    }
  }, []);

  // ── Fetch marketplace packages (search) ──
  const fetchMarketplace = useCallback(async () => {
    setMarketplaceLoading(true);
    setMarketplaceError(null);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set('query', searchQuery);
      if (typeFilter !== 'all') params.set('type', typeFilter);
      if (categoryFilter !== 'all') params.set('category', categoryFilter);
      params.set('limit', '100');

      const res = await authFetch(`${baseUrl}/api/marketplace/search?${params.toString()}`);
      if (res.ok) {
        const data: MarketplaceSearchResult = await res.json();
        setMarketplacePackages(data.packages ?? []);
        setMarketplaceFacets(data.facets ?? null);
        setMarketplaceTotal(data.total ?? 0);
      } else if (res.status === 503) {
        setMarketplacePackages([]);
        setMarketplaceTotal(0);
      } else {
        setMarketplaceError('Unable to load marketplace. Please try again.');
      }
    } catch {
      setMarketplacePackages([]);
      setMarketplaceTotal(0);
    } finally {
      setMarketplaceLoading(false);
    }
  }, [searchQuery, typeFilter, categoryFilter]);

  useEffect(() => {
    fetchPacks();
    fetchCommunityPacks();
  }, [fetchPacks, fetchCommunityPacks]);

  // Fetch marketplace when tab is active or filters change
  useEffect(() => {
    if (activeTab === 'browse') {
      // Debounce search queries
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = setTimeout(() => {
        fetchMarketplace();
      }, searchQuery ? 300 : 0);
    }
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [activeTab, fetchMarketplace, searchQuery]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, []);

  // ── Client-side sort for marketplace ──
  const sortedPackages = useMemo(() => {
    const sorted = [...marketplacePackages];
    switch (sortOption) {
      case 'popular':
        sorted.sort((a, b) => b.downloads - a.downloads || b.stars - a.stars);
        break;
      case 'updated':
        sorted.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
        break;
      case 'name':
        sorted.sort((a, b) => (a.display_name || a.name).localeCompare(b.display_name || b.name));
        break;
      case 'relevance':
      default:
        // Keep server order (FTS5 rank) when searching, otherwise sort by downloads
        if (!searchQuery) {
          sorted.sort((a, b) => b.downloads - a.downloads || b.stars - a.stars);
        }
        break;
    }
    return sorted;
  }, [marketplacePackages, sortOption, searchQuery]);

  // ── Derive categories from facets ──
  const availableCategories = useMemo(() => {
    if (!marketplaceFacets?.categories) return [];
    return Object.entries(marketplaceFacets.categories)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  }, [marketplaceFacets]);

  // ── Install recommended pack (existing logic) ──
  const handleInstallPack = useCallback(async (packId: string) => {
    setInstallingPack(packId);
    setPackError(null);
    try {
      const res = await authFetch(`${baseUrl}/api/skills/capability-packs/${packId}`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Install failed' }));
        setPackError(err.error ?? 'Install failed');
        return;
      }
      await fetchPacks();
    } catch (err) {
      setPackError(err instanceof Error ? err.message : 'Install failed');
    } finally {
      setInstallingPack(null);
    }
  }, [fetchPacks]);

  // ── Install a marketplace package ──
  const handleInstallPackage = useCallback(async (packageId: number) => {
    setInstallingPackageId(packageId);
    try {
      const res = await authFetch(`${baseUrl}/api/marketplace/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId }),
      });
      if (res.ok) {
        const result = await res.json();
        if (result.success) {
          // Update local state to reflect installation
          setMarketplacePackages(prev =>
            prev.map(p => p.id === packageId ? { ...p, installed: true } : p),
          );
          // Show post-install capability guide card
          const pkg = marketplacePackages.find(p => p.id === packageId);
          const name = pkg?.display_name || pkg?.name || 'Package';
          const category = pkg?.category || '';
          if (installToastTimerRef.current) clearTimeout(installToastTimerRef.current);
          setInstallToast(name);
          setInstallGuide({ name, category });
          installToastTimerRef.current = setTimeout(() => { setInstallToast(null); setInstallGuide(null); }, 10000);
        }
      }
    } catch {
      // Silently fail — user can retry
    } finally {
      setInstallingPackageId(null);
    }
  }, [marketplacePackages]);

  // ── Uninstall a marketplace package ──
  const handleUninstallPackage = useCallback(async (packageId: number) => {
    setUninstallingPackageId(packageId);
    try {
      const res = await authFetch(`${baseUrl}/api/marketplace/uninstall`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId }),
      });
      if (res.ok) {
        const result = await res.json();
        if (result.success) {
          setMarketplacePackages(prev =>
            prev.map(p => p.id === packageId ? { ...p, installed: false } : p),
          );
        }
      }
    } catch {
      // Silently fail — user can retry
    } finally {
      setUninstallingPackageId(null);
    }
  }, []);

  // ── Bulk install community pack ──
  const handleInstallCommunityPack = useCallback(async (slug: string) => {
    const existing = communityInstallProgress[slug];
    if (existing?.installing) return;

    const controller = new AbortController();
    abortRef.current = controller;

    setCommunityInstallProgress(prev => ({
      ...prev,
      [slug]: { installing: true, current: 0, total: 0, currentName: 'Fetching pack details...', errors: [], done: false },
    }));

    try {
      const detailRes = await authFetch(`${baseUrl}/api/marketplace/packs/${slug}`, { signal: controller.signal });
      if (!detailRes.ok) {
        setCommunityInstallProgress(prev => ({
          ...prev,
          [slug]: { ...prev[slug], installing: false, errors: ['Failed to fetch pack details'], done: true },
        }));
        return;
      }

      const detail: MarketplacePackDetail = await detailRes.json();
      const packages = detail.packages;

      if (packages.length === 0) {
        setCommunityInstallProgress(prev => ({
          ...prev,
          [slug]: { installing: false, current: 0, total: 0, currentName: '', errors: ['Pack contains no packages'], done: true },
        }));
        return;
      }

      const total = packages.length;
      const errors: string[] = [];

      for (let i = 0; i < packages.length; i++) {
        if (controller.signal.aborted) break;

        const pkg = packages[i];

        setCommunityInstallProgress(prev => ({
          ...prev,
          [slug]: { ...prev[slug], current: i + 1, total, currentName: pkg.display_name || pkg.name },
        }));

        try {
          const installRes = await authFetch(`${baseUrl}/api/marketplace/install`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ packageId: pkg.id }),
            signal: controller.signal,
          });

          if (!installRes.ok) {
            const errData = await installRes.json().catch(() => ({ error: 'Install failed' }));
            const msg = errData.blocked
              ? `${pkg.display_name || pkg.name}: blocked (${errData.severity})`
              : `${pkg.display_name || pkg.name}: ${errData.error || errData.message || 'Install failed'}`;
            errors.push(msg);
          } else {
            const result = await installRes.json();
            if (!result.success) {
              errors.push(`${pkg.display_name || pkg.name}: ${result.message || 'Install failed'}`);
            }
          }
        } catch (err) {
          if (controller.signal.aborted) break;
          errors.push(`${pkg.display_name || pkg.name}: ${err instanceof Error ? err.message : 'Network error'}`);
        }
      }

      setCommunityInstallProgress(prev => ({
        ...prev,
        [slug]: { installing: false, current: total, total, currentName: '', errors, done: true },
      }));

      if (errors.length === 0) {
        setInstalledSlugs(prev => new Set([...prev, slug]));
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setCommunityInstallProgress(prev => ({
          ...prev,
          [slug]: { ...prev[slug], installing: false, errors: [err instanceof Error ? err.message : 'Install failed'], done: true },
        }));
      }
    }
  }, [communityInstallProgress]);

  // ── Retry failed packages in a community pack ──
  const handleRetryCommunityPack = useCallback((slug: string) => {
    setCommunityInstallProgress(prev => {
      const updated = { ...prev };
      delete updated[slug];
      return updated;
    });
    handleInstallCommunityPack(slug);
  }, [handleInstallCommunityPack]);

  // ── Create Skill handler ─────────────────────────────────────────────
  const handleCreateSkill = useCallback(async () => {
    if (!newSkillName.trim() || !newSkillDescription.trim()) {
      setCreateError('Name and description are required.');
      return;
    }
    const validSteps = newSkillSteps.filter(s => s.trim().length > 0);
    if (validSteps.length === 0) {
      setCreateError('At least one step is required.');
      return;
    }

    setCreating(true);
    setCreateError(null);
    setCreateSuccess(null);

    try {
      const res = await authFetch(`${baseUrl}/api/skills/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newSkillName.trim(),
          description: newSkillDescription.trim(),
          steps: validSteps,
          category: newSkillCategory,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setCreateSuccess(`Skill "${data.skill?.name ?? newSkillName}" created successfully.`);
        // Reset form
        setNewSkillName('');
        setNewSkillDescription('');
        setNewSkillSteps(['']);
        setNewSkillCategory('general');
        // Auto-collapse after short delay
        setTimeout(() => {
          setShowCreateSkill(false);
          setCreateSuccess(null);
        }, 2000);
      } else {
        const err = await res.json().catch(() => ({ error: 'Failed to create skill' }));
        setCreateError(err.error ?? 'Failed to create skill');
      }
    } catch {
      setCreateError('Could not reach the server.');
    } finally {
      setCreating(false);
    }
  }, [newSkillName, newSkillDescription, newSkillSteps, newSkillCategory]);

  const handleAddStep = useCallback(() => {
    setNewSkillSteps(prev => [...prev, '']);
  }, []);

  const handleRemoveStep = useCallback((index: number) => {
    setNewSkillSteps(prev => prev.length <= 1 ? prev : prev.filter((_, i) => i !== index));
  }, []);

  const handleStepChange = useCallback((index: number, value: string) => {
    setNewSkillSteps(prev => prev.map((s, i) => i === index ? value : s));
  }, []);

  // ── Total pack count for tab label ──
  const totalPackCount = packs.length + communityPacks.length;

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-[960px] mx-auto h-full overflow-y-auto">
      <h1 className="text-lg font-semibold text-foreground mb-1">Skills &amp; Apps</h1>
      <div className="text-xs text-muted-foreground mb-6">Browse and install capability packs, marketplace packages, and custom skills.</div>

      {/* Tab bar */}
      <div className="flex items-center gap-0.5 mb-6 border-b border-border" role="tablist" aria-label="Capability sections">
        <button
          className={`px-4 py-2 text-xs font-medium bg-transparent border-none cursor-pointer font-[inherit] transition-colors ${
            activeTab === 'recommended'
              ? 'text-primary border-b-2 border-b-primary'
              : 'text-muted-foreground border-b-2 border-b-transparent hover:text-foreground'
          }`}
          onClick={() => setActiveTab('recommended')}
          role="tab"
          aria-selected={activeTab === 'recommended'}
          aria-controls="panel-recommended"
        >
          Recommended ({totalPackCount})
        </button>
        <button
          className={`px-4 py-2 text-xs font-medium bg-transparent border-none cursor-pointer font-[inherit] transition-colors ${
            activeTab === 'browse'
              ? 'text-primary border-b-2 border-b-primary'
              : 'text-muted-foreground border-b-2 border-b-transparent hover:text-foreground'
          }`}
          onClick={() => setActiveTab('browse')}
          role="tab"
          aria-selected={activeTab === 'browse'}
          aria-controls="panel-browse"
        >
          Browse All {marketplaceTotal > 0 ? `(${marketplaceTotal})` : ''}
        </button>
        {/* Create Skill action button */}
        <button
          className="ml-auto text-[11px] font-medium px-2.5 py-1 rounded-md border border-primary/30 bg-transparent text-primary cursor-pointer font-[inherit] transition-colors hover:bg-primary/10 flex items-center gap-1"
          onClick={() => { setActiveTab('browse'); setShowCreateSkill(v => !v); setCreateError(null); setCreateSuccess(null); }}
          data-testid="create-skill-btn"
        >
          <span className="text-sm leading-none">+</span> Create Skill
        </button>
      </div>

      {/* Connector cross-link */}
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground">Connect Your Tools</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Link GitHub, Slack, and 250+ apps to your agent</p>
        </div>
        <button
          className="text-xs px-3 py-1.5 rounded border border-primary/30 text-primary bg-transparent cursor-pointer font-[inherit] transition-colors hover:bg-primary/10"
          onClick={() => onNavigate?.('settings', 'vault')}
        >
          Settings &rarr; Keys &amp; Connections
        </button>
      </div>

      {/* Pack error */}
      {packError && (
        <div className="px-3 py-2 mb-4 rounded-md bg-destructive/10 text-destructive text-xs">
          {packError}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          Packs tab
          ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'recommended' && (
        <div id="panel-recommended" role="tabpanel" aria-label="Recommended">
          {/* ── Recommended Section ─────────────────────────────────── */}
          <div className="flex items-center gap-2 mb-4 mt-2">
            <span className="text-[13px] font-semibold text-foreground tracking-wide">Recommended</span>
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-widest bg-primary/15 text-primary">Waggle</span>
          </div>

          {packsLoading ? (
            <div className="flex flex-col gap-3 p-6">
              {[1, 2, 3].map(i => (
                <div key={i} className="animate-pulse rounded-lg border border-border p-4">
                  <div className="h-4 w-32 bg-muted rounded mb-2" />
                  <div className="h-3 w-full bg-muted rounded mb-1" />
                  <div className="h-3 w-3/4 bg-muted rounded" />
                </div>
              ))}
            </div>
          ) : fetchFailed && packs.length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-8">
              <div className="text-muted-foreground text-xs">
                Unable to load capability packs. Check your connection and try again.
              </div>
              <button
                onClick={fetchPacks}
                className="px-4 py-1.5 text-[11px] font-medium rounded-md border-none bg-primary text-white cursor-pointer font-[inherit] transition-colors hover:bg-primary/90"
              >
                Retry
              </button>
            </div>
          ) : packs.length === 0 ? (
            <div className="text-muted-foreground text-xs p-6">No recommended packs available.</div>
          ) : (
            packs.map(pack => (
              <div key={pack.id} className="bg-card border border-border border-l-[3px] border-l-primary/50 rounded-lg p-4 mb-3">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-sm font-semibold text-foreground mb-1">{pack.name}</div>
                    <div className="text-[11px] text-muted-foreground mb-3">{pack.description}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusBadgeClasses(pack.packState)}`}>
                      {pack.packState === 'complete' ? 'Installed' : pack.packState === 'incomplete' ? `${pack.installedCount}/${pack.totalCount}` : 'Available'}
                    </span>
                    {pack.packState !== 'complete' && (
                      <button
                        className={`text-[11px] font-medium px-3 py-1 rounded-md border-none font-[inherit] transition-colors ${
                          installingPack === pack.id
                            ? 'bg-card text-muted-foreground cursor-default'
                            : 'bg-primary text-white cursor-pointer hover:bg-primary/90'
                        }`}
                        onClick={() => handleInstallPack(pack.id)}
                        disabled={installingPack === pack.id}
                      >
                        {installingPack === pack.id ? 'Installing...' : pack.packState === 'incomplete' ? 'Complete' : 'Install'}
                      </button>
                    )}
                  </div>
                </div>
                {/* Skill list */}
                <div className="flex flex-col gap-1 mt-2">
                  {pack.skillStates.map(skill => (
                    <div key={skill.id} className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${skillDotClasses(skill.state)}`} />
                      <span className={`text-[11px] ${skillLabelClasses(skill.state)}`}>
                        {skill.id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}

          {/* ── Divider ─────────────────────────────────────────────── */}
          {communityPacks.length > 0 && <div className="h-px bg-border my-6" />}

          {/* ── W5.5: Enterprise Section (KVARK) ──────────────────────── */}
          <div className="flex items-center gap-2 mb-3 mt-6">
            <span className="text-[13px] font-semibold text-foreground tracking-wide">Enterprise</span>
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-widest bg-amber-500/15 text-amber-500">KVARK</span>
          </div>
          <div className="rounded-lg border border-border bg-card/50 p-4 mb-6">
            <div className="text-xs text-muted-foreground leading-relaxed">
              <p className="mb-2">KVARK enterprise packs provide governed knowledge access with data sovereignty, audit trails, and compliance-ready integrations.</p>
              <p className="text-[10px] text-muted-foreground/60">Configure your KVARK connection in Settings &gt; Team to unlock enterprise capability packs.</p>
            </div>
          </div>

          {/* ── Community Section ───────────────────────────────────── */}
          {communityLoading ? (
            <div className="text-muted-foreground text-xs p-6">Loading community packs...</div>
          ) : communityError ? (
            <div className="px-3 py-2 mb-4 rounded-md bg-destructive/10 text-destructive text-xs">
              {communityError}
            </div>
          ) : communityPacks.length > 0 ? (
            <>
              <div className="flex items-center gap-2 mb-4 mt-2">
                <span className="text-[13px] font-semibold text-foreground tracking-wide">Community</span>
                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-widest bg-primary/10 text-primary">Marketplace</span>
                <span className="text-[11px] text-muted-foreground ml-auto">
                  {communityPacks.length} packs
                </span>
              </div>

              {communityPacks.map(cp => {
                const progress = communityInstallProgress[cp.slug];
                const isInstalled = installedSlugs.has(cp.slug) || (progress?.done && progress.errors.length === 0);
                const isInstalling = progress?.installing;

                return (
                  <div
                    key={cp.slug}
                    className={`bg-card border border-border rounded-lg p-4 mb-3 ${
                      cp.priority === 'core'
                        ? 'border-l-[3px] border-l-primary/30 shadow-sm'
                        : 'border-l-[3px] border-l-transparent'
                    }`}
                    data-testid={`community-pack-${cp.slug}`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {cp.icon && <span className="text-base">{cp.icon}</span>}
                          <span className="text-sm font-semibold text-foreground">{cp.display_name}</span>
                          <span className={`text-[10px] px-1.5 py-px rounded bg-primary/[0.08] border border-primary/10 ${priorityColor(cp.priority)}`}>
                            {priorityLabel(cp.priority)}
                          </span>
                        </div>
                        <div className="text-[11px] text-muted-foreground mb-3">{cp.description}</div>
                        {/* Target roles */}
                        {cp.target_roles && (
                          <div className="flex gap-1 flex-wrap mb-1">
                            {cp.target_roles.split(',').map(role => (
                              <span key={role.trim()} className="text-[10px] px-1.5 py-px rounded bg-primary/[0.08] text-muted-foreground border border-primary/10">{role.trim()}</span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0 ml-3">
                        {isInstalled ? (
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusBadgeClasses('complete')}`}>Installed</span>
                        ) : isInstalling ? (
                          <span className="text-[11px] text-primary font-medium">
                            Installing {progress.current}/{progress.total}...
                          </span>
                        ) : progress?.done && progress.errors.length > 0 ? (
                          <button
                            className="text-[11px] font-medium px-3 py-1 rounded-md border-none bg-yellow-600 text-white cursor-pointer font-[inherit] transition-colors hover:bg-yellow-600/90"
                            onClick={() => handleRetryCommunityPack(cp.slug)}
                          >
                            Retry ({progress.errors.length} failed)
                          </button>
                        ) : (
                          <button
                            className="text-[11px] font-medium px-3 py-1 rounded-md border-none bg-primary text-white cursor-pointer font-[inherit] transition-colors hover:bg-primary/90"
                            onClick={() => handleInstallCommunityPack(cp.slug)}
                          >
                            Install
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Progress bar */}
                    {isInstalling && progress && (
                      <div>
                        <div className="h-1 bg-muted/15 rounded-sm mt-2 overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-sm transition-[width] duration-300 ease-in-out"
                            style={{ width: progress.total > 0 ? `${(progress.current / progress.total) * 100}%` : '0%' }}
                          />
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-1">
                          {progress.currentName}
                        </div>
                      </div>
                    )}

                    {/* Error list */}
                    {progress?.done && progress.errors.length > 0 && (
                      <div className="mt-2">
                        {progress.errors.map((err, i) => (
                          <div key={i} className="text-[10px] text-destructive py-0.5">
                            {err}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          ) : null /* No community packs — don't show the section at all */}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          Marketplace tab — search, filter, sort, install/uninstall
          ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'browse' && (
        <div id="panel-browse" role="tabpanel" aria-label="Browse All">
          {/* ── Filter bar ────────────────────────────────────────── */}
          <div className="flex flex-col gap-3 mb-5">
            {/* Search input */}
            <input
              type="text"
              placeholder="Search packages..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-md border border-border bg-card text-foreground outline-none font-[inherit] box-border focus:border-primary"
              aria-label="Search marketplace packages"
            />

            {/* Type filter chips */}
            <div className="flex gap-1.5 flex-wrap items-center">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mr-1 shrink-0">Type</span>
              {(['all', 'skill', 'plugin', 'mcp'] as const).map(t => (
                <button
                  key={t}
                  className={`text-[11px] font-medium px-2.5 py-[3px] rounded-xl font-[inherit] transition-all shrink-0 cursor-pointer ${
                    typeFilter === t
                      ? 'border border-primary bg-primary/[0.12] text-primary'
                      : 'border border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/30'
                  }`}
                  onClick={() => setTypeFilter(t)}
                >
                  {t === 'all' ? 'All' : t === 'mcp' ? 'MCP Servers' : `${t.charAt(0).toUpperCase() + t.slice(1)}s`}
                  {t !== 'all' && marketplaceFacets?.types?.[t] != null && (
                    <span className="opacity-60 ml-1">
                      {marketplaceFacets.types[t]}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Category filter chips */}
            {availableCategories.length > 0 && (
              <div className="flex gap-1.5 flex-wrap items-center">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mr-1 shrink-0">Category</span>
                <button
                  className={`text-[11px] font-medium px-2.5 py-[3px] rounded-xl font-[inherit] transition-all shrink-0 cursor-pointer ${
                    categoryFilter === 'all'
                      ? 'border border-primary bg-primary/[0.12] text-primary'
                      : 'border border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/30'
                  }`}
                  onClick={() => setCategoryFilter('all')}
                >
                  All
                </button>
                {availableCategories.map(cat => (
                  <button
                    key={cat.name}
                    className={`text-[11px] font-medium px-2.5 py-[3px] rounded-xl font-[inherit] transition-all shrink-0 cursor-pointer ${
                      categoryFilter === cat.name
                        ? 'border border-primary bg-primary/[0.12] text-primary'
                        : 'border border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/30'
                    }`}
                    onClick={() => setCategoryFilter(cat.name)}
                  >
                    {cat.name}
                    <span className="opacity-60 ml-1">{cat.count}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Sort */}
            <div className="flex gap-1.5 flex-wrap items-center">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mr-1 shrink-0">Sort</span>
              {([
                { key: 'popular', label: 'Most Popular' },
                { key: 'relevance', label: 'Relevance' },
                { key: 'updated', label: 'Recently Updated' },
                { key: 'name', label: 'Name A-Z' },
              ] as const).map(s => (
                <button
                  key={s.key}
                  className={`text-[11px] font-medium px-2.5 py-[3px] rounded-xl font-[inherit] transition-all shrink-0 cursor-pointer ${
                    sortOption === s.key
                      ? 'border border-primary bg-primary/[0.12] text-primary'
                      : 'border border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/30'
                  }`}
                  onClick={() => setSortOption(s.key)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Marketplace error ──────────────────────────────────── */}
          {marketplaceError && (
            <div className="px-3 py-2 mb-4 rounded-md bg-destructive/10 text-destructive text-xs">
              {marketplaceError}
              <button
                onClick={fetchMarketplace}
                className="float-right bg-transparent border border-destructive/30 rounded px-2 py-0.5 text-destructive cursor-pointer text-[11px] font-[inherit] hover:bg-destructive/10"
              >
                Retry
              </button>
            </div>
          )}

          {/* ── Loading state ─────────────────────────────────────── */}
          {marketplaceLoading ? (
            <div className="text-muted-foreground text-xs p-6 text-center">
              Loading marketplace...
            </div>
          ) : sortedPackages.length === 0 ? (
            /* ── Empty state ──────────────────────────────────────── */
            <div className="text-center p-12 text-muted-foreground">
              <div className="text-[32px] mb-3 opacity-30">
                {searchQuery ? '\u{1F50D}' : '\u{1F4E6}'}
              </div>
              <div className="text-[13px] font-medium mb-1.5 text-foreground">
                {searchQuery
                  ? 'No packages match your filters'
                  : 'Explore the Marketplace'}
              </div>
              <div className="text-[11px]">
                {searchQuery
                  ? 'Try adjusting your search query or removing some filters.'
                  : 'Browse capabilities to expand what Waggle can do — from research workflows to document generation.'}
              </div>
              {(searchQuery || typeFilter !== 'all' || categoryFilter !== 'all') && (
                <button
                  className="text-[11px] font-medium px-4 py-1.5 rounded-xl border border-border bg-card text-muted-foreground cursor-pointer font-[inherit] transition-all mt-3 hover:text-foreground hover:border-primary/30"
                  onClick={() => {
                    setSearchQuery('');
                    setTypeFilter('all');
                    setCategoryFilter('all');
                  }}
                >
                  Clear all filters
                </button>
              )}
            </div>
          ) : (
            /* ── Package grid ─────────────────────────────────────── */
            <>
              {/* Result count */}
              <div className="text-[11px] text-muted-foreground mb-3">
                {sortedPackages.length} package{sortedPackages.length !== 1 ? 's' : ''}
                {searchQuery && ` matching "${searchQuery}"`}
              </div>

              <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-2.5">
                {sortedPackages.map(pkg => {
                  const isInstalling = installingPackageId === pkg.id;
                  const isUninstalling = uninstallingPackageId === pkg.id;

                  return (
                    <div
                      key={pkg.id}
                      className={`bg-card rounded-lg p-3.5 transition-colors ${
                        pkg.installed
                          ? 'border border-green-500/20'
                          : 'border border-border hover:border-primary/30'
                      }`}
                      data-testid={`marketplace-pkg-${pkg.id}`}
                    >
                      {/* Top row: name + badges */}
                      <div className="flex justify-between items-start mb-1.5">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[13px] font-semibold text-foreground">
                              {pkg.display_name || pkg.name}
                            </span>
                            <span className={`text-[9px] font-semibold px-1.5 py-px rounded uppercase tracking-wide border ${installTypeBadgeClasses(pkg.waggle_install_type)}`}>
                              {installTypeLabel(pkg.waggle_install_type)}
                            </span>
                            {pkg.installed && (
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusBadgeClasses('installed')}`}>Installed</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Description */}
                      <div className="text-[11px] text-muted-foreground mb-1.5 leading-relaxed line-clamp-2">
                        {pkg.description}
                      </div>

                      {/* Rating + downloads — compact line below description */}
                      {(pkg.rating > 0 || pkg.downloads > 0) && (
                        <div className="flex items-center gap-3 mb-2 text-xs text-muted-foreground">
                          {pkg.rating > 0 && (
                            <span className="flex items-center gap-1" title={`${pkg.rating.toFixed(1)} out of 5${pkg.rating_count ? ` (${pkg.rating_count} ratings)` : ''}`}>
                              <span className="text-primary/70 text-[11px] tracking-tight">{renderStarRating(pkg.rating)}</span>
                              <span className="text-[10px]">{pkg.rating.toFixed(1)}</span>
                            </span>
                          )}
                          {pkg.downloads > 0 && (
                            <span className="text-[10px]" title={`${pkg.downloads.toLocaleString()} downloads`}>
                              {formatDownloads(pkg.downloads)} downloads
                            </span>
                          )}
                        </div>
                      )}

                      {/* Bottom row: metadata + action */}
                      <div className="flex justify-between items-center">
                        {/* Left: category + stats */}
                        <div className="flex items-center gap-2 flex-wrap">
                          {pkg.category && (
                            <span className="text-[10px] px-1.5 py-px rounded bg-card text-muted-foreground border border-border">{pkg.category}</span>
                          )}
                          {pkg.stars > 0 && (
                            <span className="text-[10px] text-primary flex items-center gap-[3px]">
                              <span className="text-[11px]">{'\u2605'}</span>
                              {formatDownloads(pkg.stars)}
                            </span>
                          )}
                          {pkg.downloads > 0 && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-[3px]">
                              <span className="text-[11px]">{'\u2193'}</span>
                              {formatDownloads(pkg.downloads)}
                            </span>
                          )}
                        </div>

                        {/* Right: action button */}
                        <div className="shrink-0 ml-2">
                          {pkg.installed ? (
                            <button
                              className="text-[11px] font-medium px-3 py-1 rounded-md border border-destructive/30 bg-destructive/[0.08] text-destructive cursor-pointer font-[inherit] transition-colors hover:bg-destructive/15 hover:border-destructive/50"
                              onClick={() => handleUninstallPackage(pkg.id)}
                              disabled={isUninstalling}
                            >
                              {isUninstalling ? 'Removing...' : 'Uninstall'}
                            </button>
                          ) : (
                            <button
                              className={`text-[11px] font-medium px-3 py-1 rounded-md border-none font-[inherit] transition-colors ${
                                isInstalling
                                  ? 'bg-card text-muted-foreground cursor-default'
                                  : 'bg-primary text-white cursor-pointer hover:bg-primary/90'
                              }`}
                              onClick={() => handleInstallPackage(pkg.id)}
                              disabled={isInstalling}
                            >
                              {isInstalling ? 'Installing...' : 'Install'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* ════════════════════════════════════════════════════════════════════
              Advanced: Individual Skills — collapsible section at bottom
              ════════════════════════════════════════════════════════════════════ */}
          <div className="mt-8 border-t border-border pt-6">
            <button
              onClick={() => { setShowCreateSkill(v => !v); setCreateError(null); setCreateSuccess(null); }}
              className={`flex w-full items-center justify-between rounded-md border border-border px-4 py-2.5 text-[13px] font-medium cursor-pointer transition-colors ${
                showCreateSkill
                  ? 'bg-muted text-foreground'
                  : 'bg-card text-foreground hover:bg-muted'
              }`}
              data-testid="create-skill-toggle"
            >
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Advanced</span>
                <span className="text-xs text-muted-foreground">Create Custom Skill</span>
              </div>
              <span className="text-xs text-muted-foreground">{showCreateSkill ? '\u25B2' : '\u25BC'}</span>
            </button>

            {showCreateSkill && (
              <div
                className="mt-2 p-4 bg-card border border-border rounded-lg"
                data-testid="create-skill-form"
              >
                {/* Name */}
                <label className="block text-xs text-muted-foreground mb-1">
                  Name (kebab-case)
                </label>
                <input
                  type="text"
                  value={newSkillName}
                  onChange={e => setNewSkillName(e.target.value)}
                  placeholder="my-research-workflow"
                  className="w-full px-2.5 py-1.5 text-[13px] bg-background text-foreground border border-border rounded mb-3 box-border focus:border-primary focus:outline-none"
                  data-testid="create-skill-name"
                />

                {/* Description */}
                <label className="block text-xs text-muted-foreground mb-1">
                  Description
                </label>
                <textarea
                  value={newSkillDescription}
                  onChange={e => setNewSkillDescription(e.target.value)}
                  placeholder="What this skill does..."
                  rows={2}
                  className="w-full px-2.5 py-1.5 text-[13px] bg-background text-foreground border border-border rounded mb-3 resize-y box-border focus:border-primary focus:outline-none"
                  data-testid="create-skill-description"
                />

                {/* Steps */}
                <label className="block text-xs text-muted-foreground mb-1">
                  Steps
                </label>
                {newSkillSteps.map((step, i) => (
                  <div key={i} className="flex gap-1.5 mb-1.5 items-center">
                    <span className="text-[11px] text-muted-foreground min-w-[18px]">{i + 1}.</span>
                    <input
                      type="text"
                      value={step}
                      onChange={e => handleStepChange(i, e.target.value)}
                      placeholder={`Step ${i + 1}...`}
                      className="flex-1 px-2 py-[5px] text-xs bg-background text-foreground border border-border rounded focus:border-primary focus:outline-none"
                      data-testid={`create-skill-step-${i}`}
                    />
                    {newSkillSteps.length > 1 && (
                      <button
                        onClick={() => handleRemoveStep(i)}
                        className="bg-transparent border-none text-muted-foreground cursor-pointer text-sm px-1 py-0.5 hover:text-foreground"
                        title="Remove step"
                      >
                        x
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={handleAddStep}
                  className="bg-transparent border border-dashed border-border text-muted-foreground rounded px-2.5 py-1 text-[11px] cursor-pointer mb-3 hover:text-foreground hover:border-primary/30"
                >
                  + Add step
                </button>

                {/* Category */}
                <label className="block text-xs text-muted-foreground mb-1">
                  Category
                </label>
                <select
                  value={newSkillCategory}
                  onChange={e => setNewSkillCategory(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-[13px] bg-background text-foreground border border-border rounded mb-4 box-border focus:border-primary focus:outline-none"
                  data-testid="create-skill-category"
                >
                  <option value="general">General</option>
                  <option value="research">Research</option>
                  <option value="writing">Writing</option>
                  <option value="coding">Coding</option>
                  <option value="planning">Planning</option>
                  <option value="knowledge">Knowledge</option>
                  <option value="marketing">Marketing</option>
                  <option value="communication">Communication</option>
                </select>

                {/* Error / Success */}
                {createError && (
                  <div className="px-2.5 py-1.5 mb-2.5 rounded bg-destructive/10 text-destructive text-xs">
                    {createError}
                  </div>
                )}
                {createSuccess && (
                  <div className="px-2.5 py-1.5 mb-2.5 rounded bg-green-500/10 text-green-500 text-xs">
                    {createSuccess}
                  </div>
                )}

                {/* Create button */}
                <button
                  onClick={handleCreateSkill}
                  disabled={creating}
                  className={`border-none rounded-md px-5 py-2 text-[13px] font-semibold transition-colors ${
                    creating
                      ? 'bg-muted text-muted-foreground cursor-default opacity-70'
                      : 'bg-primary text-primary-foreground cursor-pointer hover:bg-primary/90'
                  }`}
                  data-testid="create-skill-submit"
                >
                  {creating ? 'Creating...' : 'Create Skill'}
                </button>
              </div>
            )}

            {/* InstallCenter for individual skill browsing */}
            <div className="mt-4">
              <InstallCenter />
            </div>
          </div>
        </div>
      )}

      {/* Post-install capability guide card */}
      {installToast && installGuide && (
        <div className="fixed bottom-6 right-6 z-[10000] bg-card border border-green-500/30 border-l-[3px] border-l-green-500 rounded-lg px-4 py-4 shadow-[0_4px_12px_rgba(0,0,0,0.3)] max-w-[400px] animate-in fade-in slide-in-from-bottom-2 space-y-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-green-500 text-sm">{'\u2713'}</span>
              <span className="text-sm font-semibold text-foreground">{installGuide.name} installed!</span>
            </div>
            <button
              onClick={() => { if (installToastTimerRef.current) clearTimeout(installToastTimerRef.current); setInstallToast(null); setInstallGuide(null); }}
              className="shrink-0 bg-transparent border-none text-muted-foreground cursor-pointer text-sm px-1 hover:text-foreground"
            >{'\u00D7'}</button>
          </div>
          <div className="text-xs text-muted-foreground">
            Your agent now has new capabilities. Try asking:
          </div>
          <div className="space-y-1">
            {getGuidePrompts(installGuide.category).map((prompt, i) => (
              <div key={i} className="text-xs text-foreground bg-secondary/50 border border-border rounded px-2.5 py-1.5 font-mono">
                {'\u201C'}{prompt}{'\u201D'}
              </div>
            ))}
          </div>
          <button
            onClick={() => { if (installToastTimerRef.current) clearTimeout(installToastTimerRef.current); setInstallToast(null); setInstallGuide(null); }}
            className="text-[11px] text-muted-foreground hover:text-foreground bg-transparent border border-border rounded px-3 py-1 cursor-pointer transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}
      {/* Simple toast fallback when guide data is not available */}
      {installToast && !installGuide && (
        <div className="fixed bottom-6 right-6 z-[10000] bg-card border border-green-500/30 border-l-[3px] border-l-green-500 rounded-lg px-4 py-3 shadow-[0_4px_12px_rgba(0,0,0,0.3)] max-w-[360px] animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center gap-2">
            <span className="text-green-500 text-sm">{'\u2713'}</span>
            <span className="text-xs text-foreground">{installToast}</span>
            <button
              onClick={() => { if (installToastTimerRef.current) clearTimeout(installToastTimerRef.current); setInstallToast(null); }}
              className="ml-auto bg-transparent border-none text-muted-foreground cursor-pointer text-sm px-1 hover:text-foreground"
            >{'\u00D7'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
