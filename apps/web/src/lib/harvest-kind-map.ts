// Pure display mapping for the canonical PRD §15.2 `MemoryKind` vocabulary (B6).
//
// `MemoryKind` is the single source of truth for memory typing (defined once in
// `@waggle/shared`). This module maps each kind to (a) a human label for Memory
// Center filter chips / cards (S04) and (b) an onboarding Memory Review grouping
// bucket (S16). The server-side `ImportItemType → MemoryKind` normalization lives
// in the sidecar harvest layer (Phase 2B), NOT here — the build order forbids
// `@waggle/shared` from importing the hive-mind-core `ImportItemType` union.
//
// Pure functions only; no side effects. The `Record<MemoryKind, …>` map is the
// safety net: tsc fails if a new `MemoryKind` member is added without a mapping.

import type { MemoryKind } from '@waggle/shared';

/** Onboarding Memory Review grouping buckets (S16). Artifacts are sourced from
 *  the Artifact entity, not a `MemoryKind`, so they are not a target here. */
export type MemoryDisplayCategory = 'Memories' | 'Decisions' | 'Tasks' | 'Projects';

interface MemoryKindMeta {
  /** Human label for filter chips / cards (S04). */
  label: string;
  /** Memory Review grouping bucket (S16). */
  category: MemoryDisplayCategory;
}

export const MEMORY_KIND_META: Record<MemoryKind, MemoryKindMeta> = {
  fact: { label: 'Fact', category: 'Memories' },
  decision: { label: 'Decision', category: 'Decisions' },
  task: { label: 'Task', category: 'Tasks' },
  preference: { label: 'Preference', category: 'Memories' },
  strategy: { label: 'Strategy', category: 'Projects' },
  learning: { label: 'Learning', category: 'Memories' },
  goal: { label: 'Goal', category: 'Projects' },
  entity: { label: 'Entity', category: 'Memories' },
};

export function memoryKindLabel(kind: MemoryKind): string {
  return MEMORY_KIND_META[kind]?.label ?? 'Memory';
}

export function memoryKindDisplayCategory(kind: MemoryKind): MemoryDisplayCategory {
  return MEMORY_KIND_META[kind]?.category ?? 'Memories';
}

/** Display categories in render order for the Review step grouping (S16). */
export const MEMORY_DISPLAY_CATEGORIES: readonly MemoryDisplayCategory[] = [
  'Memories',
  'Decisions',
  'Tasks',
  'Projects',
] as const;
