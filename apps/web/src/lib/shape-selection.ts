/**
 * CC Sesija A §2.2 — prompt shape selection (Faza 1 GEPA-evolved variants).
 *
 * Stored client-side in localStorage. Threaded through adapter.sendMessage()
 * into the chat body so the sidecar can route to the matching registerShape
 * implementation when /api/chat is patched (A3.1 follow-up). Until A3.1 ships,
 * the sidecar receives the shape field and ignores it — selection is still
 * persisted client-side so the user's preference survives page reloads.
 *
 * Available shapes are LOCKED to the Phase 5 deployment scope:
 *   - claude::gen1-v1        (Faza 1 default, +12.5pp Pass II)
 *   - qwen-thinking::gen1-v1 (Faza 1 alt for sovereignty / cost story)
 *
 * gpt::gen1-v2 is intentionally NOT in this list — Faza 2 OVERFIT exposed in
 * Checkpoint C (decisions/2026-04-29-gepa-faza1-results.md). Adding it would
 * silently widen Phase 5 scope past the LOCKED manifest.
 */

import { useCallback, useEffect, useState } from 'react';

export type PromptShape = 'claude::gen1-v1' | 'qwen-thinking::gen1-v1';

export interface ShapeOption {
  id: PromptShape;
  label: string;
  description: string;
}

export const AVAILABLE_SHAPES: ReadonlyArray<ShapeOption> = [
  {
    id: 'claude::gen1-v1',
    label: 'Claude (Gen 1 v1)',
    description: 'Default. Faza 1 GEPA-evolved Claude variant — best Pass II quality.',
  },
  {
    id: 'qwen-thinking::gen1-v1',
    label: 'Qwen Thinking (Gen 1 v1)',
    description: 'Faza 1 GEPA-evolved Qwen variant — open-weights / sovereign track.',
  },
];

export const DEFAULT_SHAPE: PromptShape = 'claude::gen1-v1';

const STORAGE_KEY = 'waggle:selected-shape';

function isValidShape(value: unknown): value is PromptShape {
  return AVAILABLE_SHAPES.some((s) => s.id === value);
}

/** Read the persisted shape from localStorage, falling back to the default. */
export function getSelectedShape(): PromptShape {
  if (typeof window === 'undefined') return DEFAULT_SHAPE;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && isValidShape(stored)) {
      return stored;
    }
  } catch {
    // localStorage may be unavailable (SSR, restricted iframe) — fall through
  }
  return DEFAULT_SHAPE;
}

/** Persist a shape selection to localStorage. */
export function setSelectedShape(shape: PromptShape): void {
  if (typeof window === 'undefined') return;
  if (!isValidShape(shape)) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, shape);
    // Notify other components in the same tab — `storage` event only fires
    // for cross-tab writes, so we dispatch a custom event for in-tab listeners.
    window.dispatchEvent(new CustomEvent('waggle:shape-changed', { detail: shape }));
  } catch {
    // localStorage unavailable — selection is per-session only
  }
}

/**
 * React hook returning [currentShape, setShape]. Subscribes to the in-tab
 * `waggle:shape-changed` event + the cross-tab `storage` event so multiple
 * settings views stay in sync without prop drilling.
 */
export function useSelectedShape(): [PromptShape, (shape: PromptShape) => void] {
  const [shape, setShape] = useState<PromptShape>(() => getSelectedShape());

  useEffect(() => {
    const handleInTab = (e: Event) => {
      const detail = (e as CustomEvent<PromptShape>).detail;
      if (isValidShape(detail)) setShape(detail);
    };
    const handleCrossTab = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue && isValidShape(e.newValue)) {
        setShape(e.newValue);
      }
    };
    window.addEventListener('waggle:shape-changed', handleInTab);
    window.addEventListener('storage', handleCrossTab);
    return () => {
      window.removeEventListener('waggle:shape-changed', handleInTab);
      window.removeEventListener('storage', handleCrossTab);
    };
  }, []);

  const update = useCallback((next: PromptShape) => {
    setSelectedShape(next);
    setShape(next);
  }, []);

  return [shape, update];
}
