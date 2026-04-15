import { motion } from 'framer-motion';
import waggleLogo from '@/assets/waggle-logo.jpeg';
import { fadeSlide } from './constants';
import type { WelcomeStepProps } from './types';

const WelcomeStep = ({ onClickAnywhere }: WelcomeStepProps) => (
  <motion.div
    key="step-0"
    {...fadeSlide}
    className="text-center cursor-pointer"
    onClick={onClickAnywhere}
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
    <span className="inline-block text-[11px] font-display font-semibold tracking-[0.3em] uppercase text-primary mb-4">
      Your AI Operating System
    </span>
    <h1 className="text-4xl font-display font-bold text-foreground mb-3">
      Welcome to the Hive
    </h1>
    <p className="text-muted-foreground text-sm max-w-md mx-auto mb-8">
      Persistent memory. Workspace-native. Built for knowledge work.
    </p>
    <span className="text-xs text-muted-foreground/60 animate-pulse">
      Click anywhere to continue
    </span>
  </motion.div>
);

export default WelcomeStep;
