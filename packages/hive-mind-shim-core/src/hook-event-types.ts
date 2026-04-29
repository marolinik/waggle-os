/**
 * Canonical hook event surface — shared by every per-IDE shim.
 *
 * Each shim translates its IDE's native event into one of these types
 * before handing off to shim-core encoders/bridges. This is the
 * contract that keeps the rest of shim-core IDE-agnostic.
 */

export type ShimSource =
  | 'claude-code'
  | 'cursor'
  | 'hermes'
  | 'codex'
  | 'opencode'
  | 'openclaw';

export type EventType =
  | 'session-start'
  | 'session-end'
  | 'user-prompt-submit'
  | 'pre-compact'
  | 'stop'
  | 'pre-tool-use'
  | 'post-tool-use';

export interface HookEvent {
  eventType: EventType;
  source: ShimSource;
  cwd: string;
  timestamp_iso: string;
  payload: Record<string, unknown>;
}

export const ALL_EVENT_TYPES: readonly EventType[] = [
  'session-start',
  'session-end',
  'user-prompt-submit',
  'pre-compact',
  'stop',
  'pre-tool-use',
  'post-tool-use',
] as const;

export const ALL_SOURCES: readonly ShimSource[] = [
  'claude-code',
  'cursor',
  'hermes',
  'codex',
  'opencode',
  'openclaw',
] as const;

export function isEventType(value: unknown): value is EventType {
  return typeof value === 'string'
    && (ALL_EVENT_TYPES as readonly string[]).includes(value);
}

export function isShimSource(value: unknown): value is ShimSource {
  return typeof value === 'string'
    && (ALL_SOURCES as readonly string[]).includes(value);
}
