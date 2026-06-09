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

/**
 * Build a one-line natural-language preview of the profile draft for the live
 * preview under the form. Returns a friendly fallback when nothing is filled in
 * yet so the preview area is never empty. Pure — no React, no side effects.
 */
export function buildProfilePreview(partial: OnboardingProfileDraft): string {
  const name = partial.name?.trim();
  const role = partial.role?.trim();
  const industry = partial.industry?.trim();
  const workType = labelFor(WORK_TYPES, partial.workType);
  const teamSize = labelFor(TEAM_SIZES, partial.teamSize);
  const goals = (partial.goals ?? [])
    .map(id => labelFor(GOALS, id))
    .filter((g): g is string => Boolean(g));

  if (!name && !role && !industry && !workType && !teamSize && goals.length === 0) {
    return 'Tell us about yourself so Waggle can greet you by name and tailor its help.';
  }

  // Lead clause: "<Name> · <Role> in <Industry>" (each part optional).
  const lead: string[] = [];
  if (name) lead.push(name);
  const roleClause = [role, industry ? `in ${industry}` : undefined].filter(Boolean).join(' ');
  if (roleClause) lead.push(roleClause);

  const context: string[] = [];
  if (workType) context.push(`${workType} work`);
  if (teamSize) context.push(`team of ${teamSize}`);

  const goalsClause =
    goals.length === 0
      ? ''
      : goals.length <= 2
        ? `Wants to ${goals.map(g => g.toLowerCase()).join(' and ')}.`
        : `Wants to ${goals.slice(0, 2).map(g => g.toLowerCase()).join(', ')}, and ${goals.length - 2} more.`;

  const sentence1 = [lead.join(' · '), context.length ? `(${context.join(', ')})` : '']
    .filter(Boolean)
    .join(' ')
    .trim();

  return [sentence1 ? `${sentence1}.` : '', goalsClause].filter(Boolean).join(' ').trim();
}
