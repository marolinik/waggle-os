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

// Faza 1 GEPA-evolved variants (Phase 5 LOCKED scope: only gen1-v1 ships;
// gen1-v2 variants are kept in-tree for benchmarks but NOT default-registered
// — Faza 2 OVERFIT exposed in Checkpoint C, see decisions/2026-04-29-gepa-faza1-results.md).
export { claudeGen1V1Shape } from './gepa-evolved/claude-gen1-v1.js';
export { qwenThinkingGen1V1Shape } from './gepa-evolved/qwen-thinking-gen1-v1.js';

export {
  selectShape,
  listShapes,
  getShapeMetadata,
  REGISTRY,
  registerShape,
  _resetConfigCache,
  type SelectShapeOptions,
} from './selector.js';
