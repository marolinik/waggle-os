// CC Sesija A §2.5 Task A16 — shape-selection persistence + contract tests.
//
// Mirrors the pre-existing useDeveloperMode.test.ts contract: this app is on
// React 18.3 while @testing-library/react 16 targets React 19, so renderHook
// mixes React copies and crashes ("useState is null"). Pure functions get
// vitest coverage here; the React-render-level behaviour of useSelectedShape
// is deferred to Playwright E2E (same convention as useDeveloperMode).

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AVAILABLE_SHAPES,
  DEFAULT_SHAPE,
  getSelectedShape,
  setSelectedShape,
  type PromptShape,
} from './shape-selection';

const STORAGE_KEY = 'waggle:selected-shape';

describe('AVAILABLE_SHAPES Phase 5 LOCKED scope', () => {
  it('contains exactly 2 shapes (claude-gen1-v1 + qwen-thinking-gen1-v1)', () => {
    expect(AVAILABLE_SHAPES.length).toBe(2);
    const ids = AVAILABLE_SHAPES.map((s) => s.id);
    expect(ids).toContain('claude-gen1-v1');
    expect(ids).toContain('qwen-thinking-gen1-v1');
  });

  it('does NOT contain Faza 2 OVERFIT variants (gpt-gen1-v2, gen1-v2 family)', () => {
    const ids: string[] = AVAILABLE_SHAPES.map((s) => s.id);
    expect(ids).not.toContain('gpt-gen1-v2');
    expect(ids).not.toContain('claude-gen1-v2');
    expect(ids).not.toContain('qwen-thinking-gen1-v2');
  });

  it('default shape is claude-gen1-v1', () => {
    expect(DEFAULT_SHAPE).toBe('claude-gen1-v1');
  });

  it('every shape option has id, label, and description', () => {
    for (const s of AVAILABLE_SHAPES) {
      expect(s.id).toBeTruthy();
      expect(s.label).toBeTruthy();
      expect(s.description).toBeTruthy();
    }
  });
});

describe('getSelectedShape / setSelectedShape persistence', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('returns DEFAULT_SHAPE when nothing is stored', () => {
    expect(getSelectedShape()).toBe(DEFAULT_SHAPE);
  });

  it('returns DEFAULT_SHAPE when stored value is invalid', () => {
    window.localStorage.setItem(STORAGE_KEY, 'definitely-not-a-shape');
    expect(getSelectedShape()).toBe(DEFAULT_SHAPE);
  });

  it('roundtrips a valid shape selection', () => {
    setSelectedShape('qwen-thinking-gen1-v1');
    expect(getSelectedShape()).toBe('qwen-thinking-gen1-v1');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('qwen-thinking-gen1-v1');
  });

  it('rejects invalid shape via setSelectedShape (no-op, no localStorage write)', () => {
    setSelectedShape('not-a-real-shape' as unknown as PromptShape);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe('cross-tab CustomEvent contract', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('setSelectedShape dispatches waggle:shape-changed with the new value', () => {
    let captured: PromptShape | null = null;
    const handler = (e: Event) => {
      captured = (e as CustomEvent<PromptShape>).detail;
    };
    window.addEventListener('waggle:shape-changed', handler);
    setSelectedShape('qwen-thinking-gen1-v1');
    window.removeEventListener('waggle:shape-changed', handler);
    expect(captured).toBe('qwen-thinking-gen1-v1');
  });

  it('rejects invalid shape — no event fires + no localStorage write', () => {
    let fired = false;
    const handler = () => {
      fired = true;
    };
    window.addEventListener('waggle:shape-changed', handler);
    setSelectedShape('totally-not-a-shape' as unknown as PromptShape);
    window.removeEventListener('waggle:shape-changed', handler);
    expect(fired).toBe(false);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
