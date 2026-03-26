/**
 * Onboarding wizard utility functions and constants.
 */

// ── Types ───────────────────────────────────────────────────────────

export interface OnboardingData {
  name: string;
  providers: Record<string, { apiKey: string; valid: boolean }>;
  workspaceName: string;
  workspaceGroup: string;
}

export interface OnboardingStepConfig {
  id: string;
  title: string;
  description: string;
}

// ── Constants ───────────────────────────────────────────────────────

export const ONBOARDING_STEPS: OnboardingStepConfig[] = [
  {
    id: 'name',
    title: 'Welcome',
    description: "Hi! I'm Waggle. What should I call you?",
  },
  {
    id: 'apiKey',
    title: 'API Key',
    description: 'To talk to AI models, I need at least one API key.',
  },
  {
    id: 'workspace',
    title: 'Workspace',
    description: "Let's create your first workspace.",
  },
  {
    id: 'ready',
    title: 'Ready',
    description: "All set! I'll remember everything we talk about.",
  },
];

const PROVIDER_SIGNUP_URLS: Record<string, string> = {
  anthropic: 'https://console.anthropic.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys',
  google: 'https://aistudio.google.com/apikey',
};

const DEFAULT_SIGNUP_URL = 'https://docs.litellm.ai/docs/providers';

// ── Functions ───────────────────────────────────────────────────────

/**
 * Validate a user's name input.
 */
export function validateName(name: string): { valid: boolean; error?: string } {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Name is required' };
  }
  if (trimmed.length > 50) {
    return { valid: false, error: 'Name must be 50 characters or less' };
  }
  return { valid: true };
}

/**
 * Return the URL where users can sign up for an API key for a given provider.
 */
export function getProviderSignupUrl(provider: string): string {
  return PROVIDER_SIGNUP_URLS[provider.toLowerCase()] ?? DEFAULT_SIGNUP_URL;
}

/**
 * Check whether a given onboarding step has been completed based on the current data.
 */
export function isStepComplete(step: string, data: OnboardingData): boolean {
  switch (step) {
    case 'name':
      return data.name.trim().length > 0;
    case 'apiKey':
      return Object.values(data.providers).some((p) => p.valid);
    case 'workspace':
      return data.workspaceName.trim().length > 0;
    case 'ready':
      return true;
    default:
      return false;
  }
}

/**
 * Return the next step id, or null if at the last step.
 */
export function getNextStep(currentStep: string): string | null {
  const index = ONBOARDING_STEPS.findIndex((s) => s.id === currentStep);
  if (index === -1 || index >= ONBOARDING_STEPS.length - 1) return null;
  return ONBOARDING_STEPS[index + 1].id;
}

/**
 * Return the previous step id, or null if at the first step.
 */
export function getPrevStep(currentStep: string): string | null {
  const index = ONBOARDING_STEPS.findIndex((s) => s.id === currentStep);
  if (index <= 0) return null;
  return ONBOARDING_STEPS[index - 1].id;
}

/** Build a WaggleConfig patch from onboarding data */
export function buildConfigFromOnboarding(data: OnboardingData): { providers: Record<string, { apiKey: string; models: string[] }> } {
  const providers: Record<string, { apiKey: string; models: string[] }> = {};
  for (const [id, entry] of Object.entries(data.providers)) {
    if (entry.valid) {
      providers[id] = { apiKey: entry.apiKey, models: [] };
    }
  }
  return { providers };
}
