import { motion } from 'framer-motion';
import { Brain, Upload, FileJson, Loader2, Check } from 'lucide-react';
import { fadeSlide } from './constants';
import type { ImportStepProps } from './types';

const ImportStep = ({
  importSource,
  importPreview,
  importDone,
  importing,
  onFileImport,
  onImportCommit,
  goToStep,
}: ImportStepProps) => (
  <motion.div key="step-3" {...fadeSlide}>
    <div className="text-center mb-6">
      <Brain className="w-10 h-10 text-primary mx-auto mb-3" />
      <h2 className="text-2xl font-display font-bold text-foreground mb-2">
        Bring your AI memories
      </h2>
      <p className="text-sm text-muted-foreground">
        Import conversation history from other AI assistants
      </p>
    </div>

    {!importSource && !importDone && (
      <div className="grid grid-cols-2 gap-4 mb-6">
        {[
          { id: 'chatgpt' as const, name: 'ChatGPT Export', desc: 'Import from OpenAI' },
          { id: 'claude' as const, name: 'Claude Export', desc: 'Import from Anthropic' },
        ].map((src) => (
          <label
            key={src.id}
            className="glass-strong rounded-xl p-5 cursor-pointer hover:border-primary/40 transition-colors text-left group"
          >
            <FileJson className="w-5 h-5 text-primary mb-2" />
            <h3 className="text-sm font-display font-semibold text-foreground mb-1">
              {src.name}
            </h3>
            <p className="text-xs text-muted-foreground mb-3">{src.desc}</p>
            <div className="flex items-center gap-1.5 text-xs text-primary group-hover:text-primary/80">
              <Upload className="w-3 h-3" /> Choose .json file
            </div>
            <input
              type="file"
              accept=".json"
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
