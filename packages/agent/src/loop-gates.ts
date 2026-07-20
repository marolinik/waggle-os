/**
 * Completion-time gates for the agent loop.
 *
 * Extracted from agent-loop.ts (PR-D, 2026-05-27). Two gates fire from the
 * no-tool-calls branch when the model returns a "final" answer:
 *
 *   D3 verification gate — if the model claims verified/passing/working
 *     completion but ran no verification-class tool, inject ONE corrective
 *     directive and continue the loop. One-shot: a re-asserted unverified
 *     claim on the corrective turn is accepted (loop-guard / maxTurns
 *     still bound the loop).
 *
 *   D1 skill distillation gate — on a qualifying ≥5-tool, R2-gated
 *     successful turn, mechanically inject the planSkillDistillation
 *     directive so the model authors a skill in its NEXT turn. One-shot.
 *     The user's "real" answer (current `content`) is preserved in state
 *     so it surfaces in the final return — the distillation turn's output
 *     is the skill summary, NOT the answer (issue #4).
 *
 * Both gates were inlined as ~50 lines in runAgentLoop. Lifting them as a
 * single composable `maybeFireCompletionGate` call leaves the agent loop
 * reading as the conversation loop it conceptually is.
 */

import {
  assertsUnverifiedCompletion,
  isVerificationToolName,
  VERIFICATION_GATE_DIRECTIVE,
  VERIFICATION_NO_TOOL_DISCLOSURE,
} from './verification-gate.js';
import { planSkillDistillation } from './skill-distillation.js';
import { logTurnEvent } from './turn-context.js';

/**
 * One-shot flags + preserved-answer state for the two completion gates.
 * Created once per `runAgentLoop` invocation; threaded through subsequent
 * `maybeFireCompletionGate` calls so each gate fires AT MOST ONCE per run.
 */
export interface GateState {
  /** True after the D3 verification gate has fired (one-shot) */
  verificationCorrectionUsed: boolean;
  /** True after the D1 skill-distillation gate has fired (one-shot) */
  skillDistillationUsed: boolean;
  /**
   * The user-facing answer captured at D1 fire time. The distillation turn
   * that follows is a side-effect (author the skill via create_skill); its
   * own output is the skill summary, not the user's answer. Any return path
   * reached after D1 fires MUST surface this preserved value instead of the
   * distillation turn's content — otherwise "I saved a skill…" overwrites
   * the real answer (issue #4).
   */
  preservedAnswerForDistillation: string | null;
}

export function initialGateState(): GateState {
  return {
    verificationCorrectionUsed: false,
    skillDistillationUsed: false,
    preservedAnswerForDistillation: null,
  };
}

/**
 * Structural shape of the messages array the agent loop pushes to. Kept
 * local to avoid a circular import with agent-loop.ts; structurally
 * compatible with `AgentMessage`.
 */
type GateMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: unknown;
  tool_call_id?: string;
};

export interface MaybeFireCompletionGateArgs {
  /** Current turn's final assistant content (concatenated from streaming or non-streaming) */
  content: string;
  /** Names of tools used so far in this run (D1 reads length+set; D3 reads set for verification-class) */
  toolsUsed: readonly string[];
  /** Names of tools the model can actually call in this run. */
  availableToolNames?: readonly string[];
  /** Caller's message history — pushed to in-place when a gate fires */
  messages: GateMessage[];
  /** Current user-authored request, captured before internal directives are added. */
  userRequest?: string;
  /** Current gate state (returned with one-shot flags flipped if a gate fires) */
  state: GateState;
  /** Default true — set false to opt out of D3 */
  enableVerification?: boolean;
  /** Default true — set false to opt out of D1 */
  enableSkillDistillation?: boolean;
  /**
   * AI-OS Phase 3 — skill diffusion observer. Invoked the moment D1 fires
   * (right before the distillation directive is injected). Failures are
   * swallowed — diffusion is observability, not a precondition.
   */
  onSkillDistillationFire?: (info: {
    patternKey: string;
    toolsUsed: readonly string[];
    directive: string;
  }) => void | Promise<void>;
  /** H-AUDIT-1: per-turn trace ID for structured event logging */
  turnId?: string;
}

export interface GateResult {
  /** True if a gate fired AND injected a corrective directive (caller should `continue`). */
  fired: boolean;
  /** New state object — copy of input state with one-shot flags + preserved answer updated. */
  state: GateState;
  /** Deterministic local suffix used when a claim cannot be verified by any available tool. */
  contentSuffix?: string;
}

/**
 * Try the completion-time gates in declared order (D3 first, then D1).
 * At most one gate fires per call. Returns { fired, state } — caller
 * continues the loop iff `fired` is true.
 */
export async function maybeFireCompletionGate(args: MaybeFireCompletionGateArgs): Promise<GateResult> {
  const {
    content,
    toolsUsed,
    availableToolNames = [],
    messages,
    userRequest = '',
    state,
    enableVerification = true,
    enableSkillDistillation = true,
    onSkillDistillationFire,
    turnId,
  } = args;

  // ── D3 verification-before-completion gate ──
  if (
    enableVerification &&
    !state.verificationCorrectionUsed &&
    assertsUnverifiedCompletion(content, toolsUsed, userRequest)
  ) {
    if (!availableToolNames.some(isVerificationToolName)) {
      logTurnEvent(turnId, {
        stage: 'agent-loop.verification-gate.disclosed',
        contentChars: content.length,
      });
      return {
        fired: false,
        contentSuffix: VERIFICATION_NO_TOOL_DISCLOSURE,
        state: { ...state, verificationCorrectionUsed: true },
      };
    }
    const systemMessage = messages.find(message => message.role === 'system');
    const internalDirective = `\n\n# Internal verification correction\n${VERIFICATION_GATE_DIRECTIVE}`;
    if (systemMessage && typeof systemMessage.content === 'string') {
      systemMessage.content += internalDirective;
    } else {
      messages.unshift({ role: 'system', content: internalDirective.trim() });
    }
    logTurnEvent(turnId, { stage: 'agent-loop.verification-gate.fired', contentChars: content.length });
    return {
      fired: true,
      state: { ...state, verificationCorrectionUsed: true },
    };
  }

  // ── D1 Hermes-parity closed learning loop (mechanical closure) ──
  if (enableSkillDistillation && !state.skillDistillationUsed) {
    const distillPlan = planSkillDistillation(toolsUsed, content);
    if (distillPlan) {
      messages.push({ role: 'assistant', content });
      messages.push({ role: 'user', content: distillPlan.directive });
      logTurnEvent(turnId, { stage: 'agent-loop.skill-distillation.fired', toolCalls: toolsUsed.length });

      // AI-OS Phase 3 — skill diffusion observer. Swallow any error so the
      // distillation loop is never blocked by a diffusion-side failure.
      if (onSkillDistillationFire) {
        try {
          await onSkillDistillationFire({
            patternKey: distillPlan.patternKey,
            toolsUsed: [...toolsUsed],
            directive: distillPlan.directive,
          });
        } catch {
          /* observer failures must never block the loop */
        }
      }

      return {
        fired: true,
        state: {
          ...state,
          skillDistillationUsed: true,
          preservedAnswerForDistillation: content,
        },
      };
    }
  }

  // No gate fired — caller can accept completion.
  return { fired: false, state };
}
