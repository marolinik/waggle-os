/**
 * Control runs — sanity checks that the harness is not broken.
 *
 * Day 1 control: `verbose-fixed`. A prompt that deliberately tells the model
 * to answer in long form. On a short-factoid accuracy metric (substring
 * match), this should UNDERPERFORM the `raw` cell. If verbose-fixed scores
 * equal-to or better than raw on the synthetic or real LoCoMo dataset, the
 * harness scoring is suspect and must be audited before any scored run.
 *
 * Controls are intentionally NOT in the cells grid — they're diagnostic,
 * not ablation data.
 */

import type { DatasetInstance, ModelSpec, ControlName } from './types.js';
import type { LlmClient, LlmCallResult } from './llm.js';

const SYSTEM_VERBOSE_FIXED =
  'You are a careful assistant. Think step by step. Explain your reasoning in full sentences. ' +
  'Provide context for your answer. Do not give short or terse responses.';

export interface ControlInput {
  instance: DatasetInstance;
  model: ModelSpec;
  llm: LlmClient;
  turnId: string;
}

export type ControlFn = (input: ControlInput) => Promise<LlmCallResult>;

export const controls: Record<ControlName, ControlFn> = {
  'verbose-fixed': async ({ instance, model, llm, turnId: _turnId }: ControlInput) => {
    return llm.call({
      model,
      systemPrompt: SYSTEM_VERBOSE_FIXED,
      userPrompt: `Context: ${instance.context}\n\nQuestion: ${instance.question}`,
    });
  },
};
