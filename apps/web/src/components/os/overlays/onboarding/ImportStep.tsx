import { motion } from 'framer-motion';
import { Brain, Upload, Loader2, Check, Zap, ExternalLink } from 'lucide-react';
import { fadeSlide } from './constants';
import type { ImportStepProps } from './types';

/**
 * M-10: source tiles widened from 2 (ChatGPT, Claude) to 6 + auto-detect.
 * Each tile maps to a `UniversalAdapter`-supported source string. File pickers
 * accept .json, .txt, .md, .csv (matching HarvestTab's accept set) so non-JSON
 * exports (Cursor pastes, markdown threads) flow through the same handler.
 *
 * FR #38: each tile carries a brand swatch (foreground emoji + tinted ring +
 * tinted background) so users scanning a row of generic file icons can
 * recognise their tool of choice at a glance. Trademarks remain Anthropic's,
 * OpenAI's, Google's, etc. — these are decorative tints sized to match a small
 * file-icon, not full marks.
 */
const SOURCE_TILES: ReadonlyArray<{
  id: string;
  name: string;
  desc: string;
  /** Single-glyph mark — emoji used as a brand-recognisable swatch. */
  glyph: string;
  /** Tailwind class for the glyph color/tile accent. */
  accent: string;
}> = [
  { id: 'chatgpt',    name: 'ChatGPT',    desc: 'OpenAI export (.json)',  glyph: '✦', accent: 'text-emerald-400 bg-emerald-500/10 ring-emerald-500/30' },
  { id: 'claude',     name: 'Claude',     desc: 'Anthropic export (.json)', glyph: '✧', accent: 'text-orange-400 bg-orange-500/10 ring-orange-500/30' },
  { id: 'gemini',     name: 'Gemini',     desc: 'Google Takeout (.json)', glyph: '✦', accent: 'text-sky-400 bg-sky-500/10 ring-sky-500/30' },
  { id: 'perplexity', name: 'Perplexity', desc: 'Threads export',         glyph: '◆', accent: 'text-teal-400 bg-teal-500/10 ring-teal-500/30' },
  { id: 'cursor',     name: 'Cursor',     desc: 'Editor history',         glyph: '▸', accent: 'text-violet-400 bg-violet-500/10 ring-violet-500/30' },
  { id: 'unknown',    name: 'Other',      desc: 'Any text or JSON',       glyph: '·', accent: 'text-muted-foreground bg-muted/30 ring-border/40' },
];

