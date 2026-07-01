/**
 * MCP tool scope gate.
 *
 * Controls WHICH tools get registered at server start based on an env-driven
 * scope set, so a read-only token literally cannot mutate the substrate:
 *
 *   <ENV>=memory:read              -> only read tools registered
 *   <ENV>=memory:read,memory:write -> full read + write
 *
 * Default (env unset/empty) = full read + write, for backward-compat.
 * Granting memory:write auto-adds memory:read (write-implies-read).
 *
 * No HTTP / token-minting here — registration gating + scope parsing only.
 * Aligns with the mind-isolation rule: this never crosses minds, it only
 * narrows the tool surface a client sees.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export type McpScope = 'memory:read' | 'memory:write';

/** Mutating tools — withheld unless the scope set contains `memory:write`. */
export const WRITE_TOOLS: ReadonlySet<string> = new Set<string>([
  'save_memory',
  'save_entity',
  'create_relation',
  'set_identity',
  'set_awareness',
  'clear_awareness',
  'create_workspace',
  'harvest_import',
  'cleanup_frames',
  'cleanup_entities',
  'erase_memory',
  'ingest_source',
  'compile_wiki',
]);

/** Read-only tools — registered whenever the scope set contains `memory:read`. */
export const READ_TOOLS: ReadonlySet<string> = new Set<string>([
  'recall_memory',
  'search_entities',
  'get_identity',
  'get_awareness',
  'list_workspaces',
  'harvest_sources',
  'get_page',
  'search_wiki',
  'compile_health',
]);

/**
 * Classify a tool name. Unknown names fall back to 'write' (fail safe): a
 * read-only token never exposes a tool we have not explicitly vetted as read.
 */
export function toolScope(name: string): 'read' | 'write' {
  return READ_TOOLS.has(name) ? 'read' : 'write';
}

/**
 * Parse a comma-separated scope string into a normalized scope set.
 *
 * - undefined / empty / whitespace  -> full read+write (backward-compat default)
 * - explicit but no valid token     -> falls closed to read-only
 * - memory:write                    -> auto-adds memory:read (write-implies-read)
 */
export function parseScopes(raw: string | undefined): ReadonlySet<McpScope> {
  if (raw === undefined || raw.trim() === '') {
    return new Set<McpScope>(['memory:read', 'memory:write']);
  }

  const set = new Set<McpScope>();
  for (const token of raw.split(',')) {
    const t = token.trim().toLowerCase();
    if (t === 'memory:read' || t === 'memory:write') set.add(t);
    // Unknown tokens are ignored — never silently grant an unrecognized scope.
  }

  // Explicit-but-unrecognized value: fall closed to read-only.
  if (set.size === 0) set.add('memory:read');

  // write-implies-read expansion.
  if (set.has('memory:write')) set.add('memory:read');

  return set;
}

/** True when every tool (read + write) is permitted — the default path. */
export function isFullAccess(scopes: ReadonlySet<McpScope>): boolean {
  return scopes.has('memory:read') && scopes.has('memory:write');
}

/** Decide whether a single tool may be registered under the given scopes. */
export function isToolAllowed(name: string, scopes: ReadonlySet<McpScope>): boolean {
  return toolScope(name) === 'write'
    ? scopes.has('memory:write')
    : scopes.has('memory:read');
}

/**
 * Wrap an McpServer so that `.tool(name, ...)` registrations outside the granted
 * scopes are silently skipped. All other members (`.resource`, `.connect`, …)
 * pass straight through, bound to the real server so private-field access keeps
 * working. Immutable: the original server is never mutated.
 */
export function scopeGatedServer(
  server: McpServer,
  scopes: ReadonlySet<McpScope>,
): McpServer {
  return new Proxy(server, {
    // Resolve every member against the REAL target (receiver = target), so SDK
    // getters/methods that read private #fields (e.g. `.connect`) never run with
    // `this` bound to the proxy. Only `.tool` registrations are gated.
    get(target, prop) {
      if (prop === 'tool') {
        const original = Reflect.get(target, prop, target) as (
          ...args: unknown[]
        ) => unknown;
        return (...args: unknown[]): unknown => {
          const name = args[0];
          if (typeof name === 'string' && !isToolAllowed(name, scopes)) {
            return undefined;
          }
          return original.apply(target, args);
        };
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function'
        ? (value as (...a: unknown[]) => unknown).bind(target)
        : value;
    },
  });
}
