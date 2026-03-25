import { useState, useEffect } from 'react';
import { Package, Download, CheckCircle2, Shield, Star, Search, Loader2 } from 'lucide-react';
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
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [installing, setInstalling] = useState<string | null>(null);

  useEffect(() => {
    Promise.allSettled([adapter.getSkills(), adapter.getStarterPacks()])
      .then(([skills, starters]) => {
        const all: SkillPack[] = [];
        if (skills.status === 'fulfilled') all.push(...skills.value);
        if (starters.status === 'fulfilled') all.push(...starters.value);
        setPacks(all);
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

  const filtered = packs.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="h-full overflow-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-display font-semibold text-foreground">Skills & Apps</h2>
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {filtered.map(pack => {
          const trust = trustBadges[pack.trust] || trustBadges.community;
          const TrustIcon = trust.icon;
          return (
            <div key={pack.id} className="p-3 rounded-xl bg-secondary/30 border border-border/30">
              <div className="flex items-start justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-primary" />
                  <span className="text-sm font-display font-medium text-foreground">{pack.name}</span>
                </div>
                <div className="flex items-center gap-1">
                  <TrustIcon className={`w-3 h-3 ${trust.color}`} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mb-2">{pack.description}</p>
              <div className="flex items-center justify-between">
                <span className={`px-2 py-0.5 rounded text-[10px] font-display capitalize ${categoryColors[pack.category] || 'bg-muted text-muted-foreground'}`}>
                  {pack.category}
                </span>
                {pack.installed ? (
                  <span className="text-[10px] text-emerald-400 flex items-center gap-0.5"><CheckCircle2 className="w-3 h-3" /> Installed</span>
                ) : (
                  <button
                    onClick={() => handleInstall(pack.id)}
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
        })}
      </div>
    </div>
  );
};

export default CapabilitiesApp;
