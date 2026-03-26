/**
 * AdvancedSection -- data directory, config export/import, debug settings.
 *
 * LiteLLM proxy controls removed (replaced by built-in Anthropic proxy post-M4).
 */

// React import removed — no hooks used in this file after GDPR dedup
import type { WaggleConfig } from '../../services/types.js';

export interface MindFileInfo {
  workspace: string;
  path: string;
  sizeBytes: number;
}

export interface AdvancedSectionProps {
  config: WaggleConfig;
  onConfigUpdate: (config: Partial<WaggleConfig>) => void;
  dataDirectory?: string;
  onExportConfig?: () => void;
  onImportConfig?: () => void;
  mindFiles?: MindFileInfo[];
  debugLogEnabled?: boolean;
  onDebugLogToggle?: (enabled: boolean) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AdvancedSection({
  config: _config,
  onConfigUpdate: _onConfigUpdate,
  dataDirectory = '~/.waggle',
  onExportConfig,
  onImportConfig,
  mindFiles = [],
  debugLogEnabled = false,
  onDebugLogToggle,
}: AdvancedSectionProps) {
  return (
    <div className="advanced-section space-y-6">
      <h2 className="text-lg font-semibold">Advanced</h2>

      {/* Data directory */}
      <div className="rounded-lg border border-border p-4">
        <h3 className="text-sm font-medium">Data Directory</h3>
        <p className="mt-1 rounded bg-card px-3 py-2 text-sm text-muted-foreground font-mono">
          {dataDirectory}
        </p>
      </div>

      {/* Export/Import */}
      <div className="rounded-lg border border-border p-4">
        <h3 className="text-sm font-medium mb-3">Configuration</h3>
        <div className="flex gap-2">
          {onExportConfig && (
            <button
              onClick={onExportConfig}
              className="rounded bg-secondary px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
            >
              Export Config
            </button>
          )}
          {onImportConfig && (
            <button
              onClick={onImportConfig}
              className="rounded bg-secondary px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
            >
              Import Config
            </button>
          )}
        </div>
      </div>

      {/* Mind file sizes */}
      {mindFiles.length > 0 && (
        <div className="rounded-lg border border-border p-4">
          <h3 className="text-sm font-medium mb-3">Mind Files</h3>
          <div className="space-y-2">
            {mindFiles.map((mf) => (
              <div key={mf.workspace} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{mf.workspace}</span>
                <span className="text-muted-foreground font-mono">{formatBytes(mf.sizeBytes)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Data export moved to Backup tab — avoid duplication */}
      <div className="rounded-lg border border-border/50 p-4">
        <p className="text-xs text-muted-foreground">Data export available in <strong>Backup</strong> tab.</p>
      </div>

      {/* Debug log toggle */}
      <div className="rounded-lg border border-border p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium">Debug Logging</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Enable verbose logging for troubleshooting.
            </p>
          </div>
          <button
            onClick={() => onDebugLogToggle?.(!debugLogEnabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              debugLogEnabled ? 'bg-primary' : 'bg-muted'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-background shadow-sm transition-transform ${
                debugLogEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
}

// Data Export Section removed — consolidated in BackupSection to avoid duplication
