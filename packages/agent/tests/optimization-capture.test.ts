import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MindDB, OptimizationLogStore } from '@waggle/core';
import {
  captureInteraction,
  getRecentLogs,
  getWorkspaceLogs,
  isWithinBudget,
} from '../src/optimization-capture.js';
import type { AgentResponse } from '../src/agent-loop.js';

describe('optimization-capture', () => {
  let db: MindDB;
  let store: OptimizationLogStore;

  beforeEach(() => {
    db = new MindDB(':memory:');
    store = new OptimizationLogStore(db);
  });

  afterEach(() => {
    db.close();
  });

  function makeResponse(overrides?: Partial<AgentResponse>): AgentResponse {
    return {
      content: 'Hello, I can help with that.',
      toolsUsed: ['search_memory', 'save_memory'],
      usage: { inputTokens: 500, outputTokens: 200 },
      ...overrides,
    };
  }

  // ── captureInteraction ─────────────────────────────────────

  describe('captureInteraction', () => {
    it('stores a log entry with correct fields', () => {
      const entry = captureInteraction(store, {
        sessionId: 'session-1',
        workspaceId: 'ws-abc',
        systemPrompt: 'You are a helpful assistant.',
        response: makeResponse(),
        turnCount: 3,
        wasCorrection: false,
      });

      expect(entry.id).toBeGreaterThan(0);
      expect(entry.session_id).toBe('session-1');
      expect(entry.workspace_id).toBe('ws-abc');
      expect(entry.system_prompt).toBe('You are a helpful assistant.');
      expect(JSON.parse(entry.tools_used)).toEqual(['search_memory', 'save_memory']);
      expect(entry.turn_count).toBe(3);
      expect(entry.was_correction).toBe(0);
      expect(entry.input_tokens).toBe(500);
      expect(entry.output_tokens).toBe(200);
      expect(entry.timestamp).toBeTruthy();
    });

    it('records wasCorrection as 1 when true', () => {
      const entry = captureInteraction(store, {
        sessionId: 'session-1',
        workspaceId: 'ws-abc',
        systemPrompt: 'test prompt',
        response: makeResponse(),
        turnCount: 1,
        wasCorrection: true,
      });

      expect(entry.was_correction).toBe(1);
    });

    it('handles empty toolsUsed', () => {
      const entry = captureInteraction(store, {
        sessionId: 'session-1',
        workspaceId: 'ws-abc',
        systemPrompt: 'test prompt',
        response: makeResponse({ toolsUsed: [] }),
        turnCount: 1,
        wasCorrection: false,
      });

      expect(JSON.parse(entry.tools_used)).toEqual([]);
    });

    it('defaults token counts to 0 when missing', () => {
      const response: AgentResponse = {
        content: 'response',
        toolsUsed: [],
        usage: { inputTokens: 0, outputTokens: 0 },
      };
      const entry = captureInteraction(store, {
        sessionId: 's1',
        workspaceId: 'ws1',
        systemPrompt: 'prompt',
        response,
        turnCount: 1,
        wasCorrection: false,
      });

      expect(entry.input_tokens).toBe(0);
      expect(entry.output_tokens).toBe(0);
    });
  });

  // ── getRecentLogs ──────────────────────────────────────────

  describe('getRecentLogs', () => {
    it('retrieves stored entries ordered by most recent first', () => {
      captureInteraction(store, {
        sessionId: 's1', workspaceId: 'ws1', systemPrompt: 'p1',
        response: makeResponse(), turnCount: 1, wasCorrection: false,
      });
      captureInteraction(store, {
        sessionId: 's2', workspaceId: 'ws1', systemPrompt: 'p2',
        response: makeResponse(), turnCount: 2, wasCorrection: true,
      });

      const logs = getRecentLogs(store, 10);
      expect(logs).toHaveLength(2);
      // Ordered by timestamp DESC, id DESC — s2 was inserted second so it comes first
      expect(logs[0].session_id).toBe('s2');
      expect(logs[1].session_id).toBe('s1');
    });

    it('respects the limit parameter', () => {
      for (let i = 0; i < 5; i++) {
        captureInteraction(store, {
          sessionId: `s${i}`, workspaceId: 'ws1', systemPrompt: 'p',
          response: makeResponse(), turnCount: 1, wasCorrection: false,
        });
      }

      const logs = getRecentLogs(store, 3);
      expect(logs).toHaveLength(3);
    });

    it('returns empty array when no entries exist', () => {
      const logs = getRecentLogs(store);
      expect(logs).toEqual([]);
    });
  });

  // ── getWorkspaceLogs ───────────────────────────────────────

  describe('getWorkspaceLogs', () => {
    it('filters by workspace ID', () => {
      captureInteraction(store, {
        sessionId: 's1', workspaceId: 'ws-a', systemPrompt: 'p',
        response: makeResponse(), turnCount: 1, wasCorrection: false,
      });
      captureInteraction(store, {
        sessionId: 's2', workspaceId: 'ws-b', systemPrompt: 'p',
        response: makeResponse(), turnCount: 1, wasCorrection: false,
      });
      captureInteraction(store, {
        sessionId: 's3', workspaceId: 'ws-a', systemPrompt: 'p',
        response: makeResponse(), turnCount: 2, wasCorrection: true,
      });

      const wsALogs = getWorkspaceLogs(store, 'ws-a');
      expect(wsALogs).toHaveLength(2);
      expect(wsALogs.every(l => l.workspace_id === 'ws-a')).toBe(true);

      const wsBLogs = getWorkspaceLogs(store, 'ws-b');
      expect(wsBLogs).toHaveLength(1);
    });
  });

  // ── Entries have correct shape ─────────────────────────────

  describe('entry shape', () => {
    it('has all required fields with correct types', () => {
      const entry = captureInteraction(store, {
        sessionId: 'session-x',
        workspaceId: 'workspace-y',
        systemPrompt: 'You are helpful.',
        response: makeResponse({ toolsUsed: ['bash', 'read_file'] }),
        turnCount: 7,
        wasCorrection: false,
      });

      // Check all fields exist and are of expected types
      expect(typeof entry.id).toBe('number');
      expect(typeof entry.session_id).toBe('string');
      expect(typeof entry.workspace_id).toBe('string');
      expect(typeof entry.system_prompt).toBe('string');
      expect(typeof entry.tools_used).toBe('string');
      expect(typeof entry.turn_count).toBe('number');
      expect(typeof entry.was_correction).toBe('number');
      expect(typeof entry.input_tokens).toBe('number');
      expect(typeof entry.output_tokens).toBe('number');
      expect(typeof entry.timestamp).toBe('string');

      // tools_used is valid JSON array
      const parsed = JSON.parse(entry.tools_used);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toEqual(['bash', 'read_file']);
    });
  });

  // ── Budget enforcement ─────────────────────────────────────

  describe('isWithinBudget', () => {
    it('returns true when no entries exist (under budget)', () => {
      expect(isWithinBudget(store, 100)).toBe(true);
    });

    it('returns true when token cost is under budget', () => {
      // Insert entry with small token count
      captureInteraction(store, {
        sessionId: 's1', workspaceId: 'ws1', systemPrompt: 'p',
        response: makeResponse({ usage: { inputTokens: 100, outputTokens: 50 } }),
        turnCount: 1, wasCorrection: false,
      });

      // 100 input * $3/M + 50 output * $15/M = $0.0003 + $0.00075 = ~$0.00105 = ~0.1 cents
      // Budget is 100 cents = $1, so well within budget
      expect(isWithinBudget(store, 100)).toBe(true);
    });

    it('returns false when token cost exceeds budget', () => {
      // Insert entry with large token count to exceed a tiny budget
      captureInteraction(store, {
        sessionId: 's1', workspaceId: 'ws1', systemPrompt: 'p',
        response: makeResponse({ usage: { inputTokens: 1_000_000, outputTokens: 500_000 } }),
        turnCount: 1, wasCorrection: false,
      });

      // 1M input * $3/M + 500K output * $15/M = $3 + $7.5 = $10.50 = 1050 cents
      // Budget is 1 cent, so way over budget
      expect(isWithinBudget(store, 1)).toBe(false);
    });

    it('respects custom cost-per-token rates', () => {
      captureInteraction(store, {
        sessionId: 's1', workspaceId: 'ws1', systemPrompt: 'p',
        response: makeResponse({ usage: { inputTokens: 10_000, outputTokens: 5_000 } }),
        turnCount: 1, wasCorrection: false,
      });

      // With very cheap rates: 10K * $0.0001/M + 5K * $0.0001/M ≈ ~0 cents
      expect(isWithinBudget(store, 1, 0.0001 / 1_000_000, 0.0001 / 1_000_000)).toBe(true);

      // With very expensive rates: 10K * $100/M + 5K * $100/M = $1 + $0.5 = 150 cents
      expect(isWithinBudget(store, 1, 100 / 1_000_000, 100 / 1_000_000)).toBe(false);
    });
  });

  // ── Store stats ────────────────────────────────────────────

  describe('getStats (via store)', () => {
    it('computes correct aggregate stats', () => {
      captureInteraction(store, {
        sessionId: 's1', workspaceId: 'ws1', systemPrompt: 'p',
        response: makeResponse({ usage: { inputTokens: 100, outputTokens: 50 } }),
        turnCount: 3, wasCorrection: false,
      });
      captureInteraction(store, {
        sessionId: 's2', workspaceId: 'ws1', systemPrompt: 'p',
        response: makeResponse({ usage: { inputTokens: 200, outputTokens: 100 } }),
        turnCount: 5, wasCorrection: true,
      });

      const stats = store.getStats();
      expect(stats.total).toBe(2);
      expect(stats.correctionRate).toBe(0.5);      // 1/2
      expect(stats.avgTurnCount).toBe(4);           // (3+5)/2
      expect(stats.totalInputTokens).toBe(300);     // 100+200
      expect(stats.totalOutputTokens).toBe(150);    // 50+100
    });

    it('returns zeros when empty', () => {
      const stats = store.getStats();
      expect(stats.total).toBe(0);
      expect(stats.correctionRate).toBe(0);
      expect(stats.avgTurnCount).toBe(0);
      expect(stats.totalInputTokens).toBe(0);
      expect(stats.totalOutputTokens).toBe(0);
    });
  });
});
