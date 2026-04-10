/**
 * McpCatalog — Zapier-style visual grid of every MCP server in the registry.
 *
 * Every card shows a real brand logo (via simple-icons) on the authentic
 * brand color, with search, category filtering, and a live distribution bar
 * so users can see at a glance what the catalog actually contains.
 *
 * All counts rendered here are derived dynamically from MCP_CATALOG — there
 * are no hardcoded totals.
 */

import { useMemo, useState } from 'react';
import { Search, Server, Sparkles, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { MCP_CATALOG } from './mcp-registry';
import McpServerCard from './McpServerCard';
import { countWithRealLogos } from './brand-identity';

// Approximate count of third-party integrations reachable through Composio's
// MCP gateway. Kept as a "+" approximation — update when Composio publishes
// a new number.
const COMPOSIO_GATEWAY_COUNT = 250;

const McpCatalog = () => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // All counts are derived from the registry at render time.
  const stats = useMemo(() => {
    const categories = Array.from(new Set(MCP_CATALOG.map((s) => s.category)));
    const categoryCounts = categories
      .map((cat) => ({
        name: cat,
        count: MCP_CATALOG.filter((s) => s.category === cat).length,
      }))
      .sort((a, b) => b.count - a.count);
    return {
      total: MCP_CATALOG.length,
      officialCount: MCP_CATALOG.filter((s) => s.official).length,
      categories,
      categoryCounts,
      realLogoCount: countWithRealLogos(MCP_CATALOG.map((s) => s.id)),
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return MCP_CATALOG.filter((s) => {
      if (selectedCategory && s.category !== selectedCategory) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.author.toLowerCase().includes(q) ||
        s.capabilities.some((c) => c.toLowerCase().includes(q))
      );
    });
  }, [search, selectedCategory]);

  return (
    <div className="space-y-4">
      {/* ── Hero header ──────────────────────────────────────────────── */}
      <div className="space-y-2.5 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.06] via-primary/[0.02] to-transparent p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <h3 className="font-display text-sm font-semibold text-foreground">
                MCP Connector Catalog
              </h3>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground">{stats.total}</span> curated servers
              across <span className="font-semibold text-foreground">{stats.categories.length}</span>{' '}
              categories — <span className="text-primary">{stats.officialCount} official</span>,{' '}
              <span className="text-foreground/80">{stats.realLogoCount} with brand logos</span> ·
              +{COMPOSIO_GATEWAY_COUNT}+ more via the Composio gateway.
            </p>
          </div>
        </div>

        {/* Category distribution bar — a visual summary of the catalog shape. */}
        <div
          className="flex h-1.5 w-full overflow-hidden rounded-full bg-background/40 ring-1 ring-border/30"
          role="img"
          aria-label="Category distribution"
        >
          {stats.categoryCounts.map((cat, idx) => {
            const pct = (cat.count / stats.total) * 100;
            // Alternating honey intensities give the bar visual rhythm while
            // staying inside Hive DS tokens.
            const bg =
              idx % 3 === 0
                ? 'bg-primary'
                : idx % 3 === 1
                  ? 'bg-primary/70'
                  : 'bg-primary/40';
            return (
              <button
                key={cat.name}
                onClick={() =>
                  setSelectedCategory(selectedCategory === cat.name ? null : cat.name)
                }
                className={`${bg} relative h-full transition-all hover:brightness-125`}
                style={{ width: `${pct}%` }}
                title={`${cat.name} — ${cat.count} (${pct.toFixed(0)}%)`}
                aria-label={`${cat.name}: ${cat.count} servers`}
              />
            );
          })}
        </div>
      </div>

      {/* ── Search ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 rounded-xl border border-border/40 bg-muted/30 px-3 py-1.5 transition-colors focus-within:border-primary/40">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${stats.total} connectors… (postgres, slack, stripe, anything)`}
          className="h-auto flex-1 border-0 bg-transparent p-0 text-xs focus-visible:ring-0 focus-visible:ring-offset-0"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-background/50 hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* ── Category chips ───────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setSelectedCategory(null)}
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-all ${
            !selectedCategory
              ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/30'
              : 'bg-secondary/40 text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
          }`}
        >
          All · {stats.total}
        </button>
        {stats.categoryCounts.map((cat) => (
          <button
            key={cat.name}
            onClick={() =>
              setSelectedCategory(selectedCategory === cat.name ? null : cat.name)
            }
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-all ${
              selectedCategory === cat.name
                ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/30'
                : 'bg-secondary/40 text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
            }`}
          >
            {cat.name} · {cat.count}
          </button>
        ))}
      </div>

      {/* ── Result counter (only when filtering) ─────────────────────── */}
      {(search || selectedCategory) && (
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>
            Showing <span className="font-semibold text-foreground">{filtered.length}</span> of{' '}
            {stats.total}
            {selectedCategory && (
              <>
                {' '}
                in <span className="font-semibold text-primary">{selectedCategory}</span>
              </>
            )}
            {search && (
              <>
                {' '}
                matching <span className="font-semibold text-foreground">“{search}”</span>
              </>
            )}
          </span>
          {(search || selectedCategory) && (
            <button
              onClick={() => {
                setSearch('');
                setSelectedCategory(null);
              }}
              className="text-primary transition-colors hover:text-primary/80"
            >
              Reset
            </button>
          )}
        </div>
      )}

      {/* ── Grid ─────────────────────────────────────────────────────── */}
      <div className="grid max-h-[58vh] grid-cols-1 gap-2 overflow-auto pr-1 md:grid-cols-2">
        {filtered.map((server) => (
          <McpServerCard key={server.id} server={server} />
        ))}

        {filtered.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center py-10 text-center">
            <Server className="mb-2 h-8 w-8 text-muted-foreground/20" />
            <p className="text-xs text-muted-foreground">No connectors match your search</p>
            <button
              onClick={() => {
                setSearch('');
                setSelectedCategory(null);
              }}
              className="mt-2 text-[11px] text-primary hover:text-primary/80"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>

      {/* ── Footer — discover more ───────────────────────────────────── */}
      <div className="rounded-xl border border-border/30 bg-gradient-to-br from-primary/[0.04] to-transparent p-3">
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Thousands more servers available — discover them at{' '}
          <a
            href="https://github.com/punkpeye/awesome-mcp-servers"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
          >
            awesome-mcp-servers
          </a>
          ,{' '}
          <a
            href="https://github.com/modelcontextprotocol/servers"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
          >
            official reference
          </a>
          , or stream live integrations from{' '}
          <a
            href="https://mcp.composio.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
          >
            Composio
          </a>
          .
        </p>
      </div>
    </div>
  );
};

export default McpCatalog;
