/**
 * Encode a HookEvent into a HookFrame, and flatten a HookFrame into
 * the lossy SavePayload that survives the upstream save_memory wire.
 *
 * Frame model maps to hive-mind core:
 *   - temporary  -> ephemeral chatter, decays fast
 *   - normal     -> default for substantive content (upstream default)
 *   - important  -> turns containing decisions / failures / actions
 *   - critical   -> user-facing rules / preferences, retained indefinitely
 *
 * IMPORTANT (Commit 1.4): the upstream `save_memory` schema only accepts
 * `{ content, importance, source, workspace }` — `scope`, `parent`, and
 * `metadata` from HookFrame are not part of that schema. We preserve them
 * as a tagged content prefix (`[session:X parent:Y src:claude-code event:Z]`)
 * so a future search/recall can still attribute frames even though the
 * upstream search index treats the prefix as plain text.
 */

import type { HookEvent, ShimSource } from './hook-event-types.js';
import { classifyImportance, type Importance } from './importance-classifier.js';

/**
 * Provenance enum required by the upstream `save_memory.source` field.
 * Distinct from `HookFrame.source` (which is the IDE name like
 * 'claude-code'). Hook captures default to `'system'`.
 */
export type SaveMemorySource = 'user_stated' | 'tool_verified' | 'agent_inferred' | 'system';

export interface HookFrame {
  content: string;
  importance: Importance;
  scope: string;
  source: ShimSource;
  parent?: string;
  metadata: HookFrameMetadata;
}

export interface HookFrameMetadata {
  cwd: string;
  timestamp_iso: string;
  event_type?: string;
  project?: string;
  target_version?: string;
}

export interface EncodeOptions {
  /** Override the auto-classified importance. */
  importance?: Importance;
  /** Override scope (defaults to payload.session_id or 'default'). */
  scope?: string;
  /** Parent frame id (links responses to prompts). */
  parent?: string;
  /** Override extracted content (defaults to first non-empty payload field). */
  content?: string;
}

const CONTENT_KEYS = ['content', 'text', 'prompt', 'response', 'message'] as const;
const SCOPE_KEYS = ['session_id', 'sessionId', 'session', 'scope'] as const;
const PROJECT_KEYS = ['project', 'workspace', 'project_name'] as const;
const VERSION_KEYS = ['target_version', 'targetVersion', 'version'] as const;

function pickString(payload: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const v = payload[key];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return undefined;
}

export function encodeFrame(event: HookEvent, opts: EncodeOptions = {}): HookFrame {
  const content = opts.content ?? pickString(event.payload, CONTENT_KEYS) ?? '';
  const importance = opts.importance
    ?? classifyImportance(content, { eventType: event.eventType, source: event.source });
  const scope = opts.scope ?? pickString(event.payload, SCOPE_KEYS) ?? 'default';
  const project = pickString(event.payload, PROJECT_KEYS);
  const target_version = pickString(event.payload, VERSION_KEYS);

  const metadata: HookFrameMetadata = {
    cwd: event.cwd,
    timestamp_iso: event.timestamp_iso,
    event_type: event.eventType,
  };
  if (project !== undefined) metadata.project = project;
  if (target_version !== undefined) metadata.target_version = target_version;

  const frame: HookFrame = {
    content,
    importance,
    scope,
    source: event.source,
    metadata,
  };
  if (opts.parent !== undefined) frame.parent = opts.parent;
  return frame;
}

/**
 * The lossy projection of HookFrame onto upstream save_memory's schema.
 * Fields that aren't in the schema (scope, parent, IDE source, event_type)
 * are tagged into a content prefix so they survive as searchable text.
 */
export interface SavePayload {
  content: string;
  importance: Importance;
  source: SaveMemorySource;
}

const SAVE_MEMORY_DEFAULT_SOURCE: SaveMemorySource = 'system';

function buildPrefix(frame: HookFrame): string {
  const tokens: string[] = [];
  if (frame.scope && frame.scope !== 'default') tokens.push(`session:${frame.scope}`);
  if (frame.parent !== undefined) tokens.push(`parent:${frame.parent}`);
  tokens.push(`src:${frame.source}`);
  if (frame.metadata.event_type) tokens.push(`event:${frame.metadata.event_type}`);
  if (frame.metadata.project) tokens.push(`project:${frame.metadata.project}`);
  return tokens.length > 0 ? `[hm ${tokens.join(' ')}] ` : '';
}

/**
 * Flatten a HookFrame for the save_memory wire. The IDE-provenance
 * `frame.source` (e.g. 'claude-code') gets embedded in the content
 * prefix, while the MCP-level `source` field is set to the provenance
 * enum value passed in opts (default 'system' — hooks aren't user-stated
 * or agent-inferred; they're system-captured).
 */
export function frameToSavePayload(
  frame: HookFrame,
  opts: { mcpSource?: SaveMemorySource } = {},
): SavePayload {
  const prefix = buildPrefix(frame);
  return {
    content: prefix + frame.content,
    importance: frame.importance,
    source: opts.mcpSource ?? SAVE_MEMORY_DEFAULT_SOURCE,
  };
}
