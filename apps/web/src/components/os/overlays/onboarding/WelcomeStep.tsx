import { motion } from 'framer-motion';
import { ShieldCheck, Lock } from 'lucide-react';
import waggleLogoDark from '@/assets/waggle-logo.jpeg';
import waggleLogoLight from '@/assets/waggle-logo.png';
import { useIsLightTheme } from '@/hooks/useIsLightTheme';
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
  const isLight = useIsLightTheme();
  const waggleLogo = isLight ? waggleLogoLight : waggleLogoDark;
  return (
  <motion.div
    key="step-first-launch"
    {...fadeSlide}
    className="text-center"
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
        🌐 English (US)
      </span>
    </div>

    <button
      onClick={(e) => { e.stopPropagation(); onClickAnywhere(); }}
      autoFocus
      className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-display text-sm font-semibold hover:bg-primary/80 transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      Continue →
    </button>

    {/* Local-first / privacy note (C28 companion). */}
    <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground/70 mt-5 max-w-md mx-auto">
      <ShieldCheck className="w-3.5 h-3.5 text-primary/70 shrink-0" />
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
