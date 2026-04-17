import { motion } from 'framer-motion';
import { Sparkles, ChevronRight } from 'lucide-react';
import { fadeSlide, TIER_OPTIONS } from './constants';
import type { TierStepProps } from './types';

const TierStep = ({ selectedTier, onSelectTier, goToStep }: TierStepProps) => (
  <motion.div key="step-2" {...fadeSlide} className="text-center">
    <Sparkles className="w-10 h-10 text-primary mx-auto mb-4" />
    <h2 className="text-2xl font-display font-bold text-foreground mb-2">
      Choose Your Dock Layout
    </h2>
    <p className="text-sm text-muted-foreground mb-1">
      How many icons appear in your dock. You can change this anytime in Settings.
    </p>
    <p className="text-xs text-muted-foreground/70 mb-8">
      Not your billing plan — Pro/Teams pricing is handled separately.
    </p>

    <div className="grid grid-cols-3 gap-4 mb-8">
      {TIER_OPTIONS.map((t) => (
        <button
          key={t.id}
          onClick={() => onSelectTier(t.id)}
          className={`glass-strong rounded-xl p-5 text-left transition-all ${
            selectedTier === t.id
              ? 'ring-2 ring-primary bg-primary/10'
              : 'hover:bg-muted/30'
          }`}
        >
          <t.icon className={`w-6 h-6 mb-3 ${t.color}`} />
          <div className="text-sm font-display font-semibold text-foreground mb-1">
            {t.name}
          </div>
          <div className="text-xs text-muted-foreground leading-relaxed">
            {t.desc}
          </div>
        </button>
      ))}
    </div>

    <button
      onClick={() => goToStep(3)}
      disabled={!selectedTier}
      className="px-6 py-2.5 rounded-lg bg-primary text-primary-foreground font-display text-sm font-semibold disabled:opacity-40 hover:bg-primary/80 transition-colors"
    >
      Continue <ChevronRight className="inline w-4 h-4 ml-1" />
    </button>
  </motion.div>
);

export default TierStep;
