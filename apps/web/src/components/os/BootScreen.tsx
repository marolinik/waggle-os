import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useCallback } from "react";
import waggleLogoDark from "@/assets/waggle-logo.jpeg";
import waggleLogoLight from "@/assets/waggle-logo.png";
import { useIsLightTheme } from "@/hooks/useIsLightTheme";

const PHASES = [
  "Initializing core systems…",
  "Loading agent kernel…",
  "Connecting to hive network…",
  "Mounting workspaces…",
  "Ready.",
];

const PHASE_DURATION = 400;
const READY_PAUSE = 400;
const EXIT_DELAY = 300;
const SKIP_HINT_DELAY = 1000;

const BootScreen = ({ onComplete }: { onComplete: () => void }) => {
  const [phase, setPhase] = useState(0);
  const [done, setDone] = useState(false);
  const [showSkipHint, setShowSkipHint] = useState(false);
  // Logo asset varies by theme: jpeg (solid dark backing, honey W) reads well
  // on the hive-950 dark background; png (transparent, black "WAGGLE" text)
  // reads well on the cream light background.
  const isLight = useIsLightTheme();
  const waggleLogo = isLight ? waggleLogoLight : waggleLogoDark;

  const handleSkip = useCallback(() => {
    onComplete();
  }, [onComplete]);

  useEffect(() => {
    if (phase < PHASES.length - 1) {
      const t = setTimeout(() => setPhase(p => p + 1), PHASE_DURATION);
      return () => clearTimeout(t);
    } else {
      const t = setTimeout(() => setDone(true), READY_PAUSE);
      return () => clearTimeout(t);
    }
  }, [phase]);

  useEffect(() => {
    if (done) {
      const t = setTimeout(onComplete, EXIT_DELAY);
      return () => clearTimeout(t);
    }
  }, [done, onComplete]);

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
      exit={{ opacity: 0, scale: 1.05 }}
      transition={{ duration: 0.5, ease: "easeInOut" }}
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
        transition={{ type: "spring", stiffness: 200, damping: 20, delay: 0.1 }}
        className="relative mb-8"
      >
        <motion.div
          animate={{ boxShadow: ["0 0 0px hsl(var(--primary) / 0)", "0 0 40px hsl(var(--primary) / 0.3)", "0 0 0px hsl(var(--primary) / 0)"] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="rounded-3xl"
        >
          <img
            src={waggleLogo}
            alt="Waggle AI"
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
        transition={{ delay: 0.4, duration: 0.3 }}
        className="h-1 rounded-full bg-muted overflow-hidden mb-4"
      >
        <motion.div
          className="h-full bg-primary rounded-full"
          initial={{ width: "0%" }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
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
            transition={{ duration: 0.2 }}
            className={`text-xs font-mono ${
              phase === PHASES.length - 1 ? "text-primary" : "text-muted-foreground"
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
            animate={i === phase ? { scale: [1, 1.4, 1] } : {}}
            transition={{ duration: 0.4 }}
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
