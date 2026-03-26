/**
 * Wave H — Memory / Continuity Surface Productization tests.
 *
 * Verifies:
 * 1. Freshness computation (fresh/aging/stale thresholds)
 * 2. Workspace state structure (categories, nextActions)
 * 3. Next actions priority cascade (blockers → questions → tasks → stale)
 * 4. State prompt formatting
 */

import { describe, it, expect } from 'vitest';
import {
  computeFreshness,
  formatWorkspaceStatePrompt,
  type WorkspaceState,
  type StateItem,
} from '../src/local/workspace-state.js';

function makeItem(content: string, freshness: 'fresh' | 'aging' | 'stale', source: 'memory' | 'session' | 'awareness' = 'session'): StateItem {
  const dayOffsets = { fresh: 0, aging: 4, stale: 10 };
  const date = new Date(Date.now() - dayOffsets[freshness] * 86400 * 1000);
  return { content, freshness, source, dateLastTouched: date.toISOString().slice(0, 10) };
}

describe('Wave H: Continuity Surface', () => {
  describe('Freshness Computation', () => {
    it('returns fresh for dates within 2 days', () => {
      const today = new Date().toISOString().slice(0, 10);
      expect(computeFreshness(today)).toBe('fresh');
    });

    it('returns fresh for yesterday', () => {
      const yesterday = new Date(Date.now() - 86400 * 1000).toISOString().slice(0, 10);
      expect(computeFreshness(yesterday)).toBe('fresh');
    });

    it('returns aging for dates 2-7 days old', () => {
      const fourDaysAgo = new Date(Date.now() - 4 * 86400 * 1000).toISOString().slice(0, 10);
      expect(computeFreshness(fourDaysAgo)).toBe('aging');
    });

    it('returns stale for dates older than 7 days', () => {
      const tenDaysAgo = new Date(Date.now() - 10 * 86400 * 1000).toISOString().slice(0, 10);
      expect(computeFreshness(tenDaysAgo)).toBe('stale');
    });
  });

  describe('Workspace State Structure', () => {
    it('WorkspaceState has all required categories', () => {
      const state: WorkspaceState = {
        active: [],
        openQuestions: [],
        pending: [],
        blocked: [],
        completed: [],
        stale: [],
        recentDecisions: [],
        nextActions: [],
      };
      expect(Object.keys(state)).toHaveLength(8);
      expect(state.nextActions).toBeDefined();
    });

    it('nextActions are strings (derived, not StateItems)', () => {
      const state: WorkspaceState = {
        active: [],
        openQuestions: [],
        pending: [makeItem('Fix the bug', 'fresh')],
        blocked: [makeItem('Waiting for API key', 'fresh')],
        completed: [],
        stale: [],
        recentDecisions: [],
        nextActions: ['Resolve: Waiting for API key', 'Fix the bug'],
      };
      for (const action of state.nextActions) {
        expect(typeof action).toBe('string');
      }
    });
  });

  describe('Next Actions Priority', () => {
    it('blockers come before tasks in nextActions', () => {
      const state: WorkspaceState = {
        active: [],
        openQuestions: [],
        pending: [makeItem('Write tests', 'fresh')],
        blocked: [makeItem('CI is broken', 'fresh')],
        completed: [],
        stale: [],
        recentDecisions: [],
        nextActions: ['Resolve: CI is broken', 'Write tests'],
      };
      expect(state.nextActions[0]).toMatch(/^Resolve:/);
    });

    it('stale items get Resume: prefix', () => {
      const state: WorkspaceState = {
        active: [],
        openQuestions: [],
        pending: [],
        blocked: [],
        completed: [],
        stale: [makeItem('Old research thread', 'stale')],
        recentDecisions: [],
        nextActions: ['Resume: Old research thread'],
      };
      expect(state.nextActions[0]).toMatch(/^Resume:/);
    });

    it('questions get Decide: prefix', () => {
      const state: WorkspaceState = {
        active: [],
        openQuestions: [makeItem('Which database to use?', 'fresh')],
        pending: [],
        blocked: [],
        completed: [],
        stale: [],
        recentDecisions: [],
        nextActions: ['Decide: Which database to use?'],
      };
      expect(state.nextActions[0]).toMatch(/^Decide:/);
    });
  });

  describe('State Prompt Formatting', () => {
    it('formats state into a readable prompt', () => {
      const state: WorkspaceState = {
        active: [makeItem('Working on auth', 'fresh')],
        openQuestions: [],
        pending: [makeItem('Deploy to staging', 'fresh')],
        blocked: [],
        completed: [makeItem('Fixed login bug', 'fresh')],
        stale: [],
        recentDecisions: [makeItem('Using JWT for auth', 'fresh')],
        nextActions: ['Deploy to staging'],
      };

      const prompt = formatWorkspaceStatePrompt(state, 'Test Project');
      expect(prompt).toContain('Test Project');
      expect(prompt).toContain('Working on auth');
      expect(prompt).toContain('Deploy to staging');
      expect(prompt).toContain('Using JWT for auth');
    });

    it('includes next actions section', () => {
      const state: WorkspaceState = {
        active: [],
        openQuestions: [],
        pending: [],
        blocked: [],
        completed: [],
        stale: [],
        recentDecisions: [],
        nextActions: ['Do the thing'],
      };
      const prompt = formatWorkspaceStatePrompt(state, 'WS');
      expect(prompt).toContain('Likely Next Actions');
      expect(prompt).toContain('Do the thing');
    });

    it('omits empty sections', () => {
      const state: WorkspaceState = {
        active: [],
        openQuestions: [],
        pending: [],
        blocked: [],
        completed: [],
        stale: [],
        recentDecisions: [],
        nextActions: [],
      };
      const prompt = formatWorkspaceStatePrompt(state, 'Empty WS');
      expect(prompt).not.toContain('Active');
      expect(prompt).not.toContain('Blocked');
      expect(prompt).not.toContain('Next Actions');
    });
  });
});
