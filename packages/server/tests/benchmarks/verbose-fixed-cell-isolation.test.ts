/**
 * Verbose-fixed cell isolation — defense-in-depth unit test.
 *
 * Brief:  PM-Waggle-OS/briefs/2026-04-20-cc-preflight-prep-tasks.md Task 3
 * LOCKED: decisions/2026-04-20-verbose-fixed-oq-resolutions-locked.md §OQ-VF-3
 *
 * The verbose-fixed control MUST NOT invoke retrieval, the wiki compiler, or
 * the memory reader. Per the LOCKED spec, its purpose is to eliminate the
 * "prompt bogatstvo" confounder — a verbose prompt that *simulates* memory
 * access without ever *actually* hitting the memory stack. Any call to those
 * layers collapses the control into naive-RAG or full-stack and voids the
 * Week-2 results.
 *
 * This test enforces that invariant by construction:
 *   1. Invoke `controls['verbose-fixed']` from the harness — the same entry
 *      point the runner uses in scored runs.
 *   2. Spy on every server-side retrieval/wiki/memory surface that could
 *      plausibly be reached. The harness currently reaches none of these,
 *      but a future wiring mistake would.
 *   3. Assert zero invocations on each spy.
 *
 * Failure modes guarded:
 *   - Someone wires HybridSearch or CombinedRetrieval into the harness cell
 *     (e.g. accidentally merging memory-only logic into verbose-fixed).
 *   - Someone calls WikiCompiler.compile* (or the `compile` method) from the
 *     cell to "enrich" the prompt.
 *   - Someone swaps the static system prompt for a dynamic assembler that
 *     invokes any of the above under the hood.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HybridSearch, FrameStore, KnowledgeGraph, MindDB } from '@waggle/core';
import { WikiCompiler } from '@waggle/wiki-compiler';
// CombinedRetrieval isn't re-exported from @waggle/agent (yet) — import from
// the source path so prototype spies attach to the canonical class the
// harness would reach through if a future refactor wired it in.
import { CombinedRetrieval } from '../../../agent/src/combined-retrieval.js';
import { controls } from '../../../../benchmarks/harness/src/controls.js';
import type { LlmClient, LlmCallInput, LlmCallResult } from '../../../../benchmarks/harness/src/llm.js';
import type { DatasetInstance, ModelSpec } from '../../../../benchmarks/harness/src/types.js';

// ── Fixtures ─────────────────────────────────────────────────────────────

const MODEL: ModelSpec = {
  id: 'qwen3.6-35b-a3b',
  displayName: 'Qwen3.6-35B-A3B',
  provider: 'alibaba',
  litellmModel: 'dashscope/qwen3.6-35b-a3b',
  pricePerMillionInput: 0.2,
  pricePerMillionOutput: 0.8,
  contextWindow: 262144,
};

const INSTANCE: DatasetInstance = {
  instance_id: 'iso_test_001',
  question: 'Who painted the Mona Lisa?',
  context: 'Leonardo da Vinci painted the Mona Lisa during the Italian Renaissance.',
  expected: ['Leonardo da Vinci'],
};

/** A recording LlmClient that counts calls and returns a canned response.
 *  We do NOT use the harness's own DryRunClient here because we want full
 *  visibility into what the cell passed through — call args, system prompt,
 *  user prompt — without any DryRun transformation that could mask a leak. */
class RecordingLlmClient implements LlmClient {
  readonly calls: LlmCallInput[] = [];
  async call(input: LlmCallInput): Promise<LlmCallResult> {
    this.calls.push(input);
    return {
      text: 'Leonardo da Vinci',
      inputTokens: 32,
      outputTokens: 4,
      latencyMs: 1,
      costUsd: 0.000005,
      failureMode: null,
    };
  }
}

interface Spies {
  combinedSearch: ReturnType<typeof vi.spyOn>;
  hybridSearch: ReturnType<typeof vi.spyOn>;
  wikiCompile: ReturnType<typeof vi.spyOn>;
  wikiEntity: ReturnType<typeof vi.spyOn>;
  wikiConcept: ReturnType<typeof vi.spyOn>;
  wikiSynthesis: ReturnType<typeof vi.spyOn>;
  wikiIndex: ReturnType<typeof vi.spyOn>;
  wikiHealth: ReturnType<typeof vi.spyOn>;
}

