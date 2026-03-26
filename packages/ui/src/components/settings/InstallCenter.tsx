/**
 * InstallCenter — main Install Center component providing curated skill
 * browsing with runtime status and governed install flow.
 *
 * Uses Tailwind utility classes for styling.
 */

import { useState, useCallback, useEffect } from 'react';
import type { StarterCatalogResponse } from '../../services/types.js';
import { SkillCard } from './SkillCard.js';

// ── Types ────────────────────────────────────────────────────────────────

export interface InstallCenterProps {
  baseUrl?: string;
}

interface CapabilityData {
  plugins: Array<{ name: string; state: string; tools: number; skills: number }>;
  mcpServers: Array<{ name: string; state: string; healthy: boolean; tools: number }>;
  skills: Array<{ name: string; length: number }>;
  tools: { count: number; native: number; plugin: number; mcp: number };
  commands: Array<{ name: string; description: string; usage?: string }>;
  hooks: { registered: number; recentActivity: Array<{ event: string; timestamp: number; cancelled: boolean; reason?: string }> };
  workflows: Array<{ name: string; description: string; steps: number }>;
}

// ── Component ────────────────────────────────────────────────────────────

export function InstallCenter({ baseUrl = 'http://127.0.0.1:3333' }: InstallCenterProps) {
  const [catalog, setCatalog] = useState<StarterCatalogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFamily, setActiveFamily] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [installingSkillId, setInstallingSkillId] = useState<string | null>(null);
  const [confirmingSkillId, setConfirmingSkillId] = useState<string | null>(null);
  const [runtimeData, setRuntimeData] = useState<CapabilityData | null>(null);
  const [runtimeExpanded, setRuntimeExpanded] = useState(true);

  // ── Data fetching ────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    try {
      const [catalogRes, runtimeRes] = await Promise.all([
        fetch(`${baseUrl}/api/skills/starter-pack/catalog`),
        fetch(`${baseUrl}/api/capabilities/status`),
      ]);

      if (catalogRes.ok) {
        setCatalog(await catalogRes.json());
      } else {
        setError(`Unable to load catalog (${catalogRes.status})`);
      }

      if (runtimeRes.ok) {
        setRuntimeData(await runtimeRes.json());
      }
    } catch {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  }, [baseUrl]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Install flow (governed) ──────────────────────────────────────────

  const handleInstallClick = useCallback((skillId: string) => {
    setConfirmingSkillId(skillId);
  }, []);

  const handleConfirmInstall = useCallback(async (skillId: string) => {
    setConfirmingSkillId(null);
    setInstallingSkillId(skillId);

    try {
      const installRes = await fetch(`${baseUrl}/api/skills/starter-pack/${encodeURIComponent(skillId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!installRes.ok) {
        const errBody = await installRes.json().catch(() => ({ error: 'Install failed' }));
        setError((errBody as Record<string, string>).error ?? `Install failed (${installRes.status})`);
        return;
      }

      // Re-fetch catalog to get truthful state from server (NO optimistic update)
      const catalogRes = await fetch(`${baseUrl}/api/skills/starter-pack/catalog`);
      if (catalogRes.ok) {
        const data = await catalogRes.json();
        setCatalog(data);
      } else {
        // Skill was installed but catalog refresh failed — trigger full reload
        setError('Skill installed but failed to refresh catalog. Reopen settings to see updated state.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Install failed');
    } finally {
      setInstallingSkillId(null);
    }
  }, [baseUrl]);

  // ── Loading / error guards ───────────────────────────────────────────

  if (loading) {
    return <div className="text-muted-foreground/40 p-6">Loading Install Center...</div>;
  }

  if (error && !catalog) {
    return (
      <div className="p-6">
        <div className="bg-destructive/20 border border-destructive/60 rounded-lg px-3 py-2 text-destructive text-[13px]">
          {error}
          <button onClick={fetchData} className="float-right bg-transparent border border-destructive/60 rounded px-2 py-0.5 text-destructive cursor-pointer text-[11px]">Retry</button>
        </div>
      </div>
    );
  }

  if (!catalog) return null;

  // ── Filtering ────────────────────────────────────────────────────────

  const filteredSkills = catalog.skills.filter(s => {
    if (activeFamily !== 'all' && s.family !== activeFamily) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q);
    }
    return true;
  });

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <div>
      {/* 1. Runtime Status (collapsible) */}
      <div className="mb-8">
        <div
          className="flex justify-between items-center cursor-pointer"
          onClick={() => setRuntimeExpanded(!runtimeExpanded)}
        >
          <div className="text-base font-semibold text-foreground mb-2">Runtime Status</div>
          <button className="bg-transparent border border-border rounded-md px-3 py-1 text-[11px] font-semibold cursor-pointer text-muted-foreground">
            {runtimeExpanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
        <div className="text-xs text-muted-foreground mb-4">Current agent capabilities — tools, skills, plugins, and extensions.</div>
        {runtimeExpanded && runtimeData && (
          <div className="flex gap-2.5 flex-wrap mt-2">
            <span className="inline-block bg-muted border border-border rounded-md px-3.5 py-1.5 text-[13px] font-mono text-foreground"><span className="font-bold text-primary mr-1">{runtimeData.tools.count}</span> tools</span>
            <span className="inline-block bg-muted border border-border rounded-md px-3.5 py-1.5 text-[13px] font-mono text-foreground"><span className="font-bold text-primary mr-1">{runtimeData.skills.length}</span> skills</span>
            <span className="inline-block bg-muted border border-border rounded-md px-3.5 py-1.5 text-[13px] font-mono text-foreground"><span className="font-bold text-primary mr-1">{runtimeData.plugins.filter(p => p.state === 'active').length}</span> / {runtimeData.plugins.length} plugins</span>
            <span className="inline-block bg-muted border border-border rounded-md px-3.5 py-1.5 text-[13px] font-mono text-foreground"><span className="font-bold text-primary mr-1">{runtimeData.mcpServers.filter(s => s.healthy).length}</span> / {runtimeData.mcpServers.length} MCP</span>
            <span className="inline-block bg-muted border border-border rounded-md px-3.5 py-1.5 text-[13px] font-mono text-foreground"><span className="font-bold text-primary mr-1">{runtimeData.commands.length}</span> commands</span>
            <span className="inline-block bg-muted border border-border rounded-md px-3.5 py-1.5 text-[13px] font-mono text-foreground"><span className="font-bold text-primary mr-1">{runtimeData.hooks.registered}</span> hooks</span>
            <span className="inline-block bg-muted border border-border rounded-md px-3.5 py-1.5 text-[13px] font-mono text-foreground"><span className="font-bold text-primary mr-1">{runtimeData.workflows.length}</span> workflows</span>
          </div>
        )}
      </div>

      {/* 2. Install Center header */}
      <div className="mb-8">
        <div className="text-base font-semibold text-foreground mb-2">Install Center</div>
        <div className="text-xs text-muted-foreground mb-4">Browse and install curated skills to expand your agent's capabilities.</div>
      </div>

      {/* 3. Non-fatal error banner */}
      {error && (
        <div className="bg-destructive/20 border border-destructive/60 rounded-lg px-3 py-2 text-destructive text-[13px] mb-3">
          {error}
          <button onClick={() => setError(null)} className="float-right bg-transparent border border-destructive/60 rounded px-2 py-0.5 text-destructive cursor-pointer text-[11px]">Dismiss</button>
        </div>
      )}

      {/* 4. Family tab bar */}
      <div className="flex gap-1.5 flex-wrap mb-4">
        <button
          onClick={() => setActiveFamily('all')}
          className={`rounded-full px-3.5 py-1 text-xs font-medium cursor-pointer ${
            activeFamily === 'all'
              ? 'border border-primary text-primary bg-primary/10'
              : 'bg-secondary border border-border text-muted-foreground'
          }`}
        >
          All
        </button>
        {catalog.families.map(f => (
          <button
            key={f.id}
            onClick={() => setActiveFamily(f.id)}
            className={`rounded-full px-3.5 py-1 text-xs font-medium cursor-pointer ${
              activeFamily === f.id
                ? 'border border-primary text-primary bg-primary/10'
                : 'bg-secondary border border-border text-muted-foreground'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 5. Search input */}
      <input
        type="text"
        placeholder="Search skills..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="w-full px-3 py-2 text-[13px] rounded-md border border-border bg-secondary text-foreground mb-4 outline-none"
      />

      {/* 6. Confirmation dialog (inline) */}
      {confirmingSkillId && (
        <div className="bg-muted border border-primary rounded-lg px-4 py-3 mb-3 flex justify-between items-center">
          <span className="text-[13px] text-foreground">
            Install <strong>{catalog.skills.find(s => s.id === confirmingSkillId)?.name}</strong>?
            This will add the skill to your agent's capabilities.
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setConfirmingSkillId(null)}
              className="bg-transparent border border-border rounded-md px-3.5 py-1 text-xs text-muted-foreground cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={() => handleConfirmInstall(confirmingSkillId)}
              className="bg-primary border-none rounded-md px-3.5 py-1 text-xs font-semibold text-primary-foreground cursor-pointer"
            >
              Install
            </button>
          </div>
        </div>
      )}

      {/* 7. Skill grid */}
      {filteredSkills.length === 0 ? (
        <div className="text-center text-muted-foreground/40 p-6">
          {searchQuery ? 'No skills match your search.' : 'All skills in this category are installed!'}
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-2">
          {filteredSkills.map(skill => (
            <SkillCard
              key={skill.id}
              skill={skill}
              onInstall={handleInstallClick}
              installing={installingSkillId === skill.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
