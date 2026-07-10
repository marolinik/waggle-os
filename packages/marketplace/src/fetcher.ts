/**
 * Injectable outbound fetch for the marketplace package.
 *
 * The marketplace is a standalone package (its own `waggle-market` CLI) and
 * must stay free of `@waggle/agent` — importing it would create a dependency
 * cycle (agent already type/dynamic-imports `@waggle/marketplace`). So the
 * SSRF egress guard (`packages/agent/src/url-egress-guard.ts`) cannot be
 * imported here directly; instead the server layer — which owns both packages —
 * injects a guard-backed fetch into {@link MarketplaceInstaller} /
 * {@link MarketplaceSync}. Standalone/CLI callers fall back to global `fetch`.
 *
 * The threat this protects (per the guard's THREAT_MODEL.md control 8) is the
 * cloud/TEAMS sidecar binding 0.0.0.0: an attacker-influenced source URL that
 * resolves to a private / link-local address (169.254.169.254 metadata, RFC1918)
 * must be refused. The server injects a fetcher that does exactly that.
 */

/** A `fetch`-compatible function. `globalThis.fetch` is assignable to this. */
export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

/** Default fetcher — plain global fetch (no SSRF guard). Server overrides this. */
export const defaultFetch: FetchFn = (url, init) => fetch(url, init);
