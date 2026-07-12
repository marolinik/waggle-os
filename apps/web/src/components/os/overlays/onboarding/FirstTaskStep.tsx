import { motion } from 'framer-motion';
import { fadeSlide } from './constants';
import type { FirstTaskStepProps } from './types';

/**
 * Onboarding terminal step (PR5) — end inside the work. The workspace already exists
 * (created on the Template step); here the user gives the agent its first task, seeded
 * with the chosen template's hint and a few suggested prompts. "Let's go" opens the
 * workspace with that first message (an empty box falls back to a default greeting in
 * the wizard, so this never dead-ends).
 */
const FirstTaskStep = ({ message, onMessageChange, suggestions, onPickSuggestion, onLetsGo, createError }: FirstTaskStepProps) => (
  <motion.div key="step-first-task" {...fadeSlide}>
    <div className="text-center mb-5">
      <h2 className="text-2xl font-display font-bold text-foreground mb-2">What&apos;s first?</h2>
      <p className="text-sm text-muted-foreground">
        Your workspace is ready. Give your agent its first task — or pick a suggestion.
      </p>
    </div>

    {createError && <p className="text-xs text-muted-foreground mb-3 text-center">{createError}</p>}

    <textarea
      name="onboardingFirstTask"
      autoComplete="off"
      value={message}
      onChange={(e) => onMessageChange(e.target.value)}
      rows={3}
      placeholder="Ask your agent to do something…"
      aria-label="First task"
      className="w-full bg-muted/50 border border-border/50 rounded-lg px-3 py-2.5 text-sm text-foreground resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background mb-3"
    />

    {suggestions.length > 0 && (
      <div className="flex flex-wrap gap-2 mb-6">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPickSuggestion(s)}
            className="rounded-full border border-border bg-card px-3 py-1.5 text-left text-xs text-foreground/80 hover:text-foreground hover:border-primary/40 transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {s}
          </button>
        ))}
      </div>
    )}

    <div className="flex justify-end">
      <button
        onClick={onLetsGo}
        className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-primary text-primary-foreground font-display text-sm font-semibold hover:bg-primary/80 transition-colors glow-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        🐝 Let&apos;s go!
      </button>
    </div>
  </motion.div>
);

export default FirstTaskStep;
