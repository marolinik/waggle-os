import { afterEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { buildTaskFit, type ExecutorCandidate } from '@waggle/agent';
import type { ExecutorBrief } from '../../src/local/executor-brief.js';
import { routeProposalRoutes } from '../../src/local/routes/route-proposals.js';

const NOW_MS = Date.UTC(2026, 6, 15, 10, 0, 0);
const WORKSPACE_ID = 'workspace-alpha';
const PROMPT = 'Implement the router tests';

const servers: FastifyInstance[] = [];

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

function externalCandidate(overrides: Partial<ExecutorCandidate> = {}): ExecutorCandidate {
  const id = overrides.id ?? 'external:codex';
  return {
    id,
    kind: 'external',
    displayName: 'Codex CLI',
    taskFit: buildTaskFit(id),
    authClass: 'subscription-cli',
    installed: true,
    healthy: true,
    rateLimit: { state: 'available' },
    supportsHeadless: true,
    egressDestination: 'OpenAI',
    ...overrides,
  };
}

function personaCandidate(overrides: Partial<ExecutorCandidate> = {}): ExecutorCandidate {
  const id = overrides.id ?? 'persona:coder';
  return {
    id,
    kind: 'persona',
    displayName: 'Coder',
    taskFit: buildTaskFit(id),
    authClass: 'api-key',
    installed: true,
    healthy: true,
    rateLimit: { state: 'available' },
    supportsHeadless: false,
    egressDestination: null,
    ...overrides,
  };
}

function briefFixture(
  briefHash = 'brief-full-hash',
  text = '## Waggle task context\nMemory evidence:\n- Full retained context',
): ExecutorBrief {
  return {
    text,
    items: [{
      frameId: 'frame-1',
      date: '2026-07-14',
      source: 'user_stated',
      preview: 'Full retained context',
      content: 'Full retained context',
    }],
    briefHash,
    chars: text.length,
    blocked: false,
  };
}

interface HarnessOptions {
  snapshots: ExecutorCandidate[][];
  briefProvider?: (opts: {
    workspaceId: string;
    prompt: string;
    excludeFrameIds?: string[];
  }) => Promise<ExecutorBrief>;
  personaDispatcher?: (...args: unknown[]) => Promise<{
    content: string;
    approvalRequired: boolean;
    error?: string;
  }>;
}

async function createHarness(options: HarnessOptions) {
  const server = Fastify({ logger: false });
  servers.push(server);

  let snapshotIndex = 0;
  const snapshot = vi.fn(async () => {
    const candidates = options.snapshots[Math.min(snapshotIndex, options.snapshots.length - 1)] ?? [];
    snapshotIndex += 1;
    return candidates;
  });
  const briefProvider = options.briefProvider ?? vi.fn(async () => briefFixture());
  const personaDispatcher = options.personaDispatcher ?? vi.fn(async () => ({
    content: 'Dispatched',
    approvalRequired: false,
  }));
  const toolRunPayloads: unknown[] = [];

  server.decorate('localConfig', {
    dataDir: '',
    port: 4567,
    host: '127.0.0.1',
    litellmUrl: '',
  } as never);
  server.decorate('agentState', { wsSessionToken: 'ws-session-token' } as never);
  server.decorate('executorRegistry', {
    snapshot,
    noteRateLimit: vi.fn(),
    noteHealthy: vi.fn(),
  } as never);
  server.decorate('routeProposalBriefProvider', briefProvider as never);
  server.decorate('routeProposalPersonaDispatcher', personaDispatcher as never);
  server.post('/api/tools/run', async (request, reply) => {
    toolRunPayloads.push(request.body);
    return reply.code(202).send({
      roomId: 'room-1',
      runs: [{ runId: 'run-1' }],
    });
  });
  await server.register(routeProposalRoutes);

  return { server, snapshot, briefProvider, personaDispatcher, toolRunPayloads };
}

async function propose(
  server: FastifyInstance,
  overrides: Record<string, unknown> = {},
) {
  return server.inject({
    method: 'POST',
    url: '/api/route-proposals',
    payload: {
      workspaceId: WORKSPACE_ID,
      prompt: PROMPT,
      category: 'coding',
      ...overrides,
    },
  });
}

describe('route proposal routes', () => {
  it('confirms an external proposal with a rebuilt brief, read-only access, and attribution', async () => {
    const fullBrief = briefFixture('brief-full-hash');
    const reducedBrief = briefFixture(
      'brief-without-frame-hash',
      '## Waggle task context\nMemory evidence:\n- Remaining context',
    );
    const briefProvider = vi.fn(async (opts: { excludeFrameIds?: string[] }) => (
      opts.excludeFrameIds?.includes('frame-1') ? reducedBrief : fullBrief
    ));
    const { server, toolRunPayloads } = await createHarness({
      snapshots: [[externalCandidate()], [externalCandidate()]],
      briefProvider,
    });

    const proposed = await propose(server);
    expect(proposed.statusCode).toBe(200);
    const proposal = proposed.json() as { routeDecisionId: string; selected: { id: string } };
    expect(proposal.selected.id).toBe('external:codex');

    const confirmed = await server.inject({
      method: 'POST',
      url: `/api/route-proposals/${proposal.routeDecisionId}/confirm`,
      payload: { removeFrameIds: ['frame-1'] },
    });

    expect(confirmed.statusCode).toBe(200);
    expect(confirmed.json()).toEqual({
      status: 'dispatched',
      mode: 'external',
      roomId: 'room-1',
      runId: 'run-1',
    });
    expect(briefProvider).toHaveBeenNthCalledWith(1, {
      workspaceId: WORKSPACE_ID,
      prompt: PROMPT,
    });
    expect(briefProvider).toHaveBeenNthCalledWith(2, {
      workspaceId: WORKSPACE_ID,
      prompt: PROMPT,
      excludeFrameIds: ['frame-1'],
    });
    expect(reducedBrief.briefHash).not.toBe(fullBrief.briefHash);
    expect(toolRunPayloads).toEqual([{
      toolId: 'codex',
      workspaceIds: [WORKSPACE_ID],
      prompt: `${reducedBrief.text}\n\n${PROMPT}`,
      access: 'read-only',
      attribution: {
        routeDecisionId: proposal.routeDecisionId,
        briefHash: reducedBrief.briefHash,
      },
    }]);
  });

  it('dispatches a persona with the bare persona id, router origin, and websocket token', async () => {
    const personaDispatcher = vi.fn(async () => ({ content: 'Done', approvalRequired: false }));
    const { server, briefProvider, toolRunPayloads } = await createHarness({
      snapshots: [[personaCandidate()], [personaCandidate()]],
      personaDispatcher,
    });
    const proposed = await propose(server);
    const { routeDecisionId } = proposed.json() as { routeDecisionId: string };

    const confirmed = await server.inject({
      method: 'POST',
      url: `/api/route-proposals/${routeDecisionId}/confirm`,
      payload: {},
    });

    expect(confirmed.statusCode).toBe(200);
    expect(confirmed.json()).toEqual({ status: 'dispatched', mode: 'internal' });
    expect(personaDispatcher).toHaveBeenCalledWith({
      port: 4567,
      sessionToken: 'ws-session-token',
      message: PROMPT,
      workspace: WORKSPACE_ID,
      session: WORKSPACE_ID,
      persona: 'coder',
      proposeHeld: true,
      origin: 'router',
    });
    expect(briefProvider).not.toHaveBeenCalled();
    expect(toolRunPayloads).toEqual([]);
  });

  it('fails revalidation when the selected external tool is uninstalled', async () => {
    const { server, snapshot, briefProvider, toolRunPayloads } = await createHarness({
      snapshots: [
        [externalCandidate()],
        [externalCandidate({ installed: false, healthy: false })],
      ],
    });
    const proposed = await propose(server);
    const { routeDecisionId } = proposed.json() as { routeDecisionId: string };

    const confirmed = await server.inject({
      method: 'POST',
      url: `/api/route-proposals/${routeDecisionId}/confirm`,
      payload: {},
    });

    expect(confirmed.statusCode).toBe(409);
    expect(confirmed.json()).toMatchObject({
      error: 'revalidation_failed',
      reason: 'not installed',
    });
    expect(snapshot).toHaveBeenCalledTimes(2);
    expect(briefProvider).toHaveBeenCalledTimes(1);
    expect(toolRunPayloads).toEqual([]);
  });

  it('expires proposals after ten minutes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW_MS);
    const { server, snapshot } = await createHarness({ snapshots: [[personaCandidate()]] });
    const proposed = await propose(server);
    const { routeDecisionId } = proposed.json() as { routeDecisionId: string };

    vi.setSystemTime(NOW_MS + 10 * 60_000);
    const confirmed = await server.inject({
      method: 'POST',
      url: `/api/route-proposals/${routeDecisionId}/confirm`,
      payload: {},
    });

    expect(confirmed.statusCode).toBe(404);
    expect(confirmed.json()).toEqual({ error: 'route_proposal_not_found' });
    expect(snapshot).toHaveBeenCalledTimes(1);
  });

  it('allows a proposal to be confirmed only once', async () => {
    const { server, personaDispatcher, snapshot } = await createHarness({
      snapshots: [[personaCandidate()], [personaCandidate()]],
    });
    const proposed = await propose(server);
    const { routeDecisionId } = proposed.json() as { routeDecisionId: string };

    const first = await server.inject({
      method: 'POST',
      url: `/api/route-proposals/${routeDecisionId}/confirm`,
      payload: {},
    });
    const second = await server.inject({
      method: 'POST',
      url: `/api/route-proposals/${routeDecisionId}/confirm`,
      payload: {},
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(409);
    expect(second.json()).toEqual({
      error: 'route_proposal_already_claimed',
      status: 'dispatched',
    });
    expect(snapshot).toHaveBeenCalledTimes(2);
    expect(personaDispatcher).toHaveBeenCalledTimes(1);
  });

  it('never selects an external executor for a private task', async () => {
    const { server, briefProvider } = await createHarness({
      snapshots: [[externalCandidate(), personaCandidate()]],
    });

    const proposed = await propose(server, { privacy: 'private' });

    expect(proposed.statusCode).toBe(200);
    expect(proposed.json()).toMatchObject({
      selected: { id: 'persona:coder' },
      rejected: [{
        id: 'external:codex',
        reason: 'blocked by private-task policy (egress to OpenAI)',
      }],
      egress: null,
      costLine: 'runs on your configured API key',
    });
    expect(briefProvider).not.toHaveBeenCalled();
  });

  it('rejects a proposed route and prevents it from being claimed later', async () => {
    const { server, personaDispatcher } = await createHarness({
      snapshots: [[personaCandidate()]],
    });
    const proposed = await propose(server);
    const { routeDecisionId } = proposed.json() as { routeDecisionId: string };

    const rejected = await server.inject({
      method: 'POST',
      url: `/api/route-proposals/${routeDecisionId}/reject`,
    });
    const confirmed = await server.inject({
      method: 'POST',
      url: `/api/route-proposals/${routeDecisionId}/confirm`,
      payload: {},
    });

    expect(rejected.statusCode).toBe(200);
    expect(rejected.json()).toEqual({ status: 'rejected' });
    expect(confirmed.statusCode).toBe(409);
    expect(confirmed.json()).toEqual({
      error: 'route_proposal_already_claimed',
      status: 'rejected',
    });
    expect(personaDispatcher).not.toHaveBeenCalled();
  });

  it('strictly validates proposal and confirmation input', async () => {
    const { server, snapshot } = await createHarness({
      snapshots: [[personaCandidate()]],
    });

    const extraProposalField = await propose(server, { unexpected: true });
    const emptyPrompt = await propose(server, { prompt: '' });
    const validProposal = await propose(server);
    const { routeDecisionId } = validProposal.json() as { routeDecisionId: string };
    const extraConfirmField = await server.inject({
      method: 'POST',
      url: `/api/route-proposals/${routeDecisionId}/confirm`,
      payload: { unexpected: true },
    });

    expect(extraProposalField.statusCode).toBe(400);
    expect(emptyPrompt.statusCode).toBe(400);
    expect(extraConfirmField.statusCode).toBe(400);
    expect(snapshot).toHaveBeenCalledTimes(1);
  });
});
