/**
 * Characterization tests for the per-request `pre:tool` approval hook in
 * `routes/chat.ts`.
 *
 * This boundary has no executing test: the hook is registered on the request
 * hook registry, which only exists when no runner is injected, so the
 * `server.agentRunner` object seam used by the other characterization files
 * skips it entirely. These pins drive the real agent loop and replace the
 * provider at the `globalThis.fetch` link seam instead, which is the only
 * harness that reaches the hook (docs/TESTING.md "Seam caveat").
 *
 * They pin CURRENT behavior, not a specification. A bug found while pinning is
 * marked `QUIRK` and ledgered in docs/TECH-DEBT.md, never fixed here.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { WaggleConfig } from '@waggle/core';

/**
 * Argument that makes the risk classifier throw, and nothing else.
 *
 * The classifier is pure over the plain JSON a model can produce, so the only
 * way to reach its catch from the chat route is to make it throw on demand. The
 * production trigger is a coercion-hostile argument reaching the classifier
 * through a child sub-agent, which the route harness cannot drive — see
 * TD-CHAT-31. Every other argument delegates to the real implementation, so the
 * other pins in this file exercise the untouched classifier.
 */
const CLASSIFIER_THROW_SENTINEL = 'classifier-throw-sentinel.txt';

vi.mock('@waggle/agent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@waggle/agent')>();
  return {
    ...actual,
    classifyGatedToolRisk: (
      toolName: string,
      args?: Record<string, unknown>,
      trustedRiskLevel?: Parameters<typeof actual.classifyGatedToolRisk>[2],
    ) => {
      if (args?.path === CLASSIFIER_THROW_SENTINEL) {
        throw new TypeError('Cannot convert object to primitive value');
      }
      return actual.classifyGatedToolRisk(toolName, args, trustedRiskLevel);
    },
  };
});

/**
 * Restores the pre-narrowing tool catalog for one turn.
 *
 * A parent chat turn never transmits `install_capability`: it survives the
 * conversational gate into `effectiveTools` (80 eligible at chat.ts:4294) and
 * is then dropped by `selectToolsForTurn` at chat.ts:4307, which matches it to
 * no `INTENT_BUNDLES` entry and to no `mandatoryToolNames` branch — six
 * phrasings of an install request all transmit only `create_skill` and
 * `search_skills`, and the forced call returns `Tool "install_capability" not
 * found`. The production caller that does reach the enrichment is a spawned
 * sub-agent: `spawnAvailableTools` is captured before narrowing (chat.ts:3947),
 * filtered only by governance (4133) and turn policy (4152), and handed to
 * workers at 4261, so a child sees the full pool and inherits the parent's hook
 * registry. The route harness cannot drive that child, so these two pins widen
 * the parent's catalog to the same set instead — the same tactic, and the same
 * reason, as CLASSIFIER_THROW_SENTINEL above.
 */
const toolSelection = vi.hoisted(() => ({ transmitFullCatalog: false }));

vi.mock('../../src/local/persona-tool-filter.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/local/persona-tool-filter.js')>();
  return {
    ...actual,
    selectToolsForTurn: (
      eligibleTools: Parameters<typeof actual.selectToolsForTurn>[0],
      options: Parameters<typeof actual.selectToolsForTurn>[1],
    ) => {
      const selection = actual.selectToolsForTurn(eligibleTools, options);
      if (!toolSelection.transmitFullCatalog) return selection;
      // schemaChars stays as the real selector measured it: no pin here asserts
      // the transmitted schema budget, and recomputing it would claim a
      // measurement this harness does not make.
      return { ...selection, tools: [...eligibleTools], omittedCount: 0 };
    },
  };
});

import { buildLocalServer } from '../../src/local/index.js';
import { injectWithAuth, resetRateLimiter, parseSSE } from '../test-utils.js';

