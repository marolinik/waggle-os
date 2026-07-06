import { motion } from 'framer-motion';
import { ShieldCheck, Lock, Globe } from 'lucide-react';
import beeMascot from '@/assets/personas/general-purpose.png';
import { fadeSlide } from './constants';
import type { WelcomeStepProps } from './types';

/**
 * S12 — First Launch. Manual "Continue" only (C29: the 3s auto-advance was
 * dropped). Carries a static disabled `English (US)` chip (C28 — no i18n exists
 * yet, so the selector is a non-interactive placeholder) and a one-line
 * local-first / privacy note so the user sees the trust signal up front. When
 * the sidecar is unreachable an "offline-ready" note reassures that setup still
 * works locally.
 */
const WelcomeStep = ({ onClickAnywhere, offline }: WelcomeStepProps) => {
  return (
  <motion.div
    key="step-first-launch"
    {...fadeSlide}
    className="text-center"
  >
    <div className="relative w-24 h-24 mx-auto mb-6">
      {/* Wave R Lane E — brand moment: the canonical flat-geometric hex-bee
          mascot (the same set the persona picker + landing use) opens
          onboarding, a warm greeting instead of a generic app-icon tile. The
          transparent mascot reads on both themes. glow-breathe keeps the slow
          amber pulse (reduced-motion drops the animation via the keyframe
          base). */}
      <img
        src={beeMascot}
        alt="Waggle"
        className="w-24 h-24 glow-breathe"
        style={{
          filter: 'drop-shadow(0 0 42px hsl(var(--primary) / 0.32))',
        }}
      />
    </div>
    <span className="inline-block text-xs font-display font-semibold tracking-[0.3em] uppercase text-honey mb-4">
      Personal AI Workspace
    </span>
    <h1 className="text-4xl font-display font-bold text-foreground mb-3">
      Your AI should know how you work
    </h1>
    <p className="text-muted-foreground text-sm max-w-md mx-auto mb-6">
      Waggle remembers you, knows your projects, evolves with each decision, and guides the next step.
    </p>

    {/* C28: static language badge — no i18n exists yet, so this is a
        non-interactive marker of the (sole) current language, not a control. */}
    <div className="mb-5">
      <span
        title="More languages coming soon"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border/50 bg-muted/30 text-xs font-display text-muted-foreground"
      >
        <Globe className="w-3 h-3" aria-hidden /> English (US)
      </span>
    </div>

    <button
      onClick={(e) => { e.stopPropagation(); onClickAnywhere(); }}
      autoFocus
      className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-display text-sm font-semibold hover:bg-primary/80 transition-colors focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_var(--honey-line)]"
    >
      Continue →
    </button>

    {/* Local-first / privacy note (C28 companion). */}
    <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground/70 mt-5 max-w-md mx-auto">
      <ShieldCheck className="w-3.5 h-3.5 text-honey/70 shrink-0" />
      Your memory and data stay on your device. Nothing leaves unless you say so.
    </p>
    {offline && (
      <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground/60 mt-2">
        <Lock className="w-3 h-3 shrink-0" />
        Offline-ready — setup works locally even without a connection.
      </p>
    )}
  </motion.div>
  );
};

export default WelcomeStep;