const ImportStep = ({
  importSource,
  importPreview,
  importDone,
  importing,
  onFileImport,
  onImportCommit,
  claudeCodeDetected,
  onClaudeCodeHarvest,
  goToStep,
}: ImportStepProps) => (
  <motion.div key="step-3" {...fadeSlide}>
    <div className="text-center mb-6">
      <Brain className="w-10 h-10 text-primary mx-auto mb-3" />
      {/* FR #37: previous heading "Where does your AI life live?" leaned on a
          metaphor that reads awkwardly to non-native English speakers and
          buries the actual question. The new heading names the action plainly
          ("Where do you use AI today?") and the subtitle still carries the
          value prop. */}
      <h2 className="text-2xl font-display font-bold text-foreground mb-2">
        Where do you use AI today?
      </h2>
      <p className="text-sm text-muted-foreground">
        Bring your existing conversations — Waggle extracts decisions, preferences, and knowledge into your persistent memory.
      </p>
    </div>

    {/* M-10: Claude Code auto-detect banner — only when sidecar found local files. */}
    {!importDone && claudeCodeDetected?.found && (
      <div className="mb-5 p-3 rounded-xl bg-primary/10 border border-primary/30">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Zap className="w-4 h-4 text-primary shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-display font-medium text-foreground">Claude Code detected</p>
              <p className="text-[11px] text-muted-foreground truncate">
                Found {claudeCodeDetected.itemCount} items at {claudeCodeDetected.path}
              </p>
            </div>
          </div>
          {onClaudeCodeHarvest && (
            <button
              onClick={onClaudeCodeHarvest}
              disabled={importing}
              className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-display font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 shrink-0"
            >
              {importing ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Harvest'}
            </button>
          )}
        </div>
      </div>
    )}

    {!importSource && !importDone && (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-6">
        {SOURCE_TILES.map((src) => (
          <label
            key={src.id}
            className="glass-strong rounded-xl p-3.5 cursor-pointer hover:border-primary/40 transition-colors text-left group flex flex-col gap-1"
          >
            {/* FR #38: branded swatch instead of generic FileJson. Each tile
                carries a tinted glyph that signals provider at a glance —
                ChatGPT green, Claude orange, Gemini blue, Perplexity teal,
                Cursor violet, Other neutral. Glyphs are decorative emoji-class
                marks, not trademarked logos. */}
            <span
              aria-hidden="true"
              className={`inline-flex items-center justify-center w-7 h-7 rounded-lg ring-1 mb-0.5 text-base font-bold ${src.accent}`}
            >
              {src.glyph}
            </span>
            <h3 className="text-xs font-display font-semibold text-foreground">{src.name}</h3>
            <p className="text-[11px] text-muted-foreground">{src.desc}</p>
            <div className="flex items-center gap-1 text-[11px] text-primary group-hover:text-primary/80 mt-0.5">
              <Upload className="w-3 h-3" /> Choose file
            </div>
            <input
              type="file"
              accept=".json,.txt,.md,.csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onFileImport(file, src.id);
              }}
            />
          </label>
        ))}
      </div>
    )}

    {importPreview.length > 0 && !importDone && (
      <div className="glass-strong rounded-xl p-4 mb-6">
        <h3 className="text-sm font-display font-semibold text-foreground mb-2">
          Preview — {importPreview.length} items found
        </h3>
        <div className="max-h-32 overflow-y-auto space-y-1 mb-3">
          {importPreview.slice(0, 10).map((item: unknown, i: number) => {
            const entry = item as Record<string, unknown>;
            const label = (entry.title as string) || (entry.content as string) || JSON.stringify(item).slice(0, 60);
            return (
              <div key={i} className="text-xs text-muted-foreground truncate">
                • {label}
              </div>
            );
          })}
          {importPreview.length > 10 && (
            <div className="text-xs text-muted-foreground/60">
              …and {importPreview.length - 10} more
            </div>
          )}
        </div>
        <button
          onClick={onImportCommit}
          disabled={importing}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-display font-semibold hover:bg-primary/80 disabled:opacity-50 transition-colors"
        >
          {importing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
          Import {importPreview.length} items
        </button>
      </div>
    )}

    {importDone && (
      <div className="glass-strong rounded-xl p-4 mb-6 text-center">
        <Check className="w-6 h-6 text-primary mx-auto mb-2" />
        <p className="text-sm text-foreground font-display">Memories imported!</p>
      </div>
    )}

    {/* M-10: pointer to MemoryApp's HarvestTab for the long tail of sources
        (Grok, Manus, GenSpark, Qwen, MiniMax, etc.) — kept below tiles so it
        doesn't compete with the primary picks. */}
    {!importSource && !importDone && (
      <div className="mb-4 text-center">
        <p className="text-[11px] text-muted-foreground">
          Have history elsewhere? <span className="text-foreground/70">Open Memory → Harvest after setup for 14+ more sources <ExternalLink className="w-2.5 h-2.5 inline-block ml-0.5" /></span>
        </p>
      </div>
    )}

    <div className="flex items-center justify-center gap-4">
      <button
        onClick={() => goToStep(2)}
        className="text-sm text-muted-foreground hover:text-foreground transition-colors font-display"
      >
        Back
      </button>
      <button
        onClick={() => goToStep(4)}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {importDone ? 'Continue' : 'Skip this step'}
      </button>
    </div>
  </motion.div>
);

export default ImportStep;
