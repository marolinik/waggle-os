import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { HybridSearch } from '@waggle/core';
import {
  classifyRateLimitError,
  classifyTask,
  routeTask,
  type ExecutorCandidate,
  type RouteDecision,
  type RouteTask,
  type TaskCategory,
} from '@waggle/agent';
import { buildExecutorBrief, filterExecutorBrief, type ExecutorBrief } from '../executor-brief.js';
import { runChannelChatTurn } from '../channels/chat-client.js';
import { emitAuditEvent } from './events.js';

const PROPOSAL_TTL_MS = 10 * 60 * 1_000;
const SWEEP_INTERVAL_MS = 60 * 1_000;

type BriefOptions = Parameters<typeof buildExecutorBrief>[1];
type BriefProvider = (opts: BriefOptions) => Promise<ExecutorBrief>;
type PersonaDispatcher = typeof runChannelChatTurn;

interface RouteProposal {
  id: string;
  createdAt: number;
  workspaceId: string;
  sessionId: string;
  prompt: string;
  task: RouteTask;
  decision: RouteDecision;
  brief: ExecutorBrief | null;
  status: 'proposed' | 'confirming' | 'dispatched' | 'rejected';
}

declare module 'fastify' {
  interface FastifyInstance {
    routeProposalBriefProvider?: BriefProvider;
    routeProposalPersonaDispatcher?: PersonaDispatcher;
  }
}

const categorySchema = z.enum(['coding', 'writing', 'research', 'analysis', 'ops', 'general']);
const proposeSchema = z.object({
  workspaceId: z.string().min(1).max(200),
  sessionId: z.string().min(1).max(200).optional(),
  prompt: z.string().min(1).max(20_000),
  category: categorySchema.optional(),
  privacy: z.enum(['normal', 'private']).optional(),
  preferredExecutorId: z.string().min(1).max(128).optional(),
}).strict();
const paramsSchema = z.object({ id: z.string().uuid() }).strict();
const confirmSchema = z.object({
  executorId: z.string().min(1).max(128).optional(),
  removeFrameIds: z.array(z.string().min(1).max(128)).max(100).optional(),
}).strict();

