/** Narrow HTTP client for one external agent's WaggleDance Room. */

export type DanceMessageType = 'broadcast' | 'request' | 'response';
export type DanceMessageSubtype =
  | 'knowledge_check' | 'task_delegation' | 'skill_request' | 'model_recommendation'
  | 'knowledge_match' | 'task_claim' | 'discovery' | 'routed_share'
  | 'skill_share' | 'model_recipe';

const VALID_SUBTYPES: Record<DanceMessageType, ReadonlySet<DanceMessageSubtype>> = {
  request: new Set(['knowledge_check', 'task_delegation', 'skill_request', 'model_recommendation']),
  response: new Set(['knowledge_match', 'task_claim']),
  broadcast: new Set(['discovery', 'routed_share', 'skill_share', 'model_recipe']),
};

export interface DanceTransportOptions {
  env?: NodeJS.ProcessEnv;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}

export interface DanceSendOptions extends DanceTransportOptions {
  type: DanceMessageType;
  subtype: DanceMessageSubtype;
  message: string;
  referenceId?: string;
}

export interface DanceReceiveOptions extends DanceTransportOptions {
  since?: string;
  limit?: number;
  subtype?: DanceMessageSubtype;
}

export interface DanceSendResult {
  sent: boolean;
  message: Record<string, unknown>;
  response?: unknown;
}

export interface DanceReceiveResult {
  signals: Array<Record<string, unknown>>;
  total: number;
}

export async function runDanceSend(options: DanceSendOptions): Promise<DanceSendResult> {
  const message = options.message.trim();
  if (!message) throw new Error('dance send requires --message');
  if (!VALID_SUBTYPES[options.type]?.has(options.subtype)) {
    throw new Error(`Invalid WaggleDance type/subtype: ${options.type}/${options.subtype}`);
  }
  const transport = resolveTransport(options.env ?? process.env);
  const response = await request(transport, '/api/waggle-dance/signal', {
    method: 'POST',
    body: JSON.stringify({
      type: options.type,
      subtype: options.subtype,
      content: { text: message, query: message, task: message },
      referenceId: options.referenceId ?? null,
    }),
  }, options);
  const body = response as { dispatched?: unknown; message?: unknown; response?: unknown };
  if (body.dispatched !== true || !body.message || typeof body.message !== 'object') {
    throw new Error('WaggleDance send returned an invalid response');
  }
  return {
    sent: true,
    message: body.message as Record<string, unknown>,
    ...(body.response !== undefined ? { response: body.response } : {}),
  };
}

export async function runDanceReceive(options: DanceReceiveOptions = {}): Promise<DanceReceiveResult> {
  const transport = resolveTransport(options.env ?? process.env);
  const query = new URLSearchParams();
  if (options.since) query.set('since', options.since);
  if (options.subtype) query.set('subtype', options.subtype);
  if (options.limit !== undefined) query.set('limit', String(Math.max(1, Math.min(500, options.limit))));
  const suffix = query.size > 0 ? `?${query}` : '';
  const response = await request(transport, `/api/waggle-dance/signals${suffix}`, { method: 'GET' }, options);
  const body = response as { signals?: unknown; total?: unknown };
  if (!Array.isArray(body.signals)) throw new Error('WaggleDance receive returned an invalid response');
  return {
    signals: body.signals.filter((value): value is Record<string, unknown> => Boolean(value && typeof value === 'object')),
    total: typeof body.total === 'number' ? body.total : body.signals.length,
  };
}

export function renderDanceSend(result: DanceSendResult): string {
  const id = typeof result.message.id === 'string' ? result.message.id : 'unknown';
  return `WaggleDance message sent (${id})`;
}

export function renderDanceReceive(result: DanceReceiveResult): string {
  if (result.signals.length === 0) return 'No new WaggleDance messages.';
  return result.signals.map((signal) => {
    const subtype = typeof signal.subtype === 'string' ? signal.subtype : 'message';
    const sender = typeof signal.senderId === 'string' ? signal.senderId : 'unknown';
    const content = signal.content && typeof signal.content === 'object'
      ? JSON.stringify(signal.content)
      : '';
    return `[${subtype}] ${sender}: ${content}`;
  }).join('\n');
}

function resolveTransport(env: NodeJS.ProcessEnv): { baseUrl: string; token: string } {
  const rawUrl = env.WAGGLE_DANCE_URL?.trim();
  const token = env.WAGGLE_RUN_TOKEN?.trim();
  if (!rawUrl) throw new Error('WAGGLE_DANCE_URL is not set; this command is available inside a Waggle agent run');
  if (!token) throw new Error('WAGGLE_RUN_TOKEN is not set; this command is available inside a Waggle agent run');
  const url = new URL(rawUrl);
  const loopback = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
  if (url.protocol !== 'http:' || !loopback.has(url.hostname) || url.username || url.password) {
    throw new Error('WAGGLE_DANCE_URL must be an unauthenticated loopback http URL');
  }
  return { baseUrl: url.toString().replace(/\/$/, ''), token };
}

async function request(
  transport: { baseUrl: string; token: string },
  path: string,
  init: RequestInit,
  options: DanceTransportOptions,
): Promise<unknown> {
  const fetchFn = options.fetch ?? globalThis.fetch;
  const timeoutMs = Math.max(1_000, Math.min(options.timeoutMs ?? 10_000, 60_000));
  const response = await fetchFn(`${transport.baseUrl}${path}`, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      'content-type': 'application/json',
      'x-waggle-run-token': transport.token,
      ...init.headers,
    },
  });
  const text = await response.text();
  let body: unknown;
  try { body = text ? JSON.parse(text) : {}; }
  catch { body = { message: text }; }
  if (!response.ok) {
    const detail = body && typeof body === 'object' && typeof (body as { message?: unknown }).message === 'string'
      ? (body as { message: string }).message
      : `HTTP ${response.status}`;
    throw new Error(`WaggleDance request failed: ${detail}`);
  }
  return body;
}
