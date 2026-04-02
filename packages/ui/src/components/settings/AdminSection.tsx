/**
 * AdminSection — TEAMS+ admin overview: usage, workspaces, connectors, plugins.
 */

import { useState, useEffect } from 'react';

interface AdminOverview {
  usage: { totalInputTokens: number; totalOutputTokens: number };
  workspaces: Array<{ id: string; name: string; hasTeam: boolean }>;
  connectors: Array<{ id: string; name: string; status: string; category?: string }>;
  plugins: Array<{ name: string; version: string; tools: number }>;
  generatedAt: string;
}

export function AdminSection({ baseUrl = 'http://localhost:3000' }: { baseUrl?: string }) {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${baseUrl}/api/admin/overview`)
      .then(r => { if (r.status === 403) throw new Error('Admin panel requires Teams tier'); return r.json(); })
      .then(setData)
      .catch(e => setError(e.message));
  }, [baseUrl]);

  if (error) return (
    <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>
  );
  if (!data) return <div className="text-xs text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Admin Overview</h2>
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-border p-4">
          <p className="text-xs text-muted-foreground">Total Input Tokens</p>
          <p className="text-2xl font-bold text-foreground mt-1">{data.usage.totalInputTokens.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border border-border p-4">
          <p className="text-xs text-muted-foreground">Total Output Tokens</p>
          <p className="text-2xl font-bold text-foreground mt-1">{data.usage.totalOutputTokens.toLocaleString()}</p>
        </div>
      </div>
      <div>
        <p className="text-sm font-medium mb-2">Workspaces ({data.workspaces.length})</p>
        <div className="space-y-1">
          {data.workspaces.map(w => (
            <div key={w.id} className="flex items-center justify-between text-xs px-3 py-2 rounded-md bg-card border border-border">
              <span className="text-foreground font-medium">{w.name}</span>
              {w.hasTeam && <span className="text-primary text-[10px] uppercase tracking-wider">Team</span>}
            </div>
          ))}
        </div>
      </div>
      <div>
        <p className="text-sm font-medium mb-2">Connected ({data.connectors.filter(c => c.status === 'connected').length} / {data.connectors.length})</p>
        <div className="flex flex-wrap gap-1.5">
          {data.connectors.filter(c => c.status === 'connected').map(c => (
            <span key={c.id} className="text-[11px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-500 border border-green-500/20">{c.name}</span>
          ))}
        </div>
      </div>
      {data.plugins.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-2">Active Plugins ({data.plugins.length})</p>
          <div className="space-y-1">
            {data.plugins.map(p => (
              <div key={p.name} className="flex items-center justify-between text-xs px-3 py-2 rounded-md bg-card border border-border">
                <span className="font-medium text-foreground">{p.name}</span>
                <span className="text-muted-foreground">v{p.version} &middot; {p.tools} tools</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex items-center gap-3">
        <a
          href={`${baseUrl}/api/admin/audit-export?format=csv`}
          className="text-xs px-3 py-1.5 rounded border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors inline-flex items-center gap-1.5"
        >
          ↓ Export Audit Log (CSV)
        </a>
        <p className="text-[10px] text-muted-foreground">
          Last updated: {new Date(data.generatedAt).toLocaleTimeString()}
        </p>
      </div>
    </div>
  );
}
