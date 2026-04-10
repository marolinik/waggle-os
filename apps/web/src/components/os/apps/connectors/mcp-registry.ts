/**
 * Re-export shim — the MCP catalog data now lives in `@waggle/shared`
 * so both the web app and the agent/server can import the same source
 * of truth. This file exists only to keep existing relative imports
 * working while we migrate callers over time.
 *
 * Prefer importing from `@waggle/shared` in new code.
 */

export {
  MCP_CATEGORIES,
  CATEGORY_EMOJI,
  MCP_CATALOG,
  normalizeMcpId,
  type McpServer,
} from '@waggle/shared';
