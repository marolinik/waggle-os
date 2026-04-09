import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const BASE_TIPS = [
  'Type / for 22 powerful commands — search, draft, research, and more.',
  'Your AI remembers everything — across every session, every workspace.',
];

const TEMPLATE_TIPS: Record<string, string[]> = {
  'sales-pipeline': [
    'Try "Research [company name]" to get a full prospect brief.',
    'Use /draft to create personalized outreach emails.',
  ],
  'research-project': [
    'Try /research [any topic] — watch your agent search and synthesize.',
    'Use /memory to review what your agent has learned so far.',
  ],
  'code-review': [
    'Try /review to analyze code quality and suggest improvements.',
    'Use /plan for multi-step refactoring plans.',
  ],
  'marketing-campaign': [
    'Try /draft campaign brief to kickstart your strategy.',
    'Use /research competitors to analyze your market.',
  ],
  'product-launch': [
    'Try /draft PRD to create a product requirements document.',
    'Use /plan to build a launch checklist with milestones.',
  ],
  'legal-review': [
    'Try /review to analyze contracts and flag risky clauses.',
    'Use /research for legal precedent and regulatory context.',
  ],
  'agency-consulting': [
    'Try /research [client company] for a deep client brief.',
    'Use /status for project metrics across engagements.',
  ],
};

const CLOSING_TIP = 'Check your Memory tab to see what your agent learns over time.';

interface OnboardingTooltipsProps {
  templateId?: string;
  onDismiss?: () => void;
}

const OnboardingTooltips = ({ templateId, onDismiss }: OnboardingTooltipsProps) => {
  const [tipIndex, setTipIndex] = useState(0);
  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem('waggle:tooltips_done') === 'true';
  });

  const tips = useMemo(() => {
    const specific = templateId ? (TEMPLATE_TIPS[templateId] ?? []) : [];
    return [...BASE_TIPS, ...specific, CLOSING_TIP];
  }, [templateId]);

  if (dismissed) return null;

  const isLast = tipIndex >= tips.length - 1;

  const handleNext = () => {
    if (isLast) {
      setDismissed(true);
      localStorage.setItem('waggle:tooltips_done', 'true');
      onDismiss?.();
    } else {
      setTipIndex(i => i + 1);
    }
  };

  const handleDismissAll = () => {
    setDismissed(true);
    localStorage.setItem('waggle:tooltips_done', 'true');
    onDismiss?.();
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
                {tips[tipIndex]}
              </motion.p>
            </AnimatePresence>

            <div className="flex items-center justify-between">
              {/* Dot indicators */}
              <div className="flex gap-1">
                {tips.map((_, i) => (
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
                  className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
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
