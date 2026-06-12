// Pure option constants + preview helper for the onboarding "Who Are You" step
// (S13 / B8). Kept out of the React component so the step stays thin and the
// option lists + preview shape are unit-testable without mounting the tree.
//
// These three signals (workType / teamSize / goals) mirror the net-new fields
// on the server `UserProfile` (profile.ts, Phase 2D.1) and are merged through
// `PUT /api/profile`. `buildProfilePreview` produces the one-line "live preview"
// the step renders under the form.

/** Work-type personalization signal (C30 — distinct from the workspace template). */
export interface OnboardingOption {
  readonly id: string;
  readonly label: string;
}

export const WORK_TYPES: readonly OnboardingOption[] = [
  { id: 'engineering', label: 'Engineering' },
  { id: 'product', label: 'Product' },
  { id: 'research', label: 'Research' },
  { id: 'sales', label: 'Sales' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'operations', label: 'Operations' },
  { id: 'finance', label: 'Finance' },
  { id: 'legal', label: 'Legal' },
  { id: 'consulting', label: 'Consulting' },
  { id: 'design', label: 'Design' },
  { id: 'leadership', label: 'Leadership' },
  { id: 'other', label: 'Other' },
] as const;

export const TEAM_SIZES: readonly OnboardingOption[] = [
  { id: 'solo', label: 'Just me' },
  { id: '2-10', label: '2–10' },
  { id: '11-50', label: '11–50' },
  { id: '51-200', label: '51–200' },
  { id: '200+', label: '200+' },
] as const;

export const GOALS: readonly OnboardingOption[] = [
  { id: 'remember', label: 'Remember everything I work on' },
  { id: 'research', label: 'Research faster' },
  { id: 'draft', label: 'Draft documents & content' },
  { id: 'code', label: 'Write & review code' },
  { id: 'plan', label: 'Plan & manage projects' },
  { id: 'automate', label: 'Automate repetitive work' },
  { id: 'decisions', label: 'Track decisions & rationale' },
  { id: 'collaborate', label: 'Collaborate with my team' },
] as const;

/** The partial profile slice the step collects before commit. */
export interface OnboardingProfileDraft {
  readonly name?: string;
  readonly role?: string;
  readonly industry?: string;
  readonly workType?: string;
  readonly teamSize?: string;
  readonly goals?: readonly string[];
}

function labelFor(options: readonly OnboardingOption[], id: string | undefined): string | undefined {
  if (!id) return undefined;
  return options.find(o => o.id === id)?.label ?? id;
}

/** Time-of-day salutation for the live greeting preview. */
function salutation(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Build the live greeting preview under the form — a demonstration of the
 * personalization promise (how Waggle will actually greet the user), not a
 * profile summary. Degrades gracefully: no name → prompt for one; name only →
 * the memory promise; name + work type/role → a role-aware greeting. Pure —
 * `now` is injectable so tests can pin the time of day.
 */
export function buildProfilePreview(partial: OnboardingProfileDraft, now: Date = new Date()): string {
  const name = partial.name?.trim();
  if (!name) return "Tell me your name and I'll greet you properly.";

  const greeting = `${salutation(now.getHours())}, ${name}`;
  // Prefer the curated work-type label (clean noun); fall back to the
  // free-text role so either signal personalizes the clause.
  const work = labelFor(WORK_TYPES, partial.workType) ?? partial.role?.trim();
  if (work) return `${greeting} — ready to pick up your ${work.toLowerCase()} work?`;
  return `${greeting} — your work will be remembered here.`;
}
