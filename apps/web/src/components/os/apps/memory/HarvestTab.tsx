/**
 * HarvestTab — Memory Harvest UI for importing from 20+ AI platforms.
 *
 * Shows connected sources, auto-detects Claude Code, and provides
 * upload/paste interface for all platforms.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Upload, FolderSearch, RefreshCw, Clock, CheckCircle2, AlertCircle,
  Loader2, Plus, Zap, Brain,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { adapter } from '@/lib/adapter';

interface HarvestSource {
  id: number;
  source: string;
  displayName: string;
  sourcePath: string | null;
  lastSyncedAt: string | null;
  itemsImported: number;
  framesCreated: number;
  autoSync: boolean;
  syncIntervalHours: number;
}

interface PreviewResult {
  source: string;
  itemCount: number;
  types: Record<string, number>;
  preview: { id: string; title: string; type: string }[];
}

const SOURCE_ICONS: Record<string, string> = {
  'chatgpt': 'ChatGPT',
  'claude': 'Claude',
  'claude-code': 'Claude Code',
  'claude-desktop': 'Claude Desktop',
  'gemini': 'Gemini',
  'google-ai-studio': 'AI Studio',
  'perplexity': 'Perplexity',
  'grok': 'Grok',
  'cursor': 'Cursor',
  'manus': 'Manus',
  'genspark': 'GenSpark',
  'qwen': 'Qwen',
  'minimax': 'MiniMax',
  'z-ai': 'z.ai',
  'unknown': 'Other',
};

const HarvestTab = () => {
  const [sources, setSources] = useState<HarvestSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [claudeCodeDetected, setClaudeCodeDetected] = useState<{ found: boolean; itemCount: number; path: string } | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [importResult, setImportResult] = useState<{ saved: number; message: string } | null>(null);
  const [selectedSource, setSelectedSource] = useState<string>('chatgpt');
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteContent, setPasteContent] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Fetch sources on mount
  const fetchSources = useCallback(async () => {
    try {
      const data = await adapter.getHarvestSources();
      setSources(data.sources ?? []);
    } catch { /* sources not available yet */ }
    setLoading(false);
  }, []);

  // Auto-detect Claude Code
  const detectClaudeCode = useCallback(async () => {
    try {
      const data = await adapter.scanClaudeCode();
      setClaudeCodeDetected(data);
    } catch { /* not available */ }
  }, []);

  useEffect(() => {
    fetchSources();
    detectClaudeCode();
  }, [fetchSources, detectClaudeCode]);

  // Handle file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setImportResult(null);

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      // Preview first
      const previewData = await adapter.harvestPreview(data, selectedSource);
      setPreview(previewData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse file');
    }
  };

  // Handle paste submit
  const handlePasteSubmit = async () => {
    if (!pasteContent.trim()) return;
    setError(null);

    try {
      let data: unknown;
      try { data = JSON.parse(pasteContent); } catch { data = pasteContent; }

      const previewData = await adapter.harvestPreview(data, selectedSource);
      setPreview(previewData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse content');
    }
  };

  // Commit import
  const handleCommit = async (data: unknown, source: string) => {
    setImporting(true);
    setError(null);

    try {
      const result = await adapter.harvestCommit(data, source);
      setImportResult(result);
      setPreview(null);
      fetchSources();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  // Harvest Claude Code
  const handleClaudeCodeHarvest = async () => {
    setImporting(true);
    setError(null);

    try {
      const result = await adapter.harvestCommit({ scanLocal: true }, 'claude-code');
      setImportResult(result);
      fetchSources();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Claude Code harvest failed');
    } finally {
      setImporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-display font-semibold text-foreground">Memory Harvest</h3>
        </div>
        <button
          onClick={fetchSources}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Import your AI history from 20+ platforms. Waggle extracts decisions, preferences, facts, and knowledge into your persistent memory.
      </p>

      {/* Claude Code auto-detect banner */}
      {claudeCodeDetected?.found && (
        <div className="p-3 rounded-xl bg-primary/10 border border-primary/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" />
              <div>
                <p className="text-xs font-display font-medium text-foreground">Claude Code Detected</p>
                <p className="text-[11px] text-muted-foreground">
                  Found {claudeCodeDetected.itemCount} items (memories, rules, plans) at {claudeCodeDetected.path}
                </p>
              </div>
            </div>
            <button
              onClick={handleClaudeCodeHarvest}
              disabled={importing}
              className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-display hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {importing ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Harvest'}
            </button>
          </div>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
          <p className="text-[11px] text-destructive">{error}</p>
        </div>
      )}

      {/* Import result */}
      {importResult && (
        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
          <p className="text-[11px] text-emerald-400">{importResult.message}</p>
        </div>
      )}

      {/* Connected sources */}
      {sources.length > 0 && (
        <div>
          <p className="text-xs font-display font-medium text-foreground mb-2">Connected Sources</p>
          <div className="space-y-1.5">
            {sources.map(s => (
              <div key={s.id} className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/30 border border-border/30">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-400" />
                  <div>
                    <p className="text-xs font-display text-foreground">{s.displayName}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {s.itemsImported} items · {s.framesCreated} frames
                      {s.lastSyncedAt && <> · Last: {new Date(s.lastSyncedAt).toLocaleDateString()}</>}
                    </p>
                  </div>
                </div>
                {s.autoSync && (
                  <span className="text-[11px] text-primary flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5" /> Auto
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add source */}
      <div className="border-t border-border/30 pt-4">
        <p className="text-xs font-display font-medium text-foreground mb-2">Import from Platform</p>

        {/* Source selector */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {Object.entries(SOURCE_ICONS).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSelectedSource(key)}
              className={`px-2 py-1 rounded-lg text-[11px] transition-colors ${
                selectedSource === key
                  ? 'bg-primary/20 text-primary border border-primary/30'
                  : 'bg-secondary/30 text-muted-foreground hover:text-foreground border border-border/30'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Upload / Paste toggle */}
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => setPasteMode(false)}
            className={`flex-1 p-3 rounded-xl border text-center transition-colors ${
              !pasteMode ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-secondary/30 border-border/30 text-muted-foreground'
            }`}
          >
            <Upload className="w-4 h-4 mx-auto mb-1" />
            <p className="text-[11px] font-display">Upload JSON</p>
          </button>
          <button
            onClick={() => setPasteMode(true)}
            className={`flex-1 p-3 rounded-xl border text-center transition-colors ${
              pasteMode ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-secondary/30 border-border/30 text-muted-foreground'
            }`}
          >
            <Plus className="w-4 h-4 mx-auto mb-1" />
            <p className="text-[11px] font-display">Paste / Drop</p>
          </button>
        </div>

        {/* Upload mode */}
        {!pasteMode && (
          <div className="p-4 rounded-xl border-2 border-dashed border-border/50 text-center">
            <input
              type="file"
              accept=".json,.txt,.md,.csv"
              onChange={handleFileUpload}
              className="hidden"
              id="harvest-upload"
            />
            <label htmlFor="harvest-upload" className="cursor-pointer">
              <Upload className="w-6 h-6 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">Drop export file or click to browse</p>
              <p className="text-[11px] text-muted-foreground/60 mt-1">Supports JSON, TXT, MD</p>
            </label>
          </div>
        )}

        {/* Paste mode */}
        {pasteMode && (
          <div className="space-y-2">
            <textarea
              value={pasteContent}
              onChange={e => setPasteContent(e.target.value)}
              placeholder="Paste conversation text, JSON export, or any content from your AI tools..."
              className="w-full h-32 bg-muted/50 border border-border/50 rounded-xl px-3 py-2 text-xs text-foreground resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <button
              onClick={handlePasteSubmit}
              disabled={!pasteContent.trim()}
              className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-display hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              Preview Import
            </button>
          </div>
        )}

        {/* Preview */}
        {preview && (
          <div className="mt-3 p-3 rounded-xl bg-secondary/30 border border-border/30">
            <p className="text-xs font-display font-medium text-foreground mb-2">
              Preview: {preview.itemCount} items from {preview.source}
            </p>
            <div className="flex flex-wrap gap-2 mb-2">
              {Object.entries(preview.types).map(([type, count]) => (
                <span key={type} className="px-2 py-0.5 rounded text-[11px] bg-primary/10 text-primary">
                  {type}: {count}
                </span>
              ))}
            </div>
            <div className="space-y-1 max-h-32 overflow-auto mb-3">
              {preview.preview.map(item => (
                <p key={item.id} className="text-[11px] text-muted-foreground truncate">
                  {item.type === 'conversation' ? '💬' : item.type === 'memory' ? '🧠' : '📄'} {item.title}
                </p>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleCommit(pasteContent || preview, selectedSource)}
                disabled={importing}
                className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-display hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {importing ? <Loader2 className="w-3 h-3 animate-spin inline mr-1" /> : null}
                Import {preview.itemCount} Items
              </button>
              <button
                onClick={() => setPreview(null)}
                className="px-3 py-1.5 rounded-lg bg-secondary text-foreground text-xs hover:bg-secondary/70 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default HarvestTab;
