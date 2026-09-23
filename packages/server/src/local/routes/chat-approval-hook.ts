/**
 * Chat Approval Hook — the per-turn `pre:tool` gate for `POST /api/chat`.
 *
 * Extract Method on the 323-line hook the chat handler registered inline
 * (TD-CHAT-3). Every gated tool call a turn makes passes through it: it decides
 * whether the call is refused outright, auto-approved (elevated autonomy, the
 * test-mode flag, a saved grant), parked as a durable held action on a
 * headless review turn, or put to the operator as an approval card whose
 * answer it then waits for.
 *
 * The body is moved verbatim. The handler's locals it read become the fields
 * of `ChatApprovalHookTurn`, bound once under the same names, so every
 * decision site reads exactly what it read before. `waitForApprovalDecision`
 * moves with it: the hook is its only production caller, and leaving it in
 * `chat.ts` would make this module import its own caller.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import {
  needsConfirmation,
  needsConfirmationWithAutonomy,
  isCriticalNeverAutopass,
  assessTrust,
  type AutonomyLevel,
  type HookFn,
} from '@waggle/agent';
import type { CronStore, SavePendingActionInput } from '@waggle/core';
import { RISK_LEVELS, type RiskLevel } from '@waggle/shared';
import { createLogger } from '../logger.js';
import { classifyGatedTool } from '../approval-grants.js';
import { decideReviewTurnTool } from '../held-action-executor.js';
import { emitAuditEvent } from './events.js';
import { describeToolUse } from './chat-helpers.js';
import type { ApprovalTimeoutPolicy } from './chat-turn-policy.js';
import { NON_RETAINED_TURN_CONTENT, type TurnRetention } from './chat-turn-retention.js';

// Same logger name as the handler, so the hook's warnings keep their source.
const log = createLogger('chat');

// Read once at plugin registration — consistent for the lifetime of the server
const AUTO_APPROVE = process.env.WAGGLE_AUTO_APPROVE === '1' || process.env.WAGGLE_AUTO_APPROVE === 'true';

const APPROVAL_HOLD_TTL_MS = 24 * 60 * 60 * 1000;

interface ApprovalWaitOptions {
  pendingApprovals: Map<string, {
    resolve: (approved: boolean) => void;
    toolName: string;
    input: Record<string, unknown>;
    timestamp: number;
    riskLevel?: RiskLevel;
  }>;
  cronStore: Pick<CronStore, 'savePendingAction'>;
  requestId: string;
  toolName: string;
  input: Record<string, unknown>;
  riskLevel?: RiskLevel;
  heldAction: Omit<SavePendingActionInput, 'id' | 'source' | 'expiresAt'>;
  heldEvent: Record<string, unknown>;
  policy: ApprovalTimeoutPolicy;
  sendEvent: (event: 'approval_held', data: Record<string, unknown>) => void;
  onHeld: (expiresAt: string) => void;
  signal?: AbortSignal;
}

export async function waitForApprovalDecision(options: ApprovalWaitOptions): Promise<{ approved: boolean; held: boolean; timedOut: boolean }> {
  let held = false;
  let timedOut = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let abortHandler: (() => void) | undefined;
  const approved = await new Promise<boolean>((resolve) => {
    options.pendingApprovals.set(options.requestId, {
      resolve,
      toolName: options.toolName,
      input: options.input,
      timestamp: Date.now(),
      riskLevel: options.riskLevel,
    });

    abortHandler = () => {
      if (!options.pendingApprovals.delete(options.requestId)) return;
      resolve(false);
    };
    if (options.signal?.aborted) {
      abortHandler();
      return;
    }
    options.signal?.addEventListener('abort', abortHandler, { once: true });

    timeout = setTimeout(() => {
      if (!options.pendingApprovals.delete(options.requestId)) return;
      timedOut = true;

      if (options.policy.action === 'hold') {
        const expiresAt = new Date(Date.now() + APPROVAL_HOLD_TTL_MS).toISOString();
        try {
          options.cronStore.savePendingAction({
            ...options.heldAction,
            id: options.requestId,
            source: `approval-timeout:${options.requestId}`,
            expiresAt,
          });
          held = true;
        } catch (error) {
          log.warn('[security] failed to hold a timed-out approval; auto-denying instead', {
            requestId: options.requestId,
            error,
          });
        }
        if (held) {
          try {
            options.sendEvent('approval_held', { ...options.heldEvent, expiresAt });
          } catch (error) {
            log.warn('[approval] failed to emit approval_held', { requestId: options.requestId, error });
          }
          try {
            options.onHeld(expiresAt);
          } catch (error) {
            log.warn('[approval] failed to report a held approval', { requestId: options.requestId, error });
          }
        }
      }

      resolve(false);
    }, options.policy.timeoutMs);
  });
  if (timeout) clearTimeout(timeout);
  if (abortHandler) options.signal?.removeEventListener('abort', abortHandler);
  return { approved, held, timedOut };
}

/** What one chat turn hands its approval hook. Fields keep the handler's names. */
export interface ChatApprovalHookTurn {
  server: FastifyInstance;
  /** Audit and signal stream key for the turn. */
  executionScopeId: string;
  sessionId: string;
  /** The workspace the turn executes in; scopes held actions and saved grants. */
  effectiveWorkspace: string | undefined;
  autonomyLevel: AutonomyLevel;
  proposeHeldTurn: boolean | undefined;
  approvalTimeoutPolicy: ApprovalTimeoutPolicy;
  retention: TurnRetention;
  turnSignal: AbortSignal;
  sendEvent: (event: string, data: unknown) => void;
  retainedTurnJson: (value: unknown) => string;
  retainedTurnText: (value: string) => string;
}

