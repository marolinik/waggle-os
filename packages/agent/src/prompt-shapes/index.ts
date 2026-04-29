/**
 * Prompt shapes — model-aware framing for the agent loop.
 *
 * Public API (Phase 1.2 of agent-fix sprint):
 *   - selectShape(alias, options?)        — pick a shape from config
 *   - listShapes()                         — list registered shape names
 *   - getShapeMetadata(name)               — read metadata without building
 *   - REGISTRY                             — direct access to all shapes (rare)
 *   - claudeShape, qwenThinkingShape, ...  — direct shape exports
 *   - PromptShape, PromptShapeMetadata,    — types
 *     SystemPromptInput, SoloUserPromptInput,
 *     MultiStepKickoffInput, RetrievalInjectionInput
 *
 * Concrete shapes:
 *   - claude              — narrative + XML structure (Opus / Sonnet / Haiku)
 *   - qwen-thinking       — minimal scaffolding (Qwen 3.6 with thinking on)
 *   - qwen-non-thinking   — explicit structured output (judges, classifiers)
 *   - gpt                 — terse direct (GPT-5.4 reasoning model)
 *   - generic-simple      — portable fallback
 *
 * See README.md in this directory for how to add a new shape.
 */

export {
  type PromptShape,
  type PromptShapeMetadata,
  type SystemPromptInput,
  type SoloUserPromptInput,
  type MultiStepKickoffInput,
  type RetrievalInjectionInput,
  MULTI_STEP_ACTION_CONTRACT,
} from './types.js';

export { claudeShape } from './claude.js';
export { qwenThinkingShape } from './qwen-thinking.js';
export { qwenNonThinkingShape } from './qwen-non-thinking.js';
export { gptShape } from './gpt.js';
export { genericSimpleShape } from './generic-simple.js';

export {
  selectShape,
  listShapes,
  getShapeMetadata,
  REGISTRY,
  registerShape,
  _resetConfigCache,
  type SelectShapeOptions,
} from './selector.js';
