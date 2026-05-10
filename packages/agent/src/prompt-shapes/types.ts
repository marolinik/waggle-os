/**
 * Prompt shape protocol — Phase 1.2 of agent-fix sprint
 * (per decisions/2026-04-26-agent-fix-sprint-plan.md §1.2)
 *
 * Each model class gets its own PromptShape. The shape only handles
 * framing (string building); orchestration, retrieval, cost tracking,
 * and loop logic stay in the agent loop.
 *
 * HARD RULE (from work order): "empirical, ne ideoloski" — if probe
 * shows model X does better with format Y, use Y. Each shape carries
 * an `evidence_link` metadata field pointing to the empirical source
 * justifying its design. Speculation without evidence is forbidden.
 */

export interface PromptShapeMetadata {
  /** Human-readable description of when to use this shape. */
  description: string;

  /** Model class this shape is designed for (e.g. "claude", "qwen-thinking"). */
  modelClass: string;

  /**
   * Pointer to the empirical evidence justifying this shape's design.
   * REQUIRED. May reference a benchmark result, a pilot artefact, a
   * decisions doc, or "TBD: empirical probe scheduled for Phase 4
   * re-score" if no evidence exists yet.
   */
  evidence_link: string;

  /** Default thinking flag for this model class (informational; orchestrator decides). */
  defaultThinking?: boolean;

  /** Default max_tokens recommended for this model class. */
  defaultMaxTokens?: number;
}

/** Inputs for the system prompt — describes the agent's role + protocol. */
export interface SystemPromptInput {
  persona: string;
  question: string;
  isMultiStep: boolean;
  maxSteps?: number;
  maxRetrievalsPerStep?: number;
}

/** Inputs for a solo (single-shot) user prompt — full materials in one message. */
export interface SoloUserPromptInput {
  persona: string;
  materials: string;
  question: string;
}

/** Inputs for the multi-step kickoff user message (turn 1). */
export interface MultiStepKickoffInput {
  // Currently no inputs — kickoff is a fixed "begin" message.
  // Reserved for future shape-specific kickoff customization.
  _reserved?: never;
}

/** Inputs for injecting retrieval results between multi-step turns. */
export interface RetrievalInjectionInput {
  query: string;
  results: string;
  resultCount: number;
}

/**
 * A prompt shape is a string-building strategy for one model class.
 * It exposes 4 methods covering all situations the multi-step harness
 * needs. Orchestration (loop control, cost tracking, retrieval) is
 * NOT this layer's concern.
 */
export interface PromptShape {
  /** Unique name (e.g. "claude", "qwen-thinking"). */
  readonly name: string;

  /** Provenance + design intent. */
  readonly metadata: PromptShapeMetadata;

  /** Build the system prompt (sets agent role + multi-step protocol if applicable). */
  systemPrompt(input: SystemPromptInput): string;

  /** Build the solo (single-shot) user message containing persona + materials + question. */
  soloUserPrompt(input: SoloUserPromptInput): string;

  /** Build the multi-step kickoff user message (turn 1 trigger). */
  multiStepKickoffUserPrompt(input: MultiStepKickoffInput): string;

  /** Build the retrieval-injection user message (mid-loop, after retrieval). */
  retrievalInjectionUserPrompt(input: RetrievalInjectionInput): string;
}

/**
 * Multi-step protocol — what the agent must output each turn. All
 * shapes follow the same JSON action contract; only the framing of
 * how the contract is described varies. Centralized here so changing
 * the contract changes all shapes consistently.
 */
export const MULTI_STEP_ACTION_CONTRACT = `Output exactly ONE JSON object on its own line, no prose, no code fences:
  - To retrieve information: {"action": "retrieve", "query": "<your search query>"}
  - To finalize your answer:  {"action": "finalize", "response": "<your full final answer>"}`;
