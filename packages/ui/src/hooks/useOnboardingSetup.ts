import type { WaggleService } from '../services/types.js';
import type { OnboardingData } from '../components/onboarding/utils.js';
import { buildConfigFromOnboarding } from '../components/onboarding/utils.js';

export interface UseOnboardingSetupOptions {
  service: WaggleService;
}

export interface UseOnboardingSetupReturn {
  /** Performs all onboarding setup: updates config with providers, creates first workspace */
  performSetup: (data: OnboardingData) => Promise<{ success: boolean; error?: string }>;
}

/**
 * Hook that performs the "behind the scenes" onboarding setup:
 * 1. Updates config with API keys and user name
 * 2. Creates the first workspace
 * 3. Verifies service connectivity
 *
 * personal.mind creation and LiteLLM startup are handled by the agent service
 * on first launch (see packages/server/src/local/service.ts).
 */
export function useOnboardingSetup({ service }: UseOnboardingSetupOptions): UseOnboardingSetupReturn {
  const performSetup = async (data: OnboardingData): Promise<{ success: boolean; error?: string }> => {
    try {
      // 1. Update config with providers (uses shared buildConfigFromOnboarding)
      await service.updateConfig(buildConfigFromOnboarding(data));

      // 2. Create first workspace
      await service.createWorkspace({
        name: data.workspaceName,
        group: data.workspaceGroup,
      });

      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Setup failed' };
    }
  };

  return { performSetup };
}
