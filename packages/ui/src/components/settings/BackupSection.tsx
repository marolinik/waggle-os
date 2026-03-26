/**
 * BackupSection — Backup & Restore UI for machine migration.
 *
 * Allows users to create encrypted backups of ~/.waggle/ and restore from backup files.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';

// ── Data Export Section (GDPR compliance) ──────────────────────────────

function DataExportSection({ apiBase }: { apiBase: string }) {
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<{ sizeBytes: number } | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleExport = useCallback(async () => {
    setExporting(true);
    setExportResult(null);
    setExportError(null);

    try {
      const res = await fetch(`${apiBase}/api/export`, {
        method: 'POST',
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Export failed' }));
        throw new Error((err as { error?: string }).error || `HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const sizeBytes = blob.size;

      // Trigger browser download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const today = new Date().toISOString().slice(0, 10);
      a.download = `waggle-export-${today}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setExportResult({ sizeBytes });
    } catch (err) {
      setExportError((err as Error).message || 'Export failed');
    } finally {
      setExporting(false);
    }
  }, [apiBase]);

  return (
    <div className="rounded-lg border border-border p-4">
      <h3 className="text-sm font-medium mb-2">Data Export</h3>
      <p className="text-xs text-muted-foreground mb-3">
        Download all your data including memories, sessions, and settings as a ZIP file.
        API keys are masked and vault secrets are excluded.
      </p>
      <button
        onClick={handleExport}
        disabled={exporting}
        className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {exporting ? (
          <span className="flex items-center gap-2">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
            Exporting...
          </span>
        ) : (
          'Export Data (ZIP)'
        )}
      </button>
      {exportResult && (
        <p className="mt-2 text-xs text-green-400">
          Export complete — {formatExportBytes(exportResult.sizeBytes)}
        </p>
      )}
      {exportError && (
        <p className="mt-2 text-xs text-red-400">
          Export failed: {exportError}
        </p>
      )}
    </div>
  );
}

function formatExportBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface BackupSectionProps {
  /** Optional override for API base URL (defaults to http://127.0.0.1:3333) */
  apiBase?: string;
}

interface BackupMetadata {
  lastBackupAt: string;
  sizeBytes: number;
  fileCount: number;
}

interface RestorePreview {
  preview: true;
  backupCreatedAt: string;
  totalFiles: number;
  existingFiles: string[];
  newFiles: string[];
  conflicts: string[];
}

