/**
 * McpCatalog — searchable catalog of 100+ community MCP servers.
 *
 * Shows MCP servers organized by 14 categories with search,
 * install commands, and links to source repos.
 */

import { useState } from 'react';
import {
  Server, Search, ExternalLink, Database,
  FileText, Globe, Code, MessageSquare, BarChart3, Lock,
  Briefcase, Image, Terminal, Wrench, Cloud, Cpu,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { MCP_CATALOG, CATEGORY_EMOJI, type McpServer } from './mcp-registry';

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  'Database': Database,
  'Files': FileText,
  'Web': Globe,
  'Code': Code,
  'Communication': MessageSquare,
  'Productivity': Briefcase,
  'Analytics': BarChart3,
  'Cloud': Cloud,
  'DevTools': Terminal,
  'Business': Briefcase,
  'AI & ML': Cpu,
  'Security': Lock,
  'Media': Image,
  'Utilities': Wrench,
};

const McpCatalog = () => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const filtered = MCP_CATALOG.filter(s => {
    const matchesSearch = !search || s.name.toLowerCase().includes(search.toLowerCase())
      || s.description.toLowerCase().includes(search.toLowerCase())
      || s.capabilities.some(c => c.toLowerCase().includes(search.toLowerCase()));
    const matchesCat = !selectedCategory || s.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  const categories = Array.from(new Set(MCP_CATALOG.map(s => s.category)));
  const officialCount = MCP_CATALOG.filter(s => s.official).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-display font-semibold text-foreground">MCP Server Catalog</h3>
          <p className="text-[11px] text-muted-foreground">
            {MCP_CATALOG.length} servers across {categories.length} categories ({officialCount} official)
            {' '}+ 250+ via Composio gateway
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-1.5 bg-muted/50 rounded-lg px-2 py-1">
        <Search className="w-3 h-3 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search servers... (e.g. postgres, slack, stripe)"
          className="flex-1 bg-transparent text-xs h-auto border-0 p-0 focus-visible:ring-0 focus-visible:ring-offset-0"
        />
        {search && (
          <span className="text-[11px] text-muted-foreground">{filtered.length} results</span>
        )}
      </div>

      {/* Category chips */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setSelectedCategory(null)}
          className={`px-2 py-0.5 rounded-lg text-[11px] transition-colors ${
            !selectedCategory ? 'bg-primary/20 text-primary' : 'bg-secondary/30 text-muted-foreground hover:text-foreground'
          }`}
        >
          All ({MCP_CATALOG.length})
        </button>
        {categories.map(cat => {
          const count = MCP_CATALOG.filter(s => s.category === cat).length;
          const emoji = CATEGORY_EMOJI[cat] ?? '';
          return (
            <button
              key={cat}
              onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
              className={`px-2 py-0.5 rounded-lg text-[11px] transition-colors flex items-center gap-1 ${
                selectedCategory === cat ? 'bg-primary/20 text-primary' : 'bg-secondary/30 text-muted-foreground hover:text-foreground'
              }`}
            >
              {emoji} {cat} ({count})
            </button>
          );
        })}
      </div>

      {/* Server list */}
      <div className="space-y-1.5 max-h-[60vh] overflow-auto">
        {filtered.map(server => {
          const CatIcon = CATEGORY_ICONS[server.category] || Server;
          return (
            <div key={server.id} className="p-2.5 rounded-xl bg-secondary/30 border border-border/30 hover:border-primary/20 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0">
                  <CatIcon className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      {server.logo && (
                        <span className="text-[9px] font-bold bg-primary/20 text-primary rounded px-1">{server.logo}</span>
                      )}
                      <span className="text-xs font-display font-semibold text-foreground">{server.name}</span>
                      {server.official && (
                        <span className="px-1 py-0 rounded text-[9px] bg-emerald-500/20 text-emerald-400 font-display">Official</span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{server.description}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {server.capabilities.slice(0, 5).map(cap => (
                        <span key={cap} className="px-1 py-0 rounded text-[11px] bg-muted/50 text-muted-foreground">{cap}</span>
                      ))}
                    </div>
                  </div>
                </div>
                <a
                  href={server.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1 rounded text-muted-foreground hover:text-primary transition-colors shrink-0"
                  title="View source"
                >
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              {/* Install command */}
              <div className="mt-1.5 flex items-center gap-2 bg-background/50 rounded-lg px-2 py-1">
                <Terminal className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
                <code className="text-[11px] text-foreground font-mono flex-1 truncate">{server.installCmd}</code>
                <button
                  onClick={() => navigator.clipboard.writeText(server.installCmd)}
                  className="text-[11px] text-primary hover:text-primary/80 shrink-0"
                >
                  Copy
                </button>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center py-8">
            <Server className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No servers match your search</p>
          </div>
        )}
      </div>

      {/* Footer links */}
      <div className="flex items-center justify-between p-3 rounded-xl bg-primary/5 border border-primary/20">
        <p className="text-[11px] text-muted-foreground">
          Discover thousands more at{' '}
          <a href="https://github.com/punkpeye/awesome-mcp-servers" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 underline">awesome-mcp-servers</a>
          {' '}and{' '}
          <a href="https://github.com/modelcontextprotocol/servers" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 underline">official MCP servers</a>
        </p>
      </div>
    </div>
  );
};

export default McpCatalog;
