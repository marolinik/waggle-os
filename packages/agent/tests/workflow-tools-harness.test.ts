/**
 * Tests for the `run_harness` agent tool — specifically the session
 * scoping refactor that replaced the process-global harness_id keyed
 * Map with explicit run_id handles.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createWorkflowTools,
  __resetActiveHarnessRunsForTests,
} from '../src/workflow-tools.js';
import type { ToolDefinition } from '../src/tools.js';

function makeConfig(): Parameters<typeof createWorkflowTools>[0] {
  return {
    availableTools: [],
    // The run_harness tool does not spin up a sub-agent — these fields
    // are required for the factory signature but unused in these tests.
    maxDepth: 0,
    maxWorkers: 0,
    aiClient: { generateText: async () => ({ text: '', tokens: { input: 0, output: 0 } }) },
    workerFactory: async () => ({
      async run() {
        return {
          content: '',
          toolsUsed: [],
          usage: { inputTokens: 0, outputTokens: 0 },
        };
      },
    }),
  } as unknown as Parameters<typeof createWorkflowTools>[0];
}

function findTool(tools: ToolDefinition[], name: string): ToolDefinition {
  const t = tools.find(x => x.name === name);
  if (!t) throw new Error(`tool "${name}" not found`);
  return t;
}

// ── Fixtures ────────────────────────────────────────────────────

describe('run_harness tool — session scoping', () => {
  beforeEach(() => {
    __resetActiveHarnessRunsForTests();
  });

  it('first call returns a run_id and the first phase instruction', async () => {
    const tools = createWorkflowTools(makeConfig());
    const run = findTool(tools, 'run_harness');

    const result = await run.execute({ harness_id: 'research-verify' }) as string;

    expect(result).toContain('Harness Started: Research & Verify');
    expect(result).toMatch(/\*\*run_id:\*\*\s*`research-verify-/);
    expect(result).toContain('Gather');
  });

  it('subsequent call without run_id starts a BRAND NEW run instead of resuming', async () => {
    const tools = createWorkflowTools(makeConfig());
    const run = findTool(tools, 'run_harness');

    const first = await run.execute({ harness_id: 'research-verify' }) as string;
    const runId1 = extractRunId(first);

    const second = await run.execute({ harness_id: 'research-verify' }) as string;
    const runId2 = extractRunId(second);

    expect(runId1).not.toBe(runId2);
  });

  it('parallel sessions with same harness_id but different run_ids do not collide', async () => {
    const tools = createWorkflowTools(makeConfig());
    const run = findTool(tools, 'run_harness');

    const aStart = await run.execute({ harness_id: 'research-verify' }) as string;
    const bStart = await run.execute({ harness_id: 'research-verify' }) as string;
    const aRun = extractRunId(aStart);
    const bRun = extractRunId(bStart);

    expect(aRun).not.toBe(bRun);

    // Advance only run A with a phase-satisfying output.
    const aAdvanced = await run.execute({
      harness_id: 'research-verify',
      run_id: aRun,
      phase_output: {
        content: 'I searched and found two results.',
        tool_calls: [
          { tool: 'search_memory', args: { q: 'x' }, result: 'a' },
          { tool: 'recall_memory', args: { q: 'y' }, result: 'b' },
        ],
        artifacts: [],
      },
    }) as string;

    // Run A should have progressed to Synthesize (phase 2).
    expect(aAdvanced).toContain('Synthesize');

    // Run B should still be at Gather (phase 1) — advancing A did not bleed
    // into B's state.
    const bPeek = await run.execute({
      harness_id: 'research-verify',
      run_id: bRun,
    }) as string;
    expect(bPeek).toContain('Gather');
  });

  it('unknown run_id returns an error message', async () => {
    const tools = createWorkflowTools(makeConfig());
    const run = findTool(tools, 'run_harness');

    const result = await run.execute({
      harness_id: 'research-verify',
      run_id: 'nonexistent-id',
    }) as string;

    expect(result).toMatch(/Unknown run_id/i);
  });

  it('run_id from a different harness is rejected', async () => {
    const tools = createWorkflowTools(makeConfig());
    const run = findTool(tools, 'run_harness');

    const start = await run.execute({ harness_id: 'research-verify' }) as string;
    const runId = extractRunId(start);

    const result = await run.execute({
      harness_id: 'code-review-fix',
      run_id: runId,
    }) as string;

    expect(result).toMatch(/Unknown run_id/i);
  });

  it('captures real duration_ms and tokens when provided in phase_output', async () => {
    // Use research-verify; the Verify phase is auto-skipped because
    // WAGGLE_AUTO_VERIFY is not set, so the run summary fires after
    // the Synthesize phase passes its gates.
    const tools = createWorkflowTools(makeConfig());
    const run = findTool(tools, 'run_harness');

    const start = await run.execute({ harness_id: 'research-verify' }) as string;
    const runId = extractRunId(start);

    // Phase 1: Gather — feed in real tokens + duration.
    await run.execute({
      harness_id: 'research-verify',
      run_id: runId,
      phase_output: {
        content: 'results',
        tool_calls: [
          { tool: 'search_memory', args: { q: 'x' }, result: 'a' },
          { tool: 'recall_memory', args: { q: 'y' }, result: 'b' },
        ],
        artifacts: [],
        duration_ms: 2500,
        tokens: { input: 100, output: 50 },
      },
    });

    // Phase 2: Synthesize — this satisfies the 3-sections gate and
    // triggers the auto-skip of the Verify phase, completing the run.
    const finalOutput = await run.execute({
      harness_id: 'research-verify',
      run_id: runId,
      phase_output: {
        content: '## Section 1\n## Section 2\n## Section 3',
        tool_calls: [],
        artifacts: [],
        duration_ms: 3000,
        tokens: { input: 200, output: 120 },
      },
    }) as string;

    // Summary includes accumulated token totals — 100+200 in, 50+120 out.
    expect(finalOutput).toContain('Tokens:');
    expect(finalOutput).toContain('300 input');
    expect(finalOutput).toContain('170 output');
  });

  it('unknown harness_id returns a list of available harnesses', async () => {
    const tools = createWorkflowTools(makeConfig());
    const run = findTool(tools, 'run_harness');

    const result = await run.execute({ harness_id: 'does-not-exist' }) as string;

    expect(result).toContain('not found');
    expect(result).toContain('research-verify');
    expect(result).toContain('code-review-fix');
    expect(result).toContain('document-draft');
  });

  it('advancing past the final phase deletes the tracked run (cleanup)', async () => {
    const tools = createWorkflowTools(makeConfig());
    const run = findTool(tools, 'run_harness');

    const start = await run.execute({ harness_id: 'research-verify' }) as string;
    const runId = extractRunId(start);

    // Drive all three phases.
    await run.execute({
      harness_id: 'research-verify',
      run_id: runId,
      phase_output: {
        content: 'ok',
        tool_calls: [
          { tool: 'search_memory', args: {}, result: 'a' },
          { tool: 'recall_memory', args: {}, result: 'b' },
        ],
        artifacts: [],
      },
    });
    await run.execute({
      harness_id: 'research-verify',
      run_id: runId,
      phase_output: {
        content: '## A\n## B\n## C',
        tool_calls: [],
        artifacts: [],
      },
    });
    await run.execute({
      harness_id: 'research-verify',
      run_id: runId,
      phase_output: {
        content: 'VERDICT: PASS',
        tool_calls: [],
        artifacts: [],
      },
    });

    // Run should be gone. Attempting to reuse the runId errors cleanly.
    const reuse = await run.execute({
      harness_id: 'research-verify',
      run_id: runId,
    }) as string;

    expect(reuse).toMatch(/Unknown run_id/i);
  });
});

function extractRunId(output: string): string {
  const m = output.match(/\*\*run_id:\*\*\s*`([^`]+)`/);
  if (!m) throw new Error(`could not find run_id in:\n${output}`);
  return m[1];
}
