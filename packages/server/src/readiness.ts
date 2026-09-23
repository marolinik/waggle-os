/**
 * Readiness — whether server mode's dependencies answer, as opposed to
 * whether the process is breathing (R-4).
 *
 * `/health` stays a shallow liveness check on purpose: Render restarts a
 * service whose health check fails, and restarting the API because Postgres
 * is briefly down would turn a dependency blip into an outage. Readiness is a
 * separate question and a separate route.
 *
 * Each probe gets its own deadline. The public report carries only a coarse
 * reason per dependency; the underlying error, which can name hosts or carry
 * connection details, is returned separately for the server log.
 */

export interface ReadinessProbe {
  name: string;
  check: () => Promise<unknown>;
}

export type ReadinessFailure = 'timeout' | 'unavailable';

export interface ReadinessReport {
  status: 'ready' | 'not_ready';
  checks: Record<string, { ok: true } | { ok: false; reason: ReadinessFailure }>;
  timestamp: string;
}

export interface ReadinessResult {
  report: ReadinessReport;
  /** Per-dependency errors for the server log only; never sent to a client. */
  errors: Record<string, unknown>;
}

export const DEFAULT_READINESS_TIMEOUT_MS = 2_000;

class ReadinessTimeout extends Error {}

async function withDeadline(check: () => Promise<unknown>, timeoutMs: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      check(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ReadinessTimeout()), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function checkReadiness(
  probes: readonly ReadinessProbe[],
  timeoutMs: number = DEFAULT_READINESS_TIMEOUT_MS,
): Promise<ReadinessResult> {
  const checks: ReadinessReport['checks'] = {};
  const errors: Record<string, unknown> = {};
  await Promise.all(probes.map(async (probe) => {
    try {
      await withDeadline(probe.check, timeoutMs);
      checks[probe.name] = { ok: true };
    } catch (error) {
      const reason: ReadinessFailure = error instanceof ReadinessTimeout ? 'timeout' : 'unavailable';
      checks[probe.name] = { ok: false, reason };
      errors[probe.name] = error;
    }
  }));
  const ready = Object.values(checks).every(check => check.ok);
  return {
    report: { status: ready ? 'ready' : 'not_ready', checks, timestamp: new Date().toISOString() },
    errors,
  };
}
