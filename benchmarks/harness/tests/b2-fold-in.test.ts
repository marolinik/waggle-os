/**
 * Sprint 11 Task B2 fold-in integration test.
 *
 * Verifies judge-runner.ts wires resolveTieBreak into the Stage 2 judge
 * runner on 3-primary splits per decisions/2026-04-22-tie-break-policy-locked.md.
 *
 *   1. 3-primary ensemble + 1-1-1 split → resolveTieBreak dispatched with
 *      the registered tieBreakerClient; fourth vote's verdict resolves to
 *      quadri-vendor plurality.
 *   2. 3-primary ensemble + 1-1-1-1 (four-way after tie-break) → payload
 *      carries `tie_break_path: 'pm-escalation'` + `judge_error: 'PM_ESCALATION'`.
 *   3. 3-primary ensemble + 2-1 majority → no tie-break call, legacy
 *      majority path taken, `tie_break_path` undefined.
 *   4. 4-primary ensemble (not 3) → no tie-break fold-in even if 1-1-1-1;
 *      legacy `computeMajority` path preserved.
 *   5. 3-primary ensemble WITHOUT tieBreakerClient → legacy path preserved
 *      even on 1-1-1 (back-compat).
 *
 * Uses stub LlmClients — no LLM spend.
 */

import { describe, it, expect } from 'vitest';
import { runJudge, type JudgeConfig, type JudgeTriple } from '../src/judge-runner.js';
import type { LlmClient } from '../src/judge-types.js';

function stubClient(verdict: 'correct' | 'incorrect', failureMode: null | 'F1' | 'F2' | 'F3' | 'F4' | 'F5'): LlmClient {
  return {
    async complete(_prompt: string) {
      return JSON.stringify({
        verdict,
        failure_mode: failureMode,
        rationale: `stub: ${verdict}/${failureMode ?? 'null'}`,
      });
    },
  };
}

const TRIPLE: JudgeTriple = {
  question: 'What is the capital of France?',
  groundTruth: 'Paris',
  contextExcerpt: 'France is a country in Europe. Its capital is Paris.',
  modelAnswer: 'Paris',
};

