import { motion, AnimatePresence } from 'framer-motion';
import { Crown, Users, Check, X, ArrowRight } from 'lucide-react';
import { useFocusTrap } from '@/hooks/useFocusTrap';

interface TrialExpiredModalProps {
  open: boolean;
  onDismiss: () => void;
  onUpgrade: (tier: 'TEAMS') => void;
}

// Solo (free) keeps every personal capability — the trial only ever gated the
// collaboration/governance layer, so those are the only things "lost".
const KEEP_FEATURES = [
  'Memory & Harvest — unlimited, forever',
  'Unlimited workspaces & connectors',
  'Marketplace skills & connectors',
  'Self-evolving skills',
  'All built-in agents',
  'PDF & advanced exports',
];

const LOSE_FEATURES = [
  'Shared team workspaces',
  'Sync across devices',
  'Team skill library',
  'Team governance & audit',
  'SSO & role-based access',
];

export default function TrialExpiredModal({ open, onDismiss, onUpgrade }: TrialExpiredModalProps) {
  // A11y (WCAG 2.1.1/2.4.3): Escape closes, Tab is trapped, focus moves in on
  // open and restores on close. Replaces the prior Escape-only handler.
  const dialogRef = useFocusTrap<HTMLDivElement>(open, onDismiss);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[210] flex items-center justify-center"
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-hidden="true" />
          <motion.div
            ref={dialogRef}
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="trial-expired-title"
            tabIndex={-1}
            className="relative w-full max-w-lg glass-strong rounded-2xl shadow-2xl overflow-hidden focus:outline-none"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={onDismiss}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="p-6 pb-2 text-center">
              <div className="inline-flex p-3 rounded-2xl bg-primary/10 mb-4">
                <Crown className="w-8 h-8 text-primary" />
              </div>
              <h2 id="trial-expired-title" className="text-xl font-display font-bold text-foreground">
                Your 15-day trial has ended
              </h2>
              <p className="text-sm text-muted-foreground mt-2">
                Upgrade to Team to keep the collaboration features you've been using, or continue free with Solo.
              </p>
            </div>

            <div className="px-6 py-4 grid grid-cols-2 gap-4">
              <div>
                <h3 className="text-xs font-display font-semibold text-emerald-400 uppercase tracking-wider mb-2">
                  You keep
                </h3>
                <ul className="space-y-1.5">
                  {KEEP_FEATURES.map(f => (
                    <li key={f} className="flex items-start gap-2 text-[13px] text-foreground">
                      <Check className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-xs font-display font-semibold text-destructive uppercase tracking-wider mb-2">
                  You lose
                </h3>
                <ul className="space-y-1.5">
                  {LOSE_FEATURES.map(f => (
                    <li key={f} className="flex items-start gap-2 text-[13px] text-muted-foreground">
                      <X className="w-3.5 h-3.5 text-destructive/60 mt-0.5 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="px-6 pb-6 pt-2 space-y-2">
              <button
                onClick={() => onUpgrade('TEAMS')}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-primary-foreground font-display text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                <Users className="w-4 h-4" />
                Upgrade to Team — $49/seat/mo
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={onDismiss}
                className="w-full px-4 py-2 text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Continue free with Solo
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
