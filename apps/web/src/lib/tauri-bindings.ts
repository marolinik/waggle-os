/**
 * CC Sesija A §2.1 Task A2 — Tauri command bindings (TypeScript surface).
 *
 * Brief: briefs/2026-04-30-cc-sesija-A-waggle-apps-web-integration.md §2.1 Task A2
 *
 * Each function wraps a #[tauri::command] defined in app/src-tauri/src/commands/
 * and exposes a typed request/response contract. Bindings are thin: they do not
 * normalize, retry, or cache. Higher layers (adapter.ts, useMemory hook) own
 * those concerns so this file stays focused on IPC type safety.
 *
 * Tauri 2 import path note: brief says `@tauri-apps/api/tauri` (Tauri 1 path).
 * Tauri 2 moved invoke to `@tauri-apps/api/core` — using the v2 path here per
 * actual installed @tauri-apps/api 2.10.1. PM ratification 2026-04-30 Path A.
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

// ─── Shared enums ──────────────────────────────────────────────────────────

/** Frame importance (per @waggle/core Importance enum). */
export type FrameImportance = 'low' | 'normal' | 'high' | 'critical';

/** Frame provenance source (per memory.ts D6 VALID_SOURCES). */
export type FrameSource =
  | 'user_stated'
  | 'tool_verified'
  | 'agent_inferred'
  | 'import'
  | 'system';

/** Search scope (per @waggle/core SearchScope). */
export type SearchScope = 'all' | 'personal' | 'workspace' | 'global';

// ─── recall_memory ─────────────────────────────────────────────────────────

export interface RecallMemoryArgs {
  query: string;
  scope?: SearchScope;
  limit?: number;
  workspaceId?: string;
}

/**
 * Sidecar /api/memory/search returns `{ results, count }` where each result is a
 * normalized frame from `normalizeFrame()` in routes/memory.ts. Frames are
 * intentionally typed as `Record<string, unknown>` here — the canonical
 * MemoryFrame shape is owned by adapter.ts which performs camelCase + frameType
 * code mapping. Keep bindings raw to prevent two normalization paths drifting.
 */
export interface RecallMemoryResponse {
  results: Array<Record<string, unknown>>;
  count: number;
}

export function recallMemory(args: RecallMemoryArgs): Promise<RecallMemoryResponse> {
  return invoke<RecallMemoryResponse>('recall_memory', args as unknown as Record<string, unknown>);
}

// ─── save_memory ───────────────────────────────────────────────────────────

export interface SaveMemoryArgs {
  content: string;
  workspaceId?: string;
  importance?: FrameImportance;
  source?: FrameSource;
}

/**
 * Sidecar POST /api/memory/frames returns the created frame metadata (shape
 * varies by sanitization + entity-extraction outcomes). Kept as a permissive
 * record so consumers can inspect fields they care about without forcing a
 * schema-lock here.
 */
export interface SaveMemoryResponse {
  id?: string;
  frame?: Record<string, unknown>;
  [key: string]: unknown;
}

export function saveMemory(args: SaveMemoryArgs): Promise<SaveMemoryResponse> {
  return invoke<SaveMemoryResponse>('save_memory', args as unknown as Record<string, unknown>);
}

// ─── search_entities ───────────────────────────────────────────────────────

export interface SearchEntitiesArgs {
  workspaceId?: string;
  scope?: SearchScope;
}