describe('Sprint 11 B2 fold-in — judge-runner integration', () => {
  it('3-primary 1-1-1 split dispatches resolveTieBreak with tieBreakerClient; resolves to quadri-vendor plurality', async () => {
    // Three primary judges produce three distinct verdict keys (1-1-1).
    const opusClient = stubClient('correct', null);                  // correct|NA
    const gptClient = stubClient('incorrect', 'F3');                 // incorrect|F3
    const geminiClient = stubClient('incorrect', 'F4');              // incorrect|F4
    // Tie-break client breaks the tie in favor of correct|NA.
    const grokClient = stubClient('correct', null);                  // joins opus bucket

    const clients = new Map<string, LlmClient>();
    clients.set('claude-opus-4-7', opusClient);
    clients.set('gpt-5.4-pro', gptClient);
    clients.set('gemini-3.1-pro', geminiClient);

    const config: JudgeConfig = {
      kind: 'ensemble',
      models: ['claude-opus-4-7', 'gpt-5.4-pro', 'gemini-3.1-pro'],
      clients,
      tieBreakerModel: 'xai/grok-4.20',
      tieBreakerClient: grokClient,
    };

    const payload = await runJudge(TRIPLE, config);

    expect(payload.tie_break_path).toBe('quadri-vendor');
    expect(payload.tie_break_fourth_vendor).toBe('xai/grok-4.20');
    expect(payload.judge_verdict).toBe('correct');
    expect(payload.judge_failure_mode).toBeNull();
    expect(payload.judge_model).toBe('ensemble_with_tiebreak');
    expect(payload.judge_rationale).toContain('tie-break');
    expect(payload.judge_rationale).toContain('quadri-vendor');
    expect(payload.judge_ensemble).toHaveLength(4); // 3 primary + 1 fourth
    expect(payload.judge_error).toBeUndefined();
  });

  it('3-primary 1-1-1 split where fourth vote is a fourth bucket → pm-escalation + judge_error', async () => {
    const opusClient = stubClient('correct', null);
    const gptClient = stubClient('incorrect', 'F2');
    const geminiClient = stubClient('incorrect', 'F3');
    const grokClient = stubClient('incorrect', 'F4'); // fourth bucket → 1-1-1-1

    const clients = new Map<string, LlmClient>();
    clients.set('claude-opus-4-7', opusClient);
    clients.set('gpt-5.4-pro', gptClient);
    clients.set('gemini-3.1-pro', geminiClient);

    const config: JudgeConfig = {
      kind: 'ensemble',
      models: ['claude-opus-4-7', 'gpt-5.4-pro', 'gemini-3.1-pro'],
      clients,
      tieBreakerModel: 'xai/grok-4.20',
      tieBreakerClient: grokClient,
    };

    const payload = await runJudge(TRIPLE, config);

    expect(payload.tie_break_path).toBe('pm-escalation');
    expect(payload.tie_break_fourth_vendor).toBe('xai/grok-4.20');
    expect(payload.judge_error).toBe('PM_ESCALATION');
    expect(payload.judge_verdict).toBeUndefined();   // no silent verdict
    expect(payload.judge_failure_mode).toBeUndefined();
    expect(payload.judge_ensemble).toHaveLength(4);
  });

  it('3-primary 2-1 majority → no tie-break dispatch; legacy path', async () => {
    const opusClient = stubClient('correct', null);
    const gptClient = stubClient('correct', null);    // 2 for correct|NA
    const geminiClient = stubClient('incorrect', 'F3'); // 1 for incorrect|F3

    const clients = new Map<string, LlmClient>();
    clients.set('claude-opus-4-7', opusClient);
    clients.set('gpt-5.4-pro', gptClient);
    clients.set('gemini-3.1-pro', geminiClient);

    // Tie-breaker client is registered but should NOT be called.
    let grokCalled = false;
    const grokClient: LlmClient = {
      async complete() {
        grokCalled = true;
        return JSON.stringify({ verdict: 'correct', failure_mode: null, rationale: 'should not be called' });
      },
    };

    const config: JudgeConfig = {
      kind: 'ensemble',
      models: ['claude-opus-4-7', 'gpt-5.4-pro', 'gemini-3.1-pro'],
      clients,
      tieBreakerModel: 'xai/grok-4.20',
      tieBreakerClient: grokClient,
    };

    const payload = await runJudge(TRIPLE, config);

    expect(grokCalled).toBe(false);
    expect(payload.tie_break_path).toBeUndefined();
    expect(payload.tie_break_fourth_vendor).toBeUndefined();
    expect(payload.judge_verdict).toBe('correct');
    expect(payload.judge_failure_mode).toBeNull();
    expect(payload.judge_ensemble).toHaveLength(3); // 3 primary, no fourth
  });

  it('3-primary WITHOUT tieBreakerClient → legacy computeMajority path on 1-1-1 (back-compat preserved)', async () => {
    const opusClient = stubClient('correct', null);
    const gptClient = stubClient('incorrect', 'F3');
    const geminiClient = stubClient('incorrect', 'F4');

    const clients = new Map<string, LlmClient>();
    clients.set('claude-opus-4-7', opusClient);
    clients.set('gpt-5.4-pro', gptClient);
    clients.set('gemini-3.1-pro', geminiClient);

    const config: JudgeConfig = {
      kind: 'ensemble',
      models: ['claude-opus-4-7', 'gpt-5.4-pro', 'gemini-3.1-pro'],
      clients,
      // No tieBreakerModel / tieBreakerClient → legacy path.
    };

    const payload = await runJudge(TRIPLE, config);

    expect(payload.tie_break_path).toBeUndefined();
    // Legacy computeMajority 1-1-1 tie handling: returns the first-in-list
    // judge's result verbatim (tie-breaker convention pre-dating B2).
    // The judge_model field carries the tie-breaker's model id, NOT
    // 'ensemble_majority' (that string only applies when a clear winner
    // exists without tie).
    expect(payload.judge_model).toBe('claude-opus-4-7');
    expect(payload.judge_ensemble).toHaveLength(3);
  });
});
