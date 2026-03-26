export {
  validateName,
  getProviderSignupUrl,
  ONBOARDING_STEPS,
  isStepComplete,
  getNextStep,
  getPrevStep,
  buildConfigFromOnboarding,
} from './utils.js';
export type { OnboardingData, OnboardingStepConfig } from './utils.js';

export { SplashScreen } from './SplashScreen.js';
export type { SplashScreenProps } from './SplashScreen.js';

export {
  STARTUP_PHASES,
  getPhaseMessage,
  getPhaseProgress,
  isStartupComplete,
  formatProgress,
} from './splash-utils.js';
export type { StartupPhaseConfig } from './splash-utils.js';
