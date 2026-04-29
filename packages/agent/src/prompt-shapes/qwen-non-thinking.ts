/**
 * Qwen thinking-off shape — explicit step instruction with structured-output
 * template. When thinking is disabled the model needs explicit guidance for
 * structured tasks (e.g. judge calls returning JSON, classifier verdicts).
 *
 * Evidence: Stage 3 v6 self-judge re-eval (commit b7e19c5) used thinking=off
 * for the 2000 binary correctness calls — 100% parse rate (vs reasoning model
 * interference if thinking=on for short Yes/No outputs). See
 * benchmarks/results/v6-self-judge-rebench/qwen-self-judge-results.jsonl
 * (n_errors=0, n_ambiguous=0).
 */

import {
  type PromptShape,
  type SystemPromptInput,
  type SoloUserPromptInput,
  type MultiStepKickoffInput,
  type RetrievalInjectionInput,
  MULTI_STEP_ACTION_CONTRACT,
} from './types.js';

export const qwenNonThinkingShape: PromptShape = {
  name: 'qwen-non-thinking',
  metadata: {
    description: 'Explicit structured-output template for Qwen thinking-off; for short binary/structured outputs (judge calls, classifiers).',
    modelClass: 'qwen-non-thinking',
    evidence_link: 'commit b7e19c5 (Stage 3 v6 self-judge re-eval, 2000 calls thinking=off, 100% parse rate); benchmarks/results/v6-self-judge-rebench/qwen-self-judge-results.jsonl',
    defaultThinking: false,
    defaultMaxTokens: 3000,
  },

  systemPrompt(input: SystemPromptInput): string {
    const { persona, question, isMultiStep, maxSteps = 5, maxRetrievalsPerStep = 8 } = input;
    if (!isMultiStep) {
      return [
        persona,
        '',
        'Answer the question precisely. Be brief and concrete. Output only the answer — no preamble.',
      ].join('\n');
    }
    return [
      persona,
      '',
      'TASK: Answer the question using a retrieval tool. You cannot see materials directly.',
      '',
      'PROTOCOL (output exactly one JSON object per turn, no prose):',
      MULTI_STEP_ACTION_CONTRACT,
      '',
      `RULES:`,
      `- Maximum ${maxSteps} turns.`,
      `- Each retrieval returns up to ${maxRetrievalsPerStep} chunks.`,
      `- Output JSON only — no markdown fences, no explanation.`,
      '',
      'QUESTION:',
      question,
    ].join('\n');
  },

  soloUserPrompt(input: SoloUserPromptInput): string {
    return [
      input.persona,
      '',
      'MATERIALS:',
      input.materials,
      '',
      'QUESTION:',
      input.question,
      '',
      'Answer based on the materials. Be specific. No preamble.',
    ].join('\n');
  },

  multiStepKickoffUserPrompt(_input: MultiStepKickoffInput): string {
    return 'Begin. Output your first action JSON.';
  },

  retrievalInjectionUserPrompt(input: RetrievalInjectionInput): string {
    return [
      `RETRIEVAL RESULTS (query: "${input.query}", ${input.resultCount} hits):`,
      input.results,
      '',
      'Next JSON action:',
    ].join('\n');
  },
};
