import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useState, useEffect, useCallback, useRef } from "react";
import waggleLogoDark from "@/assets/waggle-logo.jpeg";
import waggleLogoLight from "@/assets/waggle-logo.png";
import { useIsLightTheme } from "@/hooks/useIsLightTheme";
import { DUR, EASE_OUT } from "@/lib/motion/tokens";

const PHASES = [
  "Initializing core systems…",
  "Loading agent kernel…",
  "Connecting to hive network…",
  "Mounting workspaces…",
  "Ready.",
];

const PHASE_DURATION = 400;
// Wave U Lane D (item 1): perceptual boot floor. The boot screen shows for at
// least this long — enough for the brand moment — then exits the instant the
// shell's data dependencies are ready (`ready` prop). Replaces the old fixed
// ~2.3s choreography floor that made returning users sit through dead air.
const MIN_BRAND_MS = 850;
// Lane H item 5: with cache-first paint there is real content waiting behind the
// boot screen for a WARM session, so the brand moment drops to a ≤500ms flash —
// no reason to dwell over content that's already there. COLD / day-0 keeps the
// full 850ms floor (nothing to paint, so the brand moment earns its beat).
const WARM_BRAND_MS = 500;
const SKIP_HINT_DELAY = 1000;

const BootScreen = ({ onComplete, ready = true, warm = false }: { onComplete: () => void; ready?: boolean; warm?: boolean }) => {
  const floorMs = warm ? WARM_BRAND_MS : MIN_BRAND_MS;
  const [phase, setPhase] = useState(0);
  const [floorElapsed, setFloorElapsed] = useState(false);
  const [showSkipHint, setShowSkipHint] = useState(false);
  const completedRef = useRef(false);
  const reduceMotion = useReducedMotion();
  // Logo asset varies by theme: jpeg (solid dark backing, honey W) reads well
  // on the hive-950 dark background; png (transparent, black "WAGGLE" text)
  // reads well on the cream light background.
  const isLight = useIsLightTheme();
  const waggleLogo = isLight ? waggleLogoLight : waggleLogoDark;

  // Fire onComplete at most once — the floor+ready path and the manual skip
  // (click / any key) both race to exit; whichever wins, the other is a no-op.
  const finish = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete();
  }, [onComplete]);

  const handleSkip = useCallback(() => {
    finish();
  }, [finish]);

  // Perceptual floor: hold the boot screen for at least floorMs (WARM_BRAND_MS
  // for a cache-first warm session, MIN_BRAND_MS cold) so the brand moment lands,
  // no matter how fast deps resolve.
  useEffect(() => {
    const t = setTimeout(() => setFloorElapsed(true), floorMs);
    return () => clearTimeout(t);
  }, [floorMs]);

  // Exit once the floor has elapsed AND the shell's deps are ready. While deps
  // are genuinely unresolved (ready=false) the boot holds past the floor — the
  // phase choreography below settles on "Ready." and waits (item 1).
  useEffect(() => {
    if (floorElapsed && ready) finish();
  }, [floorElapsed, ready, finish]);

  // Visual phase choreography — advances on its own cadence, decoupled from the
  // exit trigger so shortening the floor never truncates it mid-transition.
  useEffect(() => {
    if (phase < PHASES.length - 1) {
      const t = setTimeout(() => setPhase(p => p + 1), PHASE_DURATION);
      return () => clearTimeout(t);
    }
  }, [phase]);

  useEffect(() => {
    const handleKeyDown = () => handleSkip();
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSkip]);

  useEffect(() => {
    const t = setTimeout(() => setShowSkipHint(true), SKIP_HINT_DELAY);
    return () => clearTimeout(t);
  }, []);

  const progress = ((phase + 1) / PHASES.length) * 100;

  return (
    <motion.div
      initial={{ opacity: 1 }}
      // Item 2: the exit stays choreographed (fade) at the shorter floor; under
      // reduced motion it becomes an instant swap (no fade, no scale). The 0.5s
      // easeInOut is a deliberate bespoke boot exit — a cinematic hand-off that
      // sits OFF the standard DUR grid on purpose (no symmetric in-out easing
      // token exists, and the 0.4 settle grade would clip the fade). Pinned by
      // wave-u-boot-warm-start.test.tsx.
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 1.05 }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.5, ease: "easeInOut" }}
      className="fixed inset-0 z-[9999] bg-background flex flex-col items-center justify-center cursor-pointer"
      data-testid="boot-screen"
      role="status"
      aria-live="polite"
      aria-label={`Waggle booting — ${PHASES[phase]}. Click or press any key to skip.`}
      onClick={handleSkip}
    >
      {/* Subtle radial glow */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/5 blur-[120px]" />
      </div>

      {/* Logo */}
      <motion.div
        initial={{ opacity: 0, scale: 0.5, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        // Justified off-family spring (ζ≈0.707 vs the token band 0.74–0.77): the
        // boot logo is the one bespoke cinematic entrance — slightly bouncier by
        // design; not a reusable UI tier, so it stays a literal (Phase-0 rule).
        transition={{ type: "spring", stiffness: 200, damping: 20, delay: 0.1 }}
        className="relative mb-8"
      >
        <motion.div
          // REDUCED('ambient') → off: the infinite glow loop must not run for
          // reduced-motion users (A2 V1' catch). 2s/easeInOut are justified
          // literals — ambient breathing has no DUR token by design.
          animate={reduceMotion ? undefined : { boxShadow: ["0 0 0px hsl(var(--primary) / 0)", "0 0 40px hsl(var(--primary) / 0.3)", "0 0 0px hsl(var(--primary) / 0)"] }}
          transition={reduceMotion ? undefined : { duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="rounded-3xl"
        >
          <img
            src={waggleLogo}
            alt="Waggle AI"
            width={80}
            height={80}
            className="w-20 h-20 rounded-3xl shadow-2xl"
          />
        </motion.div>
      </motion.div>

      {/* Title */}
      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="text-2xl font-display font-bold text-foreground mb-1"
      >
        Waggle AI
      </motion.h1>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="text-xs text-muted-foreground mb-10 font-display"
      >
        Autonomous Agent OS
      </motion.p>

      {/* Progress bar */}
      <motion.div
        initial={{ opacity: 0, width: 0 }}
        animate={{ opacity: 1, width: 240 }}
        // Boot cinematic beat: the 0.3s reveal + 0.4s delay ride the boot
        // surface's own timeline (glow loop + staggered logo/title reveals),
        // deliberately off the standard DUR grid.
        transition={{ delay: 0.4, duration: 0.3 }}
        className="h-1 rounded-full bg-muted overflow-hidden mb-4"
      >
        <motion.div
          className="h-full bg-primary rounded-full"
          initial={{ width: "0%" }}
          animate={{ width: `${progress}%` }}
          // R20 Lane CL (item 1): under prefers-reduced-motion the progress area
          // must not animate — snap the fill to each step instantly (still shows
          // progress, no lingering transition). Full ease otherwise.
          transition={reduceMotion ? { duration: 0 } : { duration: DUR.settle, ease: EASE_OUT }}
        />
      </motion.div>

      {/* Phase text */}
      <div className="h-5">
        <AnimatePresence mode="wait">
          <motion.p
            key={phase}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: DUR.base }}
            className={`text-xs font-mono ${
              phase === PHASES.length - 1 ? "text-honey" : "text-muted-foreground"
            }`}
          >
            {PHASES[phase]}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* Phase dots */}
      <div className="flex gap-2 mt-6">
        {PHASES.map((_, i) => (
          <motion.div
            key={i}
            className={`w-1.5 h-1.5 rounded-full ${
              i <= phase ? "bg-primary" : "bg-muted-foreground/30"
            }`}
            // R20 Lane CL (item 1): the active-dot pulse is a repeating keyframe
            // loop — gate it under reduced motion so the progress area carries
            // ZERO lingering animation (the logo glow loop was gated in A2; the
            // background radial is a static div). Reduced motion → no pulse.
            animate={!reduceMotion && i === phase ? { scale: [1, 1.4, 1] } : {}}
            transition={{ duration: DUR.settle }}
          />
        ))}
      </div>

      {/* Skip hint */}
      <AnimatePresence>
        {showSkipHint && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            // Boot cinematic beat: 0.3s hint fade, intentionally off the DUR grid
            // (part of the boot surface's bespoke timeline).
            transition={{ duration: 0.3 }}
            className="absolute bottom-8 text-xs text-muted-foreground/50"
          >
            Click or press any key to skip
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default BootScreen;
