import { motion } from 'framer-motion';
import { Brain, Upload, Loader2, Check, Zap, ExternalLink, Info } from 'lucide-react';
import { fadeSlide } from './constants';
import { ConfidenceBadge } from '@/components/ui/confidence-badge';
import { memoryKindLabel } from '@/lib/harvest-kind-map';
import type { ImportStepProps } from './types';

/**
 * S15 / C33 — Memory Import. Surfaces the classified `items[]` from
 * `POST /api/harvest/preview` (per-item `kind` + `confidence`, Phase 2B.3) so
 * the user sees what is being imported, then commits ALL items as
 * `status:'unreviewed'` server-side (C33 commit-all default). Review happens
 * later in Memory → Needs review (the S16 surface), pointed to below — there is
 * no per-item selection UI in this cut.
 *
 * Source tiles map to `UniversalAdapter`-supported sources. Per C34, tools
 * without an export adapter (Hermes / Codex / Cursor) route to the generic
 * "Other" upload tile rather than a dedicated tile, and the long tail lives in
 * Memory → Harvest after setup.
 */
const SOURCE_TILES: ReadonlyArray<{
  id: string;
  name: string;
  desc: string;
  /** One-line how-to: where in the source product the export file comes from. */
  hint: string;
  glyph: string;
  accent: string;
}> = [
  { id: 'chatgpt',    name: 'ChatGPT',    desc: 'OpenAI export (.json)',     hint: 'In ChatGPT: Settings → Data controls → Export data. You\'ll get an email with the file.', glyph: '✦', accent: 'text-emerald-400 bg-emerald-500/10 ring-emerald-500/30' },
  { id: 'claude',     name: 'Claude',     desc: 'Anthropic export (.json)',  hint: 'In Claude: Settings → Privacy → Export data.', glyph: '✧', accent: 'text-orange-400 bg-orange-500/10 ring-orange-500/30' },
  { id: 'gemini',     name: 'Gemini',     desc: 'Google Takeout (.json)',    hint: 'Go to takeout.google.com, select Gemini, download.', glyph: '✦', accent: 'text-sky-400 bg-sky-500/10 ring-sky-500/30' },
  { id: 'perplexity', name: 'Perplexity', desc: 'Threads export',            hint: 'In Perplexity: Settings → Account → Export.', glyph: '◆', accent: 'text-teal-400 bg-teal-500/10 ring-teal-500/30' },
  // C34: Cursor / Codex / Hermes have no export adapter yet — fold them into
  // the generic "Other" file picker rather than a dedicated tile.
  { id: 'unknown',    name: 'Other',      desc: 'Cursor, Codex, any text/JSON', hint: 'Any .txt, .md or .json conversation file works.', glyph: '·', accent: 'text-muted-foreground bg-muted/30 ring-border/40' },
];

const LARGE_AUTO_IMPORT_THRESHOLD = 1000;
const formatImportCount = (count: number): string => new Intl.NumberFormat('en-US').format(count);

