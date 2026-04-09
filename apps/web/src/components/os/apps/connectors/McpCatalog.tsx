/**
 * McpCatalog — searchable catalog of community MCP servers.
 *
 * Shows popular MCP servers organized by category with one-click
 * install instructions. Includes both official and community servers.
 */

import { useState } from 'react';
import {
  Server, Search, ExternalLink, CheckCircle2, Star, Database,
  FileText, Globe, Code, MessageSquare, BarChart3, Lock,
  Briefcase, Image, Terminal, Wrench,
} from 'lucide-react';
import { Input } from '@/components/ui/input';

interface McpServer {
  id: string;
  name: string;
  description: string;
  author: string;
  category: string;
  stars?: number;
  url: string;
  installCmd: string;
  capabilities: string[];
  official?: boolean;
}

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  'Database': Database,
  'Files': FileText,
  'Web': Globe,
  'Code': Code,
  'Communication': MessageSquare,
  'Analytics': BarChart3,
  'Security': Lock,
  'Productivity': Briefcase,
  'Media': Image,
  'DevTools': Terminal,
  'Utilities': Wrench,
};

// Curated catalog of popular MCP servers
const MCP_CATALOG: McpServer[] = [
  // Database
  { id: 'postgres', name: 'PostgreSQL', description: 'Query PostgreSQL databases, inspect schemas, run migrations', author: 'MCP', category: 'Database', url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/postgres', installCmd: 'npx @modelcontextprotocol/server-postgres', capabilities: ['query', 'schema', 'migrations'], official: true },
  { id: 'sqlite', name: 'SQLite', description: 'Read and query SQLite databases', author: 'MCP', category: 'Database', url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/sqlite', installCmd: 'npx @modelcontextprotocol/server-sqlite', capabilities: ['query', 'schema'], official: true },
  { id: 'redis', name: 'Redis', description: 'Interact with Redis key-value store', author: 'Community', category: 'Database', url: 'https://github.com/modelcontextprotocol/servers', installCmd: 'npx @mcp/redis-server', capabilities: ['get', 'set', 'query'] },

  // Files & Storage
  { id: 'filesystem', name: 'Filesystem', description: 'Read, write, and manage files on the local filesystem', author: 'MCP', category: 'Files', url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem', installCmd: 'npx @modelcontextprotocol/server-filesystem /path', capabilities: ['read', 'write', 'search', 'directory'], official: true },
  { id: 'gdrive', name: 'Google Drive', description: 'Search and read Google Drive files', author: 'MCP', category: 'Files', url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/gdrive', installCmd: 'npx @modelcontextprotocol/server-gdrive', capabilities: ['search', 'read', 'list'], official: true },
  { id: 's3', name: 'AWS S3', description: 'List, read, and manage S3 buckets and objects', author: 'Community', category: 'Files', url: 'https://github.com/modelcontextprotocol/servers', installCmd: 'npx @mcp/s3-server', capabilities: ['list', 'read', 'write'] },

  // Web & Search
  { id: 'brave-search', name: 'Brave Search', description: 'Web search and local search via Brave Search API', author: 'MCP', category: 'Web', url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search', installCmd: 'npx @modelcontextprotocol/server-brave-search', capabilities: ['web_search', 'local_search'], official: true },
  { id: 'fetch', name: 'Fetch', description: 'Fetch and convert web content to markdown', author: 'MCP', category: 'Web', url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/fetch', installCmd: 'npx @modelcontextprotocol/server-fetch', capabilities: ['fetch', 'convert'], official: true },
  { id: 'puppeteer', name: 'Puppeteer', description: 'Browser automation — navigate, screenshot, interact with web pages', author: 'MCP', category: 'Web', url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/puppeteer', installCmd: 'npx @modelcontextprotocol/server-puppeteer', capabilities: ['navigate', 'screenshot', 'click', 'fill'], official: true },

  // Code & DevTools
  { id: 'github', name: 'GitHub', description: 'Manage repos, issues, PRs, search code across GitHub', author: 'MCP', category: 'Code', url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/github', installCmd: 'npx @modelcontextprotocol/server-github', capabilities: ['repos', 'issues', 'prs', 'search', 'files'], official: true },
  { id: 'gitlab', name: 'GitLab', description: 'Manage GitLab projects, issues, merge requests', author: 'Community', category: 'Code', url: 'https://github.com/modelcontextprotocol/servers', installCmd: 'npx @mcp/gitlab-server', capabilities: ['projects', 'issues', 'mrs'] },
  { id: 'sentry', name: 'Sentry', description: 'Query errors, issues, and performance data from Sentry', author: 'MCP', category: 'DevTools', url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/sentry', installCmd: 'npx @modelcontextprotocol/server-sentry', capabilities: ['issues', 'events', 'projects'], official: true },

  // Communication
  { id: 'slack', name: 'Slack', description: 'Read and send Slack messages, manage channels', author: 'MCP', category: 'Communication', url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/slack', installCmd: 'npx @modelcontextprotocol/server-slack', capabilities: ['read', 'send', 'channels', 'search'], official: true },
  { id: 'gmail', name: 'Gmail', description: 'Read, search, and send emails via Gmail', author: 'Community', category: 'Communication', url: 'https://github.com/modelcontextprotocol/servers', installCmd: 'npx @mcp/gmail-server', capabilities: ['read', 'search', 'send'] },

  // Productivity
  { id: 'notion', name: 'Notion', description: 'Search, read, and create Notion pages and databases', author: 'Community', category: 'Productivity', url: 'https://github.com/modelcontextprotocol/servers', installCmd: 'npx @mcp/notion-server', capabilities: ['search', 'read', 'create', 'databases'] },
  { id: 'linear', name: 'Linear', description: 'Manage Linear issues, projects, and cycles', author: 'Community', category: 'Productivity', url: 'https://github.com/modelcontextprotocol/servers', installCmd: 'npx @mcp/linear-server', capabilities: ['issues', 'projects', 'cycles'] },
  { id: 'jira', name: 'Jira', description: 'Search and manage Jira issues and projects', author: 'Community', category: 'Productivity', url: 'https://github.com/modelcontextprotocol/servers', installCmd: 'npx @mcp/jira-server', capabilities: ['issues', 'search', 'projects'] },

  // Analytics
  { id: 'prometheus', name: 'Prometheus', description: 'Query Prometheus metrics and alerts', author: 'Community', category: 'Analytics', url: 'https://github.com/modelcontextprotocol/servers', installCmd: 'npx @mcp/prometheus-server', capabilities: ['query', 'alerts', 'targets'] },

  // Utilities
  { id: 'memory', name: 'Memory', description: 'Persistent key-value memory for AI agents', author: 'MCP', category: 'Utilities', url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/memory', installCmd: 'npx @modelcontextprotocol/server-memory', capabilities: ['store', 'retrieve', 'search'], official: true },
  { id: 'sequentialthinking', name: 'Sequential Thinking', description: 'Chain-of-thought reasoning with revision support', author: 'MCP', category: 'Utilities', url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking', installCmd: 'npx @modelcontextprotocol/server-sequentialthinking', capabilities: ['think', 'revise'], official: true },
];

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

  const categories = Array.from(new Set(MCP_CATALOG.map(s => s.category))).sort();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-display font-semibold text-foreground">MCP Server Catalog</h3>
          <p className="text-[11px] text-muted-foreground">{MCP_CATALOG.length} servers available — extend the agent with external tools</p>
        </div>
      </div>

      {/* Search + category filter */}
      <div className="flex items-center gap-2">
        <div className="flex-1 flex items-center gap-1.5 bg-muted/50 rounded-lg px-2 py-1">
          <Search className="w-3 h-3 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search servers..."
            className="flex-1 bg-transparent text-xs h-auto border-0 p-0 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>
      </div>

      {/* Category chips */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setSelectedCategory(null)}
          className={`px-2 py-0.5 rounded-lg text-[11px] transition-colors ${
            !selectedCategory ? 'bg-primary/20 text-primary' : 'bg-secondary/30 text-muted-foreground hover:text-foreground'
          }`}
        >
          All
        </button>
        {categories.map(cat => {
          const Icon = CATEGORY_ICONS[cat] || Server;
          return (
            <button
              key={cat}
              onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
              className={`px-2 py-0.5 rounded-lg text-[11px] transition-colors flex items-center gap-1 ${
                selectedCategory === cat ? 'bg-primary/20 text-primary' : 'bg-secondary/30 text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="w-2.5 h-2.5" /> {cat}
            </button>
          );
        })}
      </div>

      {/* Server list */}
      <div className="space-y-2">
        {filtered.map(server => {
          const CatIcon = CATEGORY_ICONS[server.category] || Server;
          return (
            <div key={server.id} className="p-3 rounded-xl bg-secondary/30 border border-border/30 hover:border-primary/20 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0">
                  <CatIcon className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-display font-semibold text-foreground">{server.name}</span>
                      {server.official && (
                        <span className="px-1 py-0 rounded text-[9px] bg-primary/20 text-primary font-display">Official</span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{server.description}</p>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {server.capabilities.map(cap => (
                        <span key={cap} className="px-1.5 py-0 rounded text-[11px] bg-muted/50 text-muted-foreground">{cap}</span>
                      ))}
                    </div>
                  </div>
                </div>
                <a
                  href={server.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1 rounded text-muted-foreground hover:text-primary transition-colors shrink-0"
                  title="View on GitHub"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
              {/* Install command */}
              <div className="mt-2 flex items-center gap-2 bg-background/50 rounded-lg px-2.5 py-1.5">
                <Terminal className="w-3 h-3 text-muted-foreground shrink-0" />
                <code className="text-[11px] text-foreground font-mono flex-1 truncate">{server.installCmd}</code>
                <button
                  onClick={() => navigator.clipboard.writeText(server.installCmd)}
                  className="text-[11px] text-primary hover:text-primary/80 shrink-0"
                >
                  Copy
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground/60 mt-1">by {server.author}</p>
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

      {/* Community link */}
      <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 text-center">
        <p className="text-[11px] text-muted-foreground">
          Discover more at the{' '}
          <a
            href="https://github.com/modelcontextprotocol/servers"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:text-primary/80 underline"
          >
            MCP Server Registry
          </a>
          {' '}— 6,000+ community servers available.
        </p>
      </div>
    </div>
  );
};

export default McpCatalog;
