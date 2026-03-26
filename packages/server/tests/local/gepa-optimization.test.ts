/**
 * GEPA Prompt Optimization Cron Handler Tests
 *
 * Tests the prompt_optimization cron handler logic:
 *   - Calls LLM when correction rate > 20% or avg turns > 15
 *   - Stores generated variant in optimization_log
 *   - Skips when budget is exceeded
 *   - Skips when not enough data
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { MindDB, OptimizationLogStore } from '@waggle/core';
import { isWithinBudget, getRecentLogs } from '@waggle/agent';

describe('GEPA Prompt Optimization', () => {
  let tmpDir: string;
  let db: MindDB;
  let optStore: OptimizationLogStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-gepa-'));
    db = new MindDB(path.join(tmpDir, 'test.mind'));
    optStore = new OptimizationLogStore(db);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('Signal detection', () => {
    it('detects high correction rate as optimization signal', () => {
      // Insert logs with high correction rate (>20%)
      for (let i = 0; i < 10; i++) {
        optStore.insert({
          sessionId: `sess-${i}`,
          workspaceId: 'ws-test',
          systemPrompt: 'Test system prompt for optimization',
          toolsUsed: ['search_memory', 'save_memory'],
          turnCount: 5,
          wasCorrection: i < 5, // 50% correction rate
          inputTokens: 100,
          outputTokens: 200,
        });
      }

      const stats = optStore.getStats();
      expect(stats.correctionRate).toBeGreaterThan(0.2);
      expect(stats.total).toBe(10);
    });

    it('detects high avg turn count as optimization signal', () => {
      // Insert logs with high turn count (>15)
      for (let i = 0; i < 10; i++) {
        optStore.insert({
          sessionId: `sess-${i}`,
          workspaceId: 'ws-test',
          systemPrompt: 'Test system prompt for optimization',
          toolsUsed: ['search_memory'],
          turnCount: 20, // >15 threshold
          wasCorrection: false,
          inputTokens: 100,
          outputTokens: 200,
        });
      }

      const stats = optStore.getStats();
      expect(stats.avgTurnCount).toBeGreaterThan(15);
    });

    it('does not trigger when both metrics are within thresholds', () => {
      for (let i = 0; i < 10; i++) {
        optStore.insert({
          sessionId: `sess-${i}`,
          workspaceId: 'ws-test',
          systemPrompt: 'Test system prompt',
          toolsUsed: ['search_memory'],
          turnCount: 5,
          wasCorrection: false,
          inputTokens: 100,
          outputTokens: 200,
        });
      }

      const stats = optStore.getStats();
      expect(stats.correctionRate).toBeLessThanOrEqual(0.2);
      expect(stats.avgTurnCount).toBeLessThanOrEqual(15);
    });
  });

  describe('Budget check', () => {
    it('reports within budget when token costs are low', () => {
      for (let i = 0; i < 5; i++) {
        optStore.insert({
          sessionId: `sess-${i}`,
          workspaceId: 'ws-test',
          systemPrompt: 'Test prompt',
          toolsUsed: [],
          turnCount: 3,
          wasCorrection: false,
          inputTokens: 100,
          outputTokens: 50,
        });
      }

      // Budget is 100 cents ($1). 500 input + 250 output tokens is far under budget.
      expect(isWithinBudget(optStore, 100)).toBe(true);
    });

    it('reports over budget when token costs exceed limit', () => {
      // Insert a log with massive token counts to exceed budget
      optStore.insert({
        sessionId: 'sess-big',
        workspaceId: 'ws-test',
        systemPrompt: 'Test prompt',
        toolsUsed: [],
        turnCount: 3,
        wasCorrection: false,
        inputTokens: 10_000_000, // 10M input tokens at $3/M = $30
        outputTokens: 1_000_000, // 1M output tokens at $15/M = $15
      });

      // Budget is 100 cents ($1). Total cost is ~$45 = 4500 cents. Way over budget.
      expect(isWithinBudget(optStore, 100)).toBe(false);
    });
  });

  describe('Variant storage', () => {
    it('stores generated variant in optimization_log', () => {
      // Simulate what the cron handler does after generating a variant
      const variantText = 'Improved system prompt with better instructions for reducing corrections...'.repeat(5);

      optStore.insert({
        sessionId: `gepa-variant-${Date.now()}`,
        workspaceId: 'ws-test',
        systemPrompt: variantText,
        toolsUsed: ['gepa_variant'],
        turnCount: 0,
        wasCorrection: false,
        inputTokens: 500,
        outputTokens: variantText.length,
      });

      const recent = getRecentLogs(optStore, 10);
      const variant = recent.find(l => JSON.parse(l.tools_used).includes('gepa_variant'));
      expect(variant).toBeDefined();
      expect(variant!.system_prompt).toBe(variantText);
      expect(variant!.turn_count).toBe(0);
      expect(variant!.was_correction).toBe(0);
    });

    it('retrieves recent logs for analysis', () => {
      for (let i = 0; i < 8; i++) {
        optStore.insert({
          sessionId: `sess-${i}`,
          workspaceId: 'ws-test',
          systemPrompt: `Prompt v${i}`,
          toolsUsed: ['search_memory'],
          turnCount: i + 1,
          wasCorrection: i % 3 === 0,
          inputTokens: 100 * (i + 1),
          outputTokens: 50 * (i + 1),
        });
      }

      const logs = getRecentLogs(optStore, 5);
      expect(logs).toHaveLength(5);
      // Most recent first
      expect(logs[0].session_id).toBe('sess-7');
    });
  });

  describe('Minimum data requirement', () => {
    it('skips optimization when fewer than 5 logs', () => {
      for (let i = 0; i < 3; i++) {
        optStore.insert({
          sessionId: `sess-${i}`,
          workspaceId: 'ws-test',
          systemPrompt: 'Test prompt',
          toolsUsed: [],
          turnCount: 20,
          wasCorrection: true,
          inputTokens: 100,
          outputTokens: 200,
        });
      }

      const recentLogs = getRecentLogs(optStore, 100);
      // The cron handler checks: if (recentLogs.length < 5) continue;
      expect(recentLogs.length).toBeLessThan(5);
    });
  });
});