const ImportStep = ({
  importSource,
  importItems,
  importDone,
  importing,
  onFileImport,
  onImportCommit,
  claudeCodeDetected,
  onClaudeCodeHarvest,
  onContinue,
}: ImportStepProps) => {
  const detectedItemCount = claudeCodeDetected?.itemCount ?? 0;
  const detectedItemCountLabel = formatImportCount(detectedItemCount);
  const largeDetectedHistory = detectedItemCount >= LARGE_AUTO_IMPORT_THRESHOLD;

  return (
  <motion.div key="step-memory-import" {...fadeSlide}>
    <div className="text-center mb-6">
      <Brain className="w-10 h-10 text-honey mx-auto mb-3" />
      <h2 className="text-2xl font-display font-bold text-foreground mb-2">
        Where do you use AI today?
      </h2>
      <p className="text-sm text-muted-foreground">
        Bring your existing conversations — Waggle extracts decisions, preferences, and knowledge into your persistent memory.
      </p>
    </div>

    {/* Claude Code auto-detect banner — only when the sidecar found local files. */}
    {!importDone && claudeCodeDetected?.found && (
      <div className={`mb-5 p-3 rounded-xl border ${largeDetectedHistory ? 'bg-honey/10 border-honey/30' : 'bg-primary/10 border-primary/30'}`}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Zap className="w-4 h-4 text-honey shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-display font-medium text-foreground">Claude Code detected</p>
              <p className="text-[11px] text-muted-foreground truncate" title={claudeCodeDetected.path}>
                Found {detectedItemCountLabel} items from Claude Code
              </p>
              {largeDetectedHistory && (
                <p className="text-[11px] text-muted-foreground/80 mt-1 max-w-md">
                  That is a lot of memory to absorb at setup. Review it after your workspace is ready,
                  or import now if you are ready to curate Needs review.
                </p>
              )}
            </div>
          </div>
          {onClaudeCodeHarvest && (
            largeDetectedHistory ? (
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center shrink-0">
                <button
                  onClick={onContinue}
                  disabled={importing}
                  className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-display font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  Review after setup
                </button>
                <button
                  onClick={onClaudeCodeHarvest}
                  disabled={importing}
                  aria-busy={importing}
                  className="px-3 py-1.5 rounded-lg border border-border/70 bg-background/40 text-xs font-display font-semibold text-foreground hover:bg-muted/60 transition-colors disabled:opacity-50"
                >
                  {importing ? <Loader2 aria-label="Importing" className="w-3 h-3 animate-spin" /> : `Import ${detectedItemCountLabel} now`}
                </button>
              </div>
            ) : (
              <button
                onClick={onClaudeCodeHarvest}
                disabled={importing}
                aria-busy={importing}
                className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-display font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 shrink-0"
              >
                {importing ? <Loader2 aria-label="Importing" className="w-3 h-3 animate-spin" /> : 'Import my history'}
              </button>
            )
          )}
        </div>
      </div>
    )}

    {!importSource && !importDone && (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-6">
        {SOURCE_TILES.map((src) => (
          <label
            key={src.id}
            className="glass-strong rounded-xl p-3.5 cursor-pointer hover:border-primary/40 focus-within:ring-2 focus-within:ring-primary transition-colors text-left group flex flex-col gap-1"
          >
            <span
              aria-hidden="true"
              className={`inline-flex items-center justify-center w-7 h-7 rounded-lg ring-1 mb-0.5 text-base font-bold ${src.accent}`}
            >
              {src.glyph}
            </span>
            <h3 className="text-xs font-display font-semibold text-foreground">{src.name}</h3>
            <p className="text-[11px] text-muted-foreground">{src.desc}</p>
            <p className="text-[10px] text-muted-foreground/70">{src.hint}</p>
            <div className="flex items-center gap-1 text-[11px] text-honey group-hover:text-honey/80 mt-0.5">
              <Upload className="w-3 h-3" /> Choose file
            </div>
            <input
              type="file"
              accept=".json,.txt,.md,.csv"
              aria-label={`Import ${src.name} export file`}
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onFileImport(file, src.id);
              }}
            />
          </label>
        ))}
      </div>
    )}

    {/* C33: surface the classified items (kind + confidence) before commit. The
        commit lands every item as `status:'unreviewed'`; no per-item selection. */}
    {importItems.length > 0 && !importDone && (
      <div className="glass-strong rounded-xl p-4 mb-4">
        <h3 className="text-sm font-display font-semibold text-foreground mb-2">
          Preview — {importItems.length} {importItems.length === 1 ? 'item' : 'items'} found
        </h3>
        <div className="max-h-40 overflow-y-auto space-y-1.5 mb-3">
          {importItems.slice(0, 10).map((item, i) => (
            <div key={item.id ?? i} className="flex items-center gap-2 text-xs">
              <span className="inline-flex items-center rounded-md bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground shrink-0">
                {memoryKindLabel(item.kind)}
              </span>
              <span className="text-muted-foreground truncate flex-1 min-w-0">{item.title}</span>
              <ConfidenceBadge value={item.confidence} compact className="shrink-0" />
            </div>
          ))}
          {importItems.length > 10 && (
            <div className="text-xs text-muted-foreground/60">
              …and {importItems.length - 10} more
            </div>
          )}
        </div>
        <button
          onClick={onImportCommit}
          disabled={importing}
          aria-busy={importing}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-display font-semibold hover:bg-primary/80 disabled:opacity-50 transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {importing ? <Loader2 aria-hidden="true" className="w-3 h-3 animate-spin" /> : <Check aria-hidden="true" className="w-3 h-3" />}
          Import {importItems.length} {importItems.length === 1 ? 'item' : 'items'}
        </button>
        {/* C33: review-later pointer. */}
        <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground/80 mt-2.5">
          <Info className="w-3 h-3 mt-0.5 shrink-0" />
          Everything imports as <span className="text-foreground/70">Needs review</span> — you can review,
          edit, or remove these anytime in Memory → Needs review.
        </p>
      </div>
    )}

    {importDone && (
      <div className="glass-strong rounded-xl p-4 mb-4 text-center">
        <Check className="w-6 h-6 text-honey mx-auto mb-2" />
        <p className="text-sm text-foreground font-display">Memories imported!</p>
        <p className="text-[11px] text-muted-foreground mt-1">
          Find them under Memory → Needs review to curate.
        </p>
      </div>
    )}

    {/* Long-tail pointer for sources without a primary tile. */}
    {!importSource && !importDone && (
      <div className="mb-4 text-center">
        <p className="text-[11px] text-muted-foreground">
          Have history elsewhere? <span className="text-foreground/70">Open Memory → Harvest after setup for 14+ more sources <ExternalLink className="w-2.5 h-2.5 inline-block ml-0.5" /></span>
        </p>
      </div>
    )}

    <div className="flex items-center justify-end gap-4">
      <button
        onClick={onContinue}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors rounded-md px-1 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {importDone ? 'Continue →' : 'Skip this step →'}
      </button>
    </div>
  </motion.div>
  );
};

export default ImportStep;