interface RestoreResult {
  restored: boolean;
  filesRestored: number;
  totalFiles: number;
  conflicts: string[];
  errors?: string[];
  backupCreatedAt: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function BackupSection({ apiBase = 'http://127.0.0.1:3333' }: BackupSectionProps) {
  const [metadata, setMetadata] = useState<BackupMetadata | null>(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [preview, setPreview] = useState<RestorePreview | null>(null);
  const [restoreResult, setRestoreResult] = useState<RestoreResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  // Load backup metadata
  useEffect(() => {
    let cancelled = false;
    async function loadMetadata() {
      try {
        const res = await fetch(`${apiBase}/api/backup/metadata`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setMetadata(data as BackupMetadata);
        }
      } catch {
        // No metadata available
      }
    }
    loadMetadata();
    return () => { cancelled = true; };
  }, [apiBase]);

  // Create backup
  const handleBackup = useCallback(async () => {
    setBackupLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`${apiBase}/api/backup`, { method: 'POST' });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Backup failed' }));
        throw new Error((body as { error?: string }).error || 'Backup failed');
      }

      // Download the file
      const blob = await res.blob();
      const encrypted = res.headers.get('X-Waggle-Backup-Encrypted') === 'true';
      const fileCount = res.headers.get('X-Waggle-Backup-Files') || '?';

      const disposition = res.headers.get('Content-Disposition') || '';
      const filenameMatch = disposition.match(/filename="([^"]+)"/);
      const filename = filenameMatch ? filenameMatch[1] : `waggle-backup-${new Date().toISOString().slice(0, 10)}.waggle-backup`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Refresh metadata
      setMetadata({
        lastBackupAt: new Date().toISOString(),
        sizeBytes: blob.size,
        fileCount: parseInt(fileCount, 10) || 0,
      });

      setSuccessMsg(`Backup created (${fileCount} files, ${formatBytes(blob.size)}, ${encrypted ? 'encrypted' : 'unencrypted'})`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Backup failed');
    } finally {
      setBackupLoading(false);
    }
  }, [apiBase]);

  // File selection for restore
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setSuccessMsg(null);
    setRestoreResult(null);
    setPreview(null);
    setRestoreLoading(true);
    setPendingFile(file);

    try {
      // Read file as base64
      const arrayBuffer = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );

      // Request preview
      const res = await fetch(`${apiBase}/api/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backup: base64, preview: true }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Preview failed' }));
        throw new Error((body as { error?: string }).error || 'Failed to read backup file');
      }

      const data = await res.json() as RestorePreview;
      setPreview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read backup file');
      setPendingFile(null);
    } finally {
      setRestoreLoading(false);
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [apiBase]);

  // Confirm restore
  const handleConfirmRestore = useCallback(async () => {
    if (!pendingFile) return;

    setRestoreLoading(true);
    setError(null);

    try {
      const arrayBuffer = await pendingFile.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );

      const res = await fetch(`${apiBase}/api/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backup: base64, preview: false }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Restore failed' }));
        throw new Error((body as { error?: string }).error || 'Restore failed');
      }

      const data = await res.json() as RestoreResult;
      setRestoreResult(data);
      setPreview(null);
      setPendingFile(null);
      setSuccessMsg(`Restored ${data.filesRestored} files successfully`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restore failed');
    } finally {
      setRestoreLoading(false);
    }
  }, [apiBase, pendingFile]);

  // Cancel restore
  const handleCancelRestore = useCallback(() => {
    setPreview(null);
    setPendingFile(null);
    setError(null);
  }, []);

  return (
    <div className="backup-section space-y-6">
      <h2 className="text-lg font-semibold">Backup & Restore</h2>
      <p className="text-sm text-muted-foreground">
        Create encrypted backups of your Waggle data for machine migration or safekeeping.
      </p>

      {/* Data Export (GDPR) */}
      <DataExportSection apiBase={apiBase} />

      {/* Divider between export and backup */}
      <div className="border-t border-border" />

      {/* Status messages */}
      {error && (
        <div className="rounded-lg border border-red-700 bg-red-900/30 p-3 text-sm text-red-300">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="rounded-lg border border-green-700 bg-green-900/30 p-3 text-sm text-green-300">
          {successMsg}
        </div>
      )}

      {/* Create Backup */}
      <div className="rounded-lg border border-border p-4">
        <h3 className="text-sm font-medium mb-2">Create Backup</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Backs up all Waggle data including mind files, config, workspaces, vault, and sessions.
          The backup is encrypted using your vault key.
        </p>
        {metadata && (
          <div className="mb-3 text-xs text-muted-foreground space-y-1">
            <p>Last backup: {formatDate(metadata.lastBackupAt)}</p>
            <p>Size: {formatBytes(metadata.sizeBytes)} ({metadata.fileCount} files)</p>
          </div>
        )}
        <button
          onClick={handleBackup}
          disabled={backupLoading}
          className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {backupLoading ? 'Creating backup...' : 'Create Backup'}
        </button>
      </div>

      {/* Restore from Backup */}
      <div className="rounded-lg border border-border p-4">
        <h3 className="text-sm font-medium mb-2">Restore from Backup</h3>
        <div className="rounded-lg border border-amber-700 bg-amber-900/20 p-3 mb-3 text-xs text-amber-300">
          Warning: Restoring will replace your current data with the backup contents.
          Make sure to create a backup of your current data first.
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Select a .waggle-backup file to restore. You will see a preview before anything changes.
        </p>

        {/* Preview display */}
        {preview && (
          <div className="mb-3 rounded-lg border border-border bg-card p-3 space-y-2">
            <h4 className="text-sm font-medium">Restore Preview</h4>
            <p className="text-xs text-muted-foreground">
              Backup from: {formatDate(preview.backupCreatedAt)}
            </p>
            <p className="text-xs text-muted-foreground">
              Total files: {preview.totalFiles} |
              New files: {preview.newFiles.length} |
              Will overwrite: {preview.conflicts.length}
            </p>
            {preview.conflicts.length > 0 && (
              <div className="text-xs text-amber-300">
                <p className="font-medium mb-1">Files that will be overwritten:</p>
                <div className="max-h-32 overflow-y-auto rounded bg-background p-2 font-mono">
                  {preview.conflicts.slice(0, 20).map((f) => (
                    <div key={f}>{f}</div>
                  ))}
                  {preview.conflicts.length > 20 && (
                    <div className="text-muted-foreground">...and {preview.conflicts.length - 20} more</div>
                  )}
                </div>
              </div>
            )}
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleConfirmRestore}
                disabled={restoreLoading}
                className="rounded bg-red-600 px-4 py-2 text-sm text-primary-foreground hover:bg-red-500 disabled:opacity-50"
              >
                {restoreLoading ? 'Restoring...' : 'Confirm Restore'}
              </button>
              <button
                onClick={handleCancelRestore}
                disabled={restoreLoading}
                className="rounded bg-muted px-4 py-2 text-sm text-muted-foreground hover:bg-muted/80"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Restore result display */}
        {restoreResult && (
          <div className="mb-3 rounded-lg border border-green-700 bg-green-900/20 p-3 text-xs space-y-1">
            <p className="text-green-300 font-medium">Restore complete</p>
            <p className="text-muted-foreground">
              Restored {restoreResult.filesRestored} of {restoreResult.totalFiles} files
            </p>
            {restoreResult.conflicts.length > 0 && (
              <p className="text-amber-300">{restoreResult.conflicts.length} files overwritten</p>
            )}
            {restoreResult.errors && restoreResult.errors.length > 0 && (
              <div className="text-red-300">
                <p>{restoreResult.errors.length} errors:</p>
                {restoreResult.errors.map((e, i) => (
                  <p key={i} className="ml-2">{e}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {!preview && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".waggle-backup"
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={restoreLoading}
              className="rounded bg-secondary px-4 py-2 text-sm text-muted-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {restoreLoading ? 'Reading backup...' : 'Select Backup File'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
