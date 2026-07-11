/**
 * Loopback chat client — runs one agent turn through POST /api/chat on
 * 127.0.0.1 and collapses the SSE stream into a final result.
 *
 * Deliberate design: channel adapters reuse the FULL existing chat path
 * (injection scan, persona resolution, governance, memory persistence,
 * audit trail) instead of extracting a service from the 2k-line chat.ts.
 * The origin guard admits loopback requests without an Origin header by
 * design (see local/origin-guard.ts — "same-host curl / server inject").
 *
 * Approval semantics (founder decision, v1): when the turn stalls on
 * `approval_required` we do NOT approve over IM — the caller replies with
 * a "needs approval in the Waggle app" message instead.
 */

export interface ChatTurnResult {
  content: string;
  approvalRequired: boolean;
  error?: string;
}

export interface ChatTurnRequest {
  port: number;
  /** Sidecar session token for the protected loopback API. */
  sessionToken: string;
  message: string;
  workspace: string;
  /** Persisted session id — one per IM conversation. */
  session: string;
  timeoutMs?: number;
  /** Per-turn persona override (e.g. 'session-reviewer' for the idle watcher). */
  persona?: string;
  /**
   * Headless turn: hold gated proposable tools for human approval instead of
   * prompting live over an SSE stream nobody is watching. Used by channels and
   * self-evolution reviews. See the `proposeHeld` field on POST /api/chat.
   */
  proposeHeld?: boolean;
  /**
   * Automation-origin marker (#13): set ONLY by headless/automated callers
   * (e.g. the idle-watcher's review turns) so the chat route skips its
   * post-response memory write-back. IM channel adapters must NOT set this —
   * inbound IM messages are real user turns and must keep writing memory.
   */
  origin?: 'automation';
}

/** Hard ceiling so a wedged turn can't pin a poll loop forever. */
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

interface SseEvent {
  event: string;
  data: unknown;
}

/** Parse complete SSE frames out of an accumulating buffer. Returns leftover. */
export function drainSseBuffer(buffer: string): { events: SseEvent[]; rest: string } {
  const events: SseEvent[] = [];
  const frames = buffer.split('\n\n');
  const rest = frames.pop() ?? '';
  for (const frame of frames) {
    let event = 'message';
    let dataRaw = '';
    for (const line of frame.split('\n')) {
      if (line.startsWith('event: ')) event = line.slice(7).trim();
      else if (line.startsWith('data: ')) dataRaw += line.slice(6);
    }
    if (dataRaw === '') continue;
    try {
      events.push({ event, data: JSON.parse(dataRaw) });
    } catch {
      /* non-JSON data frame — ignore; the chat route always sends JSON */
    }
  }
  return { events, rest };
}

export async function runChannelChatTurn(req: ChatTurnRequest): Promise<ChatTurnResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), req.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(`http://127.0.0.1:${req.port}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${req.sessionToken}`,
      },
      body: JSON.stringify({
        message: req.message,
        workspace: req.workspace,
        session: req.session,
        ...(req.persona ? { persona: req.persona } : {}),
        ...(req.proposeHeld ? { proposeHeld: true } : {}),
        ...(req.origin ? { origin: req.origin } : {}),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      // Pre-SSE JSON errors: validation, injection block, viewer RBAC.
      let detail = `HTTP ${response.status}`;
      try {
        const body = await response.json() as { error?: string; code?: string };
        if (body?.code === 'INJECTION_DETECTED') {
          return { content: '', approvalRequired: false, error: 'Message blocked by the security scanner.' };
        }
        if (body?.error) detail = body.error;
      } catch { /* non-JSON error body — keep status text */ }
      return { content: '', approvalRequired: false, error: detail };
    }

    if (!response.body) {
      return { content: '', approvalRequired: false, error: 'Empty response stream' };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let content = '';
    let approvalRequired = false;
    let error: string | undefined;

    for (;;) {
      const { done, value } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: true });
      const drained = drainSseBuffer(buffer);
      buffer = drained.rest;
      for (const evt of drained.events) {
        if (evt.event === 'done') {
          const d = evt.data as { content?: string };
          if (typeof d?.content === 'string') content = d.content;
        } else if (evt.event === 'approval_required') {
          approvalRequired = true;
        } else if (evt.event === 'error') {
          const d = evt.data as { error?: string; message?: string };
          error = d?.error ?? d?.message ?? 'Agent turn failed';
        }
      }
      if (done) break;
    }

    return { content, approvalRequired, error };
  } catch (e: unknown) {
    const aborted = e instanceof Error && e.name === 'AbortError';
    return {
      content: '',
      approvalRequired: false,
      error: aborted ? 'Agent turn timed out' : (e instanceof Error ? e.message : 'Agent turn failed'),
    };
  } finally {
    clearTimeout(timeout);
  }
}