export interface KGNodeRaw {
  id: string;
  label?: string;
  type?: string;
  properties?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface KGEdgeRaw {
  source: string;
  target: string;
  type?: string;
  properties?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Sidecar GET /api/memory/graph returns the KnowledgeGraph slice as `{nodes, edges}`.
 * The actual shape is whatever `KnowledgeGraph` projects; raw fields preserved.
 */
export interface SearchEntitiesResponse {
  nodes: KGNodeRaw[];
  edges: KGEdgeRaw[];
  [key: string]: unknown;
}

export function searchEntities(args: SearchEntitiesArgs = {}): Promise<SearchEntitiesResponse> {
  return invoke<SearchEntitiesResponse>('search_entities', args as unknown as Record<string, unknown>);
}

// ─── get_identity ──────────────────────────────────────────────────────────

/**
 * Identity record from packages/core/src/mind/identity.ts (IdentityLayer).
 *
 * Backed by /api/identity sidecar route (A1.1 shipped 2026-04-30). Returns
 * either a configured identity (configured: true + IdentityLayer fields) or
 * a placeholder (configured: false + nullable fields + optional _note) so
 * consumers can branch on `configured` for onboarding-vs-populated rendering
 * with one type.
 */
export interface IdentityResponse {
  configured: boolean;
  name: string | null;
  role?: string | null;
  department?: string | null;
  personality?: string | null;
  capabilities?: string | null;
  system_prompt?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  _note?: string;
  [key: string]: unknown;
}

export function getIdentity(): Promise<IdentityResponse> {
  return invoke<IdentityResponse>('get_identity');
}

// ─── wiki commands (A4) ────────────────────────────────────────────────────
// CC Sesija A §2.1 Task A4. Reads compiled wiki pages from sidecar (sourced
// from per-workspace MindDB by packages/wiki-compiler) + triggers compile.

/**
 * One entry in the wiki page index from GET /api/wiki/pages. Shape varies by
 * page type (entity/concept/synthesis); raw fields preserved for the React
 * adapter to project into typed UI cells.
 */
export interface WikiPageMeta {
  slug: string;
  title?: string;
  type?: string;
  [key: string]: unknown;
}

export interface WikiPageContent {
  slug: string;
  content: string;
  [key: string]: unknown;
}

/** List all compiled wiki pages (slug + metadata, no body). */
export function getWikiPages(): Promise<WikiPageMeta[] | { pages: WikiPageMeta[] }> {
  return invoke<WikiPageMeta[] | { pages: WikiPageMeta[] }>('get_wiki_pages');
}

/** Fetch a single wiki page's metadata by slug. */
export function getWikiPage(slug: string): Promise<WikiPageMeta> {
  return invoke<WikiPageMeta>('get_wiki_page', { slug });
}

/** Fetch the full markdown content for a wiki page by slug. */
export function getWikiPageContent(slug: string): Promise<WikiPageContent> {
  return invoke<WikiPageContent>('get_wiki_page_content', { slug });
}

export interface CompileWikiArgs {
  workspaceId?: string;
}

/**
 * Sidecar POST /api/wiki/compile triggers wiki-compiler. Response is a summary
 * envelope from packages/wiki-compiler — exact shape depends on compiler version
 * (page counts, entity counts, gap reports). Raw shape preserved.
 */
export interface CompileWikiResponse {
  pageCount?: number;
  entityCount?: number;
  gaps?: number;
  [key: string]: unknown;
}

export function compileWikiSection(args: CompileWikiArgs = {}): Promise<CompileWikiResponse> {
  return invoke<CompileWikiResponse>('compile_wiki_section', args as unknown as Record<string, unknown>);
}

// ─── run_agent_query (streaming) ───────────────────────────────────────────
// CC Sesija A §2.1 Task A3.

export interface AgentQueryArgs {
  query: string;
  /**
   * Optional shape selector — Faza 1 GEPA-evolved variant id (e.g.
   * `claude::gen1-v1`, `qwen-thinking::gen1-v1`). A3.1 follow-up: sidecar
   * `/api/chat` does not yet honor this field; the Tauri command carries it
   * through the body so a single sidecar patch wires the behavior without
   * binding changes.
   */
  shape?: string;
  workspaceId?: string;
  persona?: string;
  model?: string;
  session?: string;
}

/**
 * One parsed SSE event. `event` is the SSE event name (defaults to "message"
 * if the server didn't emit `event:` lines). `data` is the parsed JSON value
 * when the data payload was JSON, otherwise the raw concatenated data text.
 */
export interface AgentStreamChunk {
  event: string;
  data: unknown;
}

/** Payload of the end event — either `{ ok: true }` or an error envelope. */
export interface AgentStreamEnd {
  ok?: boolean;
  error?: string;
  body?: string;
}

export interface AgentQuerySubscription {
  /** Server-issued correlation id; also encoded in the Tauri event names. */
  requestId: string;
  /** Stop receiving chunk events. Always also call `endUnlisten`. */
  unlisten: UnlistenFn;
}

/**
 * Start an agent query and subscribe to its chunk events.
 *
 * The Tauri command spawns a background task that POSTs to the sidecar's
 * `/api/chat` SSE endpoint and emits one Tauri event per parsed SSE event.
 * Returns the request_id (for correlation + listening to the end event) and
 * an unlisten handle so the caller can detach when the consumer unmounts.
 *
 * The end event is intentionally a separate subscription (`listenAgentEnd`)
 * so callers can wire completion + error handling without funneling through
 * the per-chunk handler.
 */
export async function runAgentQuery(
  args: AgentQueryArgs,
  onChunk: (chunk: AgentStreamChunk) => void,
): Promise<AgentQuerySubscription> {
  const requestId = await invoke<string>(
    'run_agent_query',
    args as unknown as Record<string, unknown>,
  );
  const unlisten = await listen<AgentStreamChunk>(
    `agent-stream-${requestId}`,
    (event) => onChunk(event.payload),
  );
  return { requestId, unlisten };
}

/**
 * Subscribe to the end-of-stream event for a previously started agent query.
 * The handler fires exactly once per request_id; the returned unlisten can be
 * called to release the subscription early.
 */
export function listenAgentEnd(
  requestId: string,
  onEnd: (payload: AgentStreamEnd) => void,
): Promise<UnlistenFn> {
  return listen<AgentStreamEnd>(`agent-stream-${requestId}-end`, (event) =>
    onEnd(event.payload),
  );
}

// ─── Runtime detection ─────────────────────────────────────────────────────

/**
 * True when running inside the Tauri webview (vs. browser dev). Use to gate
 * code that imports or invokes Tauri commands so apps/web can still run in
 * `npm run dev` against a sidecar without crashing on missing IPC bridge.
 *
 * Detection: Tauri 2 injects `__TAURI_INTERNALS__` on window before any user
 * scripts run. Checking for it is cheaper than try/catch around invoke.
 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}
