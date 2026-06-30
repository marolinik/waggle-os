import { describe, it, expect, afterEach } from 'vitest';
import { MindDB } from '@waggle/core';
import { Orchestrator } from '../src/orchestrator.js';
import { MockEmbedder } from '../../hive-mind-core/tests/mind/helpers/mock-embedder.js';

describe('buildSystemPrompt goal-ancestry (#6)', () => {
  const dbs: MindDB[] = [];
  function orch(goalAncestry?: { project?: string; goal?: string; mission?: string; task?: string }) {
    const db = new MindDB(':memory:');
    dbs.push(db);
    return new Orchestrator({ db, embedder: new MockEmbedder(), ...(goalAncestry ? { goalAncestry } : {}) });
  }
  afterEach(() => {
    while (dbs.length) dbs.pop()!.close();
  });

  it("renders the Why You're Here section after setGoalAncestry", () => {
    const o = orch();
    o.setGoalAncestry({ project: 'Acme Redesign', goal: 'Ship the live-output pane' });
    const prompt = o.buildSystemPrompt();
    expect(prompt).toContain("# Why You're Here");
    expect(prompt).toContain('Project: Acme Redesign');
    expect(prompt).toContain('Goal: Ship the live-output pane');
  });

  it('omits the section entirely when no ancestry is set', () => {
    expect(orch().buildSystemPrompt()).not.toContain("# Why You're Here");
  });

  it('accepts goalAncestry via the constructor config', () => {
    expect(orch({ project: 'P' }).buildSystemPrompt()).toContain('Project: P');
  });

  it('clears the section when setGoalAncestry(null)', () => {
    const o = orch({ project: 'P' });
    expect(o.buildSystemPrompt()).toContain('Project: P');
    o.setGoalAncestry(null);
    expect(o.buildSystemPrompt()).not.toContain("# Why You're Here");
  });
});
