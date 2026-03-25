import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const TIPS = [
  'Type / for 22 powerful commands — search, draft, research, and more.',
  'I remember everything you tell me across sessions.',
  'Create workspaces to organize projects with separate memory.',
  'Your AI remembers everything — facts, decisions, preferences.',
  'Check your Memory tab to see what I\'ve learned.',
  'Type /help in chat for a full list of commands.',
  'Try /research [topic] to kick off a deep dive.',
];

interface OnboardingTooltipsProps {
  onComplete?: () => void;
}

const OnboardingTooltips = ({ onComplete }: OnboardingTooltipsProps) => {
  const [tipIndex, setTipIndex] = useState(0);
  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem('waggle:tooltips_done') === 'true';
  });

  useEffect(() => {
    // Small delay before showing first tooltip
    const timer = setTimeout(() => {}, 500);
    return () => clearTimeout(timer);
  }, []);

  if (dismissed) return null;

  const isLast = tipIndex >= TIPS.length - 1;

  const handleNext = () => {
    if (isLast) {
      setDismissed(true);
      localStorage.setItem('waggle:tooltips_done', 'true');
      onComplete?.();
    } else {
      setTipIndex(i => i + 1);
    }
  };

  const handleDismissAll = () => {
    setDismissed(true);
    localStorage.setItem('waggle:tooltips_done', 'true');
    onComplete?.();
  };

  return (
    <AnimatePresence>
      {!dismissed && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[100] w-full max-w-sm"
        >
          <div className="glass-strong rounded-xl px-5 py-4 shadow-xl">
            <AnimatePresence mode="wait">
              <motion.p
                key={tipIndex}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.15 }}
                className="text-sm text-foreground mb-3"
              >
                {TIPS[tipIndex]}
              </motion.p>
            </AnimatePresence>

            <div className="flex items-center justify-between">
              {/* Dot indicators */}
              <div className="flex gap-1">
                {TIPS.map((_, i) => (
                  <div
                    key={i}
                    className={`w-1.5 h-1.5 rounded-full transition-colors ${
                      i === tipIndex ? 'bg-primary' : 'bg-muted-foreground/30'
                    }`}
                  />
                ))}
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleDismissAll}
                  className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  Dismiss all
                </button>
                <button
                  onClick={handleNext}
                  className="px-3 py-1 rounded-lg bg-primary text-primary-foreground text-xs font-display font-semibold hover:bg-primary/80 transition-colors"
                >
                  {isLast ? 'Got it' : 'Next'}
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default OnboardingTooltips;
