/**
 * GPT shape — terse + structured. GPT-5.4 is a reasoning model with
 * substantial internal reasoning; verbose system prompts can interfere with
 * its built-in chain-of-thought. Direct task framing, no decoration.
 *
 * Evidence: pilot 2026-04-26 trio judge ensemble used gpt-5.4 with
 * max_tokens=200-3000 and minimal prompting; clean parse on 36/36 pilot
 * judge calls (no GPT-side malformed JSON across all 12 cells × 3 tasks).
 * See benchmarks/results/pilot-2026-04-26/pilot-summary.json.
 */

import {
  type PromptShape,
  type SystemPromptInput,
  type SoloUserPromptInput,
  type MultiStepKickoffInput,
  type RetrievalInjectionInput,
  MULTI_STEP_ACTION_CONTRACT,
} from './types.js';

export const gptShape: PromptShape = {
  name: 'gpt',
  metadata: {
    description: 'Terse direct framing for GPT-5.4 and other reasoning-heavy GPT models; minimal decoration.',
    modelClass: 'gpt',
    evidence_link: 'commit 4f6a962 (pilot 2026-04-26 close-out): 36/36 GPT trio judge calls clean parse; benchmarks/results/pilot-2026-04-26/pilot-summary.json',
    defaultThinking: undefined, // GPT-5.4 has internal reasoning — orchestrator does not toggle a thinking flag
    defaultMaxTokens: 4096,
  },

  systemPrompt(input: SystemPromptInput): string {
    const { persona, question, isMultiStep, maxSteps = 5, maxRetrievalsPerStep = 8 } = input;
    if (!isMultiStep) {
      return [
        persona,
        'Answer based on the materials. Be concrete.',
      ].join('\n\n');
    }
    return [
      persona,
      'You answer questions by issuing retrieval queries against a private corpus you cannot see directly.',
      MULTI_STEP_ACTION_CONTRACT,
      `Max ${maxSteps} turns; ${maxRetrievalsPerStep} chunks per retrieval.`,
      `Question: ${question}`,
    ].join('\n\n');
  },

  soloUserPrompt(input: SoloUserPromptInput): string {
    return [
      input.persona,
      `Materials:\n${input.materials}`,
      `Question: ${input.question}`,
      'Answer concretely based on the materials.',
    ].join('\n\n');
  },

  multiStepKickoffUserPrompt(_input: MultiStepKickoffInput): string {
    return 'Begin. First JSON action:';
  },

  retrievalInjectionUserPrompt(input: RetrievalInjectionInput): string {
    return [
      `Retrieval ("${input.query}", ${input.resultCount} hits):`,
      input.results,
      'Next JSON action:',
    ].join('\n\n');
  },
};