/** Builds the `pre:tool` hook for one chat turn. */
export function createChatApprovalHook(turn: ChatApprovalHookTurn): HookFn {
  const {
    server,
    executionScopeId,
    sessionId,
    effectiveWorkspace,
    autonomyLevel,
    proposeHeldTurn,
    approvalTimeoutPolicy,
    retention,
    turnSignal,
    sendEvent,
    retainedTurnJson,
    retainedTurnText,
  } = turn;
  const autoApprove = AUTO_APPROVE;
  return async (ctx) => {
    if (turnSignal.aborted) {
      return { cancel: true, reason: 'Chat or workspace cancelled' };
    }
    if (!ctx.toolName) return;
    const args = (ctx.args ?? {}) as Record<string, unknown>;
    const trustedRiskLevel = typeof ctx.riskLevel === 'string'
      && (RISK_LEVELS as readonly string[]).includes(ctx.riskLevel)
      ? ctx.riskLevel as RiskLevel
      : undefined;
    // One classification per gated call, reused by the grant check below
    // and by the approval metadata further down. Classifying twice meant
    // deciding twice what a failure means, in two places, differently.
    const gatedRisk = classifyGatedTool(ctx.toolName, args, trustedRiskLevel);
    const grantRiskLevel = gatedRisk.riskLevel;

    // A call whose arguments cannot be read is decided here, before any
    // site that would read them. Every reader below coerces something a
    // model supplied — the confirmation predicate, the grant fingerprint,
    // the held-proposal summary — and a throw in any of them escapes to
    // `HookRegistry.fire`, which swallows it. The call still failed
    // closed at the execution floor, but no card was offered, no reason
    // was recorded, and for a tool whose floor check coerces the same
    // argument the client never even saw the tool resolve.
    //
    // This is the same treatment `cc3e1436` gave a tool nobody could
    // classify, for the same reason: the missing fact is the decision
    // itself, so the call is refused rather than guessed at. It is NOT a
    // deny-to-prompt change — the outcome was already a denial; what
    // changes is that the denial is now explicit, logged and reported.
    if (!gatedRisk.classified) {
      log.warn('[security] tool arguments could not be read; denying the tool', {
        workspaceId: executionScopeId,
        sessionId,
        toolName: ctx.toolName,
        error: gatedRisk.reason,
      });
      return {
        cancel: true,
        reason: `${ctx.toolName} could not be risk-assessed, so it was not run.`,
      };
    }

    // Every approval surface below describes this same call, and the
    // description reads arguments the deciders never touch, so a call
    // they all read fine can still have an undescribable name or path.
    // Build it once here, so "the description could not be built" is
    // decided in one place instead of at four sites that would each
    // decide it differently.
    //
    // Failure refuses the call rather than substituting a marker.
    // A description is not a security decision — but it runs INSIDE the
    // hook, so making it total would convert this denial into an
    // approval prompt, and the operator would be approving a card whose
    // "what will happen" line it could not render. Founder ruling
    // 2026-09-17, the third against deny-to-prompt at a hook site; the
    // disclosure sites OUTSIDE the hook stay total (`describeToolUseSafe`).
    let toolDescription: string;
    try {
      toolDescription = describeToolUse(ctx.toolName, args);
    } catch (error) {
      log.warn('[security] tool description could not be built; denying the tool', {
        workspaceId: executionScopeId,
        sessionId,
        toolName: ctx.toolName,
        error,
      });
      return {
        cancel: true,
        reason: `${ctx.toolName} could not be described, so it was not run.`,
      };
    }

    // Phase B.5: autonomy-aware gate. If the user has Trusted or YOLO set
    // for this session, the tool may auto-pass. Critical blacklist still
    // blocks even at YOLO (see isCriticalNeverAutopass).
    const requiresBaseConfirmation = needsConfirmation(
      ctx.toolName,
      args,
      trustedRiskLevel,
    );
    if (!needsConfirmationWithAutonomy(ctx.toolName, args, autonomyLevel, trustedRiskLevel)) {
      // Surface an audit-visible step when elevated autonomy pre-approved
      // so users can see WHY the tool ran without a prompt.
      if (autonomyLevel !== 'normal' && requiresBaseConfirmation) {
        sendEvent('step', { content: `\u26a1 ${ctx.toolName} auto-approved (${autonomyLevel})` });
        // Tag the audit input with the autonomy level so forensics can
        // see WHY the tool was auto-approved.
        emitAuditEvent(server, {
          workspaceId: executionScopeId,
          eventType: 'approval_auto',
          toolName: ctx.toolName,
          input: retainedTurnJson({ args, _autonomy: autonomyLevel }),
          sessionId,
          approved: true,
        });
      }
      return requiresBaseConfirmation ? { authorize: true } : undefined;
    }

    // Headless channel/review turn: no interactive client is watching this
    // loopback stream, so a live approval prompt would auto-deny after the
    // timeout. Convert a gated proposable tool into a DURABLE held action
    // that ApprovalsApp shows; deny any other gated tool. This runs before the
    // grant-store shortcut on purpose \u2014 a saved "Always allow" grant must
    // NOT let a headless reviewer write a skill to disk. The trust boundary:
    // the reviewer can never persist a skill without explicit human approval.
    //
    // This branch deliberately does NOT require derived persistence.
    // `proposeHeld` is one of the two inputs to `isAutomatedTurn`, and an
    // automated turn is a read-only persistence boundary, so requiring it
    // here made the guard fire on every proposeHeld turn and left
    // `decideReviewTurnTool` unreachable — the feature was never
    // delivered and proposals were dropped instead of parked
    // (TD-CHAT-46). Parking a proposal is a pending decision awaiting a
    // human, not a learned fact, so the memory boundary does not govern
    // it. Memory write-back on an automated turn — auto-save, skill
    // distillation, KG extraction, correction detection — stays gated by
    // `allowDerivedPersistence` exactly as Steal #13 intends.
    if (proposeHeldTurn) {
      const heldSource = sessionId.startsWith('channel-')
        ? `channel:${sessionId}`
        : `session-reviewer:${sessionId}`;
      const decision = decideReviewTurnTool(server, {
        workspaceId: effectiveWorkspace || null,
        source: heldSource,
        tool: ctx.toolName,
        args,
        summary: toolDescription,
      });
      if (decision.enqueued && 'id' in decision.enqueued) {
        sendEvent('approval_required', {
          requestId: decision.enqueued.id,
          toolName: ctx.toolName,
          input: args,
          sourceWorkspaceId: effectiveWorkspace || null,
          held: true,
        });
      }
      sendEvent('step', { content: decision.step });
      return { cancel: true, reason: decision.reason };
    }

    // H3: Auto-approve all tool requests when WAGGLE_AUTO_APPROVE=1 (testing only)
    if (autoApprove) {
      sendEvent('step', { content: `\u2714 ${ctx.toolName} auto-approved (test mode)` });
      return { authorize: true };
    }

    // Phase B.3: check the persistent grant store — if the user previously
    // chose "Always allow" for this (tool, target) combination, skip the
    // approval prompt silently.
    if (
      !isCriticalNeverAutopass(ctx.toolName, args, grantRiskLevel)
      && server.agentState.approvalGrantStore.has(
        ctx.toolName,
        args,
        effectiveWorkspace || null,
        grantRiskLevel,
      )
    ) {
      sendEvent('step', { content: `\u2714 ${ctx.toolName} allowed by saved grant` });
      return { authorize: true };
    }

    const requestId = crypto.randomUUID();
    const toolName = ctx.toolName;
    const input = (ctx.args ?? {}) as Record<string, unknown>;

    // P7/D15 A4: enrich EVERY gated approval with risk metadata so the
    // in-chat card (D4(ii), A5) can show a consistent risk badge — not just
    // install_capability. install_capability keeps its richer content-based
    // TrustAssessment; all other gated tools get the canonical
    // classifyGatedToolRisk mapping. `description` is the plain-language
    // "what will happen" line the FE card expects (divergence #10).
    let trustMeta: Record<string, unknown> | undefined;
    if (toolName === 'install_capability') {
      try {
        const skillNameRaw = input.name as string ?? '';
        const source = input.source as string ?? '';
        // Review Minor #1: path.basename strips any directory separators so a model
        // coerced into `name: "../../evil"` cannot escape the starter-skills directory.
        const skillName = path.basename(skillNameRaw);
        // Read starter skill content for trust assessment
        const { getStarterSkillsDir } = await import('@waggle/sdk');
        const starterPath = path.join(getStarterSkillsDir(), `${skillName}.md`);
        const content = fs.existsSync(starterPath) ? fs.readFileSync(starterPath, 'utf-8') : '';
        const trust = assessTrust({ capabilityType: 'skill', source, content });
        trustMeta = {
          riskLevel: trust.riskLevel,
          approvalClass: trust.approvalClass,
          trustSource: trust.trustSource,
          assessmentMode: trust.assessmentMode,
          explanation: trust.explanation,
          permissions: trust.permissions,
          description: toolDescription,
        };
      } catch (error) {
        // An install nobody could assess is an unknown install, not a
        // medium one. Falling through to the heuristic block offered the
        // same install as medium/elevated — weaker than the high/critical
        // this assessment produces for it — with `assessmentMode:
        // heuristic` on both paths, so the card could not be told apart.
        // Refuse it instead, like a tool nobody could classify. The
        // operator needs the cause: a non-string `name` from the model
        // reads very differently from an unreadable starter-skill
        // directory.
        log.warn('[security] install_capability trust assessment failed; refusing the install', {
          workspaceId: executionScopeId,
          sessionId,
          toolName,
          error,
        });
        return {
          cancel: true,
          reason: `${toolName} could not be trust-assessed, so it was not run.`,
        };
      }
    }
    // Track A review: for any non-install gated tool, derive risk
    // heuristically so approvalClass is NEVER absent
    // (an absent approvalClass would let the FE offer "Always allow" on a
    // critical op — fail-open). trustSource is OMITTED here: there is no real
    // provenance signal for a bash/git/connector call, and stamping
    // 'local_user' was a false claim on the trust surface (review #3).
    if (!trustMeta) {
      // `gatedRisk.classified` is true here: an unclassifiable tool was
      // denied at the top of the hook, before any decision site ran.
      trustMeta = {
        riskLevel: gatedRisk.riskLevel,
        approvalClass: gatedRisk.approvalClass,
        assessmentMode: 'heuristic',
        description: toolDescription,
      };
    }

    // Send approval_required SSE event to the client.
    // Phase B.3: includes sourceWorkspaceId so the frontend can send it
    // back verbatim when the user clicks "Always allow" — keeps the grant
    // store scoped correctly.
    sendEvent('approval_required', {
      requestId, toolName, input,
      sourceWorkspaceId: effectiveWorkspace || null,
      ...trustMeta,
    });
      // F2: Audit trail — approval requested
      emitAuditEvent(server, {
        workspaceId: executionScopeId,
        eventType: 'approval_requested',
        toolName,
        input: retainedTurnJson(input),
        sessionId,
      });

    // Wait for the client to approve or deny. A configured hold timeout
    // still cancels this live execution, but preserves the proposed call
    // in the durable Approvals inbox for an explicit later decision.
    const summary = typeof trustMeta?.description === 'string' ? trustMeta.description : toolDescription;
    const riskLevel = typeof trustMeta?.riskLevel === 'string'
      && (RISK_LEVELS as readonly string[]).includes(trustMeta.riskLevel)
      ? trustMeta.riskLevel as RiskLevel
      : grantRiskLevel;
    const approvalClass = typeof trustMeta?.approvalClass === 'string' ? trustMeta.approvalClass : 'elevated';
    const { approved, held, timedOut } = await waitForApprovalDecision({
      pendingApprovals: server.agentState.pendingApprovals,
      cronStore: server.cronStore,
      requestId,
      toolName,
      input,
      riskLevel,
      heldAction: {
        workspaceId: effectiveWorkspace || null,
        toolName,
        argsJson: retainedTurnJson(input),
        summary: retainedTurnText(summary),
        riskLevel,
        approvalClass,
      },
      heldEvent: {
        requestId,
        toolName,
        input: retention.allowDerivedPersistence ? input : { redacted: NON_RETAINED_TURN_CONTENT },
        sourceWorkspaceId: effectiveWorkspace || null,
        held: true,
        message: 'Moved to Approvals inbox',
        ...trustMeta,
      },
      policy: retention.allowDerivedPersistence
        ? approvalTimeoutPolicy
        : { ...approvalTimeoutPolicy, action: 'deny' },
      sendEvent,
      signal: turnSignal,
      onHeld: (expiresAt) => {
        log.warn('[security] approval timed out; moved to the Approvals inbox', {
          workspaceId: executionScopeId,
          sessionId,
          toolName,
          requestId,
        });
        emitAuditEvent(server, {
          workspaceId: executionScopeId,
          eventType: 'approval_held',
          toolName,
          input: retainedTurnJson(input),
          sessionId,
        });
        sendEvent('step', { content: `\u23f8 ${toolName} moved to Approvals inbox`, expiresAt });
      },
    });

    if (turnSignal.aborted) {
      return { cancel: true, reason: 'Chat or workspace cancelled' };
    }
    if (!approved) {
      if (held) {
        return { cancel: true, reason: `Approval for ${toolName} moved to Approvals inbox` };
      }
      if (timedOut) {
        log.warn('[security] approval timed out; auto-denied for safety', {
            workspaceId: executionScopeId,
            sessionId,
            toolName,
            requestId,
          });
      }
      sendEvent('step', { content: `\u2716 ${toolName} denied by user` });
      emitAuditEvent(server, { workspaceId: executionScopeId, eventType: 'approval_denied', toolName, sessionId, approved: false });
      return { cancel: true, reason: `User denied ${toolName}` };
    }
    sendEvent('step', { content: `\u2714 ${toolName} approved` });
      emitAuditEvent(server, { workspaceId: executionScopeId, eventType: 'approval_granted', toolName, sessionId, approved: true });
    return { authorize: true };
  };
}
