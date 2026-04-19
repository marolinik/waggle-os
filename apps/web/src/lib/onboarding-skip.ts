/**
 * Defaults applied when the user picks "Skip and set me up" on the
 * onboarding WhyWaggle step (M-18 / UX-1).
 *
 * Pinning these as a named constant (rather than inline literals in
 * the wizard) means a regression test can assert the skip contract
 * without having to mount the full React tree — if these shift, we
 * want a failing test, not a silent UX regression.
 */

export interface SkipSetupDefaults {
  /** Template id used for the workspace (matches TEMPLATES in onboarding/constants). */
  readonly templateId: string;
  /** Persona id used for the workspace (matches PERSONAS in persona-data). */
  readonly personaId: string;
  /** Display name for the auto-created workspace. */
  readonly workspaceName: string;
  /** Workspace group folder. */
  readonly group: string;
}

export const SKIP_SETUP_DEFAULTS: SkipSetupDefaults = {
  templateId: 'blank',
  personaId: 'general-purpose',
  workspaceName: 'Default Workspace',
  group: 'Personal',
};
