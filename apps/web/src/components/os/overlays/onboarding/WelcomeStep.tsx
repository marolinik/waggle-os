import { motion } from 'framer-motion';
import waggleLogo from '@/assets/waggle-logo.jpeg';
import { fadeSlide } from './constants';
import type { WelcomeStepProps } from './types';

const WelcomeStep = ({ onClickAnywhere }: WelcomeStepProps) => (
  <motion.div
    key="step-0"
    {...fadeSlide}
    className="text-center"
    onClick={onClickAnywhere}
    /* Click-anywhere preserved for mouse users, but no longer the sole path —
       the explicit Continue button below is keyboard-reachable (A11y audit #11, WCAG 2.2.1). */
  >
    <div className="relative w-24 h-24 mx-auto mb-6">
      <img
        src={waggleLogo}
        alt="Waggle"
        className="w-24 h-24 rounded-2xl"
        style={{
          boxShadow: '0 0 60px hsl(var(--primary) / 0.3)',
        }}
      />
    </div>
    <span className="inline-block text-xs font-display font-semibold tracking-[0.3em] uppercase text-primary mb-4">
      Your AI Operating System
    </span>
    <h1 className="text-4xl font-display font-bold text-foreground mb-3">
      Welcome to the Hive
    </h1>
    <p className="text-muted-foreground text-sm max-w-md mx-auto mb-8">
      Persistent memory. Workspace-native. Built for knowledge work.
    </p>
    <button
      onClick={(e) => { e.stopPropagation(); onClickAnywhere(); }}
      autoFocus
      className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-display text-sm font-semibold hover:bg-primary/80 transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      Continue →
    </button>
    <p className="text-xs text-muted-foreground/60 mt-4">
      or click anywhere
    </p>
  </motion.div>
);

export default WelcomeStep;
