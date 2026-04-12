import { useState, useEffect } from 'react';
import { Archive, Download, Upload, Loader2, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { adapter } from '@/lib/adapter';

interface BackupMeta {
  timestamp: string;
  workspaces: number;
  frames: number;
  sizeBytes: number;
}

const BackupApp = () => {
  const [backups, setBackups] = useState<BackupMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  useEffect(() => {
    adapter.fetch('/api/backup/metadata').then(r => r.json())
      .then(data => { setBackups(Array.isArray(data) ? data : data.backups ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const handleBackup = async () => {
    setCreating(true);
    setLastResult(null);
    try {
      const res = await adapter.fetch('/api/backup', { method: 'POST' });
      if (res.ok) {
        setLastResult('Backup created successfully.');
        const data = await res.json().catch(() => null);
        if (data) setBackups(prev => [data, ...prev]);
      } else {
        setLastResult('Backup failed. Check server logs.');
      }
    } catch {
      setLastResult('Connection error — is the backend running?');
    }
    setCreating(false);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 px-4 py-3 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Archive className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-display font-semibold text-foreground">Backup & Restore</h2>
          </div>
          <button onClick={handleBackup} disabled={creating}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-primary/20 text-primary hover:bg-primary/30 transition-colors disabled:opacity-50 font-display">
            {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
            {creating ? 'Creating...' : 'Create Backup'}
          </button>
        </div>
        {lastResult && (
          <p className={`text-[11px] mt-2 ${lastResult.includes('success') ? 'text-emerald-400' : 'text-destructive'}`}>
            {lastResult}
          </p>
        )}
      </div>

      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : backups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <Archive className="w-8 h-8 text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">No backups yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Create your first backup to protect your workspaces and memories.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {backups.map((b, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-muted/20 hover:bg-muted/30 transition-colors">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground font-display">
                    {new Date(b.timestamp).toLocaleString()}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {b.workspaces} workspace{b.workspaces !== 1 ? 's' : ''} · {b.frames} frames · {formatSize(b.sizeBytes)}
                  </p>
                </div>
                <button className="text-[11px] text-primary hover:text-primary/80 font-display">Restore</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default BackupApp;
