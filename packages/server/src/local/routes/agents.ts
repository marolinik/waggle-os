import type { FastifyPluginAsync } from 'fastify';
import type { AgentType, AutonomyLevel, Scope } from '@waggle/shared';
import {
  readAgents, addAgent, getAgent, patchAgent,
  AGENT_RUN_STATES, type AgentRecord, type AgentRunState, type NewAgentInput,
} from '../agents-store.js';
import { assertSafeSegment, authHeaders, clampStr, clampStrArray } from './validate.js';

/**
 * UX-Refactor Phase 3 — Agent Center REST surface (S09/S18, PRD §16.7/§15.5).
 *
 * NAMING (load-bearing): `/api/agents/*` CRUD exists only on the Clerk-gated
 * CLOUD server (`src/routes/agents.ts`) — everything here is NET-NEW on the
 * local sidecar. The existing static `GET /api/agents/active` (local/routes/
 * agent.ts) keeps precedence over the `/:id` param route (find-my-way prefers
 * static segments regardless of registration order).
 *
 * Gate ratifications honoured:
 *  - B3  — Agent = real object in `{dataDir}/agents.json` referencing `personaId`;
 *          successRate/lastRunAt DERIVED at read from execution_traces, never stored.
 *  - C22 — type vocabulary personal/workspace/team/autonomous (tabs are FE).
 *  - C23 — `/run` = ONE-SHOT fleet-spawn into a chosen workspace, delegated to the
 *          real executor `POST /api/fleet/spawn` (the only path that runs
 *          runAgentLoop) — NOT the agent-groups `/run` placeholder stub. 400 on
 *          workspace ambiguity; persistent always-running agents deferred.
 *  - M2 awareness — audit writes never pass riskLevel 'critical' (DDL CHECK
 *          allows low/medium/high only until M2 lands).
 *
 * Trace keying: `execution_traces` has NO agent column (keys: session/persona/
 * workspace), and fleet spawn records no traces itself. `/run` therefore starts
 * a trace here tagged `agent:{id}` (in TracePayload.tags) keyed by the spawn
 * sessionId; reads filter on that tag. Spawn-loop completion does not finalize
 * the trace (fleet's fire-and-forget loop has no completion hook — a documented
 * deferred parity item in fleet.ts), so spawn traces stay `pending`: lastRunAt
 * derives immediately, successRate counts only finalized traces (chat/harness).
 *
 * Run keying: workspace sessions are ONE-per-workspace and shared between chat
 * and fleet spawns, so liveStatus/pause must NOT fan out over workspace+persona
 * (that swept up co-tenant chat/agent sessions). Instead `/run` records the
 * spawn's {workspaceId, sessionId} in an in-process map keyed by agent id, and
 * liveStatus/pause act only on that recorded session. Entries are lost on
 * restart (the stored status then applies) — acceptable for one-shot C23 runs.
 *
 * Tier gating: agent creation is deliberately UNGATED — CLAUDE.md §1 moat
 * strategy: "Agents are free (they generate memory)", matching the executor
 * (`POST /api/fleet/spawn` is free for all tiers).
 */

const AGENT_TYPES: readonly AgentType[] = ['personal', 'workspace', 'team', 'autonomous'];
const AUTONOMY_LEVELS: readonly AutonomyLevel[] = ['manual', 'guided', 'medium', 'high'];
const SCOPES: readonly Scope[] = ['personal', 'workspace', 'team', 'organization'];

// Defense-in-depth caps on free-form fields (mirrors artifacts.ts).
const MAX_NAME_LEN = 200;
const MAX_GOAL_LEN = 4000;
const MAX_DESC_LEN = 2000;
const MAX_STR_LEN = 200;
const MAX_IDS = 100;
// Trace scan bounds for the derived overlay (B3).
const TRACE_SCAN = 500;
const MAX_TRACE_LIST = 200;

const asAgentType = (v: unknown): AgentType | undefined =>
  AGENT_TYPES.includes(v as AgentType) ? (v as AgentType) : undefined;
const asAutonomy = (v: unknown): AutonomyLevel | undefined =>
  AUTONOMY_LEVELS.includes(v as AutonomyLevel) ? (v as AutonomyLevel) : undefined;
const asRunState = (v: unknown): AgentRunState | undefined =>
  AGENT_RUN_STATES.includes(v as AgentRunState) ? (v as AgentRunState) : undefined;
