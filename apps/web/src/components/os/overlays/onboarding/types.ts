import type { ElementType } from 'react';
import type { UserTier } from '@/lib/dock-tiers';

/* ─── Shared step prop base ─── */
export interface StepNavigation {
  readonly goToStep: (step: number) => void;
}

/* ─── WelcomeStep ─── */
export interface WelcomeStepProps extends StepNavigation {
  readonly onClickAnywhere: () => void;
}

/* ─── WhyWaggleStep ─── */
export interface WhyWaggleStepProps extends StepNavigation {
  /**
   * "Skip and set me up" (M-18 / UX-1): bypass steps 2-6 and land on
   * Ready with sensible defaults. Disabled while the wizard is
   * already creating a workspace.
   */
  readonly onSkipSetup?: () => void;
  readonly skipDisabled?: boolean;
}

/* ─── TierStep ─── */
export interface TierStepProps extends StepNavigation {
  readonly selectedTier: UserTier;
  readonly onSelectTier: (tier: UserTier) => void;
}

/* ─── ImportStep ─── */
export interface ImportStepProps extends StepNavigation {
  readonly importSource: 'chatgpt' | 'claude' | null;
  readonly importPreview: readonly unknown[];
  readonly importDone: boolean;
  readonly importing: boolean;
  readonly onFileImport: (file: File, source: 'chatgpt' | 'claude') => void;
  readonly onImportCommit: () => void;
}

/* ─── TemplateStep ─── */
export interface TemplateStepProps extends StepNavigation {
  readonly selectedTemplate: string;
  readonly workspaceName: string;
  readonly onSelectTemplate: (id: string, name: string) => void;
  readonly onWorkspaceNameChange: (name: string) => void;
}

/* ─── PersonaStep ─── */
export interface PersonaStepProps extends StepNavigation {
  readonly selectedTemplate: string;
  readonly selectedPersona: string;
  readonly onSelectPersona: (id: string) => void;
  readonly showCustomPersona: boolean;
  readonly onToggleCustomPersona: (show: boolean) => void;
  readonly customPersonaName: string;
  readonly customPersonaDesc: string;
  readonly onCustomPersonaNameChange: (name: string) => void;
  readonly onCustomPersonaDescChange: (desc: string) => void;
  readonly onCreateCustomPersona: () => void;
  readonly creatingPersona: boolean;
}

/* ─── ApiKeyStep ─── */
export interface ApiKeyStepProps extends StepNavigation {
  readonly selectedProvider: string;
  readonly apiKey: string;
  readonly validating: boolean;
  readonly keyValid: boolean | null;
  readonly keySaved: boolean;
  readonly creatingWorkspace: boolean;
  readonly onSelectProvider: (id: string) => void;
  readonly onApiKeyChange: (key: string) => void;
  readonly onValidateKey: () => void;
  readonly onFinish: () => void;
}

/* ─── ReadyStep ─── */
export interface ReadyStepProps {
  readonly createError: string | null;
  readonly onLetsGo: () => void;
}

/* ─── Shared data types ─── */
export interface OnboardingTemplate {
  readonly id: string;
  readonly name: string;
  readonly icon: ElementType;
  readonly hint: string;
  readonly desc: string;
}

export interface OnboardingPersona {
  readonly id: string;
  readonly name: string;
  readonly icon: ElementType;
  readonly desc: string;
  readonly tier: 'universal' | 'knowledge' | 'domain';
}

export interface OnboardingProvider {
  readonly id: string;
  readonly name: string;
  readonly prefix: string;
  readonly badge: string | null;
  readonly keyUrl: string;
}

export interface ValueProp {
  readonly icon: ElementType;
  readonly title: string;
  readonly desc: string;
}

export interface TierOption {
  readonly id: UserTier;
  readonly name: string;
  readonly icon: ElementType;
  readonly color: string;
  readonly desc: string;
}
