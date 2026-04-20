/**
 * HarvestTab — Memory Harvest UI for importing from 20+ AI platforms.
 *
 * Shows connected sources, auto-detects Claude Code, and provides
 * upload/paste interface for all platforms.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Upload, RefreshCw, Clock, CheckCircle2, AlertCircle,
  Loader2, Plus, Zap, Brain, Trash2, Pause, Play, Sparkles, RotateCcw, XCircle,
} from 'lucide-react';
import { adapter } from '@/lib/adapter';
import { HintTooltip } from '@/components/ui/hint-tooltip';

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

function formatRelative(iso: string | null): string {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 'unknown';
  const diffMs = Date.now() - then;
  if (diffMs < 0) return 'just now';
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(mo / 12)}y ago`;
}

const HarvestTab = () => {
  const [sources, setSources] = useState<HarvestSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [claudeCodeDetected, setClaudeCodeDetected] = useState<{ found: boolean; itemCount: number; path: string } | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  // Raw parsed input held between preview and commit. The preview response is
  // a summary shape the server can't re-parse, so we must retain the original
  // data (file JSON, pasted object, or paste string) here for commit.
  const [pendingData, setPendingData] = useState<unknown>(null);
  const [importResult, setImportResult] = useState<{
    saved: number; itemCount?: number; message: string;
    duplicatesSkipped?: number; entitiesCreated?: number; identityUpdates?: number;
  } | null>(null);
  const [selectedSource, setSelectedSource] = useState<string>('chatgpt');
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteContent, setPasteContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  // M-07: live progress streamed from /api/harvest/progress during commit.
  // Resets to null when no import is in flight.
  const [progress, setProgress] = useState<{ phase: string; current: number; total: number; source: string } | null>(null);
  // M-09: pending identity suggestions extracted from recent harvest frames.
  // Surfaced as a banner after a successful commit; cleared on next import start.
  // The suggestions themselves live in UserProfile — we only hold the count here.
  const [identitySuggestionCount, setIdentitySuggestionCount] = useState(0);
  // M-08: interrupted run ready for resume — shown on mount if one exists
  // and cleared once the user picks Resume or Discard.
  const [interruptedRun, setInterruptedRun] = useState<{
    id: number; source: string; status: 'running' | 'failed';
    totalItems: number; itemsSaved: number; startedAt: string;
  } | null>(null);

  const claudeCodeSource = sources.find(s => s.source === 'claude-code') ?? null;

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

  // M-08: check for interrupted runs on mount so the banner can offer
  // Resume/Discard. Best-effort — silent on error since the feature is
  // additive and shouldn't block the rest of HarvestTab from rendering.
  const fetchInterruptedRun = useCallback(async () => {
    try {
      const { run } = await adapter.getLatestInterruptedHarvestRun();
      setInterruptedRun(run);
    } catch { /* no server, no run */ }
  }, []);

  useEffect(() => {
    fetchSources();
    detectClaudeCode();
    fetchInterruptedRun();
  }, [fetchSources, detectClaudeCode, fetchInterruptedRun]);

  // Handle file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setImportResult(null);

    try {
      const text = await file.text();
      // Try JSON first; fall back to raw text so non-JSON exports
      // (markdown, plain text) still reach the UniversalAdapter.
      let data: unknown;
      try { data = JSON.parse(text); } catch { data = text; }

      const previewData = await adapter.harvestPreview(data, selectedSource);
      setPreview(previewData);
      setPendingData(data);
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
      setPendingData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse content');
    }
  };

  // M-09: post-commit identity extraction. Non-blocking — if the Anthropic
  // key is missing or the LLM call fails, suggestions stay at 0 and the
  // banner simply doesn't render. Called from both import paths.
  const runIdentityExtraction = useCallback(async () => {
    try {
      const { suggestions } = await adapter.extractHarvestIdentity();
      setIdentitySuggestionCount(suggestions.length);
    } catch { /* non-fatal */ }
  }, []);

  // M-08: resume an interrupted run. Replays the cached input through the
  // same commit pipeline; FrameStore dedup handles already-saved items so
  // the user doesn't see double frames.
  const handleResumeRun = async () => {
    if (!interruptedRun) return;
    setImporting(true);
    setError(null);
    setProgress(null);
    setImportResult(null);
    setInterruptedRun(null);
    setIdentitySuggestionCount(0);

    const sub = adapter.subscribeHarvestProgress(setProgress);
    await sub.ready;

    try {
      const result = await adapter.resumeHarvestRun(interruptedRun.id);
      setImportResult(result);
      await fetchSources();
      if (result?.saved > 0) await runIdentityExtraction();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Resume failed');
      // Re-fetch — the run may have moved to failed state with a new error.
      await fetchInterruptedRun();
    } finally {
      sub.close();
      setImporting(false);
      setProgress(null);
    }
  };

  // M-08: discard an interrupted run so the banner stops showing.
  const handleDiscardRun = async () => {
    if (!interruptedRun) return;
    try {
      await adapter.abandonHarvestRun(interruptedRun.id);
    } catch { /* swallow — banner hides either way */ }
    setInterruptedRun(null);
  };

  // Commit import — always uses the retained pendingData, never the preview
  // shape (server cannot re-parse the preview response).
  const handleCommit = async () => {
    if (pendingData === null) return;
    setImporting(true);
    setError(null);
    setProgress(null);
    setIdentitySuggestionCount(0);

    // M-07: subscribe BEFORE the POST so the server-side listener is
    // registered before the pipeline starts emitting events.
    const sub = adapter.subscribeHarvestProgress(setProgress);
    await sub.ready;

    try {
      const result = await adapter.harvestCommit(pendingData, selectedSource);
      setImportResult(result);
      setPreview(null);
      setPendingData(null);
      await fetchSources();
      if (result?.saved > 0) await runIdentityExtraction();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      sub.close();
      setImporting(false);
      setProgress(null);
    }
  };

  const handleCancelPreview = () => {
    setPreview(null);
    setPendingData(null);
  };

  // Harvest Claude Code — filesystem scan mode; server handles `{ scanLocal: true }`
  // via FilesystemAdapter.scan() rather than SourceAdapter.parse().
  const handleClaudeCodeHarvest = async () => {
    setImporting(true);
    setError(null);
    setImportResult(null);
    setProgress(null);
    setIdentitySuggestionCount(0);

    // M-07: same subscribe-before-POST ordering as handleCommit.
    const sub = adapter.subscribeHarvestProgress(setProgress);
    await sub.ready;

    try {
      const result = await adapter.harvestCommit({ scanLocal: true }, 'claude-code');
      setImportResult(result);
      await fetchSources();
      // Refresh the detect banner so "Found N items" reflects the
      // current state (already-harvested vs. pending).
      await detectClaudeCode();
      if (result?.saved > 0) await runIdentityExtraction();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Claude Code harvest failed');
    } finally {
      sub.close();
      setImporting(false);
      setProgress(null);
    }
  };

  // M-09: open the Profile app on the Identity tab, where the suggestions
  // banner is rendered. Cross-component via `waggle:open-app` — Desktop
  // owns the window raise; UserProfileApp owns the tab switch.
  const handleReviewIdentity = () => {
    window.dispatchEvent(new CustomEvent('waggle:open-app', {
      detail: { appId: 'profile', tab: 'identity' },
    }));
    setIdentitySuggestionCount(0);
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

      {/* M-08: Resume banner — shows when a prior run was interrupted.
          Resumes replay the cached input (server-side); FrameStore dedup
          handles already-saved frames. Discard deletes the cache. */}
      {interruptedRun && !importing && (
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2">
          <div className="flex items-start gap-2">
            <RotateCcw className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-display font-medium text-foreground">
                Last harvest interrupted
              </p>
              <p className="text-[11px] text-muted-foreground">
                {interruptedRun.source} — saved {interruptedRun.itemsSaved} of {interruptedRun.totalItems} items. Resume picks up where it left off.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleResumeRun}
              disabled={importing}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500 text-amber-950 text-xs font-display hover:bg-amber-400 transition-colors disabled:opacity-50"
            >
              <RotateCcw className="w-3 h-3" /> Resume
            </button>
            <button
              onClick={handleDiscardRun}
              disabled={importing}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-secondary text-foreground text-xs hover:bg-secondary/70 transition-colors disabled:opacity-50"
            >
              <XCircle className="w-3 h-3" /> Discard
            </button>
          </div>
        </div>
      )}

      {/* Privacy headline — Report 3 principle #6 */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
        <span className="text-emerald-400 text-[11px] font-medium">Your data stays on this device. Harvest processes locally — nothing is sent to any server.</span>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Import your AI history from 20+ platforms. Waggle extracts decisions, preferences, facts, and knowledge into your persistent memory.
      </p>

      {/* Claude Code auto-detect banner */}
      {claudeCodeDetected?.found && (
        <div className="p-3 rounded-xl bg-primary/10 border border-primary/30">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Zap className="w-4 h-4 text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-display font-medium text-foreground">
                  Claude Code Detected
                  {claudeCodeSource && (
                    <span className="ml-2 text-[11px] text-emerald-400">
                      · {claudeCodeSource.framesCreated} frames harvested
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {claudeCodeSource ? (
                    <>Last run {formatRelative(claudeCodeSource.lastSyncedAt)} · {claudeCodeDetected.itemCount} items available at {claudeCodeDetected.path}</>
                  ) : (
                    <>Found {claudeCodeDetected.itemCount} items (memories, rules, plans) at {claudeCodeDetected.path}</>
                  )}
                </p>
              </div>
            </div>
            <button
              onClick={handleClaudeCodeHarvest}
              disabled={importing}
              className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-display hover:bg-primary/90 transition-colors disabled:opacity-50 shrink-0"
            >
              {importing ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : claudeCodeSource ? (
                'Re-harvest'
              ) : (
                'Harvest'
              )}
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

      {/* M-07: Live progress — visible only while a commit is in flight. */}
      {progress && (
        <div
          className="p-3 rounded-lg bg-primary/5 border border-primary/20 space-y-1.5"
          role="progressbar"
          aria-valuenow={progress.current}
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-label={`${progress.phase} ${progress.current} of ${progress.total}`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-foreground capitalize font-display">
              {progress.phase}…
            </span>
            <span className="text-[11px] text-muted-foreground font-mono">
              {progress.current}/{progress.total}
            </span>
          </div>
          <div className="h-1 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-[width] duration-200"
              style={{
                width: `${Math.min(100, (progress.current / Math.max(1, progress.total)) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* M-09: identity suggestion nudge — appears after a successful commit
          when at least one structured identity fact surfaced. Click routes to
          UserProfileApp → Identity tab where the user accepts/dismisses. */}
      {identitySuggestionCount > 0 && (
        <div className="p-3 rounded-lg bg-accent/10 border border-accent/30 flex items-center gap-3">
          <Sparkles className="w-4 h-4 text-accent shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-display font-medium text-foreground">
              We learned {identitySuggestionCount} thing{identitySuggestionCount !== 1 ? 's' : ''} about you
            </p>
            <p className="text-[11px] text-muted-foreground">
              Review &amp; confirm in your profile
            </p>
          </div>
          <button
            onClick={handleReviewIdentity}
            className="px-3 py-1.5 rounded-lg bg-accent text-accent-foreground text-xs font-display hover:bg-accent/90 transition-colors shrink-0"
          >
            Open Profile →
          </button>
        </div>
      )}

      {/* Import result with dedup summary — Report 3 principle #3 */}
      {importResult && (
        <div className={`p-3 rounded-lg flex flex-col gap-1.5 ${
          importResult.saved > 0
            ? 'bg-emerald-500/10 border border-emerald-500/20'
            : 'bg-amber-500/10 border border-amber-500/20'
        }`}>
          <div className="flex items-start gap-2">
            {importResult.saved > 0
              ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
              : <AlertCircle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />}
            <p className={`text-[11px] ${importResult.saved > 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
              {importResult.message}
            </p>
          </div>
          {/* Dedup + enrichment summary */}
          {(importResult.duplicatesSkipped || importResult.entitiesCreated || importResult.identityUpdates) && (
            <div className="text-[10px] text-muted-foreground ml-5.5 space-y-0.5">
              {importResult.duplicatesSkipped ? (
                <p>{importResult.duplicatesSkipped} duplicate{importResult.duplicatesSkipped !== 1 ? 's' : ''} already known — skipped</p>
              ) : null}
              {importResult.entitiesCreated ? (
                <p>{importResult.entitiesCreated} entities added to knowledge graph</p>
              ) : null}
              {importResult.identityUpdates ? (
                <p>{importResult.identityUpdates} identity signal{importResult.identityUpdates !== 1 ? 's' : ''} detected</p>
              ) : null}
            </div>
          )}
        </div>
      )}

      {/* Connected sources */}
      {sources.length > 0 && (
        <div>
          <p className="text-xs font-display font-medium text-foreground mb-2">Connected Sources</p>
          <div className="space-y-1.5">
            {sources.map(s => (
              <div key={s.id} className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/30 border border-border/30">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-display text-foreground">{s.displayName}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {s.itemsImported} items · {s.framesCreated} frames
                      {s.lastSyncedAt && <> · {formatRelative(s.lastSyncedAt)}</>}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <HintTooltip content={s.autoSync ? 'Pause auto-sync' : 'Enable auto-sync'}>
                    <button
                      onClick={async () => {
                        await adapter.toggleHarvestAutoSync(s.source, !s.autoSync);
                        fetchSources();
                      }}
                      className={`p-1 rounded transition-colors ${s.autoSync ? 'text-primary hover:text-primary/70' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      {s.autoSync ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                    </button>
                  </HintTooltip>
                  <HintTooltip content="Remove source">
                    <button
                      onClick={async () => {
                        await adapter.removeHarvestSource(s.source);
                        fetchSources();
                      }}
                      className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </HintTooltip>
                </div>
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
                onClick={handleCommit}
                disabled={importing || pendingData === null}
                className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-display hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {importing ? <Loader2 className="w-3 h-3 animate-spin inline mr-1" /> : null}
                Import {preview.itemCount} Items
              </button>
              <button
                onClick={handleCancelPreview}
                disabled={importing}
                className="px-3 py-1.5 rounded-lg bg-secondary text-foreground text-xs hover:bg-secondary/70 transition-colors disabled:opacity-50"
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