const asScopes = (v: unknown): Scope[] | undefined =>
  Array.isArray(v) && v.length > 0 && v.every((s) => SCOPES.includes(s as Scope))
    ? (v as Scope[]) : undefined;

/** execution_traces timestamps default to SQLite `YYYY-MM-DD HH:MM:SS` (UTC,
 *  no zone marker) — browsers parse that as LOCAL time. Normalize to ISO-8601
 *  UTC at the route boundary (the substrate compensates the same way in
 *  finalize(); see execution-traces.ts). */
function sqliteUtcToIso(ts: string): string {
  if (ts.includes('T')) return ts; // already ISO
  const ms = Date.parse(`${ts.replace(' ', 'T')}Z`);
  return Number.isNaN(ms) ? ts : new Date(ms).toISOString();
}

/** Body shape shared by POST (create) and PATCH (update). */
interface AgentBody {
  name?: string; goal?: string; description?: string; type?: string;
  personaId?: string; avatar?: string; model?: string; autonomyLevel?: string;
  workspaceIds?: string[]; teamId?: string; memoryScopes?: string[];
  skillIds?: string[]; connectorIds?: string[]; mcpIds?: string[];
  permissions?: Record<string, unknown>; status?: string; createdBy?: string;
}

/** Per-agent derived run stats from the trace scan (B3). */
interface AgentTraceStats {
  lastRunAt?: string;
  successRate?: number;
}

