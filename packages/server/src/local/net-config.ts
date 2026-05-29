/**
 * Network bind configuration for the local Waggle sidecar.
 *
 * The desktop product is localhost-only, so the server binds to the loopback
 * interface (127.0.0.1) by default. Deployments that must accept external
 * traffic (Docker/Render cloud) opt in explicitly via WAGGLE_HOST=0.0.0.0.
 *
 * Historical note: the prior default was 0.0.0.0, which combined with the
 * (now fixed) unauthenticated /health token leak to allow a full LAN auth
 * bypass — see docs/audits/2026-05-29-prod-readiness (R1-001).
 */

const LOOPBACK = '127.0.0.1';

/**
 * All host strings that mean "the loopback interface". AV-5: isLoopbackBind()
 * previously compared only to '127.0.0.1', so WAGGLE_HOST=localhost or ::1 — both
 * normal loopback choices — made it return false and silently DISABLED the
 * anti-DNS-rebind Host allowlist while the server was still bound locally.
 */
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '::ffff:127.0.0.1']);

/** Resolve the host the sidecar binds to. Loopback unless WAGGLE_HOST is set. */
export function resolveBindHost(env: NodeJS.ProcessEnv = process.env): string {
  const h = env.WAGGLE_HOST?.trim();
  return h && h.length > 0 ? h : LOOPBACK;
}

/** True when the sidecar is bound to a loopback interface (the safe default). */
export function isLoopbackBind(env: NodeJS.ProcessEnv = process.env): boolean {
  return LOOPBACK_HOSTS.has(resolveBindHost(env));
}
