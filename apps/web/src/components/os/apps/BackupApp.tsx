import { useState, useEffect, type ChangeEvent } from 'react';
import { Archive, Download, Upload, Loader2, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { adapter } from '@/lib/adapter';
import { DATE_LOCALE } from '@/lib/date-locale';
import { ApprovalModal, type ApprovalRequest } from '@/components/ui/approval-modal';

interface BackupMeta {
  timestamp: string;
  workspaces: number;
  frames: number;
  sizeBytes: number;
}

/**
 * R4-006 — classify a `GET /api/backup/metadata` response status.
 *
 * 404 is the legitimate "no backups yet" empty state (the route 404s when no
 * metadata file exists). Any other non-2xx is a real fault that must surface
 * as a retryable error — NOT be collapsed into the empty state. Exported pure
 * so the rule is regression-testable without rendering React (same constraint
 * as ConnectorsApp.shouldResetCredentialInputs).
 */
export function classifyMetadataStatus(status: number): 'ok' | 'empty' | 'error' {
  if (status === 404) return 'empty';
  if (status >= 200 && status < 300) return 'ok';
  return 'error';
}

const BackupApp = () => {
  const [backups, setBackups] = useState<BackupMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [pendingRestoreFile, setPendingRestoreFile] = useState<File | null>(null);

  const loadMetadata = () => {
    setLoading(true);
    setLoadError(false);
    // The route returns 404 when no backup exists yet — that's the legitimate
    // empty state, not a failure. Any other non-2xx (or a network error) is a
    // real fault and must surface as a retryable error, never as "No backups".
    adapter.fetchRaw('/api/backup/metadata')
      .then(async r => {
        const kind = classifyMetadataStatus(r.status);
        if (kind === 'empty') { setBackups([]); setLoading(false); return; }
        if (kind === 'error') { setLoadError(true); setLoading(false); return; }
        const data = await r.json();
        setBackups(Array.isArray(data) ? data : data.backups ?? []);
        setLoading(false);
      })
      .catch(() => { setLoadError(true); setLoading(false); });
  };

  useEffect(() => { loadMetadata(); }, []);

  const handleBackup = async () => {
    setCreating(true);
    setLastResult(null);
    try {
      const res = await adapter.fetchRaw('/api/backup', { method: 'POST' });
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

  const restoreBackup = async (file: File) => {
    setRestoring(true);
    setLastResult(null);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '');
        reader.onerror = () => reject(reader.error ?? new Error('read failed'));
        reader.readAsDataURL(file);
      });
      const res = await adapter.fetchRaw('/api/restore', {
        method: 'POST',
        body: JSON.stringify({ backup: base64 }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        const count = data?.filesRestored;
        setLastResult(
          typeof count === 'number'
            ? `Backup restored successfully (${count} files). Restart the server to apply.`
            : 'Backup restored successfully. Restart the server to apply.',
        );
      } else {
        const err = await res.json().catch(() => null);
        setLastResult(err?.error ?? 'Restore failed. Check server logs.');
      }
    } catch {
      setLastResult('Connection error — is the backend running?');
    }
    setRestoring(false);
  };

  const handleRestore = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset the input so re-selecting the same file fires onChange again.
    e.target.value = '';
    if (!file) return;
    setLastResult(null);
    setPendingRestoreFile(file);
  };

  const restoreApproval: ApprovalRequest | null = pendingRestoreFile
    ? {
      action: `Restore backup: ${pendingRestoreFile.name}`,
      riskLevel: 'critical',
      scope: [
        'Overwrite current data with the selected backup.',
        'Current workspaces, sessions, and memory may be replaced.',
        'A restart is required after restore succeeds.',
      ],
    }
    : null;

  const confirmRestore = async () => {
    if (!pendingRestoreFile) return;
    const file = pendingRestoreFile;
    await restoreBackup(file);
    setPendingRestoreFile(null);
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
            <Archive className="w-4 h-4 text-honey" />
            <h2 className="text-sm font-display font-semibold text-foreground">Backup & Restore</h2>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleBackup} disabled={creating || restoring}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-primary/20 text-honey hover:bg-primary/30 transition-colors disabled:opacity-50 font-display">
              {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
              {creating ? 'Creating...' : 'Create Backup'}
            </button>
            <label className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-secondary/50 text-foreground hover:bg-secondary/70 transition-colors font-display cursor-pointer ${creating || restoring ? 'opacity-50 pointer-events-none' : ''}`}>
              {restoring ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
              {restoring ? 'Restoring...' : 'Restore'}
              <input type="file" accept=".waggle-backup" aria-label="Restore backup file" className="sr-only" disabled={creating || restoring} onChange={handleRestore} />
            </label>
          </div>
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
            <Loader2 className="w-5 h-5 animate-spin text-honey" />
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <AlertTriangle className="w-8 h-8 text-destructive/40 mb-2" />
            <p className="text-sm text-foreground">Couldn't load backup history.</p>
            <p className="text-xs text-muted-foreground mt-1">The backend may be offline or returned an error.</p>
            <button onClick={loadMetadata}
              className="mt-3 px-3 py-1.5 text-xs rounded-lg bg-primary/20 text-honey hover:bg-primary/30 transition-colors font-display">
              Retry
            </button>
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
                    {new Date(b.timestamp).toLocaleString(DATE_LOCALE)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {b.workspaces} workspace{b.workspaces !== 1 ? 's' : ''} · {b.frames} frames · {formatSize(b.sizeBytes)}
                  </p>
                </div>
                <label className={`text-[11px] text-honey hover:text-honey/80 font-display cursor-pointer ${creating || restoring ? 'opacity-50 pointer-events-none' : ''}`}>
                  Restore
                  <input type="file" accept=".waggle-backup" aria-label={`Restore backup file from ${new Date(b.timestamp).toLocaleString(DATE_LOCALE)}`} className="sr-only" disabled={creating || restoring} onChange={handleRestore} />
                </label>
              </div>
            ))}
          </div>
        )}
      </div>
      <ApprovalModal
        request={restoreApproval}
        approveLabel={restoring ? 'Restoring...' : 'Restore backup'}
        busy={restoring}
        onApprove={() => { void confirmRestore(); }}
        onCancel={() => {
          if (!restoring) setPendingRestoreFile(null);
        }}
      />
    </div>
  );
};

export default BackupApp;
