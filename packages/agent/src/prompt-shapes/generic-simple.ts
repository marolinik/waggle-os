/**
 * Generic-simple fallback shape — works for any model. Plain markdown
 * structure, no model-specific tricks. Used when the alias does not match
 * any known model class.
 *
 * Evidence: serves as the conservative default. No empirical claims about
 * superiority on any specific model — only the claim that it is portable.
 * If a probe shows a specific model class benefits from a custom shape,
 * a new shape file should be authored with its own evidence_link.
 */

import {
  type PromptShape,
  type SystemPromptInput,
  type SoloUserPromptInput,
  type MultiStepKickoffInput,
  type RetrievalInjectionInput,
  MULTI_STEP_ACTION_CONTRACT,
} from './types.js';

export const genericSimpleShape: PromptShape = {
  name: 'generic-simple',
  metadata: {
    description: 'Portable fallback shape — plain markdown, no model-specific framing. Used when alias is not in the registry.',
    modelClass: 'generic',
    evidence_link: 'decisions/2026-04-26-agent-fix-sprint-plan.md §1.2 (named as the conservative default; no superiority claim)',
    defaultMaxTokens: 4096,
  },

  systemPrompt(input: SystemPromptInput): string {
    const { persona, question, isMultiStep, maxSteps = 5, maxRetrievalsPerStep = 8 } = input;
    if (!isMultiStep) {
      return [
        persona,
        '',
        'Answer the question based on the materials. Be specific and substantive.',
      ].join('\n');
    }
    return [
      persona,
      '',
      'You have access to a private corpus via a retrieval tool. Request retrievals to get information.',
      '',
      MULTI_STEP_ACTION_CONTRACT,
      '',
      `Max ${maxSteps} turns. Each retrieval returns up to ${maxRetrievalsPerStep} chunks.`,
      '',
      `Question: ${question}`,
    ].join('\n');
  },

  soloUserPrompt(input: SoloUserPromptInput): string {
    return [
      input.persona,
      '',
      'Materials:',
      '',
      input.materials,
      '',
      `Question: ${input.question}`,
      '',
      'Answer based on the materials. Be specific.',
    ].join('\n');
  },

  multiStepKickoffUserPrompt(_input: MultiStepKickoffInput): string {
    return 'Begin. Output your first action JSON.';
  },

  retrievalInjectionUserPrompt(input: RetrievalInjectionInput): string {
    return [
      `Retrieval results for "${input.query}" (${input.resultCount} hits):`,
      '',
      input.results,
      '',
      'Next action JSON?',
    ].join('\n');
  },
};