/** The turn asks the provider to stream, so every stub answers as an SSE body. */
function sseBody(...frames: unknown[]): Response {
  const payload = frames.map(frame => `data: ${JSON.stringify(frame)}\n\n`).join('') + 'data: [DONE]\n\n';
  return new Response(payload, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

/** One OpenAI-compatible tool call. */
function toolCallResponse(name: string, args: Record<string, unknown>): Response {
  return sseBody(
    {
      choices: [{
        delta: {
          tool_calls: [{
            index: 0,
            id: `call-${name}`,
            type: 'function',
            function: { name, arguments: JSON.stringify(args) },
          }],
        },
        finish_reason: null,
      }],
    },
    {
      choices: [{ delta: {}, finish_reason: 'tool_calls' }],
      usage: { prompt_tokens: 10, completion_tokens: 2 },
    },
  );
}

/** A plain assistant answer. */
function textResponse(content: string): Response {
  return sseBody(
    { choices: [{ delta: { content }, finish_reason: null }] },
    {
      choices: [{ delta: {}, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 3 },
    },
  );
}

describe('POST /api/chat pre-tool approval hook (characterization)', () => {
  let server: FastifyInstance;
  let tmpDir: string;
  let originalFetch: typeof globalThis.fetch;
  const originalTimeout = process.env.WAGGLE_APPROVAL_TIMEOUT_MS;
  const originalTimeoutAction = process.env.WAGGLE_APPROVAL_TIMEOUT_ACTION;

  beforeAll(async () => {
    // The timeout policy is resolved once when the chat plugin registers, so it
    // has to be in the environment before the server is built. A short deny
    // keeps every pin terminating without a client on the other end.
    process.env.WAGGLE_APPROVAL_TIMEOUT_MS = '750';
    process.env.WAGGLE_APPROVAL_TIMEOUT_ACTION = 'deny';

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-approval-hook-'));
    server = await buildLocalServer({ dataDir: tmpDir });
    // No `server.agentRunner`: the request hook registry, and therefore the
    // approval hook, only exists on the real agent-loop path.
    server.vault.set('anthropic', 'sk-approval-hook-pin');
    server.agentState.llmProvider = {
      provider: 'anthropic-proxy',
      health: 'healthy',
      detail: 'test',
      checkedAt: new Date().toISOString(),
    };
    const config = new WaggleConfig(tmpDir);
    config.save();
    originalFetch = globalThis.fetch;
  });

  afterAll(async () => {
    globalThis.fetch = originalFetch;
    if (originalTimeout === undefined) delete process.env.WAGGLE_APPROVAL_TIMEOUT_MS;
    else process.env.WAGGLE_APPROVAL_TIMEOUT_MS = originalTimeout;
    if (originalTimeoutAction === undefined) delete process.env.WAGGLE_APPROVAL_TIMEOUT_ACTION;
    else process.env.WAGGLE_APPROVAL_TIMEOUT_ACTION = originalTimeoutAction;
    await server.close();
    await new Promise(r => setTimeout(r, 100));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* EBUSY on Windows */ }
  });

  /**
   * Asks for `toolName` until that tool's result comes back, then answers with
   * text, so the loop makes exactly one gated tool call and finishes.
   */
  function stubProvider(toolName: string, args: Record<string, unknown>) {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/tags')) {
        return new Response(JSON.stringify({ models: [] }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        });
      }
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        messages?: Array<{ role?: string }>;
      };
      // Ask for the tool until its result comes back: keying on the outcome
      // rather than a call counter keeps the stub correct however many
      // availability probes the route makes first.
      const toolAnswered = (body.messages ?? []).some(m => m.role === 'tool');
      return toolAnswered ? textResponse('done') : toolCallResponse(toolName, args);
    }) as typeof globalThis.fetch;
  }

  /**
   * One workspace per pin. A chat runtime and its tool pool are cached per
   * workspace session, and a second turn on a reused workspace was observed
   * reaching the model with an empty tool catalog, which would make these pins
   * order-dependent. Recorded as TD-CHAT-32.
   */
  function createWorkspace(label: string): string {
    return server.workspaceManager.create({
      name: `approval hook ${label} ${Date.now()}`,
      group: 'test',
      directory: tmpDir,
    }).id;
  }

  async function runTurn(
    workspaceId: string,
    message: string,
    session: string,
    extraPayload: Record<string, unknown> = {},
  ) {
    resetRateLimiter(server);
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: {
        message, workspace: workspaceId, session, model: 'claude-sonnet-4-6',
        ...extraPayload,
      },
    });
    // Each pin opens its own workspace, and the session manager caps live
    // workspace sessions at the tier limit (FREE = 10), so the eleventh pin
    // was refused with "not ready for chat". Release the session per turn.
    server.sessionManager.close(workspaceId);
    return { status: res.statusCode, events: parseSSE(res.body) };
  }

  /**
   * Runs a turn and answers its first approval card through the real
   * `/api/approval/:requestId` route while the hook is waiting on it.
   */
  async function runTurnAnswering(
    workspaceId: string,
    message: string,
    session: string,
    approved: boolean,
  ) {
    let answered: { status: number; body: Record<string, unknown> } | undefined;
    let stop = false;
    const answer = (async () => {
      while (!stop && !answered) {
        const [requestId] = server.agentState.pendingApprovals.keys();
        if (requestId) {
          const res = await injectWithAuth(server, {
            method: 'POST',
            url: `/api/approval/${requestId}`,
            payload: { approved },
          });
          answered = { status: res.statusCode, body: JSON.parse(res.body) };
          return;
        }
        await new Promise(r => setTimeout(r, 10));
      }
    })();
    try {
      const turn = await runTurn(workspaceId, message, session);
      return { ...turn, answered };
    } finally {
      stop = true;
      await answer;
    }
  }

  function stepContents(events: Array<{ event: string; data: string }>): string[] {
    return events
      .filter(e => e.event === 'step')
      .map(e => JSON.parse(e.data).content as string);
  }

  function toolResultText(events: Array<{ event: string; data: string }>, name: string): string | undefined {
    const toolResult = events.find(e => e.event === 'tool_result' && JSON.parse(e.data).name === name);
    return toolResult ? JSON.parse(toolResult.data).result as string : undefined;
  }

  it('enriches a gated tool approval, then denies it when no client answers', async () => {
    stubProvider('write_file', { path: 'notes.txt', content: 'hello' });
    const { status, events } = await runTurn(
      createWorkspace('enrichment'),
      'Write hello into notes.txt',
      'approval-enrichment',
    );
    expect(status).toBe(200);
    const approval = events.find(e => e.event === 'approval_required');
    expect(approval).toBeDefined();
    const payload = JSON.parse(approval!.data) as Record<string, unknown>;
    expect(payload.toolName).toBe('write_file');
    expect(payload.input).toEqual({ path: 'notes.txt', content: 'hello' });
    // The heuristic mapping, not the richer content-based assessment: that one
    // is reserved for install_capability.
    expect(payload.assessmentMode).toBe('heuristic');
    expect(payload.riskLevel).toBe('medium');
    expect(payload.approvalClass).toBe('elevated');
    expect(typeof payload.description).toBe('string');

    // No client answers, so the configured timeout denies the call. The turn
    // still completes: the denial reaches the model as a tool result and the
    // loop answers without the tool, which never ran.
    expect(events.some(e => e.event === 'step' && JSON.parse(e.data).content === '✖ write_file denied by user')).toBe(true);
    expect(events.some(e => e.event === 'done')).toBe(true);
    expect(JSON.parse(events.find(e => e.event === 'done')!.data).toolsUsed).toEqual([]);
    expect(fs.existsSync(path.join(tmpDir, 'notes.txt'))).toBe(false);
    // Deliberately absent: there is no provenance signal for a plain file
    // write, and stamping one would be a false claim on the trust surface.
    expect(payload.trustSource).toBeUndefined();
  });

  it('denies the tool without an approval card when the classifier throws', async () => {
    stubProvider('write_file', { path: CLASSIFIER_THROW_SENTINEL, content: 'hello' });
    const { status, events } = await runTurn(
      createWorkspace('classifier-throw'),
      'Write hello into the sentinel file',
      'approval-classifier-throw',
    );
    expect(status).toBe(200);

    // A tool nobody could classify is not offered for approval: the card would
    // carry no risk class, and the client reads an absent approval class as
    // permission to show "Always allow".
    expect(events.some(e => e.event === 'approval_required')).toBe(false);

    // The call is denied by the classification failure itself, and the turn
    // still completes because the denial reaches the model as a tool result.
    expect(events.some(e => e.event === 'done')).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, CLASSIFIER_THROW_SENTINEL))).toBe(false);
  });

  /**
   * The two `install_capability` pins below are a pair on purpose.
   *
   * `assessmentMode` does NOT discriminate the content-based assessment from
   * its catch: `assessTrust` returns `'heuristic'` itself whenever the starter
   * skill file is absent, so an absent file and a thrown assessment look
   * identical on that field. `trustSource` is the only separator — the try
   * branch copies it off the assessment, and the heuristic fallback omits it
   * deliberately. Pinning the absence without the presence beside it would be
   * vacuous.
   */
  it('carries a trustSource when the install_capability trust assessment succeeds', async () => {
    stubProvider('install_capability', { name: 'research-assistant', source: 'marketplace' });
    toolSelection.transmitFullCatalog = true;
    let status: number, events: Array<{ event: string; data: string }>;
    try {
      ({ status, events } = await runTurn(
        createWorkspace('install-assessed'),
        'Install the research-assistant capability',
        'approval-install-assessed',
      ));
    } finally {
      toolSelection.transmitFullCatalog = false;
    }
    expect(status).toBe(200);
    const approval = events.find(e => e.event === 'approval_required');
    expect(approval).toBeDefined();
    const payload = JSON.parse(approval!.data) as Record<string, unknown>;
    expect(payload.toolName).toBe('install_capability');
    // `marketplace` is not a case in resolveTrustSource, so provenance reads
    // `unknown` (5 risk points) and the empty starter-skill file adds the
    // missing-metadata point: classifyRisk(6) is `high`, whose approval class
    // is `critical`. These are the values the catch below throws away.
    expect(payload.trustSource).toBe('unknown');
    expect(payload.riskLevel).toBe('high');
    expect(payload.approvalClass).toBe('critical');
    expect(payload.assessmentMode).toBe('heuristic');
    expect(typeof payload.explanation).toBe('string');
    expect(payload.permissions).toBeDefined();
  });

  it('denies the install when the install_capability trust assessment throws', async () => {
    // `path.basename` receives the model-supplied name unvalidated, so a
    // non-string name throws ERR_INVALID_ARG_TYPE inside the assessment try --
    // ordinary JSON, no mock.
    stubProvider('install_capability', { name: 123, source: 'marketplace' });
    toolSelection.transmitFullCatalog = true;
    let status: number, events: Array<{ event: string; data: string }>;
    try {
      ({ status, events } = await runTurn(
        createWorkspace('install-throw'),
        'Install capability number 123',
        'approval-install-throw',
      ));
    } finally {
      toolSelection.transmitFullCatalog = false;
    }
    expect(status).toBe(200);

    // An install nobody could assess is an unknown install, not a medium one.
    // Until 2026-09-16 the catch fell through to the heuristic block and the
    // same install was offered as medium/elevated -- weaker than the
    // high/critical the assessment produces for it (pinned above), with
    // `assessmentMode: heuristic` on both paths so the card could not be told
    // apart. It is now refused outright, like a tool nobody could classify.
    expect(events.some(e => e.event === 'approval_required')).toBe(false);

    // The turn still completes: the denial reaches the model as a tool result
    // and the loop answers without the tool.
    expect(events.some(e => e.event === 'done')).toBe(true);
  });

  it('discloses an unreadable tool argument and blocks the tool without ending the turn', async () => {
    // `{"toString": 0}` is ordinary JSON a model can emit. `??` does not shield
    // it: the value is non-nullish, so ToString runs, `toString` is not
    // callable, and the inherited `valueOf` returns an object -- TypeError.
    stubProvider('write_file', { path: { toString: 0 }, content: 'hello' });
    toolSelection.transmitFullCatalog = true;
    let status: number, events: Array<{ event: string; data: string }>;
    try {
      ({ status, events } = await runTurn(
        createWorkspace('coercion'),
        'Write hello into notes.txt',
        'approval-coercion',
      ));
    } finally {
      toolSelection.transmitFullCatalog = false;
    }
    expect(status).toBe(200);

    // The two disclosures survive the unreadable argument. Until 2026-09-16
    // both coerced it bare, and the first one to run ended the whole turn with
    // an SSE `error` carrying `Cannot convert object to primitive value`
    // verbatim and no `done` at all.
    const step = events.find(e => e.event === 'step' && JSON.parse(e.data).content?.startsWith('Writing file:'));
    expect(step).toBeDefined();
    // The prefix is a wire contract: session-utils re-parses it out of stored
    // assistant prose, so the marker is substituted inside the sentence rather
    // than the sentence being replaced.
    expect(JSON.parse(step!.data).content).toBe('Writing file: <unreadable>...');
    // The sibling disclosure asserts a fact it cannot state, so it is dropped
    // rather than faked.
    expect(events.some(e => e.event === 'file_created')).toBe(false);

    // No approval card: a call whose arguments cannot be read is not a
    // low-risk call, it is an undecidable one, so the hook refuses it outright
    // rather than offering it. Until 2026-09-17 the same outcome was reached by
    // accident -- `keyForTool` threw inside the saved-grant lookup,
    // `HookRegistry.fire` swallowed it with no log, and the execution floor was
    // what actually refused the call, reporting its own generic message.
    expect(events.some(e => e.event === 'approval_required')).toBe(false);
    const toolResult = events.find(e => e.event === 'tool_result' && JSON.parse(e.data).name === 'write_file');
    expect(toolResult).toBeDefined();
    expect(JSON.parse(toolResult!.data).result)
      .toBe('[BLOCKED] write_file could not be risk-assessed, so it was not run.');

    // The turn completes: the denial reaches the model as a tool result.
    expect(events.some(e => e.event === 'done')).toBe(true);
    expect(JSON.parse(events.find(e => e.event === 'done')!.data).toolsUsed).toEqual([]);
  });

  it('blocks a gated tool whose confirmation predicate cannot read its argument', async () => {
    // `bash` gates on its command text: `needsConfirmation` coerces
    // `args.command` to look for chain operators. `{"toString": 0}` is ordinary
    // JSON, so the predicate throws at the FIRST hook site -- before the
    // saved-grant lookup the sibling pin below reaches, and before any
    // approval decision is taken.
    //
    // `classifyGatedTool` already survives this argument: it catches the same
    // coercion and returns `classified: false`. But the hook only reads that
    // flag deep inside the approval enrichment, long after the predicate above
    // has thrown. Totality at the classifier buys nothing while the check that
    // reads it runs last.
    stubProvider('bash', { command: { toString: 0 } });
    toolSelection.transmitFullCatalog = true;
    let status: number, events: Array<{ event: string; data: string }>;
    try {
      ({ status, events } = await runTurn(
        createWorkspace('predicate-coercion'),
        'Run a shell command',
        'approval-predicate-coercion',
      ));
    } finally {
      toolSelection.transmitFullCatalog = false;
    }
    expect(status).toBe(200);

    // The disclosure survives the unreadable argument (the half of TD-CHAT-36
    // closed by `99d50139`), so the client is told a command is starting.
    expect(events.some(e => e.event === 'step'
      && JSON.parse(e.data).content === 'Running command: <unreadable>...')).toBe(true);
    expect(events.some(e => e.event === 'tool' && JSON.parse(e.data).name === 'bash')).toBe(true);

    // The hook now decides this before any predicate reads the argument, so the
    // refusal is explicit and reported. Until 2026-09-17 the predicate throw
    // escaped to `HookRegistry.fire`, which swallowed it with no log, and the
    // same coercion threw AGAIN inside the tool-executor floor -- so the call
    // never ran, but neither an approval card nor a `tool_result` was ever
    // emitted and the client kept an announced tool that never resolved.
    expect(events.some(e => e.event === 'approval_required')).toBe(false);
    const toolResult = events.find(e => e.event === 'tool_result' && JSON.parse(e.data).name === 'bash');
    expect(toolResult).toBeDefined();
    expect(JSON.parse(toolResult!.data).result)
      .toBe('[BLOCKED] bash could not be risk-assessed, so it was not run.');

    // The turn itself still completes and the tool is counted as unused.
    expect(events.some(e => e.event === 'done')).toBe(true);
    expect(JSON.parse(events.find(e => e.event === 'done')!.data).toolsUsed).toEqual([]);
  });

  it('denies every held proposal, because a proposeHeld turn is an automated turn', async () => {
    // A `proposeHeld` turn is meant to convert a gated proposable tool into a
    // DURABLE held action that ApprovalsApp shows, rather than a live SSE
    // prompt no headless caller can answer. The arguments here are perfectly
    // readable -- this pin is about the branch, not about coercion.
    stubProvider('write_file', { path: 'notes.txt', content: 'hello' });
    toolSelection.transmitFullCatalog = true;
    let status: number, events: Array<{ event: string; data: string }>;
    try {
      ({ status, events } = await runTurn(
        createWorkspace('held-proposal'),
        'Write hello into notes.txt',
        'approval-held-proposal',
        { proposeHeld: true },
      ));
    } finally {
      toolSelection.transmitFullCatalog = false;
    }
    expect(status).toBe(200);

    // The proposal is PARKED, not dropped. Until 2026-09-17 `proposeHeld` fed
    // `isAutomatedTurn`, an automated turn was a read-only persistence
    // boundary, and this branch refused to enqueue without derived persistence
    // -- so the guard fired on every proposeHeld turn and
    // `decideReviewTurnTool`, whose only caller is this branch, was unreachable
    // (TD-CHAT-46). Parking a proposal is a pending decision, not a learned
    // fact, so the memory boundary no longer governs it.
    const approval = events.find(e => e.event === 'approval_required');
    expect(approval).toBeDefined();
    const payload = JSON.parse(approval!.data) as Record<string, unknown>;
    expect(payload.toolName).toBe('write_file');
    expect(payload.held).toBe(true);
    expect(events.some(e => e.event === 'step'
      && JSON.parse(e.data).content === '\u{1F4CB} write_file held for your approval')).toBe(true);

    // The tool is blocked while the proposal waits for a human.
    const toolResult = events.find(e => e.event === 'tool_result' && JSON.parse(e.data).name === 'write_file');
    expect(toolResult).toBeDefined();
    expect(JSON.parse(toolResult!.data).result).toBe('[BLOCKED] Review turn: write_file held for approval');
    expect(JSON.parse(toolResult!.data).isError).toBe(true);

    // Nothing was written, so nothing claims it was. `file_created` keys off
    // `!isError`, and a `[BLOCKED]` result is a failure -- without that, a
    // denied write announced a file that does not exist.
    expect(events.some(e => e.event === 'file_created')).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, 'notes.txt'))).toBe(false);

    expect(events.some(e => e.event === 'done')).toBe(true);
    expect(JSON.parse(events.find(e => e.event === 'done')!.data).toolsUsed).toEqual([]);
  });

  it('blocks a decidable tool whose description cannot be built', async () => {
    // Every security decider reads this call fine: the risk classifier touches
    // no argument for `create_skill`, `needsConfirmation` is a set membership
    // test, and `keyForTool` returns '*'. Only the human-readable description
    // reads `name`, and it cannot.
    stubProvider('create_skill', { name: { toString: 0 }, content: 'hello' });
    toolSelection.transmitFullCatalog = true;
    let status: number, events: Array<{ event: string; data: string }>;
    try {
      ({ status, events } = await runTurn(
        createWorkspace('describe-coercion'),
        'Create a skill',
        'approval-describe-coercion',
      ));
    } finally {
      toolSelection.transmitFullCatalog = false;
    }
    expect(status).toBe(200);

    // The disclosure outside the hook is total and says so.
    expect(events.some(e => e.event === 'step'
      && JSON.parse(e.data).content === 'Creating skill: <unreadable>...')).toBe(true);

    // The description built INSIDE the hook is deliberately not total: it is
    // how the operator reads the card, so a card it cannot render is refused
    // rather than offered with a marker (founder 2026-09-17). What changed is
    // that the refusal is now taken here, with a reason, instead of being a
    // swallowed throw the execution floor cleaned up with a generic message.
    expect(events.some(e => e.event === 'approval_required')).toBe(false);
    const toolResult = events.find(e => e.event === 'tool_result' && JSON.parse(e.data).name === 'create_skill');
    expect(toolResult).toBeDefined();
    expect(JSON.parse(toolResult!.data).result)
      .toBe('[BLOCKED] create_skill could not be described, so it was not run.');

    expect(events.some(e => e.event === 'done')).toBe(true);
    expect(JSON.parse(events.find(e => e.event === 'done')!.data).toolsUsed).toEqual([]);
  });

  it('auto-approves a gated tool at elevated autonomy and says why', async () => {
    stubProvider('write_file', { path: 'autonomy.txt', content: 'hello' });
    const { status, events } = await runTurn(
      createWorkspace('autonomy'),
      'Write hello into notes.txt',
      'approval-autonomy',
      { autonomy: { level: 'yolo' } },
    );
    expect(status).toBe(200);
    expect(events.some(e => e.event === 'approval_required')).toBe(false);
    expect(stepContents(events)).toContain('⚡ write_file auto-approved (yolo)');
    expect(JSON.parse(events.find(e => e.event === 'done')!.data).toolsUsed).toEqual(['write_file']);
  });

  it('skips the card when a saved grant covers the call', async () => {
    const args = { path: 'granted.txt', content: 'hello' };
    const workspaceId = createWorkspace('saved-grant');
    server.agentState.approvalGrantStore.grant('write_file', args, workspaceId);
    stubProvider('write_file', args);
    const { status, events } = await runTurn(workspaceId, 'Write hello into notes.txt', 'approval-saved-grant');
    expect(status).toBe(200);
    expect(events.some(e => e.event === 'approval_required')).toBe(false);
    expect(stepContents(events)).toContain('✔ write_file allowed by saved grant');
    expect(JSON.parse(events.find(e => e.event === 'done')!.data).toolsUsed).toEqual(['write_file']);
  });

  it('runs the tool when the client approves the card', async () => {
    stubProvider('write_file', { path: 'approved.txt', content: 'hello' });
    const { status, events, answered } = await runTurnAnswering(
      createWorkspace('approved'),
      'Write hello into notes.txt',
      'approval-approved',
      true,
    );
    expect(status).toBe(200);
    expect(answered).toEqual({
      status: 200,
      body: expect.objectContaining({ ok: true, approved: true }),
    });
    expect(events.some(e => e.event === 'approval_required')).toBe(true);
    expect(stepContents(events)).toContain('✔ write_file approved');
    expect(JSON.parse(events.find(e => e.event === 'done')!.data).toolsUsed).toEqual(['write_file']);
  });

  it('blocks the tool when the client denies the card', async () => {
    stubProvider('write_file', { path: 'denied.txt', content: 'hello' });
    const { status, events, answered } = await runTurnAnswering(
      createWorkspace('denied'),
      'Write hello into notes.txt',
      'approval-denied',
      false,
    );
    expect(status).toBe(200);
    expect(answered).toEqual({
      status: 200,
      body: expect.objectContaining({ ok: true, approved: false }),
    });
    expect(stepContents(events)).toContain('✖ write_file denied by user');
    expect(toolResultText(events, 'write_file')).toBe('[BLOCKED] User denied write_file');
    expect(JSON.parse(events.find(e => e.event === 'done')!.data).toolsUsed).toEqual([]);
  });
});
