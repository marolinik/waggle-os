/**
 * GEPA Faza 1 — REGISTRY-injection cross-module-boundary regression test.
 *
 * Per manifest v7 Amendment 8 §registry_invariant_test.
 *
 * Documents the H1 failure mode discovered via Gen 1 partial run b5avslp51 +
 * diagnostic probe (benchmarks/gepa/scripts/faza-1/probe-registry-injection.ts):
 *
 *   Under tsx + Node ESM with workspace path resolution, importing REGISTRY
 *   via a deep relative path produces a SEPARATE module instance from
 *   importing via the package path '@waggle/agent'. Mutations to one
 *   instance do NOT propagate to the other.
 *
 * This test asserts BOTH:
 *   (a) the failure mode (direct deep-path mutation does NOT propagate
 *       to package-import REGISTRY), so the bug class stays detectable
 *       if someone "fixes" the canonical path back to a deep import; AND
 *   (b) registerShape() via '@waggle/agent' DOES propagate to the
 *       agent-loop's view of REGISTRY (selectShape sees the new shape).
 *
 * If this test ever fails on (a) it means the underlying ESM resolver
 * dedup-logic changed; if it ever fails on (b) it means registerShape
 * was broken or its export path was changed.
 */

import { describe, expect, it } from 'vitest';

// Path A — deep relative import (the failing pattern from b5avslp51)
import { REGISTRY as RegistryFromScriptDeepPath } from '../../../../packages/agent/src/prompt-shapes/selector.js';

// Path B — package import (the canonical, agent-loop-equivalent path)
import {
  REGISTRY as RegistryFromPackage,
  registerShape,
  selectShape,
  type PromptShape,
} from '@waggle/agent';

function makeProbeShape(name: string): PromptShape {
  // Minimal valid PromptShape stub — only structure matters for the registry test;
  // method bodies are not invoked here.
  return {
    name,
    metadata: {
      description: `Probe shape ${name} for registry-injection regression test`,
      modelClass: 'probe',
      defaultThinking: false,
      defaultMaxTokens: 100,
      evidence_link: 'manifest v7 Amendment 8 §registry_invariant_test',
    },
    systemPrompt: () => 'probe',
    soloUserPrompt: () => 'probe',
    multiStepKickoffUserPrompt: () => 'probe',
    retrievalInjectionUserPrompt: () => 'probe',
  } as PromptShape;
}

describe('Amendment 8 §registry_invariant_test — REGISTRY cross-module-boundary', () => {
  it('documents H1 failure mode: deep-relative-path REGISTRY and package REGISTRY are SEPARATE module instances', () => {
    // This assertion documents the empirical finding from probe-registry-injection.ts
    // run on 2026-04-28 (Node v22.19.0 + tsx). If the underlying ESM resolver ever
    // deduplicates these paths, this test will fail-and-flag the change.
    expect(RegistryFromScriptDeepPath).not.toBe(RegistryFromPackage);
  });

  it('documents H1: direct deep-path mutation does NOT propagate to package-import REGISTRY', () => {
    const shapeName = 'amendment-8-h1-failure-mode-witness';
    const shape = makeProbeShape(shapeName);

    // Anti-pattern (the b5avslp51 bug): direct mutation via deep-path import.
    (RegistryFromScriptDeepPath as Record<string, PromptShape>)[shapeName] = shape;

    // Direct read on the same instance: visible.
    expect(RegistryFromScriptDeepPath[shapeName]).toBe(shape);

    // Read via the package-import (agent-loop's view): NOT visible.
    expect(RegistryFromPackage[shapeName]).toBeUndefined();

    // selectShape (from package, mirrors agent-loop call site): throws.
    expect(() => selectShape('any-alias', { override: shapeName })).toThrow(
      /not in REGISTRY/,
    );

    // Cleanup — remove the failure-mode witness so subsequent tests stay clean.
    delete (RegistryFromScriptDeepPath as Record<string, PromptShape>)[shapeName];
  });

  it('FIX: registerShape() via @waggle/agent DOES propagate (canonical mutation API per §canonical_mutation_api)', () => {
    const shapeName = 'amendment-8-canonical-fix-witness';
    const shape = makeProbeShape(shapeName);

    // Canonical mutation: registerShape imported from '@waggle/agent'.
    registerShape(shapeName, shape);

    // Read via the package-import (agent-loop's view): visible.
    expect(RegistryFromPackage[shapeName]).toBe(shape);

    // selectShape with override (matches agent-loop's selectShape call site).
    const found = selectShape('any-alias', { override: shapeName });
    expect(found).toBe(shape);
    expect(found.name).toBe(shapeName);

    // Cleanup — Faza 1 doesn't expose unregisterShape, so we mutate via canonical
    // Path-B REGISTRY directly to keep cross-test isolation.
    delete (RegistryFromPackage as Record<string, PromptShape>)[shapeName];
  });

  it('registerShape rejects empty name with informative error', () => {
    const shape = makeProbeShape('temp');
    expect(() => registerShape('', shape)).toThrow(/non-empty string/);
  });

  it('registerShape rejects malformed shape (missing systemPrompt method)', () => {
    const malformed = {
      name: 'malformed',
      metadata: { description: 'nope', modelClass: 'x', defaultThinking: false, defaultMaxTokens: 1 },
      // systemPrompt deliberately missing
    } as unknown as PromptShape;
    expect(() => registerShape('malformed-test', malformed)).toThrow(
      /missing required PromptShape fields/,
    );
  });

  it('registerShape registration survives multiple re-registrations (last-write-wins semantics)', () => {
    const name = 'amendment-8-multi-register';
    const shape1 = makeProbeShape(name);
    const shape2 = makeProbeShape(name);
    // Distinct identity but same name.
    expect(shape1).not.toBe(shape2);

    registerShape(name, shape1);
    expect(selectShape('x', { override: name })).toBe(shape1);

    registerShape(name, shape2);  // re-register
    expect(selectShape('x', { override: name })).toBe(shape2);

    delete (RegistryFromPackage as Record<string, PromptShape>)[name];
  });

  it('registerShape via @waggle/agent makes the shape visible from listShapes()', async () => {
    const name = 'amendment-8-listshapes-witness';
    const shape = makeProbeShape(name);

    const { listShapes } = await import('@waggle/agent');
    const beforeNames = listShapes();
    expect(beforeNames).not.toContain(name);

    registerShape(name, shape);
    const afterNames = listShapes();
    expect(afterNames).toContain(name);

    delete (RegistryFromPackage as Record<string, PromptShape>)[name];
  });
});
