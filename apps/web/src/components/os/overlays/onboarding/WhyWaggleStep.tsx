import { motion } from 'framer-motion';
import { Hexagon, ChevronRight } from 'lucide-react';
import { fadeSlide, VALUE_PROPS } from './constants';
import type { WhyWaggleStepProps } from './types';

const WhyWaggleStep = ({ goToStep }: WhyWaggleStepProps) => (
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

    <button
      onClick={() => goToStep(2)}
      className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-display text-sm font-semibold hover:bg-primary/80 transition-colors"
    >
      Continue <ChevronRight className="w-4 h-4" />
    </button>
  </motion.div>
);

export default WhyWaggleStep;
