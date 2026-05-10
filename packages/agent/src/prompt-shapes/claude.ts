/**
 * Claude prompt shape — narrative + explicit step instruction. Claude Opus
 * works well with rich, structured context and benefits from extended thinking
 * being available. Uses XML-ish tags to structure the system prompt.
 *
 * Evidence: pilot 2026-04-26 Cells A and B (Opus solo + harness) achieved
 * trio_mean 4.611-5.000 across all 3 tasks; both retained as binding records
 * in commit 4f6a962 (the pilot close-out).
 */

import {
  type PromptShape,
  type SystemPromptInput,
  type SoloUserPromptInput,
  type MultiStepKickoffInput,
  type RetrievalInjectionInput,
  MULTI_STEP_ACTION_CONTRACT,
} from './types.js';

export const claudeShape: PromptShape = {
  name: 'claude',
  metadata: {
    description: 'Narrative system prompt with XML-style structure; for Claude Opus / Sonnet / Haiku.',
    modelClass: 'claude',
    evidence_link: 'decisions/2026-04-26-pilot-verdict-FAIL.md §1 (Cells A/B retained as binding records); pilot artefacts at benchmarks/results/pilot-2026-04-26/pilot-task-{1,2,3}-{A,B}.jsonl',
    defaultThinking: true,
    defaultMaxTokens: 4096,
  },

  systemPrompt(input: SystemPromptInput): string {
    const { persona, question, isMultiStep, maxSteps = 5, maxRetrievalsPerStep = 8 } = input;
    if (!isMultiStep) {
      return [
        '<role>',
        persona,
        '</role>',
        '',
        'Answer the question precisely and substantively, grounded in the materials provided.',
      ].join('\n');
    }
    return [
      '<role>',
      persona,
      '</role>',
      '',
      '<task>',
      'You have access to a private corpus of materials about this scenario via a retrieval tool.',
      'You CANNOT see the materials directly. You MUST request retrievals to get information.',
      '</task>',
      '',
      '<protocol>',
      MULTI_STEP_ACTION_CONTRACT,
      '',
      `You have a maximum of ${maxSteps} turns. Plan accordingly.`,
      `Each retrieval returns up to ${maxRetrievalsPerStep} most relevant document chunks.`,
      'A good retrieval query is 5-15 words and targets specific information.',
      '</protocol>',
      '',
      '<question>',
      question,
      '</question>',
    ].join('\n');
  },

  soloUserPrompt(input: SoloUserPromptInput): string {
    return [
      '<context>',
      input.persona,
      '</context>',
      '',
      '<materials>',
      input.materials,
      '</materials>',
      '',
      '<question>',
      input.question,
      '</question>',
      '',
      'Answer the question above based on the materials. Be specific and substantive.',
    ].join('\n');
  },

  multiStepKickoffUserPrompt(_input: MultiStepKickoffInput): string {
    return 'Begin. Output your first action JSON now.';
  },

  retrievalInjectionUserPrompt(input: RetrievalInjectionInput): string {
    return [
      `<retrieval_results query="${input.query}" count="${input.resultCount}">`,
      input.results,
      '</retrieval_results>',
      '',
      'Next action JSON?',
    ].join('\n');
  },
};