export const routeProposalRoutes: FastifyPluginAsync = async (server) => {
  const proposals = new Map<string, RouteProposal>();
  const sweep = (nowMs: number) => {
    for (const [id, proposal] of proposals) {
      if (nowMs - proposal.createdAt >= PROPOSAL_TTL_MS) proposals.delete(id);
    }
  };
  const sweepTimer = setInterval(() => sweep(Date.now()), SWEEP_INTERVAL_MS);
  sweepTimer.unref();
  server.addHook('onClose', async () => clearInterval(sweepTimer));

  server.post('/api/route-proposals', async (request, reply) => {
    const parsed = proposeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation failed', details: parsed.error.flatten() });
    }

    const nowMs = Date.now();
    sweep(nowMs);
    const body = parsed.data;
    const category: TaskCategory = body.category ?? classifyTask(body.prompt).category;
    const task: RouteTask = {
      category,
      privacy: body.privacy ?? 'normal',
      ...(body.preferredExecutorId ? { preferredExecutorId: body.preferredExecutorId } : {}),
    };
    const decision = routeTask(task, await server.executorRegistry.snapshot(nowMs), nowMs);
    const brief = decision.selected?.kind === 'external'
      ? await provideBrief(server, {
          workspaceId: body.workspaceId,
          prompt: body.prompt,
        })
      : null;
    const proposal: RouteProposal = {
      id: randomUUID(),
      createdAt: nowMs,
      workspaceId: body.workspaceId,
      sessionId: body.sessionId ?? body.workspaceId,
      prompt: body.prompt,
      task,
      decision,
      brief,
      status: 'proposed',
    };
    proposals.set(proposal.id, proposal);

    emitAuditEvent(server, {
      workspaceId: body.workspaceId,
      eventType: 'tool_call',
      toolName: 'executor_router',
      input: JSON.stringify({
        routeDecisionId: proposal.id,
        category: task.category,
        privacy: task.privacy,
        preferredExecutorId: task.preferredExecutorId ?? null,
      }),
      output: JSON.stringify({ selectedExecutorId: decision.selected?.id ?? null }),
    });

    return proposalResponse(proposal);
  });

  server.post('/api/route-proposals/:id/confirm', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    const body = confirmSchema.safeParse(request.body ?? {});
    if (!params.success || !body.success) {
      const details = !params.success
        ? params.error.flatten()
        : !body.success
          ? body.error.flatten()
          : {};
      return reply.code(400).send({
        error: 'Validation failed',
        details,
      });
    }

    const nowMs = Date.now();
    sweep(nowMs);
    const proposal = proposals.get(params.data.id);
    if (!proposal) return reply.code(404).send({ error: 'route_proposal_not_found' });
    if (proposal.status !== 'proposed') {
      return reply.code(409).send({ error: 'route_proposal_already_claimed', status: proposal.status });
    }

    const executorId = body.data.executorId ?? proposal.decision.selected?.id;
    if (!executorId) {
      return reply.code(409).send({ error: 'revalidation_failed', reason: 'no eligible executor' });
    }
    const offered = [proposal.decision.selected, ...proposal.decision.alternatives]
      .filter((candidate): candidate is ExecutorCandidate => candidate !== null);
    if (!offered.some((candidate) => candidate.id === executorId)) {
      return reply.code(400).send({ error: 'executor_not_offered', executorId });
    }

    // Egress guarantee: an override may only dispatch to the destination the
    // user saw disclosed. A different destination requires a fresh proposal.
    const disclosed = proposal.decision.selected;
    const chosen = offered.find((candidate) => candidate.id === executorId);
    if (disclosed && chosen && chosen.egressDestination !== disclosed.egressDestination) {
      return reply.code(409).send({
        error: 'revalidation_failed',
        reason: 'chosen executor sends data to a different destination — re-propose to review the disclosure',
      });
    }

    proposal.status = 'confirming';
    try {
      const candidates = await server.executorRegistry.snapshot(nowMs);
      const candidate = candidates.find((item) => item.id === executorId);
      const revalidated = candidate ? routeTask(proposal.task, [candidate], nowMs) : null;
      if (!candidate || !revalidated?.selected) {
        proposal.status = 'proposed';
        return reply.code(409).send({
          error: 'revalidation_failed',
          reason: revalidated?.rejected[0]?.reason ?? 'executor unavailable',
        });
      }

      let roomId: string | undefined;
      let runId: string | undefined;
      let mode: 'external' | 'internal';
      let resultText: string | undefined;
      let brief: ExecutorBrief | null = null;
      if (candidate.kind === 'external') {
        mode = 'external';
        // Never re-run retrieval at confirm: filter the brief the user
        // reviewed so removed frames cannot be backfilled by new results.
        brief = proposal.brief
          ? filterExecutorBrief(proposal.brief, {
              workspaceId: proposal.workspaceId,
              prompt: proposal.prompt,
              removeFrameIds: body.data.removeFrameIds,
            })
          : null;
        const dispatched = await server.inject({
          method: 'POST',
          url: '/api/tools/run',
          headers: {
            ...(request.headers.authorization
              ? { authorization: request.headers.authorization }
              : {}),
          },
          payload: {
            toolId: candidate.id.slice('external:'.length),
            workspaceIds: [proposal.workspaceId],
            prompt: !brief || brief.blocked || !brief.text
              ? proposal.prompt
              : `${brief.text}\n\n${proposal.prompt}`,
            access: 'read-only',
            attribution: {
              routeDecisionId: proposal.id,
              ...(brief && !brief.blocked && brief.text ? { briefHash: brief.briefHash } : {}),
            },
          },
        });
        const dispatchedBody = dispatched.json() as {
          roomId?: string;
          runs?: Array<{ runId?: string }>;
          error?: string;
          message?: string;
        };
        if (dispatched.statusCode >= 400) {
          proposal.status = 'proposed';
          return reply.code(dispatched.statusCode).send(dispatchedBody);
        }
        roomId = dispatchedBody.roomId;
        runId = dispatchedBody.runs?.[0]?.runId;
      } else {
        mode = 'internal';
        const dispatchPersona = server.routeProposalPersonaDispatcher ?? runChannelChatTurn;
        const turn = await dispatchPersona({
          port: server.localConfig.port,
          sessionToken: server.agentState.wsSessionToken,
          message: proposal.prompt,
          workspace: proposal.workspaceId,
          session: proposal.sessionId,
          persona: candidate.id.slice('persona:'.length),
          proposeHeld: true,
          origin: 'router',
        });
        if (turn.error) {
          proposal.status = 'proposed';
          // Feed the registry so the next proposal doesn't re-select an
          // exhausted persona (mirrors the external-run rate-limit hook).
          const assessment = classifyRateLimitError(turn.error, Date.now());
          if (assessment.isRateLimit) {
            server.executorRegistry.noteRateLimit(candidate.id, assessment.resetAtMs);
          }
          return reply.code(502).send({ error: 'dispatch_failed', reason: turn.error });
        }
        server.executorRegistry.noteHealthy(candidate.id);
        resultText = turn.content || undefined;
      }

      proposal.status = 'dispatched';
      proposal.brief = brief;
      emitAuditEvent(server, {
        workspaceId: proposal.workspaceId,
        eventType: 'tool_result',
        toolName: 'executor_router',
        input: JSON.stringify({ routeDecisionId: proposal.id, executorId }),
        output: JSON.stringify({ status: 'dispatched', mode, roomId: roomId ?? null, runId: runId ?? null }),
      });
      return {
        status: 'dispatched',
        mode,
        ...(roomId ? { roomId } : {}),
        ...(runId ? { runId } : {}),
        ...(resultText ? { resultText } : {}),
      };
    } catch (error) {
      proposal.status = 'proposed';
      throw error;
    }
  });

  server.post('/api/route-proposals/:id/reject', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'Validation failed', details: params.error.flatten() });
    }
    sweep(Date.now());
    const proposal = proposals.get(params.data.id);
    if (!proposal) return reply.code(404).send({ error: 'route_proposal_not_found' });
    if (proposal.status !== 'proposed') {
      return reply.code(409).send({ error: 'route_proposal_already_claimed', status: proposal.status });
    }
    proposal.status = 'rejected';
    return { status: 'rejected' };
  });
};

