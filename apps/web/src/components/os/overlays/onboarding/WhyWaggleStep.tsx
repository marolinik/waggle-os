import { motion } from 'framer-motion';
import { Hexagon, ChevronRight, Zap } from 'lucide-react';
import { fadeSlide, VALUE_PROPS } from './constants';
import type { WhyWaggleStepProps } from './types';
import { HintTooltip } from '@/components/ui/hint-tooltip';

const WhyWaggleStep = ({ goToStep, onSkipSetup, skipDisabled }: WhyWaggleStepProps) => (
  <motion.div key="step-1" {...fadeSlide} className="text-center">
    <Hexagon className="w-10 h-10 text-primary mx-auto mb-4" />
    <h2 className="text-2xl font-display font-bold text-foreground mb-2">
      Why Waggle?
    </h2>
    <p className="text-sm text-muted-foreground mb-8">
      Not just another chatbot. A full operating system for your AI.
    </p>

    <div className="grid grid-cols-3 gap-4 mb-8">
      {VALUE_PROPS.map((vp) => (
        <div
          key={vp.title}
          className="glass-strong rounded-xl p-5 text-left"
        >
          <vp.icon className="w-5 h-5 text-primary mb-3" />
          <h3 className="text-sm font-display font-semibold text-foreground mb-1">
            {vp.title}
          </h3>
          <p className="text-xs text-muted-foreground">{vp.desc}</p>
        </div>
      ))}
    </div>

    <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
      <button
        onClick={() => goToStep(2)}
        className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-display text-sm font-semibold hover:bg-primary/80 transition-colors"
        data-testid="onboarding-continue"
      >
        Continue <ChevronRight className="w-4 h-4" />
      </button>
      {onSkipSetup && (
        <HintTooltip content="Skip the walkthrough and land on the desktop with sensible defaults.">
          <button
            onClick={onSkipSetup}
            disabled={skipDisabled}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-display text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="onboarding-skip-setup"
          >
            {/* FR #36: previous label "Skip and set me up" read as paradoxical
                ("skipping" but also "setting up"). The action sets sensible
                defaults instantly — "Skip — quick setup" surfaces both halves
                without the contradiction. */}
            <Zap className="w-3.5 h-3.5" /> Skip — quick setup
          </button>
        </HintTooltip>
      )}
    </div>
  </motion.div>
);

export default WhyWaggleStep;
