/**
 * Waggle ↔ τ² bridge server (Approach A+, direct-call tool forwarding).
 *
 *   GET  /health  → { ok: true }
 *   POST /seed    → append a history message to a session WITHOUT calling the LLM
 *                   (replays τ²'s message_history; forwards tool_calls/tool_call_id).
 *   POST /turn    → run one agent turn for a session.
 *     body: { session_id, model, domain_policy,
 *             tools:[{name,description,parameters}],
 *             message?:{role:'user',content} | tool_results?:[{id,content,error?}] }
 *     resp: { content|null, tool_calls|null, usage:{inputTokens,outputTokens},
 *             tools_used, turn_count }
 *
 * TOOL FORWARDING: the bridge keeps a per-session OpenAI-wire message history and
 * issues ONE litellm /chat/completions call per τ² turn (see ./llm-client.ts). It
 * does NOT run @waggle/agent's runAgentLoop — in this cell τ² owns the loop, the
 * tool executor, the gates and the loop-guard, so "Waggle under test" narrows to
 * system-prompt assembly (the AGENT_INSTRUCTION wrap + frozen recalled memory).
 * The bridge FORWARDS the model's tool_calls to τ² (which executes the REAL tools)
 * and THREADS τ²'s tool results back as role:'tool' messages on the next turn, so
 * τ²'s DB-state oracle can score > 0. packages/agent/src/agent-loop.ts is UNCHANGED.
 *
 * Wire invariants (litellm translates these to valid Anthropic for opus and feeds
 * them natively to qwen): a tool-call assistant message stores content:'' (EMPTY
 * STRING, never null — LiteLLM→Anthropic compat) + tool_calls; a text assistant
 * message stores non-empty content (EMPTY_FALLBACK guards the degenerate empty
 * turn that would otherwise crash τ²'s AssistantMessage.validate()). The LLM call
 * happens AFTER appending the incoming user/tool message and BEFORE appending the
 * assistant reply, so the request never ends on an assistant message.
 */

import http from 'node:http';
import { HybridSearch, MindDB, createOllamaEmbedder, type Embedder } from '@waggle/core';
import { formatRecalled } from '../../harness/src/continual/arm-runner.js';
import { callChatCompletion, normalizeTools, type WireMessage } from './llm-client.js';

/** τ²'s own agent instruction (verbatim from upstream llm_agent.py AGENT_INSTRUCTION).
 *  Held constant across all four arms so model + recalled-memory are the only
 *  cross-arm variables. BEHAVIORAL_SPEC is deliberately NOT injected. */
const AGENT_INSTRUCTION = [
  'You are a customer service agent that helps the user according to the <policy> provided below.',
  'In each turn you can either:',
  '- Send a message to the user.',
  '- Make a tool call.',
  'You cannot do both at the same time.',
  '',
  'Try to be helpful and always follow the policy. Always make sure you generate valid JSON only.',
].join('\n');

/** Benign user-facing message for the degenerate "no content, no tool_calls"
 *  turn — keeps content non-empty so τ²'s validate() doesn't crash run(). */
const EMPTY_FALLBACK = "I'm sorry, could you clarify what you'd like me to help with?";

/** Recall query → recalled "# Recalled Memories" block (memory-ON seam). */
export type BridgeRecallFn = (query: string) => Promise<string>;

export interface WaggleBridgeOptions {
  /** TCP port; 0 = ephemeral. */
  port: number;
  /** LiteLLM proxy for the chat-completions call. */
  litellmUrl: string;
  litellmApiKey: string;
  /** Injected for tests; defaults to globalThis.fetch. */
  llmFetch?: typeof fetch;
  /**
   * Injected recall for tests/alternate backends. When provided it OVERRIDES the
   * mindPath/HybridSearch path: the bridge calls recallFn(firstUserMessage) once
   * per session (freeze-per-task) and appends the returned block to the system
   * prompt. Omitted ⇒ mindPath drives recall; both omitted ⇒ memory-OFF.
   */
  recallFn?: BridgeRecallFn;
  /**
   * Memory-ON: path to a FROZEN mind file. When set (and no recallFn), each
   * session recalls the mind ONCE (query = first user message, freeze-per-task)
   * and the "# Recalled Memories" block is appended to the system prompt.
   */
  mindPath?: string;
  /** Embedder for recall; must match the frozen mind's dimension. Defaults to
   *  createOllamaEmbedder() (nomic, 1024-d) when `mindPath` is set. */
  embedder?: Embedder;
  /** Recall top-K. Default 10. */
  recallLimit?: number;
}

/** Cumulative agent-side usage across all sessions this bridge served — the
 *  authoritative per-arm efficiency source for the pilot (one bridge per arm). */
export interface BridgeStats {
  inputTokens: number;
  outputTokens: number;
  /** Number of agent turns (chat-completion calls) served. */
  turns: number;
}

export interface WaggleBridgeHandle {
  url: string;
  port: number;
  /** Cumulative agent token usage + turn count (read after an arm completes). */
  stats(): BridgeStats;
  close(): Promise<void>;
}

