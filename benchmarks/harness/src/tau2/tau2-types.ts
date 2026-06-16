/**
 * Read-only TS mirrors of the τ²-bench results JSON. Field names verified
 * against sierra-research/tau2-bench src/tau2/data_model/simulation.py
 * (Results / SimulationRun / RewardInfo / RewardType). Only fields the
 * harness consumes are typed precisely; everything else is tolerated via
 * index signatures so an upstream schema bump degrades gracefully.
 *
 * The oracle: success of a single simulation is `RewardInfo.reward`, which
 * τ² computes as the PRODUCT of the components named in `reward_basis`
 * (DB hash match, ACTION matching, COMMUNICATE substring, ENV_ASSERTION) —
 * a state/action oracle, NOT a substring scorer over the final answer.
 */

/** τ² RewardType enum values (string form as serialized). */
export type Tau2RewardType =
  | 'DB'
  | 'ACTION'
  | 'COMMUNICATE'
  | 'ENV_ASSERTION'
  | 'NL_ASSERTION';

export interface Tau2DBCheck {
  /** Whether the predicted env DB hash matched the target DB hash. */
  db_match?: boolean;
  [k: string]: unknown;
}

export interface Tau2ActionCheck {
  action_id?: string;
  name?: string;
  /** Whether the agent issued this required action with matching args. */
  action_match?: boolean;
  [k: string]: unknown;
}

export interface Tau2EnvAssertionCheck {
  /** Whether the assertion held against the predicted env. */
  met?: boolean;
  [k: string]: unknown;
}

export interface Tau2CommunicateCheck {
  /** Whether the required info string appeared in the agent's messages. */
  met?: boolean;
  [k: string]: unknown;
}

export interface Tau2NLAssertionCheck {
  met?: boolean;
  [k: string]: unknown;
}

export interface Tau2RewardInfo {
  /** Final reward for the simulation (product over reward_basis components).
   *  τ² uses 1.0 = full success, 0.0 = failure (partial possible if a basis
   *  yields a fraction; the oracle below treats reward >= REWARD_PASS as pass). */
  reward: number;
  db_check?: Tau2DBCheck | null;
  action_checks?: Tau2ActionCheck[] | null;
  env_assertions?: Tau2EnvAssertionCheck[] | null;
  communicate_checks?: Tau2CommunicateCheck[] | null;
  nl_assertions?: Tau2NLAssertionCheck[] | null;
  reward_basis?: Tau2RewardType[] | null;
  reward_breakdown?: Record<string, number> | null;
  [k: string]: unknown;
}

/** One trial of one task. */
export interface Tau2SimulationRun {
  id: string;
  task_id: string;
  /** Trial index (0-based or 1-based depending on τ² version — we don't
   *  assume; pass^k groups by task_id and counts, not by trial value). */
  trial?: number;
  seed?: number;
  reward_info?: Tau2RewardInfo | null;
  /** Total agent-side LLM $ for this simulation (τ² populates from LiteLLM). */
  agent_cost?: number | null;
  user_cost?: number | null;
  duration?: number | null;
  termination_reason?: string | null;
  /** Half-duplex message list — we count assistant turns + tool calls from it. */
  messages?: Tau2Message[] | null;
  [k: string]: unknown;
}

export interface Tau2Message {
  role?: string;
  content?: string | null;
  /** OpenAI-style tool calls on an assistant message, when present. */
  tool_calls?: Array<{ id?: string; function?: { name?: string } }> | null;
  /** Some τ² serializations attach token usage per message. */
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
  [k: string]: unknown;
}

export interface Tau2Task {
  id: string;
  [k: string]: unknown;
}

export interface Tau2Info {
  /** Recorded run metadata — domain, agent, agent_llm, user_llm, etc.
   *  Shape varies by version; tolerated as a free dict. */
  [k: string]: unknown;
}

export interface Tau2Results {
  timestamp?: string;
  info?: Tau2Info;
  tasks?: Tau2Task[];
  simulations: Tau2SimulationRun[];
  [k: string]: unknown;
}
