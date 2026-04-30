import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// FR #47: previously two BASE_TIPS plus CLOSING_TIP gave a no-template flow
// only three slides, and the second slide ("Your AI remembers everything")
// can read as a paraphrase of the first slide's "search, draft, research"
// promise. Splitting the tour into four slides — commands, dock, memory,
// closing — gives every slide a distinct visual focus and prevents the
// "step 2 has identical text as step 1" perception PM hit on 2026-05-01.
const BASE_TIPS = [
  'Type / for 22 powerful commands — search, draft, research, and more.',
  'Click dock icons to open Memory, Files, Connectors, Mission Control, and more.',
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
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ type: 'spring', damping: 22, stiffness: 260 }}
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[100] w-full max-w-lg px-6"
        >
          <div className="glass-strong rounded-2xl px-8 py-7 shadow-2xl border border-primary/20">
            <AnimatePresence mode="wait">
              <motion.p
                key={tipIndex}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.15 }}
                className="text-lg text-foreground mb-5 leading-relaxed"
              >
                {tips[tipIndex]}
              </motion.p>
            </AnimatePresence>

            <div className="flex items-center justify-between">
              {/* Dot indicators */}
              <div className="flex gap-1.5">
                {tips.map((_, i) => (
                  <div
                    key={i}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      i === tipIndex ? 'bg-primary' : 'bg-muted-foreground/30'
                    }`}
                  />
                ))}
              </div>

              <div className="flex items-center gap-4">
                <button
                  onClick={handleDismissAll}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Dismiss all
                </button>
                <button
                  onClick={handleNext}
                  className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-display font-semibold hover:bg-primary/80 transition-colors"
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