async function provideBrief(server: FastifyInstance, opts: BriefOptions): Promise<ExecutorBrief> {
  if (server.routeProposalBriefProvider) return server.routeProposalBriefProvider(opts);
  const db = server.mindCache.acquire(opts.workspaceId);
  try {
    return await buildExecutorBrief({ search: new HybridSearch(db, server.embeddingProvider) }, opts);
  } finally {
    server.mindCache.release(opts.workspaceId);
  }
}

function proposalResponse(proposal: RouteProposal) {
  const selected = proposal.decision.selected;
  const briefBlocked = proposal.brief?.blocked === true;
  return {
    routeDecisionId: proposal.id,
    selected: selected ? {
      id: selected.id,
      displayName: selected.displayName,
      reason: `best ${proposal.task.category} fit, available now`,
    } : null,
    alternatives: proposal.decision.alternatives.map(({ id, displayName }) => ({ id, displayName })),
    rejected: proposal.decision.rejected,
    scores: proposal.decision.scores,
    egress: selected?.kind === 'external' && proposal.brief && !briefBlocked ? {
      destination: selected.egressDestination ?? 'configured provider',
      items: proposal.brief.items.map(({ frameId, date, source, preview }) => ({
        frameId,
        date,
        source,
        preview: preview.slice(0, 120),
      })),
      briefChars: proposal.brief.chars,
    } : null,
    ...(briefBlocked ? {
      briefBlocked: true,
      briefBlockedReason: proposal.brief?.blockedReason,
    } : {}),
    costLine: selected?.kind === 'external'
      ? `uses your existing ${selected.displayName} allowance`
      : selected
        ? 'runs on your configured API key'
        : null,
  };
}
