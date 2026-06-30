/**
 * Waggle ↔ τ² bridge server. Owns runAgentLoop; exposes it as an HTTP backend
 * the Python τ² custom agent forwards each turn to.
 *
 *   GET  /health        → { ok: true }
 *   POST /turn          → run one agent turn for a session.
 *     body: { session_id, model, domain_policy, message:{role,content},
 *             tools:[{name,description,parameters}] }
 *     resp: { content, usage:{inputTokens,outputTokens}, tools_used, turn_count }
 *
 * The Node side keeps the per-session message list so the Python side stays
 * thin. `model` comes straight from τ²'s --agent-llm. Tools are τ²'s domain
 * tools, made executable as no-op stubs here — τ² executes the REAL tools on
 * ITS side after parsing our assistant message's tool_calls; this bridge only
 * needs the schemas so runAgentLoop can EMIT tool_calls. (See Task 6 note.)
 *
 * NOTE on tool execution model: τ²'s half-duplex contract is that the agent
 * RETURNS an AssistantMessage (possibly with tool_calls) and τ² executes the
 * tools, returning ToolMessages on the next call. Therefore runAgentLoop here
 * must run with maxTurns=1 per /turn call so it emits at most one assistant
 * message (with tool_calls) WITHOUT executing them locally, letting τ² own the
 * environment. We pass tools with a throwing `execute` so a local execution
 * attempt is a loud bug, never a silent wrong-env call.
 */

import http from 'node:http';
import { runAgentLoop as realRunAgentLoop, type AgentLoopConfig, type AgentResponse, type ToolDefinition } from '@waggle/agent';
import { HybridSearch, MindDB, createOllamaEmbedder, type Embedder } from '@waggle/core';
import { formatRecalled } from '../../harness/src/continual/arm-runner.js';

export type BridgeRunAgentLoopFn = (cfg: AgentLoopConfig) => Promise<AgentResponse>;

export interface WaggleBridgeOptions {
  /** TCP port; 0 = ephemeral. */
  port: number;
  /** LiteLLM proxy for the agent loop. */
  litellmUrl: string;
  litellmApiKey: string;
  /** Injected for tests; defaults to the real runAgentLoop. */
  runAgentLoopFn?: BridgeRunAgentLoopFn;
  /**
   * Memory-ON: path to a FROZEN mind file. When set, each session recalls the
   * mind ONCE (query = first user message, freeze-per-task) and the recalled
   * "# Recalled Memories" block is appended to the domain policy in the agent's
   * systemPrompt — the agentic equivalent of the QA arm-runner recall path.
   * OMITTED = memory-OFF (the proven B⁻ path): systemPrompt = domain policy.
   */
  mindPath?: string;
  /** Embedder for recall; must match the frozen mind's dimension. Defaults to
   *  createOllamaEmbedder() (nomic, 1024-d) when `mindPath` is set. */
  embedder?: Embedder;
  /** Recall top-K. Default 10 (matches the orchestrator recallMemory default). */
  recallLimit?: number;
}

export interface WaggleBridgeHandle {
  url: string;
  port: number;
  close(): Promise<void>;
}

interface TurnRequest {
  session_id: string;
  model: string;
  domain_policy: string;
  message: { role: string; content: string };
  tools: Array<{ name: string; description: string; parameters: Record<string, unknown> }>;
}

interface SessionState {
  messages: Array<{ role: string; content: string }>;
  userTurns: number;
  /** Recalled block, frozen at the first user turn (memory-ON). `undefined`
   *  until recall has run; memory-OFF leaves it `undefined` forever. */
  recalledBlock?: string;
}

function toToolDefinitions(
  tools: TurnRequest['tools'],
): ToolDefinition[] {
  return tools.map(t => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
    // The agent must NOT execute τ² tools locally — τ² owns the environment.
    execute: async () => {
      throw new Error(`τ² tool '${t.name}' must be executed by τ², not the bridge`);
    },
  }));
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf-8');
}

export function startWaggleBridge(opts: WaggleBridgeOptions): Promise<WaggleBridgeHandle> {
  const runFn = opts.runAgentLoopFn ?? realRunAgentLoop;
  const sessions = new Map<string, SessionState>();

  // Memory-ON: open the frozen mind read-only for recall. memory-OFF leaves
  // `search` undefined and the bridge runs the proven memory-off (B⁻) path.
  const recallLimit = opts.recallLimit ?? 10;
  let mind: MindDB | undefined;
  let search: HybridSearch | undefined;
  if (opts.mindPath) {
    mind = new MindDB(opts.mindPath);
    search = new HybridSearch(mind, opts.embedder ?? createOllamaEmbedder());
  }

  const server = http.createServer((req, res) => {
    void (async () => {
      try {
        if (req.method === 'GET' && req.url === '/health') {
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
          if (body.message) {
            state.messages.push({ role: body.message.role, content: body.message.content });
            if (body.message.role === 'user') state.userTurns += 1;
          }

          // Memory-ON recall (freeze-per-task): recall ONCE on the first user
          // turn — the kickoff message is the closest analog to the task goal —
          // and reuse the block for every subsequent turn so the mind is frozen
          // across the task (matches arm-runner's once-per-task recall + pass^k
          // freeze). Recall errors are NOT swallowed: a 500 here surfaces a
          // broken memory arm rather than silently degrading it to memory-OFF.
          if (search && state.recalledBlock === undefined && body.message?.role === 'user') {
            const results = await search.search(body.message.content, { limit: recallLimit, profile: 'balanced' });
            state.recalledBlock = formatRecalled(results);
            console.error(
              `[bridge] memory-ON recall: session=${body.session_id} frames=${results.length} ` +
              `q=${JSON.stringify(body.message.content.slice(0, 80))}`,
            );
          }
          const domainPolicy = body.domain_policy ?? '';
          const systemPrompt = state.recalledBlock
            ? `${domainPolicy}\n\n${state.recalledBlock}`
            : domainPolicy;

          const cfg: AgentLoopConfig = {
            litellmUrl: opts.litellmUrl,
            litellmApiKey: opts.litellmApiKey,
            model: body.model,
            systemPrompt,
            tools: toToolDefinitions(body.tools ?? []),
            messages: state.messages,
            // One assistant turn per τ² turn — τ² owns tool execution.
            maxTurns: 1,
          };
          const resp = await runFn(cfg);
          state.messages.push({ role: 'assistant', content: resp.content });
          sessions.set(body.session_id, state);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            content: resp.content,
            usage: resp.usage,
            tools_used: resp.toolsUsed,
            turn_count: state.userTurns,
          }));
          return;
        }
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'not found' }));
      } catch (err) {
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
        close: () => new Promise<void>((res) => server.close(() => { mind?.close(); res(); })),
      });
    });
  });
}
