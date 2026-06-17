/**
 * install-store — pure types + helpers for the PR4 shared install store
 * (Warm-Hive Marketplace "sync"). The store (InstallProvider) is the single
 * FE source of truth for "what is installed / connecting" that the grid
 * (Variation A), agent-pick, and inline-in-chat (Variation B) all subscribe
 * to, so installing in ANY view reflects in ALL.
 *
 * This module is React-free on purpose: the dispatch discriminator + the
 * count-eligibility rule are unit-testable without rendering.
 */
import type { ExtensionType } from '@waggle/shared';

/**
 * The minimal descriptor the store installs/uninstalls. `Extension`
 * (lib/extension-catalog) is a structural superset, so the grid passes its
 * Extensions verbatim; the inline-chat card (Phase D) builds one from a
 * CapabilityRequest.
 */
export interface InstallTarget {
  /** Namespaced catalog id — `pkg:<n>` | `connector:<id>` | `mcp:<id>` | `pack:<…>`. */
  id: string;
  type: ExtensionType;
  kind: 'package' | 'pack' | 'federated';
  name: string;
  /** Numeric registry id — kind 'package' only. */
  packageId?: number;
}

/** Why an install attempt did not succeed (drives the caller's follow-up UI). */
export type InstallReason =
  | 'tier' // PRO required — the adapter already dispatched waggle:tier-insufficient
  | 'security' // SecurityGate blocked / requires approval
  | 'error' // network / server / unknown failure (toast already shown)
  | 'needs-credentials' // connector needs a token the caller did not supply (card collects it / OAuth → Hub)
  | 'unsupported'; // browse-only (pack) or ambient (agent/model/template) — not installable via the store

export interface InstallOutcome {
  ok: boolean;
  reason?: InstallReason;
}

/** Credentials/options a caller may supply for a connector (token-paste) or MCP enable. */
export interface InstallCredentials {
  token?: string;
  apiKey?: string;
  settings?: Record<string, string>;
  force?: boolean;
  forceInsecure?: boolean;
}

/** Strip the catalog namespace prefix: `connector:slack` → `slack`, `mcp:postgres` → `postgres`. */
export function rawId(namespacedId: string): string {
  const i = namespacedId.indexOf(':');
  return i === -1 ? namespacedId : namespacedId.slice(i + 1);
}

/**
 * The togglable kinds the store can install/connect/enable AND that count
 * toward the installed count (D1, honest global count). Ambient kinds
 * (agent/model/template) are always present; packs are browse-only — neither
 * flows through the store, so neither inflates the count.
 */
export function isTogglable(target: Pick<InstallTarget, 'type' | 'kind'>): boolean {
  if (target.kind === 'package') return true; // marketplace skill / mcp package
  if (target.kind === 'pack') return false; // browse-only (no install-pack route)
  return target.type === 'connector' || target.type === 'mcp'; // federated connector / catalog mcp
}

/** Narrow an unknown thrown value to a human-readable message. */
export function describeError(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  return 'Server unreachable';
}

/** A thrown AdapterHttpError that is a 403 tier rejection (the adapter has
 *  already dispatched waggle:tier-insufficient). The connector connect path
 *  throws (vs the fetchRaw install paths whose tier body is inspected inline). */
export function isTierError(e: unknown): boolean {
  const err = e as { status?: number; body?: { error?: unknown } } | undefined;
  return err?.status === 403 && err?.body?.error === 'TIER_INSUFFICIENT';
}
