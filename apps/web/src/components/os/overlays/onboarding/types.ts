import type { ElementType } from 'react';
import type { UserTier } from '@/lib/dock-tiers';
import type { UserProfile, ClassifiedHarvestItem } from '@/lib/types';
import type { WorkspaceType } from '@waggle/shared';

/* ─── Shared step prop base ─── */
export interface StepNavigation {
  readonly goToStep: (step: number) => void;
}

/* ─── WelcomeStep (S12 — first-launch) ─── */
export interface WelcomeStepProps {
  /** Advance to the next step (manual Continue; no auto-advance — C29). */
  readonly onClickAnywhere: () => void;
  /** Sidecar reachability — surfaces an offline-ready note (C28 companion). */
  readonly offline?: boolean;
}

/* ─── WhoAreYouStep (S13 / B8) ─── */
/** The profile slice the Who-Are-You step edits. */
export type OnboardingProfileFields = Pick<
  UserProfile,
  'name' | 'role' | 'industry' | 'workType' | 'teamSize' | 'goals'
>;

export interface WhoAreYouStepProps {
  readonly profile: OnboardingProfileFields;
  readonly onChange: (patch: Partial<OnboardingProfileFields>) => void;
  /** Performs the dual write (profile + identity seed) then advances. */
  readonly onContinue: () => void;
  /** Actionable persistence error; the step remains open until retry or escape. */
  readonly saveError?: string | null;
  /** Explicit escape after a failed save without claiming personalization succeeded. */
  readonly onContinueWithoutPersonalization?: () => void;
  readonly saving: boolean;
}

/* ─── ImportStep (S15 / C33) ─── */
export interface ImportStepProps {
  readonly importSource: string | null;
  /** Classified preview items (kind + confidence) from harvest/preview (C33). */
  readonly importItems: readonly ClassifiedHarvestItem[];
  readonly importDone: boolean;
  readonly importing: boolean;
  readonly importError?: string | null;
  readonly importSuccessMessage?: string | null;
  readonly onFileImport: (file: File, source: string) => void;
  readonly onImportCommit: () => void;
  /** Claude Code auto-detect status; when found, renders a one-click harvest. */
  readonly claudeCodeDetected?: { found: boolean; itemCount: number; path: string } | null;
  readonly onClaudeCodeHarvest?: () => void;
  readonly onContinue: () => void;
}

/* ─── WorkspaceCreateStep (S17 thin / C6 / C35) ─── */
/** Onboarding-scoped workspace types — the personal-scope subset of WorkspaceType
 *  (`team`/`organization` are reserved for the team flow, not day-0 onboarding). */
export type OnboardingWorkspaceType = Extract<
  WorkspaceType,
  'project' | 'client' | 'research' | 'personal'
>;

export interface WorkspaceCreateStepProps {
  readonly workspaceType: OnboardingWorkspaceType;
  readonly workspaceName: string;
  readonly onSelectType: (type: OnboardingWorkspaceType) => void;
  readonly onNameChange: (name: string) => void;
  readonly onCreate: () => void;
  readonly onBack: () => void;
  readonly creating: boolean;
  readonly createError: string | null;
}

/* ─── ModelGateStep (PR5 D2 — the hard model gate) ─── */
export interface ModelGateStepProps {
  /** Advance to Import — only reachable once a working model exists (hard gate). */
  readonly onContinue: () => void;
  /** Soft escape: dismiss onboarding to Home (the NoModelBanner persists there). */
  readonly onLater: () => void;
}

/* ─── TemplateStep (PR5 D4/D5 — curated 6; selecting one creates the workspace) ─── */
export interface TemplateStepProps {
  readonly templates: readonly OnboardingTemplate[];
  /** Create the workspace from this template (persona + templateId), then advance. */
  readonly onSelect: (templateId: string) => void;
  readonly creating: boolean;
  /** The template id currently being created (for a per-card spinner). */
  readonly creatingId: string | null;
  readonly createError: string | null;
  /** Curated id recommended from the who-are-you answers (badge + first ordering); null = none. */
  readonly recommendedId?: string | null;
}

/* ─── FirstTaskStep (PR5 — terminal: seed the first message, open the workspace) ─── */
export interface FirstTaskStepProps {
  readonly message: string;
  readonly onMessageChange: (message: string) => void;
  /** Suggested first prompts (the curated templates' hints). */
  readonly suggestions: readonly string[];
  readonly onPickSuggestion: (suggestion: string) => void;
  readonly onLetsGo: () => void;
  readonly createError: string | null;
}

/* ─── ReadyStep (superseded by FirstTaskStep; kept for any standalone reuse) ─── */
export interface ReadyStepProps {
  readonly createError: string | null;
  readonly onLetsGo: () => void;
}

/* ─── Shared data types (still consumed by constants.ts + onboarding-tier-filter.ts) ─── */
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
