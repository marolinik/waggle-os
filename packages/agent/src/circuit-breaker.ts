/**
 * Circuit breaker for model-endpoint calls (Phase 7, R-2).
 *
 * `retry-policy.ts` already decides whether ONE failure is worth retrying. It
 * has no memory, so a provider that is simply down costs every turn its full
 * retry ladder — three backoffs and a timeout — before the user sees an error,
 * and the next turn pays it again. The breaker is the memory: after enough
 * consecutive failures it stops dialling and fails immediately, then lets a
 * single probe through to find out when the provider came back.
 *
 * Deliberately NOT a general-purpose resilience layer:
 *
 * - **Keyed by endpoint origin.** A wedged local Ollama must not stop calls to
 *   Anthropic. That is the bulkhead property, obtained here for free rather
 *   than by building pools a single-user desktop app has no use for.
 * - **A 4xx never trips it, except 429.** A 400 or a 401 will not heal by
 *   waiting, and fast-failing them behind a generic "temporarily unavailable"
 *   would hide the one error the user can act on — an expired API key has to
 *   keep saying so. Only network failures, timeouts, 5xx and 429 count.
 * - **A trip is expected output, not an incident.** `onStateChange` exists so a
 *   caller can log or surface it; the breaker itself never throws on open, it
 *   returns a synthetic 503 so every existing error path keeps working
 *   unchanged.
 */

/** A breaker is closed (passing calls), open (failing fast), or probing. */
export type BreakerState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerOptions {
  /** Consecutive counted failures before the breaker opens. Default 5. */
  failureThreshold?: number;
  /** How long to fail fast before allowing one probe. Default 30s. */
  openMs?: number;
  /** Injectable clock (tests). Defaults to `Date.now`. */
  now?: () => number;
  /** Notified on every state transition, for logging. */
  onStateChange?: (endpoint: string, from: BreakerState, to: BreakerState) => void;
}

const DEFAULT_FAILURE_THRESHOLD = 5;
const DEFAULT_OPEN_MS = 30_000;

interface EndpointCircuit {
  state: BreakerState;
  consecutiveFailures: number;
  /** When the breaker opened, so we know when a probe is due. */
  openedAt: number;
}

/**
 * Does this response count as a failure for breaker purposes?
 * Exported so the wiring and its pins agree on one definition.
 */
export function countsAsBreakerFailure(status: number): boolean {
  return status === 429 || status >= 500;
}

export class CircuitBreaker {
  private readonly circuits = new Map<string, EndpointCircuit>();
  private readonly failureThreshold: number;
  private readonly openMs: number;
  private readonly now: () => number;
  private readonly onStateChange?: CircuitBreakerOptions['onStateChange'];

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
    this.openMs = options.openMs ?? DEFAULT_OPEN_MS;
    this.now = options.now ?? Date.now;
    this.onStateChange = options.onStateChange;
  }

  /** Current state for an endpoint. An endpoint never seen is closed. */
  stateOf(endpoint: string): BreakerState {
    return this.circuits.get(endpoint)?.state ?? 'closed';
  }

  /**
   * Whether a call may proceed. Transitions open → half-open once the cooldown
   * has elapsed, which is why this is not a pure read.
   */
  allows(endpoint: string): boolean {
    const circuit = this.circuits.get(endpoint);
    if (!circuit || circuit.state === 'closed') return true;
    if (circuit.state === 'half-open') return false; // a probe is already in flight
    if (this.now() - circuit.openedAt < this.openMs) return false;
    this.transition(endpoint, circuit, 'half-open');
    return true;
  }

  /** A call succeeded: close the breaker and forget the failure history. */
  recordSuccess(endpoint: string): void {
    const circuit = this.circuits.get(endpoint);
    if (!circuit) return;
    if (circuit.state !== 'closed') this.transition(endpoint, circuit, 'closed');
    circuit.consecutiveFailures = 0;
  }

  /**
   * A call failed in a way that counts. A failure during a probe re-opens the
   * breaker immediately rather than spending the whole threshold again.
   */
  recordFailure(endpoint: string): void {
    const circuit = this.circuits.get(endpoint)
      ?? { state: 'closed' as BreakerState, consecutiveFailures: 0, openedAt: 0 };
    this.circuits.set(endpoint, circuit);
    circuit.consecutiveFailures += 1;
    const probeFailed = circuit.state === 'half-open';
    if (circuit.state === 'open') return;
    if (probeFailed || circuit.consecutiveFailures >= this.failureThreshold) {
      circuit.openedAt = this.now();
      this.transition(endpoint, circuit, 'open');
    }
  }

  private transition(endpoint: string, circuit: EndpointCircuit, to: BreakerState): void {
    const from = circuit.state;
    if (from === to) return;
    circuit.state = to;
    this.onStateChange?.(endpoint, from, to);
  }
}

/** The origin a breaker keys on, or the whole input when it will not parse. */
export function breakerEndpointKey(input: RequestInfo | URL): string {
  const raw = typeof input === 'string' ? input
    : input instanceof URL ? input.href
    : (input as Request).url;
  try {
    return new URL(raw).origin;
  } catch {
    return raw;
  }
}

/**
 * Wrap a fetch so model-endpoint calls pass through a breaker.
 *
 * An open breaker returns a synthetic 503 rather than throwing, so callers that
 * already handle a non-ok response — `retry-policy.ts` among them — keep
 * working with no change. `Retry-After` carries the remaining cooldown so the
 * existing retry parser can use it instead of guessing.
 */
export function wrapFetchWithBreaker(
  breaker: CircuitBreaker,
  fetchImpl?: typeof globalThis.fetch,
): typeof globalThis.fetch {
  return async function breakeredFetch(input, init) {
    const endpoint = breakerEndpointKey(input);
    if (!breaker.allows(endpoint)) {
      return new Response(
        JSON.stringify({
          error: {
            type: 'circuit_open',
            message: `The model endpoint at ${endpoint} failed repeatedly and is being given a moment to recover. Try again shortly.`,
          },
        }),
        {
          status: 503,
          headers: { 'Content-Type': 'application/json', 'Retry-After': '30' },
        },
      );
    }
    try {
      // Resolved per call, never captured: binding `globalThis.fetch` at wrap
      // time would freeze whatever fetch existed when the composition root ran,
      // and every suite that swaps `globalThis.fetch` afterwards would be
      // silently bypassed.
      const response = await (fetchImpl ?? globalThis.fetch)(input, init);
      if (countsAsBreakerFailure(response.status)) breaker.recordFailure(endpoint);
      else breaker.recordSuccess(endpoint);
      return response;
    } catch (err) {
      // A network failure or our own AbortSignal deadline firing. Both mean the
      // endpoint did not answer, which is exactly what the breaker counts.
      breaker.recordFailure(endpoint);
      throw err;
    }
  };
}