export const agentEntityRoutes: FastifyPluginAsync = async (server) => {
  const dataDir = server.localConfig.dataDir;

  /** In-process record of the last fleet spawn per agent (C23 one-shot runs).
   *  Keys liveStatus/pause to the agent's OWN spawn session instead of a
   *  workspace+persona heuristic (see file header "Run keying"). */
  const activeRuns = new Map<string, { workspaceId: string; sessionId: string }>();

  /** One bounded scan over recent traces, grouped by `agent:{id}` tag.
   *  successRate = (success+verified) / finalized; pending excluded.
   *  tagLike pre-filters in SQL so the scan bound applies to AGENT-tagged
   *  traces only — busy chat/harness traffic can no longer evict an agent's
   *  lastRunAt/successRate out of the window. */
  function collectTraceStats(): Map<string, { lastRunAt: string; counts: Record<string, number> }> {
    const byAgent = new Map<string, { lastRunAt: string; counts: Record<string, number> }>();
    try {
      for (const t of server.traceStore.queryParsed({ limit: TRACE_SCAN, tagLike: '"agent:' })) {
        for (const tag of t.payload.tags ?? []) {
          if (!tag.startsWith('agent:')) continue;
          const agentId = tag.slice('agent:'.length);
          const entry = byAgent.get(agentId) ?? { lastRunAt: t.created_at, counts: {} };
          if (t.created_at > entry.lastRunAt) entry.lastRunAt = t.created_at;
          entry.counts[t.outcome] = (entry.counts[t.outcome] ?? 0) + 1;
          byAgent.set(agentId, entry);
        }
      }
    } catch {
      // Trace store unavailable — derived fields stay undefined.
    }
    return byAgent;
  }

  function toStats(entry?: { lastRunAt: string; counts: Record<string, number> }): AgentTraceStats {
    if (!entry) return {};
    const c = entry.counts;
    const good = (c.success ?? 0) + (c.verified ?? 0);
    const finalized = good + (c.corrected ?? 0) + (c.abandoned ?? 0);
    return {
      lastRunAt: sqliteUtcToIso(entry.lastRunAt),
      ...(finalized > 0 ? { successRate: good / finalized } : {}),
    };
  }

  /** Live status overlay keyed to the agent's OWN recorded spawn (activeRuns).
   *  No recorded run (or a session in 'error') → undefined → stored status.
   *  A mere open chat session in a shared workspace never reports 'running'. */
  function liveStatus(agent: AgentRecord): AgentRunState | undefined {
    const run = activeRuns.get(agent.id);
    if (!run) return undefined;
    try {
      for (const s of server.sessionManager.getActive()) {
        if (s.workspaceId !== run.workspaceId) continue;
        if (s.status === 'active') return 'running';
        if (s.status === 'paused') return 'paused';
      }
    } catch {
      // Session manager unavailable — fall back to the stored status.
    }
    return undefined;
  }

  function toView(
    agent: AgentRecord,
    stats: AgentTraceStats,
  ): AgentRecord & AgentTraceStats {
    return {
      ...agent,
      status: liveStatus(agent) ?? agent.status,
      ...stats,
    };
  }

  // GET /api/agents — saved agents with derived status/lastRunAt/successRate (B3).
  server.get('/api/agents', async () => {
    const statsByAgent = collectTraceStats();
    const agents = readAgents(dataDir).map((a) => toView(a, toStats(statsByAgent.get(a.id))));
    return { agents, count: agents.length };
  });

  // POST /api/agents — create. NOT tier-gated: CLAUDE.md §1 moat strategy says
  // "Agents are free (they generate memory)" and the executor (fleet spawn) is
  // free for all tiers — a tier gate here would be an incoherent surface.
  // Blueprint hard gate: goal, model, memoryScopes and autonomyLevel are
  // required so the stored record is the full effective surface ("no hidden
  // tool/memory access").
  server.post<{ Body: AgentBody }>(
    '/api/agents',
    async (request, reply) => {
      const b = request.body ?? {};
      if (!b.name || !String(b.name).trim()) {
        return reply.status(400).send({ error: 'name is required' });
      }
      if (!b.goal || !String(b.goal).trim()) {
        return reply.status(400).send({ error: 'goal is required' });
      }
      if (!b.model || !String(b.model).trim()) {
        return reply.status(400).send({ error: 'model is required' });
      }
      const autonomyLevel = asAutonomy(b.autonomyLevel);
      if (!autonomyLevel) {
        return reply.status(400).send({ error: `autonomyLevel must be one of: ${AUTONOMY_LEVELS.join(', ')}` });
      }
      const memoryScopes = asScopes(b.memoryScopes);
      if (!memoryScopes) {
        return reply.status(400).send({ error: `memoryScopes must be a non-empty array of: ${SCOPES.join(', ')}` });
      }
      if (b.type !== undefined && !asAgentType(b.type)) {
        return reply.status(400).send({ error: `type must be one of: ${AGENT_TYPES.join(', ')}` });
      }
      if (b.status !== undefined && !asRunState(b.status)) {
        return reply.status(400).send({ error: `Invalid status "${b.status}"` });
      }
      const workspaceIds = clampStrArray(b.workspaceIds, MAX_IDS, MAX_STR_LEN);
      // Workspace ids become path components downstream (fleet spawn persistence).
      for (const wsId of workspaceIds) assertSafeSegment(wsId, 'workspaceId');

      const input: NewAgentInput = {
        name: clampStr(b.name, MAX_NAME_LEN),
        goal: clampStr(b.goal, MAX_GOAL_LEN),
        ...(b.description ? { description: clampStr(b.description, MAX_DESC_LEN) } : {}),
        type: asAgentType(b.type) ?? 'personal',
        ...(b.personaId ? { personaId: clampStr(b.personaId, MAX_STR_LEN) } : {}),
        ...(b.avatar ? { avatar: clampStr(b.avatar, MAX_STR_LEN) } : {}),
        model: clampStr(b.model, MAX_STR_LEN),
        autonomyLevel,
        ...(workspaceIds.length > 0 ? { workspaceIds } : {}),
        ...(b.teamId ? { teamId: clampStr(b.teamId, MAX_STR_LEN) } : {}),
        memoryScopes,
        ...(Array.isArray(b.skillIds) ? { skillIds: clampStrArray(b.skillIds, MAX_IDS, MAX_STR_LEN) } : {}),
        ...(Array.isArray(b.connectorIds) ? { connectorIds: clampStrArray(b.connectorIds, MAX_IDS, MAX_STR_LEN) } : {}),
        ...(Array.isArray(b.mcpIds) ? { mcpIds: clampStrArray(b.mcpIds, MAX_IDS, MAX_STR_LEN) } : {}),
        ...(b.permissions && typeof b.permissions === 'object' ? { permissions: b.permissions } : {}),
        status: asRunState(b.status) ?? 'idle',
        createdBy: clampStr(b.createdBy ?? 'user', MAX_STR_LEN),
      };
      const agent = addAgent(dataDir, input);

      // Elevated-surface audit: an agent claiming connectors/MCPs widens the
      // external-access surface — record it. capability_type CHECK has no
      // 'agent' member, so 'native' is the closest honest class; riskLevel
      // stays 'medium' (NEVER 'critical' — M2 DDL CHECK). Best-effort.
      const elevated = (input.connectorIds?.length ?? 0) + (input.mcpIds?.length ?? 0);
      if (elevated > 0) {
        try {
          server.auditStore.record({
            capabilityName: agent.name,
            capabilityType: 'native',
            source: 'local-created',
            riskLevel: 'medium',
            trustSource: 'local_user',
            approvalClass: 'elevated',
            action: 'installed',
            initiator: 'user',
            detail: `Agent ${agent.id} created claiming connectors=[${(input.connectorIds ?? []).join(',')}] mcps=[${(input.mcpIds ?? []).join(',')}]`,
          });
        } catch { /* audit is best-effort */ }
      }

      return reply.status(201).send({ id: agent.id, agent });
    },
  );

  // GET /api/agents/:id — one agent with derived overlay.
  server.get<{ Params: { id: string } }>('/api/agents/:id', async (request, reply) => {
    const agent = getAgent(dataDir, request.params.id);
    if (!agent) return reply.status(404).send({ error: 'Agent not found' });
    const stats = toStats(collectTraceStats().get(agent.id));
    return { agent: toView(agent, stats) };
  });

  // PATCH /api/agents/:id — partial update (mirrors agent-groups PATCH shape;
  // immutable id/createdAt are enforced by the store).
  server.patch<{ Params: { id: string }; Body: AgentBody }>(
    '/api/agents/:id',
    async (request, reply) => {
      const b = request.body ?? {};
      // Blueprint hard gate holds on update too: required fields may change
      // but never blank out (a blanked goal would 400 downstream in /run with
      // a confusing "task is required").
      for (const key of ['name', 'goal', 'model'] as const) {
        if (b[key] !== undefined && !String(b[key]).trim()) {
          return reply.status(400).send({ error: `${key} cannot be blank` });
        }
      }
      if (b.type !== undefined && !asAgentType(b.type)) {
        return reply.status(400).send({ error: `type must be one of: ${AGENT_TYPES.join(', ')}` });
      }
      if (b.autonomyLevel !== undefined && !asAutonomy(b.autonomyLevel)) {
        return reply.status(400).send({ error: `autonomyLevel must be one of: ${AUTONOMY_LEVELS.join(', ')}` });
      }
      if (b.memoryScopes !== undefined && !asScopes(b.memoryScopes)) {
        return reply.status(400).send({ error: `memoryScopes must be a non-empty array of: ${SCOPES.join(', ')}` });
      }
      if (b.status !== undefined && !asRunState(b.status)) {
        return reply.status(400).send({ error: `Invalid status "${b.status}"` });
      }
      const workspaceIds = b.workspaceIds !== undefined
        ? clampStrArray(b.workspaceIds, MAX_IDS, MAX_STR_LEN) : undefined;
      if (workspaceIds) for (const wsId of workspaceIds) assertSafeSegment(wsId, 'workspaceId');

      // Snapshot for the elevated-surface audit comparison below.
      const before = getAgent(dataDir, request.params.id);
      if (!before) return reply.status(404).send({ error: 'Agent not found' });

      const patch: Partial<AgentRecord> = {
        ...(b.name !== undefined ? { name: clampStr(b.name, MAX_NAME_LEN) } : {}),
        ...(b.goal !== undefined ? { goal: clampStr(b.goal, MAX_GOAL_LEN) } : {}),
        ...(b.description !== undefined ? { description: clampStr(b.description, MAX_DESC_LEN) } : {}),
        ...(b.type !== undefined ? { type: b.type as AgentType } : {}),
        ...(b.personaId !== undefined ? { personaId: clampStr(b.personaId, MAX_STR_LEN) } : {}),
        ...(b.avatar !== undefined ? { avatar: clampStr(b.avatar, MAX_STR_LEN) } : {}),
        ...(b.model !== undefined ? { model: clampStr(b.model, MAX_STR_LEN) } : {}),
        ...(b.autonomyLevel !== undefined ? { autonomyLevel: b.autonomyLevel as AutonomyLevel } : {}),
        ...(workspaceIds !== undefined ? { workspaceIds } : {}),
        ...(b.teamId !== undefined ? { teamId: clampStr(b.teamId, MAX_STR_LEN) } : {}),
        ...(b.memoryScopes !== undefined ? { memoryScopes: b.memoryScopes as Scope[] } : {}),
        ...(b.skillIds !== undefined ? { skillIds: clampStrArray(b.skillIds, MAX_IDS, MAX_STR_LEN) } : {}),
        ...(b.connectorIds !== undefined ? { connectorIds: clampStrArray(b.connectorIds, MAX_IDS, MAX_STR_LEN) } : {}),
        ...(b.mcpIds !== undefined ? { mcpIds: clampStrArray(b.mcpIds, MAX_IDS, MAX_STR_LEN) } : {}),
        ...(b.permissions !== undefined ? { permissions: b.permissions } : {}),
        ...(b.status !== undefined ? { status: b.status as AgentRunState } : {}),
      };
      const updated = patchAgent(dataDir, request.params.id, patch);
      if (!updated) return reply.status(404).send({ error: 'Agent not found' });

      // Elevated-surface audit (mirrors POST): a PATCH that changes the
      // claimed connectors/MCPs changes the external-access surface — record
      // it so create-clean-then-patch-in cannot bypass the trail. action stays
      // 'installed' (the install_audit DDL CHECK has no 'updated' member —
      // same constraint class as the M2 riskLevel note); the change is spelled
      // out in detail. Best-effort.
      if (b.connectorIds !== undefined || b.mcpIds !== undefined) {
        const changed =
          JSON.stringify(before.connectorIds ?? []) !== JSON.stringify(updated.connectorIds ?? []) ||
          JSON.stringify(before.mcpIds ?? []) !== JSON.stringify(updated.mcpIds ?? []);
        if (changed) {
          try {
            server.auditStore.record({
              capabilityName: updated.name,
              capabilityType: 'native',
              source: 'local-created',
              riskLevel: 'medium',
              trustSource: 'local_user',
              approvalClass: 'elevated',
              action: 'installed',
              initiator: 'user',
              detail: `Agent ${updated.id} updated claiming connectors=[${(updated.connectorIds ?? []).join(',')}] mcps=[${(updated.mcpIds ?? []).join(',')}] (was connectors=[${(before.connectorIds ?? []).join(',')}] mcps=[${(before.mcpIds ?? []).join(',')}])`,
            });
          } catch { /* audit is best-effort */ }
        }
      }

      return { ok: true, agent: updated };
    },
  );

  // POST /api/agents/:id/run — C23: one-shot fleet-spawn into a chosen workspace.
  // Delegates to the REAL executor POST /api/fleet/spawn (the only path that runs
  // runAgentLoop) via an internal inject — NOT the agent-groups stub.
  server.post<{ Params: { id: string }; Body: { input?: string; workspaceId?: string } }>(
    '/api/agents/:id/run',
    async (request, reply) => {
      const agent = getAgent(dataDir, request.params.id);
      if (!agent) return reply.status(404).send({ error: 'Agent not found' });

      const b = request.body ?? {};
      let workspaceId: string | undefined;
      if (b.workspaceId) {
        assertSafeSegment(b.workspaceId, 'workspaceId');
        if (agent.workspaceIds?.length && !agent.workspaceIds.includes(b.workspaceId)) {
          return reply.status(400).send({
            error: 'workspace_not_assigned',
            message: `Agent is not assigned to workspace "${b.workspaceId}"`,
          });
        }
        workspaceId = b.workspaceId;
      } else if ((agent.workspaceIds?.length ?? 0) === 1) {
        workspaceId = agent.workspaceIds![0];
      } else if ((agent.workspaceIds?.length ?? 0) > 1) {
        // C23: FE shows a picker; the server refuses to guess.
        return reply.status(400).send({
          error: 'workspace_ambiguous',
          message: 'Agent has multiple workspaces — pass workspaceId',
          workspaceIds: agent.workspaceIds,
        });
      }
      // No workspaceIds at all → fleet spawn falls back to the default workspace.

      // Clamp the only free-form field on this surface (matches the goal cap —
      // task flows into fleet spawn, sessions jsonl, signals and trace input).
      const task = clampStr(b.input, MAX_GOAL_LEN).trim() || agent.goal;
      const res = await server.inject({
        method: 'POST',
        url: '/api/fleet/spawn',
        headers: authHeaders(request),
        payload: {
          task,
          ...(agent.personaId ? { persona: agent.personaId } : {}),
          model: agent.model,
          ...(workspaceId ? { parentWorkspaceId: workspaceId } : {}),
          // #6 fast-follow — carry the agent's durable goal as the ancestry "why".
          ...(agent.goal ? { goal: agent.goal } : {}),
        },
      });
      const body = res.json() as Record<string, unknown>;
      if (res.statusCode >= 400) {
        return reply.status(res.statusCode).send(body);
      }

      // Key this run to its actual spawn session (see file header "Run
      // keying") — liveStatus/pause act only on this recorded session.
      activeRuns.set(agent.id, {
        workspaceId: String(body.workspaceId ?? workspaceId ?? ''),
        sessionId: String(body.sessionId ?? ''),
      });

      // B3 derived-at-read substrate: tag a trace with this agent's id so
      // lastRunAt/successRate have a deterministic key (traces have no agent
      // column). The spawn loop has no completion hook, so this trace stays
      // `pending` — counted for lastRunAt, excluded from successRate.
      try {
        server.traceStore.start({
          sessionId: String(body.sessionId ?? ''),
          personaId: agent.personaId ?? null,
          workspaceId: String(body.workspaceId ?? workspaceId ?? ''),
          model: String(body.model ?? agent.model),
          input: task,
          tags: [`agent:${agent.id}`],
        });
      } catch { /* trace recording is best-effort */ }

      return {
        sessionId: body.sessionId,
        workspaceId: body.workspaceId ?? workspaceId,
        status: body.status,
        task,
      };
    },
  );

  // POST /api/agents/:id/pause — pause the session of the agent's OWN recorded
  // spawn (activeRuns; see file header "Run keying" — no workspace+persona
  // fan-out, so co-tenant sessions in other workspaces are never touched).
  // Same operation as POST /api/fleet/:workspaceId/pause (a thin wrapper over
  // sessionManager.pause). NOTE: fleet pause ABORTS the in-flight spawn loop
  // via the workspace session's AbortController — it is a stop, not a suspend,
  // and the session is shared per-workspace, so another spawn loop running in
  // the SAME workspace would abort with it (1-session-per-workspace substrate).
  server.post<{ Params: { id: string } }>('/api/agents/:id/pause', async (request, reply) => {
    const agent = getAgent(dataDir, request.params.id);
    if (!agent) return reply.status(404).send({ error: 'Agent not found' });

    const run = activeRuns.get(agent.id);
    if (!run) {
      return reply.status(404).send({ error: 'No recorded run for this agent' });
    }
    let paused = 0;
    try {
      for (const s of server.sessionManager.getActive()) {
        if (s.workspaceId !== run.workspaceId) continue;
        if (s.status === 'active' && server.sessionManager.pause(s.workspaceId)) paused++;
      }
    } catch {
      return reply.status(503).send({ error: 'Session manager not available' });
    }
    if (paused === 0) {
      return reply.status(404).send({ error: 'No active session for this agent' });
    }
    // The spawn loop is aborted — the run is over; stored status applies again.
    activeRuns.delete(agent.id);
    return { ok: true, paused };
  });

  // GET /api/agents/:id/traces — thin read over execution_traces filtered by the
  // `agent:{id}` tag (no agent column exists; see file header).
  server.get<{ Params: { id: string }; Querystring: { limit?: string } }>(
    '/api/agents/:id/traces',
    async (request, reply) => {
      const agent = getAgent(dataDir, request.params.id);
      if (!agent) return reply.status(404).send({ error: 'Agent not found' });

      const parsed = request.query.limit ? parseInt(request.query.limit, 10) : MAX_TRACE_LIST;
      const max = Math.min(Number.isFinite(parsed) && parsed > 0 ? parsed : MAX_TRACE_LIST, MAX_TRACE_LIST);
      const tag = `agent:${agent.id}`;

      let traces: Array<Record<string, unknown>> = [];
      try {
        // tagLike pre-filters in SQL so the scan bound applies to THIS agent's
        // traces (LIKE wildcards aside — the exact JS tag filter still rules);
        // the exact .includes() guard below stays authoritative.
        traces = server.traceStore.queryParsed({ limit: TRACE_SCAN, tagLike: `"agent:${agent.id}"` })
          .filter((t) => (t.payload.tags ?? []).includes(tag))
          .slice(0, max)
          .map((t) => ({
            id: t.id,
            ts: sqliteUtcToIso(t.created_at),
            sessionId: t.session_id,
            workspaceId: t.workspace_id,
            model: t.model,
            outcome: t.outcome,
            cost: t.cost_usd,
            durationMs: t.duration_ms,
            tools: t.payload.toolCalls.map((c) => c.tool),
          }));
      } catch {
        // Trace store unavailable — empty list beats a 500.
      }
      return { traces, count: traces.length };
    },
  );
};
