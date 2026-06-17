import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { fadeSlide } from './constants';
import type { TemplateStepProps } from './types';

/**
 * Onboarding Template step (PR5 D4/D5). Folds the old workspace-create step: picking
 * one of the curated 6 starting points creates the first workspace with a matching
 * specialist persona + the template id, then advances to the first task. Calm/fast —
 * no type picker, no name field (the template names it; renameable later).
 */
const TemplateStep = ({ templates, onSelect, onBack, creating, creatingId, createError }: TemplateStepProps) => (
  <motion.div key="step-template" {...fadeSlide}>
    <div className="text-center mb-6">
      <h2 className="text-2xl font-display font-bold text-foreground mb-2">Pick a starting point</h2>
      <p className="text-sm text-muted-foreground">
        We&apos;ll set up your first workspace — its own brain, with a matching specialist. Add more anytime.
      </p>
    </div>

    <div className="grid grid-cols-2 gap-2.5 mb-5">
      {templates.map((t) => {
        const Icon = t.icon;
        const isCreating = creating && creatingId === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(t.id)}
            disabled={creating}
            aria-busy={isCreating}
            className="glass-strong rounded-xl p-3.5 text-left transition-colors flex flex-col gap-1 hover:border-primary/40 disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {isCreating ? (
              <Loader2 className="w-5 h-5 mb-0.5 text-primary animate-spin" aria-hidden />
            ) : (
              <Icon className="w-5 h-5 mb-0.5 text-muted-foreground" aria-hidden />
            )}
            <h3 className="text-sm font-display font-semibold text-foreground">{t.name}</h3>
            <p className="text-[11px] text-muted-foreground">{t.desc}</p>
          </button>
        );
      })}
    </div>

    {createError && <p className="text-xs text-muted-foreground mb-3">{createError}</p>}

    <div className="flex items-center justify-start">
      <button
        onClick={onBack}
        disabled={creating}
        className="text-sm text-muted-foreground hover:text-foreground transition-colors font-display rounded-md px-1 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        Back
      </button>
    </div>
  </motion.div>
);

export default TemplateStep;
