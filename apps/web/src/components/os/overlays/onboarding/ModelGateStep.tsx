import { motion } from 'framer-motion';
import { Cpu, ArrowRight, Loader2 } from 'lucide-react';
import { fadeSlide } from './constants';
import { ModelGate } from '@/components/os/model-gate/ModelGate';
import { useHasWorkingModel } from '@/hooks/useHasWorkingModel';
import type { ModelGateStepProps } from './types';

/**
 * Onboarding step 3 — the HARD model gate (PR5 D2). Continue stays disabled until
 * ≥1 working model exists (a cloud key live-validated → Vault, OR a detected/pulled
 * local model). One soft escape — "I'll do this later" — dismisses onboarding to
 * Home, where the NoModelBanner persists until a model is set up. A zero-model first
 * task instantly errors; the gate prevents that cold-start dead-end (DESIGN_POV §2).
 *
 * Reuses the shared ModelGate (same component as Settings → Models) so the gate and
 * the permanent home of model setup can never drift.
 */
const ModelGateStep = ({ onContinue, onLater }: ModelGateStepProps) => {
  const { hasWorkingModel, loading, refresh } = useHasWorkingModel();
  return (
    <motion.div key="step-model-gate" {...fadeSlide}>
      <div className="text-center mb-5">
        <Cpu className="w-10 h-10 text-honey mx-auto mb-3" />
        <h2 className="text-2xl font-display font-bold text-foreground mb-2">Connect a model</h2>
        <p className="text-sm text-muted-foreground">
          Waggle needs one model to think with. Bring your own provider key — stored encrypted
          in your Vault — or run a model locally. Nothing leaves your machine without your key.
        </p>
      </div>

      <ModelGate variant="onboarding" onModelReady={refresh} />

      <div className="flex items-center justify-end gap-4 mt-6">
        <div className="flex items-center gap-3">
          <button
            onClick={onLater}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors font-display rounded-md px-2 py-1 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            I&apos;ll do this later
          </button>
          <button
            onClick={onContinue}
            disabled={!hasWorkingModel}
            aria-disabled={!hasWorkingModel}
            title={hasWorkingModel ? undefined : 'Add a working model to continue'}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-display text-sm font-semibold hover:bg-primary/80 disabled:opacity-50 transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {loading ? <Loader2 aria-hidden className="w-4 h-4 animate-spin" /> : null}
            Continue <ArrowRight className="w-4 h-4" aria-hidden />
          </button>
        </div>
      </div>
    </motion.div>
  );
};

export default ModelGateStep;
