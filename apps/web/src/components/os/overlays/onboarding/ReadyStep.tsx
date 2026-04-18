import { motion } from 'framer-motion';
import waggleLogoDark from '@/assets/waggle-logo.jpeg';
import waggleLogoLight from '@/assets/waggle-logo.png';
import { useIsLightTheme } from '@/hooks/useIsLightTheme';
import { fadeSlide } from './constants';
import type { ReadyStepProps } from './types';

const ReadyStep = ({ createError, onLetsGo }: ReadyStepProps) => {
  const isLight = useIsLightTheme();
  const waggleLogo = isLight ? waggleLogoLight : waggleLogoDark;
  return (
  <motion.div key="step-7" {...fadeSlide} className="text-center">
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', damping: 12 }}
    >
      <div className="relative w-20 h-20 mx-auto mb-5">
        <img
          src={waggleLogo}
          alt="Waggle"
          className="w-20 h-20 rounded-2xl"
          style={{ boxShadow: '0 0 60px hsl(var(--primary) / 0.4)' }}
        />
      </div>
      {createError && (
        <p className="text-xs text-amber-400 mb-3 text-center">{createError}</p>
      )}
      <h2 className="text-3xl font-display font-bold text-foreground mb-2">
        Your hive is ready ⬡
      </h2>
      <p className="text-sm text-muted-foreground mb-6">
        Your workspace is ready. Let's get to work.
      </p>
      <button
        onClick={onLetsGo}
        className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-primary text-primary-foreground font-display text-sm font-semibold hover:bg-primary/80 transition-colors glow-primary"
      >
        🐝 Let's go!
      </button>
    </motion.div>
  </motion.div>
  );
};

export default ReadyStep;
