/**
 * Qwen thinking-on shape — minimal scaffolding. Qwen 3.6 35B-A3B with
 * thinking enabled emits its own reasoning_content; over-structuring the
 * system prompt fights the model. Plain markdown headers, terse protocol.
 *
 * Evidence: Stage 3 v6 LoCoMo apples-to-apples 74% (oracle ceiling) used
 * thinking=on + max_tokens=64000 — see commit b7e19c5 + memo at
 * benchmarks/results/v6-self-judge-rebench/apples-to-apples-memo.md.
 * Pilot 2026-04-26 Cells C/D restart (post amendment v2) used thinking=on
 * + max_tokens=16000; tok_out 5304-7406 vs original 3522-3622 demonstrated
 * Qwen's reasoning headroom matters for synthesis (decisions/2026-04-26-pilot-verdict-FAIL.md §3.1).
 */

import {
  type PromptShape,
  type SystemPromptInput,
  type SoloUserPromptInput,
  type MultiStepKickoffInput,
  type RetrievalInjectionInput,
  MULTI_STEP_ACTION_CONTRACT,
} from './types.js';

export const qwenThinkingShape: PromptShape = {
  name: 'qwen-thinking',
  metadata: {
    description: 'Minimal scaffolding for Qwen thinking-on; the model handles reasoning structure internally.',
    modelClass: 'qwen-thinking',
    evidence_link: 'commit b7e19c5 (Stage 3 v6 self-judge re-eval, Qwen 3.6 + thinking=on + 16K tokens, oracle 74%); decisions/2026-04-26-pilot-verdict-FAIL.md §3.1 (token-out lift evidence post amendment v2)',
    defaultThinking: true,
    defaultMaxTokens: 16000,
  },

  systemPrompt(input: SystemPromptInput): string {
    const { persona, question, isMultiStep, maxSteps = 5, maxRetrievalsPerStep = 8 } = input;
    if (!isMultiStep) {
      return [
        persona,
        '',
        'Answer the question precisely and substantively, grounded in the materials provided.',
      ].join('\n');
    }
    return [
      persona,
      '',
      '## Task',
      'You have access to a private corpus via a retrieval tool. You cannot see materials directly — request retrievals to get information.',
      '',
      '## Protocol',
      MULTI_STEP_ACTION_CONTRACT,
      '',
      `Max ${maxSteps} turns. Each retrieval returns up to ${maxRetrievalsPerStep} chunks.`,
      '',
      '## Question',
      question,
    ].join('\n');
  },

  soloUserPrompt(input: SoloUserPromptInput): string {
    return [
      input.persona,
      '',
      '## Materials',
      '',
      input.materials,
      '',
      '## Question',
      '',
      input.question,
      '',
      'Answer the question above based on the materials. Be specific and substantive.',
    ].join('\n');
  },

  multiStepKickoffUserPrompt(_input: MultiStepKickoffInput): string {
    return 'Begin. Output your first action JSON now.';
  },

  retrievalInjectionUserPrompt(input: RetrievalInjectionInput): string {
    return [
      `## Retrieval results for "${input.query}" (${input.resultCount} hits)`,
      '',
      input.results,
      '',
      'Next action JSON?',
    ].join('\n');
  },
};
