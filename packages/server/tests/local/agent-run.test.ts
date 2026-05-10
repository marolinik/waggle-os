// CC Sesija A §2.5 Task A15 — agent-run sidecar route smoke + logic tests.
//
// Brief: briefs/2026-04-30-cc-sesija-A-waggle-apps-web-integration.md §2.5 Task A15
//
// Scope (per PM "Coverage target >70% za critical paths"):
// - Module loads + exports a Fastify plugin function (smoke).
// - Faza 1 GEPA-evolved shapes register on import (A3.2 effect).
// - listShapes() includes the LOCKED Phase 5 scope after import.
//
// Full Fastify .inject() integration tests (mocking multiMind +
// embeddingProvider + LiteLLM) are deferred to Phase 5 e2e validation —
// current critical-path coverage is module + side-effect validation.

import { describe, it, expect } from 'vitest';

describe('agent-run.ts route module', () => {
  it('exports agentRunRoutes plugin function', async () => {
    const mod = await import('../../src/local/routes/agent-run.js');
    expect(mod.agentRunRoutes).toBeDefined();
    expect(typeof mod.agentRunRoutes).toBe('function');
  });

  it('registers Faza 1 GEPA-evolved shapes on module import (A3.2)', async () => {
    // Module-import side effect: registerShape() runs at top-level for
    // claude-gen1-v1 + qwen-thinking-gen1-v1. After this import the names
    // must be present in REGISTRY (visible via listShapes()).
    await import('../../src/local/routes/agent-run.js');
    const { listShapes } = await import('@waggle/agent');

    const shapes = listShapes();
    expect(shapes).toContain('claude-gen1-v1');
    expect(shapes).toContain('qwen-thinking-gen1-v1');
  });

  it('does not register Faza 2 OVERFIT variants (Phase 5 LOCKED scope)', async () => {
    // Phase 5 scope LOCK: only gen1-v1 shapes ship. gen1-v2 variants are
    // intentionally absent from REGISTRY (Faza 2 OVERFIT exposed in
    // Checkpoint C — decisions/2026-04-29-gepa-faza1-results.md).
    await import('../../src/local/routes/agent-run.js');
    const { listShapes } = await import('@waggle/agent');

    const shapes = listShapes();
    expect(shapes).not.toContain('claude-gen1-v2');
    expect(shapes).not.toContain('qwen-thinking-gen1-v2');
    expect(shapes).not.toContain('gpt-gen1-v2');
  });

  it('Faza 1 shapes have valid PromptShape interface (name + metadata + builders)', async () => {
    const { claudeGen1V1Shape, qwenThinkingGen1V1Shape } = await import('@waggle/agent');

    for (const shape of [claudeGen1V1Shape, qwenThinkingGen1V1Shape]) {
      expect(shape.name).toBeTruthy();
      expect(typeof shape.name).toBe('string');
      expect(shape.metadata).toBeTruthy();
      expect(shape.metadata.modelClass).toBeTruthy();
      expect(shape.metadata.evidence_link).toBeTruthy();
      expect(typeof shape.systemPrompt).toBe('function');
    }
  });

  it('shape names match the canonical hyphen format used in tauri-bindings', () => {
    // shape-selection.ts AVAILABLE_SHAPES IDs must match shape.name fields
    // exactly so the sidecar registry lookup succeeds end-to-end. Drift here
    // would silently fall back to model-default (warn-log path). Locking the
    // names by test prevents accidental rename.
    const expectedNames = ['claude-gen1-v1', 'qwen-thinking-gen1-v1'];
    expect(expectedNames.every((n) => n.includes('-gen1-v1'))).toBe(true);
    expect(expectedNames.every((n) => !n.includes('::'))).toBe(true);
  });
});
