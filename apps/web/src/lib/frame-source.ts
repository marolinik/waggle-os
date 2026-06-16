/**
 * frame.source provenance vocabulary.
 *
 * The `memory_frames.source` column persists exactly 5 values (the DB CHECK
 * constraint at `packages/hive-mind-core/src/mind/schema.ts:57`). The server
 * projects the raw string; the FE owns the friendly label/description map
 * (recon 01 §5). Single source of truth for the ⬡ provenance pill across
 * Workspace Overview, Chat activity steps, and the Memory-Trust screen.
 *
 * Anything outside the 5 known values falls back to the raw string — never
 * throws, never fabricates.
 */

export type FrameSourceValue =
  | 'user_stated'
  | 'tool_verified'
  | 'agent_inferred'
  | 'import'
  | 'system';

interface FrameSourceMeta {
  /** Short pill label, e.g. "you". */
  label: string;
  /** Longer phrase for tooltips / detail, e.g. "you told Waggle". */
  description: string;
}

const FRAME_SOURCE_META: Record<FrameSourceValue, FrameSourceMeta> = {
  user_stated: { label: 'you', description: 'you told Waggle directly' },
  tool_verified: { label: 'verified', description: 'confirmed by a tool execution' },
  agent_inferred: { label: 'agent', description: 'inferred by an agent' },
  import: { label: 'imported', description: 'brought in via harvest / import' },
  system: { label: 'system', description: 'seeded by Waggle' },
};

/**
 * Friendly pill label for a raw `frame.source` value. Returns `undefined` for
 * an absent source (so callers render the date-only fallback, never a
 * fabricated pill); falls back to the raw string for an unknown value.
 */
export function frameSourceLabel(source: string | undefined | null): string | undefined {
  if (!source) return undefined;
  return FRAME_SOURCE_META[source as FrameSourceValue]?.label ?? source;
}

/** Longer human description of a `frame.source` value (tooltips / detail). */
export function frameSourceDescription(source: string | undefined | null): string | undefined {
  if (!source) return undefined;
  return FRAME_SOURCE_META[source as FrameSourceValue]?.description ?? source;
}

/** True when a memory's provenance means it was independently verified. */
export function isVerifiedSource(source: string | undefined | null): boolean {
  return source === 'tool_verified';
}