/** One element of /seed | /turn message input (forwards tool history too). */
interface SeedMessage {
  role: string;
  content?: string | null;
  tool_calls?: Array<{ id: string; type?: 'function'; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}

interface TurnRequest {
  session_id: string;
  model: string;
  domain_policy: string;
  tools: Array<{ name: string; description: string; parameters: Record<string, unknown> }>;
  /** User-sim turn (XOR with tool_results). */
  message?: { role: string; content: string };
  /** Environment turn — 1 entry for a ToolMessage, N for a MultiToolMessage. */
  tool_results?: Array<{ id: string; content?: string; error?: boolean }>;
}

interface SessionState {
  /** Append-only OpenAI-wire history (system is rebuilt fresh each turn, not stored). */
  messages: WireMessage[];
  userTurns: number;
  /** Recalled block, frozen at the first user turn (memory-ON). `undefined`
   *  until recall has run; memory-OFF leaves it `undefined` forever. */
  recalledBlock?: string;
}

function buildSystemPrompt(domainPolicy: string, recalledBlock: string | undefined): string {
  const base = `<instructions>\n${AGENT_INSTRUCTION}\n</instructions>\n<policy>\n${domainPolicy}\n</policy>`;
  return recalledBlock ? `${base}\n\n${recalledBlock}` : base;
}

function safeJsonParse(s: string | undefined): Record<string, unknown> {
  if (!s) return {};
  try {
    const v = JSON.parse(s);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch (err) {
    if (process.env.WAGGLE_BRIDGE_STRICT_ARGS) {
      throw new Error(`malformed tool-call arguments JSON: ${err instanceof Error ? err.message : String(err)}`);
    }
    console.error(`[bridge] malformed tool-call arguments JSON (lenient {} default): ${JSON.stringify(s).slice(0, 200)}`);
    return {};
  }
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf-8');
}

/** Append a /seed|/turn-history message to a session's wire, preserving tool
 *  history (assistant.tool_calls, tool.tool_call_id). Returns whether it was a
 *  user message (so callers can bump userTurns). */
function pushHistoryMessage(state: SessionState, m: SeedMessage): boolean {
  if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0) {
    state.messages.push({
      role: 'assistant',
      content: '',
      tool_calls: m.tool_calls.map(tc => ({ id: tc.id, type: 'function', function: { name: tc.function.name, arguments: tc.function.arguments } })),
    });
    return false;
  }
  if (m.role === 'tool') {
    state.messages.push({ role: 'tool', content: m.content ?? '', tool_call_id: m.tool_call_id });
    return false;
  }
  state.messages.push({ role: m.role as WireMessage['role'], content: m.content ?? '' });
  return m.role === 'user';
}

export function startWaggleBridge(opts: WaggleBridgeOptions): Promise<WaggleBridgeHandle> {
  const llmFetch = opts.llmFetch ?? globalThis.fetch;
  const sessions = new Map<string, SessionState>();

  // Memory-ON: a recallFn override takes precedence; else open the frozen mind
  // read-only for HybridSearch recall. Neither ⇒ memory-OFF.
  const recallLimit = opts.recallLimit ?? 10;
  let mind: MindDB | undefined;
  let search: HybridSearch | undefined;
  if (!opts.recallFn && opts.mindPath) {
    mind = new MindDB(opts.mindPath);
    search = new HybridSearch(mind, opts.embedder ?? createOllamaEmbedder());
  }
  const recallEnabled = Boolean(opts.recallFn || search);
  const recall = async (query: string): Promise<string> => {
    if (opts.recallFn) return opts.recallFn(query);
    const results = await search!.search(query, { limit: recallLimit, profile: 'balanced' });
    console.error(`[bridge] memory-ON recall: frames=${results.length} q=${JSON.stringify(query.slice(0, 80))}`);
    return formatRecalled(results);
  };

  // Cumulative agent usage (efficiency signal). One bridge per arm.
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let turnCount = 0;

  const server = http.createServer((req, res) => {
    void (async () => {
      try {
        if (req.method === 'GET' && req.url === '/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
          return;
        }
        if (req.method === 'POST' && req.url === '/seed') {
          // Append a history message WITHOUT calling the LLM — replicates the
          // stock agent's get_init_state (history is recorded; only
          // generate_next_message calls the model). Forwards tool history so a
          // retail task with initial_state tool calls round-trips.
          const body = JSON.parse(await readBody(req)) as { session_id?: string; message?: SeedMessage };
          if (!body.session_id) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'session_id is required' }));
            return;
          }
          const state = sessions.get(body.session_id) ?? { messages: [], userTurns: 0 };
          if (body.message) {
            if (pushHistoryMessage(state, body.message)) state.userTurns += 1;
          }
          sessions.set(body.session_id, state);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
          return;
        }
        if (req.method === 'POST' && req.url === '/turn') {
          const body = JSON.parse(await readBody(req)) as Partial<TurnRequest>;
          if (!body.session_id || typeof body.model !== 'string' || body.model.length === 0) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'session_id and a non-empty model are required' }));
            return;
          }
          const state = sessions.get(body.session_id) ?? { messages: [], userTurns: 0 };

          // Append the incoming message. tool_results (env turn) push role:'tool'
          // per result and NEVER trigger recall / bump userTurns. A user message
          // pushes role:'user', bumps userTurns and is the recall query.
          let firstUserContent: string | undefined;
          if (body.tool_results && body.tool_results.length > 0) {
            for (const r of body.tool_results) {
              state.messages.push({ role: 'tool', content: r.content ?? '', tool_call_id: r.id });
            }
          } else if (body.message?.role === 'user') {
            const content = body.message.content ?? '';
            state.messages.push({ role: 'user', content });
            state.userTurns += 1;
            firstUserContent = content;
          } else {
            // Nothing to append → the wire would end on the prior assistant turn
            // (Anthropic prefill-rejection). The Python forwarder always sends a
            // user message XOR tool_results; guard the raw HTTP surface anyway.
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'a user message or tool_results is required' }));
            return;
          }

          // Memory-ON recall (freeze-per-task): recall ONCE on the first user
          // turn and reuse for every subsequent turn. Errors are NOT swallowed —
          // a 500 surfaces a broken memory arm rather than silently degrading it.
          if (recallEnabled && state.recalledBlock === undefined && firstUserContent !== undefined) {
            state.recalledBlock = await recall(firstUserContent);
          }

          const systemPrompt = buildSystemPrompt(body.domain_policy ?? '', state.recalledBlock);
          const wire: WireMessage[] = [{ role: 'system', content: systemPrompt }, ...state.messages];

          if (process.env.WAGGLE_BRIDGE_DEBUG) {
            console.error(
              `[bridge] turn model=${body.model} ` +
              `incoming=${body.tool_results ? `tool_results[${body.tool_results.length}]` : body.message?.role} ` +
              `roles=[${state.messages.map(m => m.role).join(',')}]`,
            );
          }

          const result = await callChatCompletion(llmFetch, {
            url: `${opts.litellmUrl}/chat/completions`,
            apiKey: opts.litellmApiKey,
            model: body.model,
            messages: wire,
            tools: normalizeTools(body.tools ?? []),
            tool_choice: 'auto',
          });
          totalInputTokens += result.usage.inputTokens;
          totalOutputTokens += result.usage.outputTokens;
          turnCount += 1;

          let out: { content: string | null; tool_calls: Array<{ id: string; name: string; arguments: Record<string, unknown> }> | null };
          let toolsUsed: string[];

          if (result.toolCalls.length > 0) {
            // PREFER tool_calls: drop any accompanying text. Parse each arg blob
            // ONCE and store its RE-SERIALIZED form on the wire so the wire is
            // always valid JSON identical to what τ² received — re-sending a
            // verbatim malformed blob next turn would make litellm→Anthropic 400
            // and crash the whole session (infra-excluded → biased denominators).
            // Mint a stable id when the model omitted one OR emitted a duplicate
            // within the turn (Anthropic requires unique tool_use ids; τ² asserts
            // tc.id == tm.id when threading results back), STORING that same id.
            const seenIds = new Set<string>();
            const norm = result.toolCalls.map((tc, i) => {
              let id = tc.id && tc.id.length > 0 ? tc.id : `call_${turnCount}_${i}`;
              if (seenIds.has(id)) id = `call_${turnCount}_${i}`;
              seenIds.add(id);
              return { id, name: tc.fn.name, argsObj: safeJsonParse(tc.fn.arguments) };
            });
            state.messages.push({
              role: 'assistant',
              content: '', // EMPTY STRING (not null) — LiteLLM→Anthropic tool_use compat
              tool_calls: norm.map(n => ({ id: n.id, type: 'function', function: { name: n.name, arguments: JSON.stringify(n.argsObj) } })),
            });
            out = { content: null, tool_calls: norm.map(n => ({ id: n.id, name: n.name, arguments: n.argsObj })) };
            toolsUsed = norm.map(n => n.name);
          } else {
            const content = (result.content ?? '').trim() ? (result.content as string) : EMPTY_FALLBACK;
            state.messages.push({ role: 'assistant', content });
            out = { content, tool_calls: null };
            toolsUsed = [];
          }

          sessions.set(body.session_id, state);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            content: out.content,
            tool_calls: out.tool_calls,
            usage: result.usage,
            tools_used: toolsUsed,
            turn_count: state.userTurns,
          }));
          return;
        }
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'not found' }));
      } catch (err) {
        // Surface the cause: τ²'s urllib raises HTTPError without the body, so a
        // bare "HTTP 500" in the τ² log is otherwise undiagnosable.
        console.error(`[bridge] ${req.url} 500: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
      }
    })();
  });

  return new Promise<WaggleBridgeHandle>((resolve, reject) => {
    server.on('error', reject);
    server.listen(opts.port, '127.0.0.1', () => {
      const addr = server.address();
      if (addr === null || typeof addr === 'string') {
        reject(new Error('bridge server failed to bind a TCP port'));
        return;
      }
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        port: addr.port,
        stats: () => ({ inputTokens: totalInputTokens, outputTokens: totalOutputTokens, turns: turnCount }),
        close: () => new Promise<void>((res) => server.close(() => { mind?.close(); res(); })),
      });
    });
  });
}
