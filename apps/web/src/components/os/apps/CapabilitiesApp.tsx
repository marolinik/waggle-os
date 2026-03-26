import { useState, useEffect } from 'react';
import { Package, Download, CheckCircle2, Shield, Star, Search, Loader2, Store, Grid3X3, List, Trash2 } from 'lucide-react';
import { adapter } from '@/lib/adapter';
import type { SkillPack } from '@/lib/types';

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

const CapabilitiesApp = () => {
  const [packs, setPacks] = useState<SkillPack[]>([]);
  const [marketplacePacks, setMarketplacePacks] = useState<SkillPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [installing, setInstalling] = useState<string | null>(null);
  const [tab, setTab] = useState<'installed' | 'marketplace' | 'starter' | 'tools'>('installed');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  useEffect(() => {
    Promise.allSettled([
      adapter.getSkills(),
      adapter.getStarterPacks(),
      adapter.getMarketplacePacks(),
      adapter.getCapabilityPacks(),
    ])
      .then(([skills, starters, marketplace, caps]) => {
        const all: SkillPack[] = [];
        if (skills.status === 'fulfilled') all.push(...skills.value);
        if (starters.status === 'fulfilled') all.push(...starters.value);
        if (caps.status === 'fulfilled') all.push(...caps.value);
        setPacks(all);
        if (marketplace.status === 'fulfilled') setMarketplacePacks(marketplace.value);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleInstall = async (packId: string) => {
    setInstalling(packId);
    try {
      await adapter.installPack(packId);
      setPacks(prev => prev.map(p => p.id === packId ? { ...p, installed: true } : p));
    } finally { setInstalling(null); }
  };

  const handleMarketplaceInstall = async (packId: string) => {
    setInstalling(packId);
    try {
      await adapter.installMarketplacePack(packId);
      setMarketplacePacks(prev => prev.map(p => p.id === packId ? { ...p, installed: true } : p));
    } finally { setInstalling(null); }
  };

  const displayPacks = tab === 'marketplace' ? marketplacePacks : tab === 'installed' ? packs.filter(p => p.installed) : packs;
  const filtered = displayPacks.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.description.toLowerCase().includes(search.toLowerCase())
  );

  const PackCard = ({ pack, onInstall }: { pack: SkillPack; onInstall: (id: string) => void }) => {
    const trust = trustBadges[pack.trust] || trustBadges.community;
    const TrustIcon = trust.icon;
    return (
      <div className={`p-3 rounded-xl bg-secondary/30 border border-border/30 ${viewMode === 'list' ? '' : ''}`}>
        <div className="flex items-start justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-primary" />
            <span className="text-sm font-display font-medium text-foreground">{pack.name}</span>
          </div>
          <TrustIcon className={`w-3 h-3 ${trust.color}`} />
        </div>
        <p className="text-xs text-muted-foreground mb-2">{pack.description}</p>
        {pack.skills && pack.skills.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {pack.skills.slice(0, 3).map(s => (
              <span key={s} className="px-1.5 py-0.5 rounded text-[9px] bg-muted text-muted-foreground">{s}</span>
            ))}
            {pack.skills.length > 3 && <span className="text-[9px] text-muted-foreground">+{pack.skills.length - 3}</span>}
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className={`px-2 py-0.5 rounded text-[10px] font-display capitalize ${categoryColors[pack.category] || 'bg-muted text-muted-foreground'}`}>
            {pack.category}
          </span>
          {pack.installed ? (
            <span className="text-[10px] text-emerald-400 flex items-center gap-0.5"><CheckCircle2 className="w-3 h-3" /> Installed</span>
          ) : (
            <button
              onClick={() => onInstall(pack.id)}
              disabled={installing === pack.id}
              className="flex items-center gap-1 px-2 py-1 text-[10px] rounded-lg bg-primary/20 text-primary hover:bg-primary/30 disabled:opacity-50 transition-colors"
            >
              {installing === pack.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
              Install
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="h-full overflow-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-display font-semibold text-foreground">Skills & Apps</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-1 rounded transition-colors ${viewMode === 'grid' ? 'text-primary' : 'text-muted-foreground'}`}
          >
            <Grid3X3 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-1 rounded transition-colors ${viewMode === 'list' ? 'text-primary' : 'text-muted-foreground'}`}
          >
            <List className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 p-0.5 rounded-lg bg-muted/50 w-fit">
        {(['installed', 'starter', 'marketplace', 'tools'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-xs rounded-md font-display transition-colors capitalize ${
              tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'marketplace' && <Store className="w-3 h-3 inline mr-1" />}
            {t}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5 bg-muted/50 rounded-lg px-2 py-1.5 mb-4">
        <Search className="w-3.5 h-3.5 text-muted-foreground" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search capabilities..."
          className="flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      )}

      <div className={viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 gap-2' : 'space-y-2'}>
        {filtered.map(pack => (
          <PackCard
            key={pack.id}
            pack={pack}
            onInstall={tab === 'marketplace' ? handleMarketplaceInstall : handleInstall}
          />
        ))}
      </div>

      {!loading && filtered.length === 0 && tab !== 'tools' && (
        <div className="text-center py-8">
          <Package className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">No {tab} packs found</p>
        </div>
      )}

      {/* Tools tab — read-only overview of all agent capabilities */}
      {tab === 'tools' && (
        <div className="space-y-3">
          <p className="text-[10px] text-muted-foreground mb-3">These are the built-in tools the agent can use. They work automatically — no setup needed.</p>
          {[
            { category: 'File Operations', tools: ['read_file', 'write_file', 'edit_file', 'list_directory', 'find_files', 'delete_path'], desc: 'Read, write, search, and manage files in workspace' },
            { category: 'Code & Shell', tools: ['bash', 'search_content', 'create_directory'], desc: 'Execute commands, search code, manage directories' },
            { category: 'Web & Search', tools: ['web_search', 'web_fetch', 'perplexity_search', 'tavily_search', 'brave_search'], desc: 'Search the web, fetch pages, get real-time information' },
            { category: 'Memory', tools: ['save_memory', 'search_memory', 'get_awareness'], desc: 'Remember facts, search past conversations, track context' },
            { category: 'Documents', tools: ['generate_docx', 'read_docx', 'summarize_document'], desc: 'Create Word docs, read documents, generate reports' },
            { category: 'Git', tools: ['git_status', 'git_commit', 'git_push', 'git_diff', 'git_log'], desc: 'Version control — commit, push, diff, branch management' },
            { category: 'Planning', tools: ['create_plan', 'update_plan', 'execute_plan'], desc: 'Break down tasks, track progress, execute step by step' },
            { category: 'Skills', tools: ['create_skill', 'list_skills', 'suggest_skill'], desc: 'Create, manage, and discover reusable skills' },
            { category: 'Agents', tools: ['spawn_agent'], desc: 'Launch specialist sub-agents for parallel work' },
            { category: 'Scheduling', tools: ['schedule_cron', 'list_crons', 'trigger_cron'], desc: 'Set up recurring tasks and automated runs' },
            { category: 'Browser', tools: ['open_page', 'screenshot', 'click', 'fill'], desc: 'Browse websites, fill forms, take screenshots' },
            { category: 'Connectors', tools: ['29 services'], desc: 'GitHub, Slack, Notion, Jira, and more — connect in the Connectors app' },
          ].map(group => (
            <div key={group.category} className="p-2.5 rounded-lg bg-secondary/30 border border-border/30">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-display font-medium text-foreground">{group.category}</span>
                <span className="text-[9px] text-muted-foreground">{group.tools.length} tool{group.tools.length > 1 ? 's' : ''}</span>
              </div>
              <p className="text-[10px] text-muted-foreground mb-1.5">{group.desc}</p>
              <div className="flex flex-wrap gap-1">
                {group.tools.map(t => (
                  <span key={t} className="px-1.5 py-0.5 text-[8px] rounded bg-muted/50 text-muted-foreground font-mono">{t}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CapabilitiesApp;
