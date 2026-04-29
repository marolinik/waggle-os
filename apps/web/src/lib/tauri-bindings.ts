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
 * NOTE (CC Sesija A A1.1 follow-up): the sidecar does not yet register a
 * `/api/identity` route. Until that ships, the Tauri command returns a
 * placeholder `{ configured: false, name: null, email: null, preferences: {},
 * _note: "..." }`. Consumers should branch on `configured` to render either
 * the unconfigured-onboarding hint or the populated profile.
 */
export interface IdentityResponse {
  configured: boolean;
  name: string | null;
  email: string | null;
  preferences: Record<string, unknown>;
  _note?: string;
  [key: string]: unknown;
}

export function getIdentity(): Promise<IdentityResponse> {
  return invoke<IdentityResponse>('get_identity');
}

// ─── compile_wiki_section ──────────────────────────────────────────────────

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
