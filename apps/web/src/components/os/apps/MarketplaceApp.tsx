import { useState, useEffect, useCallback } from 'react';
import { Store, Search, Download, Trash2, Loader2, Shield, Package, CheckCircle2, AlertTriangle } from 'lucide-react';
import { adapter } from '@/lib/adapter';
import { useToast } from '@/hooks/use-toast';

interface MarketplacePackage {
  id: number;
  name: string;
  description: string;
  type: string;
  category?: string;
  source?: string;
  installed: boolean;
  scanStatus?: 'passed' | 'failed' | 'not_scanned';
  scanScore?: number;
}

interface SearchResult {
  packages: MarketplacePackage[];
  total: number;
  categories?: string[];
}

type Tab = 'search' | 'installed';

const MarketplaceApp = () => {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MarketplacePackage[]>([]);
  const [installed, setInstalled] = useState<MarketplacePackage[]>([]);
  const [loading, setLoading] = useState(false);
  const [installing, setInstalling] = useState<number | null>(null);
  const [total, setTotal] = useState(0);

  const searchPackages = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${adapter.getServerUrl()}/api/marketplace/search?query=${encodeURIComponent(q)}&limit=20`);
      if (res.ok) {
        const data: SearchResult = await res.json();
        setResults(data.packages ?? []);
        setTotal(data.total ?? 0);
      }
    } catch { setResults([]); }
    finally { setLoading(false); }
  }, []);

  const loadInstalled = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${adapter.getServerUrl()}/api/marketplace/installed`);
      if (res.ok) {
        const data = await res.json();
        setInstalled(data.installations ?? []);
      }
    } catch { setInstalled([]); }
    finally { setLoading(false); }
  }, []);

  // Initial load
  useEffect(() => {
    searchPackages('');
    loadInstalled();
  }, [searchPackages, loadInstalled]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => searchPackages(query), 300);
    return () => clearTimeout(t);
  }, [query, searchPackages]);

  const handleInstall = async (pkg: MarketplacePackage) => {
    setInstalling(pkg.id);
    try {
      const res = await fetch(`${adapter.getServerUrl()}/api/marketplace/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId: pkg.id }),
      });
      if (res.ok) {
        toast({ title: 'Installed', description: `${pkg.name} installed successfully` });
        setResults(prev => prev.map(p => p.id === pkg.id ? { ...p, installed: true } : p));
        loadInstalled();
      } else {
        const err = await res.json().catch(() => ({ error: 'Install failed' }));
        toast({ title: 'Install failed', description: err.error ?? 'Unknown error', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Install failed', description: 'Server unreachable', variant: 'destructive' });
    }
    finally { setInstalling(null); }
  };

  const handleUninstall = async (pkg: MarketplacePackage) => {
    try {
      await fetch(`${adapter.getServerUrl()}/api/marketplace/uninstall`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId: pkg.id }),
      });
      toast({ title: 'Uninstalled', description: `${pkg.name} removed` });
      setInstalled(prev => prev.filter(p => p.id !== pkg.id));
      setResults(prev => prev.map(p => p.id === pkg.id ? { ...p, installed: false } : p));
    } catch {
      toast({ title: 'Uninstall failed', variant: 'destructive' });
    }
  };

  const scanBadge = (pkg: MarketplacePackage) => {
    if (pkg.scanStatus === 'passed') return <Shield className="w-3 h-3 text-emerald-400" />;
    if (pkg.scanStatus === 'failed') return <AlertTriangle className="w-3 h-3 text-destructive" />;
    return null;
  };

  const displayList = tab === 'installed' ? installed : results;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/30">
        <div className="flex items-center gap-3 mb-3">
          <Store className="w-5 h-5" style={{ color: 'var(--honey-500)' }} />
          <h2 className="text-sm font-display font-semibold text-foreground">Marketplace</h2>
          <span className="text-[10px] text-muted-foreground ml-auto">{total} packages available</span>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-3">
          {(['search', 'installed'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1 text-xs font-display rounded-lg transition-colors ${
                tab === t ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t === 'search' ? 'Browse' : `Installed (${installed.length})`}
            </button>
          ))}
        </div>

        {/* Search */}
        {tab === 'search' && (
          <div className="flex items-center gap-2 bg-muted/30 rounded-lg px-3 py-1.5">
            <Search className="w-3.5 h-3.5 text-muted-foreground" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search skills, plugins, connectors..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
          </div>
        )}
      </div>

      {/* Package list */}
      <div className="flex-1 overflow-auto p-3 space-y-2">
        {loading && displayList.length === 0 && (
          <div className="text-center py-8">
            <Loader2 className="w-6 h-6 text-muted-foreground/40 mx-auto mb-2 animate-spin" />
            <p className="text-xs text-muted-foreground">Loading packages...</p>
          </div>
        )}

        {!loading && displayList.length === 0 && (
          <div className="text-center py-8">
            <Package className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">
              {tab === 'installed' ? 'No packages installed yet' : query ? `No results for "${query}"` : 'No packages available'}
            </p>
          </div>
        )}

        {displayList.map(pkg => (
          <div
            key={pkg.id}
            className="flex items-start gap-3 p-3 rounded-xl border border-border/30 bg-secondary/20 hover:border-border/60 transition-colors"
          >
            <Package className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-display font-medium text-foreground truncate">{pkg.name}</span>
                {scanBadge(pkg)}
                {pkg.installed && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
              </div>
              <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">{pkg.description}</p>
              <div className="flex items-center gap-2 mt-1">
                {pkg.type && <span className="text-[9px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{pkg.type}</span>}
                {pkg.category && <span className="text-[9px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{pkg.category}</span>}
                {pkg.source && <span className="text-[9px] text-muted-foreground/60">{pkg.source}</span>}
              </div>
            </div>
            <div className="shrink-0">
              {pkg.installed ? (
                <button
                  onClick={() => handleUninstall(pkg)}
                  className="flex items-center gap-1 px-2 py-1 text-[10px] rounded-lg text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="w-3 h-3" /> Remove
                </button>
              ) : (
                <button
                  onClick={() => handleInstall(pkg)}
                  disabled={installing === pkg.id}
                  className="flex items-center gap-1 px-2 py-1 text-[10px] rounded-lg text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                >
                  {installing === pkg.id
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : <Download className="w-3 h-3" />
                  }
                  Install
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MarketplaceApp;
