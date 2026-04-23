/**
 * Sprint 12 Task 2.5 Stage 1.5 §7.3 — pre-cell health check.
 *
 * Before the runner burns ~20 instance evaluations on a cell, verify every
 * upstream route the run depends on is actually reachable. Catches:
 *   - Judge API-key expiry (Anthropic/OpenAI/Gemini rotation)
 *   - LiteLLM route rename (provider changed slug between runs)
 *   - DashScope authentication drift
 *   - LiteLLM proxy container down (Docker daemon crash since last run)
 *
 * Two levels of probe:
 *   1. GET `/health/liveliness`    — is the proxy itself alive?
 *   2. POST `/v1/chat/completions` with a 5-token "ping" payload for each
 *      required model (subject + judge ensemble). Verifies the route is
 *      wired AND the upstream provider is responsive.
 *
 * Any 5xx response or network error accumulates into `result.failures`.
 * `ok` is true only when every probe returns 2xx. Caller (main) throws a
 * clear error on `ok: false` so nothing starts against a broken upstream.
 *
 * `fetchFn` is injectable so tests can stub it without touching globals.
 * `timeoutMs` defaults to 15 s per probe — thinking=on reasoning calls can
 * push latency; shorter timeouts cause false negatives on slow judges.
 */

const DEFAULT_PROBE_TIMEOUT_MS = 15_000;

export interface HealthCheckOptions {
  litellmUrl: string;
  litellmApiKey: string;
  subjectModel: string;
  judgeModels?: string[];
  fetchFn?: typeof globalThis.fetch;
  timeoutMs?: number;
  /** When true (default), also GETs `/health/liveliness`. Some LiteLLM
   *  configs don't expose that endpoint; set false to skip it. */
  includeLivenessProbe?: boolean;
}

export interface HealthCheckFailure {
  endpoint: string;
  error: string;
}

export interface HealthCheckResult {
  ok: boolean;
  failures: HealthCheckFailure[];
  probedAt: string; // ISO timestamp
  durationMs: number;
}

/** Short message used in the ping body. Minimum tokens that still elicits a
 *  response; any live model will say "Pong" or similar. */
const PING_MESSAGE = 'Respond with just: pong';

async function probeOnce(
  label: string,
  fn: () => Promise<Response>,
  failures: HealthCheckFailure[],
): Promise<void> {
  try {
    const res = await fn();
    if (!res.ok) {
      failures.push({ endpoint: label, error: `http_${res.status}` });
    }
  } catch (err: unknown) {
    const name = err instanceof Error ? err.name : 'unknown';
    failures.push({ endpoint: label, error: `fetch_error_${name}` });
  }
}

export async function preCellHealthCheck(opts: HealthCheckOptions): Promise<HealthCheckResult> {
  const fetchFn = opts.fetchFn ?? globalThis.fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;
  const includeLiveness = opts.includeLivenessProbe ?? true;
  const failures: HealthCheckFailure[] = [];
  const started = Date.now();
  const baseUrl = opts.litellmUrl.replace(/\/$/, '');

  // 1. Liveness probe (skipped when includeLivenessProbe=false).
  if (includeLiveness) {
    await probeOnce('GET /health/liveliness', async () => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        return await fetchFn(`${baseUrl}/health/liveliness`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${opts.litellmApiKey}` },
          signal: ctrl.signal,
        });
      } finally {
        clearTimeout(t);
      }
    }, failures);
  }

  // 2. Model ping probes (subject + each judge).
  const probeModels: string[] = [opts.subjectModel, ...(opts.judgeModels ?? [])];
  for (const model of probeModels) {
    await probeOnce(`POST /v1/chat/completions model=${model}`, async () => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        return await fetchFn(`${baseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${opts.litellmApiKey}`,
          },
          signal: ctrl.signal,
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: PING_MESSAGE }],
            max_tokens: 5,
            temperature: 0.0,
          }),
        });
      } finally {
        clearTimeout(t);
      }
    }, failures);
  }

  return {
    ok: failures.length === 0,
    failures,
    probedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
  };
}