function installSpies(): Spies {
  // Prototype-level spies fire no matter which instance the harness might
  // construct. They throw if actually invoked so a single escaped call
  // becomes a loud test failure rather than a subtle accumulating count.
  const trap = (layer: string) => () => {
    throw new Error(`verbose-fixed cell illegally invoked ${layer}`);
  };

  return {
    combinedSearch: vi
      .spyOn(CombinedRetrieval.prototype as unknown as { search: (...args: unknown[]) => unknown }, 'search')
      .mockImplementation(trap('CombinedRetrieval.search')),
    hybridSearch: vi
      .spyOn(HybridSearch.prototype as unknown as { search: (...args: unknown[]) => unknown }, 'search')
      .mockImplementation(trap('HybridSearch.search')),
    wikiCompile: vi
      .spyOn(WikiCompiler.prototype as unknown as { compile: (...args: unknown[]) => unknown }, 'compile')
      .mockImplementation(trap('WikiCompiler.compile')),
    wikiEntity: vi
      .spyOn(WikiCompiler.prototype as unknown as { compileEntityPage: (...args: unknown[]) => unknown }, 'compileEntityPage')
      .mockImplementation(trap('WikiCompiler.compileEntityPage')),
    wikiConcept: vi
      .spyOn(WikiCompiler.prototype as unknown as { compileConceptPage: (...args: unknown[]) => unknown }, 'compileConceptPage')
      .mockImplementation(trap('WikiCompiler.compileConceptPage')),
    wikiSynthesis: vi
      .spyOn(WikiCompiler.prototype as unknown as { compileSynthesisPage: (...args: unknown[]) => unknown }, 'compileSynthesisPage')
      .mockImplementation(trap('WikiCompiler.compileSynthesisPage')),
    wikiIndex: vi
      .spyOn(WikiCompiler.prototype as unknown as { compileIndex: (...args: unknown[]) => unknown }, 'compileIndex')
      .mockImplementation(trap('WikiCompiler.compileIndex')),
    wikiHealth: vi
      .spyOn(WikiCompiler.prototype as unknown as { compileHealth: (...args: unknown[]) => unknown }, 'compileHealth')
      .mockImplementation(trap('WikiCompiler.compileHealth')),
  };
}

describe('verbose-fixed cell isolation (OQ-VF-3 invariant)', () => {
  let spies: Spies;
  let llm: RecordingLlmClient;

  beforeEach(() => {
    spies = installSpies();
    llm = new RecordingLlmClient();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('verbose-fixed cell invokes zero retrieval calls', async () => {
    await controls['verbose-fixed']({
      instance: INSTANCE,
      model: MODEL,
      llm,
      turnId: 'iso-retrieval-0001',
    });
    // Both the workspace-level combined-retrieval and the lower-level
    // hybrid memory search must stay at zero — brief Task 3 case 1 +
    // case 3 combined (memory reader + retriever).
    expect(spies.combinedSearch).not.toHaveBeenCalled();
    expect(spies.hybridSearch).not.toHaveBeenCalled();
    // Sanity: the cell MUST have called the LLM exactly once. Otherwise
    // the invariant is met only because the cell did nothing — not a
    // healthy pass.
    expect(llm.calls).toHaveLength(1);
  });

  it('verbose-fixed cell invokes zero wiki compiler calls', async () => {
    await controls['verbose-fixed']({
      instance: INSTANCE,
      model: MODEL,
      llm,
      turnId: 'iso-wiki-0002',
    });
    // All five compile entry points on WikiCompiler — every public compile
    // surface that could inject wiki content into the prompt.
    expect(spies.wikiCompile).not.toHaveBeenCalled();
    expect(spies.wikiEntity).not.toHaveBeenCalled();
    expect(spies.wikiConcept).not.toHaveBeenCalled();
    expect(spies.wikiSynthesis).not.toHaveBeenCalled();
    expect(spies.wikiIndex).not.toHaveBeenCalled();
    expect(spies.wikiHealth).not.toHaveBeenCalled();
    expect(llm.calls).toHaveLength(1);
  });

  it('verbose-fixed cell invokes zero memory read calls', async () => {
    await controls['verbose-fixed']({
      instance: INSTANCE,
      model: MODEL,
      llm,
      turnId: 'iso-memory-0003',
    });
    // The memory reader — HybridSearch.search is the canonical read path
    // on personal.mind and workspace mind databases. CombinedRetrieval
    // wraps it but we spy on both layers to catch either-or entry points.
    expect(spies.hybridSearch).not.toHaveBeenCalled();
    expect(spies.combinedSearch).not.toHaveBeenCalled();
    expect(llm.calls).toHaveLength(1);
  });

  it('verbose-fixed cell passes a long-form system prompt through to the LLM', async () => {
    // Belt-and-braces: the whole point of the control is a VERBOSE prompt.
    // If future refactor strips the verbose instructions, the control's
    // diagnostic value vanishes even if the zero-call invariants still hold.
    await controls['verbose-fixed']({
      instance: INSTANCE,
      model: MODEL,
      llm,
      turnId: 'iso-shape-0004',
    });
    expect(llm.calls).toHaveLength(1);
    const call = llm.calls[0];
    expect(call.systemPrompt.length).toBeGreaterThan(80);
    expect(call.systemPrompt.toLowerCase()).toMatch(/step by step|full sentences|careful/);
    expect(call.userPrompt).toContain(INSTANCE.question);
    expect(call.userPrompt).toContain(INSTANCE.context);
  });
});

// Ensure the suppressed-logic imports are not tree-shaken away — referencing
// the Mind / KG constructors keeps bundler eye on them so spies attach to the
// *real* prototype methods. (If the test ever compiles without these imports,
// they'd still be inert at runtime since we never instantiate them.)
void MindDB;
void FrameStore;
void KnowledgeGraph;
