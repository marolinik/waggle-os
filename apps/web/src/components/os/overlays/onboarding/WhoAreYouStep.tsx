import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { fadeSlide } from './constants';
import { WORK_TYPES, TEAM_SIZES, GOALS, buildProfilePreview } from '@/lib/onboarding-profile';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import type { WhoAreYouStepProps } from './types';

/** Industry options — copied from UserProfileApp's Identity tab (reuse pattern). */
const INDUSTRIES = [
  'Technology', 'Financial Services', 'Consulting', 'Healthcare',
  'Education', 'Manufacturing', 'Retail', 'Media', 'Legal',
  'Real Estate', 'Energy', 'Government', 'Non-profit', 'Other',
] as const;

const profileChipClass = (selected: boolean): string => selected
  ? 'border border-primary/40 bg-primary text-primary-foreground'
  : 'border border-[var(--line-affordance)] bg-muted/50 text-[var(--text-tertiary)] hover:border-[var(--focus-ring)] hover:text-foreground';

/**
 * S13 / B8 — "Who Are You". Captures the day-0 identity + personalization
 * signals and renders a live one-line preview. On Continue the wizard performs
 * the dual write (`PUT /api/profile` AND `POST /api/identity`) so the Home
 * cockpit greets the user by name (B8). This component is presentational: it
 * lifts every field through `onChange` and delegates the save to `onContinue`.
 */
const WhoAreYouStep = ({
  profile,
  onChange,
  onContinue,
  onContinueWithoutPersonalization,
  saving,
  saveError,
}: WhoAreYouStepProps) => {
  const goals = profile.goals ?? [];
  const toggleGoal = (id: string) => {
    const next = goals.includes(id) ? goals.filter(g => g !== id) : [...goals, id];
    onChange({ goals: next });
  };

  const preview = buildProfilePreview({
    name: profile.name,
    role: profile.role,
    industry: profile.industry,
    workType: profile.workType,
    teamSize: profile.teamSize,
    goals,
  });

  return (
    <motion.div key="step-who-are-you" {...fadeSlide} className="w-full min-w-0">
      {/* Wave V Lane F item 3 (mascot carry): the generic UserRound glyph that
          used to head this step is gone — the wizard shell now carries the
          persistent breathing hex-bee across every step, so the brand mascot is
          the header instead of a per-step icon swap. */}
      <div className="text-center mb-3 sm:mb-6">
        <h2 className="text-xl sm:text-2xl font-display font-bold text-foreground mb-1.5 sm:mb-2">
          Tell us who you are
        </h2>
        <p className="text-[13px] sm:text-sm text-muted-foreground leading-snug sm:leading-normal">
          Waggle uses this to greet you by name and tailor how it helps. You can change it anytime in My Profile.
        </p>
      </div>

      <div className="space-y-3 sm:space-y-5">
        {/* Name / Role / Industry */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1" htmlFor="who-name">Name</label>
            <input
              id="who-name"
              name="onboardingName"
              autoComplete="name"
              value={profile.name ?? ''}
              onChange={e => onChange({ name: e.target.value })}
              disabled={saving}
              placeholder="Marko Markovic"
              className="w-full bg-muted/50 border border-border/50 rounded-lg px-3 py-1.5 text-[13px] sm:text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1" htmlFor="who-role">Role</label>
            <input
              id="who-role"
              name="onboardingRole"
              autoComplete="organization-title"
              value={profile.role ?? ''}
              onChange={e => onChange({ role: e.target.value })}
              disabled={saving}
              placeholder="Strategy Consultant"
              className="w-full bg-muted/50 border border-border/50 rounded-lg px-3 py-1.5 text-[13px] sm:text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1" htmlFor="who-industry">Industry</label>
            {/* Wave V Lane F item 3: the native OS <select> rendered its options
                list in un-themed browser chrome (a white popup in dark mode).
                The app's themed Select primitive (Radix) renders a token-driven
                dropdown that matches both themes; the trigger inherits the same
                bg-muted/50 + border-border/50 grammar as the Name/Role inputs. */}
            <Select
              value={profile.industry || undefined}
              onValueChange={(v) => onChange({ industry: v })}
              disabled={saving}
            >
              <SelectTrigger
                id="who-industry"
                aria-label="Industry"
                className="w-full h-auto bg-muted/50 border-border/50 rounded-lg px-3 py-1.5 text-[13px] sm:text-sm text-foreground"
              >
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                {INDUSTRIES.map(i => (
                  <SelectItem key={i} value={i}>{i}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Work type (C30 — distinct personalization signal from the template) */}
        <div>
          <label className="text-xs text-muted-foreground block mb-1.5 sm:mb-2">What kind of work do you do?</label>
          <div className="flex flex-wrap gap-1.5">
            {WORK_TYPES.map(w => (
              <button
                key={w.id}
                type="button"
                aria-pressed={profile.workType === w.id}
                onClick={() => onChange({ workType: profile.workType === w.id ? '' : w.id })}
                disabled={saving}
                className={`px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg text-xs font-display transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${profileChipClass(profile.workType === w.id)}`}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>

        {/* Team size */}
        <div>
          <label className="text-xs text-muted-foreground block mb-1.5 sm:mb-2">How big is your team?</label>
          <div className="flex flex-wrap gap-1.5">
            {TEAM_SIZES.map(t => (
              <button
                key={t.id}
                type="button"
                aria-pressed={profile.teamSize === t.id}
                onClick={() => onChange({ teamSize: profile.teamSize === t.id ? '' : t.id })}
                disabled={saving}
                className={`px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg text-xs font-display transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${profileChipClass(profile.teamSize === t.id)}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Goals (multi-select chips) */}
        <div>
          <label className="text-xs text-muted-foreground block mb-1.5 sm:mb-2">What do you want Waggle to help with?</label>
          <div className="flex flex-wrap gap-1.5">
            {GOALS.map(g => {
              const on = goals.includes(g.id);
              return (
                <button
                  key={g.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleGoal(g.id)}
                  disabled={saving}
                  className={`px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg text-xs font-display transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${profileChipClass(on)}`}
                >
                  {g.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Live preview */}
        <div className="p-2.5 sm:p-3 rounded-xl bg-secondary/30 border border-border/30">
          {/* Lane T: was text-muted-foreground/70 (~2.9:1 light over the tinted
              preview panel — sub-AA). Full-opacity --text-tertiary → ≥5.2:1. */}
          <p className="text-[11px] uppercase tracking-wide text-[var(--text-tertiary)] mb-1 font-display">Preview</p>
          <p className="text-sm text-foreground">{preview}</p>
        </div>
      </div>

      {saveError && (
        <p
          role="alert"
          aria-live="assertive"
          className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {saveError}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3 mt-4 sm:mt-6">
        {saveError && onContinueWithoutPersonalization && (
          <button
            type="button"
            onClick={onContinueWithoutPersonalization}
            disabled={saving}
            className="px-4 py-2 rounded-xl text-sm font-display text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Continue without personalization
          </button>
        )}
        <button
          type="button"
          onClick={onContinue}
          disabled={saving}
          aria-busy={saving}
          className="inline-flex items-center gap-2 px-5 py-2 sm:py-2.5 rounded-xl bg-primary text-primary-foreground font-display text-sm font-semibold hover:bg-primary/80 disabled:cursor-not-allowed disabled:opacity-50 transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {saving ? <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin" /> : null}
          {saving ? 'Saving…' : saveError ? 'Retry saving profile' : 'Continue →'}
        </button>
      </div>
    </motion.div>
  );
};

export default WhoAreYouStep;
