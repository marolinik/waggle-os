import { motion } from 'framer-motion';
import { UserRound, Loader2 } from 'lucide-react';
import { fadeSlide } from './constants';
import { WORK_TYPES, TEAM_SIZES, GOALS, buildProfilePreview } from '@/lib/onboarding-profile';
import type { WhoAreYouStepProps } from './types';

/** Industry options — copied from UserProfileApp's Identity tab (reuse pattern). */
const INDUSTRIES = [
  'Technology', 'Financial Services', 'Consulting', 'Healthcare',
  'Education', 'Manufacturing', 'Retail', 'Media', 'Legal',
  'Real Estate', 'Energy', 'Government', 'Non-profit', 'Other',
] as const;

/**
 * S13 / B8 — "Who Are You". Captures the day-0 identity + personalization
 * signals and renders a live one-line preview. On Continue the wizard performs
 * the dual write (`PUT /api/profile` AND `POST /api/identity`) so the Home
 * cockpit greets the user by name (B8). This component is presentational: it
 * lifts every field through `onChange` and delegates the save to `onContinue`.
 */
const WhoAreYouStep = ({ profile, onChange, onContinue, saving }: WhoAreYouStepProps) => {
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
    <motion.div key="step-who-are-you" {...fadeSlide}>
      <div className="text-center mb-6">
        <UserRound className="w-10 h-10 text-primary mx-auto mb-3" />
        <h2 className="text-2xl font-display font-bold text-foreground mb-2">
          Tell us who you are
        </h2>
        <p className="text-sm text-muted-foreground">
          Waggle uses this to greet you by name and tailor how it helps. You can change it anytime in My Profile.
        </p>
      </div>

      <div className="space-y-5">
        {/* Name / Role / Industry */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1" htmlFor="who-name">Name</label>
            <input
              id="who-name"
              value={profile.name ?? ''}
              onChange={e => onChange({ name: e.target.value })}
              placeholder="Marko Markovic"
              className="w-full bg-muted/50 border border-border/50 rounded-lg px-3 py-1.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1" htmlFor="who-role">Role</label>
            <input
              id="who-role"
              value={profile.role ?? ''}
              onChange={e => onChange({ role: e.target.value })}
              placeholder="Strategy Consultant"
              className="w-full bg-muted/50 border border-border/50 rounded-lg px-3 py-1.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1" htmlFor="who-industry">Industry</label>
            <select
              id="who-industry"
              value={profile.industry ?? ''}
              onChange={e => onChange({ industry: e.target.value })}
              className="w-full bg-muted/50 border border-border/50 rounded-lg px-3 py-1.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <option value="">Select…</option>
              {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
            </select>
          </div>
        </div>

        {/* Work type (C30 — distinct personalization signal from the template) */}
        <div>
          <label className="text-xs text-muted-foreground block mb-2">What kind of work do you do?</label>
          <div className="flex flex-wrap gap-1.5">
            {WORK_TYPES.map(w => (
              <button
                key={w.id}
                type="button"
                aria-pressed={profile.workType === w.id}
                onClick={() => onChange({ workType: profile.workType === w.id ? '' : w.id })}
                className={`px-3 py-1.5 rounded-lg text-xs font-display transition-colors ${
                  profile.workType === w.id
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/50 text-muted-foreground hover:text-foreground'
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>

        {/* Team size */}
        <div>
          <label className="text-xs text-muted-foreground block mb-2">How big is your team?</label>
          <div className="flex flex-wrap gap-1.5">
            {TEAM_SIZES.map(t => (
              <button
                key={t.id}
                type="button"
                aria-pressed={profile.teamSize === t.id}
                onClick={() => onChange({ teamSize: profile.teamSize === t.id ? '' : t.id })}
                className={`px-3 py-1.5 rounded-lg text-xs font-display transition-colors ${
                  profile.teamSize === t.id
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/50 text-muted-foreground hover:text-foreground'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Goals (multi-select chips) */}
        <div>
          <label className="text-xs text-muted-foreground block mb-2">What do you want Waggle to help with?</label>
          <div className="flex flex-wrap gap-1.5">
            {GOALS.map(g => {
              const on = goals.includes(g.id);
              return (
                <button
                  key={g.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleGoal(g.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-display transition-colors ${
                    on
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted/50 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {g.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Live preview */}
        <div className="p-3 rounded-xl bg-secondary/30 border border-border/30">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground/70 mb-1 font-display">Preview</p>
          <p className="text-sm text-foreground">{preview}</p>
        </div>
      </div>

      <div className="flex items-center justify-end gap-4 mt-6">
        <button
          onClick={onContinue}
          disabled={saving}
          aria-busy={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-display text-sm font-semibold hover:bg-primary/80 disabled:opacity-50 transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {saving ? <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin" /> : null}
          {saving ? 'Saving…' : 'Continue →'}
        </button>
      </div>
    </motion.div>
  );
};

export default WhoAreYouStep;
