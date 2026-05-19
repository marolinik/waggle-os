/**
 * D5 — Subagent context isolation (premium-harness rubric, Claude Code
 * signature pillar: "fresh window, only result returns, heavy data GC'd").
 *
 * The rubric scored D5=2 "verify-only": the isolation is structurally
 * enforced (the child runs its own runLoop; only AgentResponse =
 * {content, toolsUsed, usage} can return — the child's tool-output
 * payloads / transcript physically cannot cross), but no test LOCKED
 * that contract. This is the R5 pattern (correct-but-unverified). These
 * lock-tests verify the two isolation invariants end-to-end and guard
 * against a regression that dumps child internals into the parent.
 *
 * The third premium sub-claim — bounded results + stale GC — is already
 * locked by subagent-cleanup.test.ts (MAX_AGENT_RESULTS / eviction);
 * not duplicated here.
 *
 * Deterministic: a fake runLoop, no real LLM.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createSubAgentTools, agentResults, activeAgents } from '../src/subagent-tools.js';
import type { ToolDefinition } from '../src/tools.js';
import type { AgentLoopConfig, AgentResponse } from '../src/agent-loop.js';

const HEAVY = 'HEAVY_INTERMEDIATE_LEAK_'.repeat(500); // bulky child tool output
const FINAL = 'DISTILLED_RESULT_MARKER';

function spawnTool(runLoop: (c: AgentLoopConfig) => Promise<AgentResponse>): ToolDefinition {
  // A tool the child *could* call; its output is intentionally huge so a
  // leak into the parent return would be unmistakable.
  const heavyTool: ToolDefinition = {
    name: 'repo_grep',
    description: 'returns a huge payload',
    parameters: { type: 'object', properties: {}, required: [] },
    execute: async () => HEAVY,
  };
  const tools = createSubAgentTools({
    availableTools: [heavyTool],
    runLoop,
    litellmUrl: 'http://unused.local',
    litellmApiKey: 'unused',
    defaultModel: 'test-model',
  });
  const spawn = tools.find(t => t.name === 'spawn_agent');
  if (!spawn) throw new Error('spawn_agent tool not found');
  return spawn;
}

describe('D5 — subagent context isolation (premium pillar, locked)', () => {
  beforeEach(() => {
    agentResults.clear();
    activeAgents.clear();
  });

  it('runs the child in a FRESH window — only its task, never parent history/tools spillover', async () => {
    let captured: AgentLoopConfig | undefined;
    const fakeRunLoop = async (cfg: AgentLoopConfig): Promise<AgentResponse> => {
      captured = cfg;
      return { content: FINAL, toolsUsed: [], usage: { inputTokens: 1, outputTokens: 1 } };
    };
    const spawn = spawnTool(fakeRunLoop);

    await spawn.execute({ name: 'w1', role: 'custom', tools: ['repo_grep'], task: 'TASK_MARKER_42' });

    expect(captured, 'runLoop must have been invoked').toBeDefined();
    // Fresh window: the child's message window is EXACTLY its own task —
    // the parent's conversation/history is never injected.
    expect(captured!.messages).toEqual([{ role: 'user', content: 'TASK_MARKER_42' }]);
    // The child gets exactly the scoped toolset, nothing more (non-vacuous).
    expect(captured!.tools.length).toBe(1);
    expect(captured!.tools[0].name).toBe('repo_grep');
  });

  it('returns ONLY the distilled result to the parent — heavy child tool-output never crosses the boundary', async () => {
    // A faithful child: it actually consumes a huge tool output internally,
    // then produces a short final answer. Only the final answer may return.
    const fakeRunLoop = async (cfg: AgentLoopConfig): Promise<AgentResponse> => {
      const grep = cfg.tools.find(t => t.name === 'repo_grep')!;
      const heavy = await grep.execute({}); // child ingests bulky intermediate data
      expect(heavy).toContain('HEAVY_INTERMEDIATE_LEAK_'); // sanity: it really is huge
      return {
        content: FINAL,
        toolsUsed: ['repo_grep', 'repo_read', 'repo_grep'],
        usage: { inputTokens: 1234, outputTokens: 567 },
      };
    };
    const spawn = spawnTool(fakeRunLoop);

    const parentFacing = await spawn.execute({ name: 'w1', role: 'custom', tools: ['repo_grep'], task: 'do the thing' });

    // Only the distilled result + lightweight metadata cross to the parent…
    expect(parentFacing).toContain(FINAL);
    expect(parentFacing).toContain('repo_grep, repo_read, repo_grep');
    expect(parentFacing).toContain('1801'); // token total = 1234 + 567
    // …the child's heavy intermediate data must NOT enter parent context.
    expect(parentFacing).not.toContain('HEAVY_INTERMEDIATE_LEAK_');
    // And the stored result (get_agent_result surface) is content-only too.
    const stored = [...agentResults.values()][0] as { response?: string };
    expect(stored?.response).toBe(FINAL);
    expect(JSON.stringify(stored)).not.toContain('HEAVY_INTERMEDIATE_LEAK_');
  });
});
