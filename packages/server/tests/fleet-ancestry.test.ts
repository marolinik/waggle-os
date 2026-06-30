/**
 * AI-OS #6 fast-follow — agent-run goal-ancestry: a spawn carries the agent's
 * durable goal + workspace as the "why". Focused unit on the exported helper.
 */
import { describe, it, expect } from 'vitest';
import { buildSpawnAncestry } from '../src/local/routes/fleet.js';

describe('buildSpawnAncestry (#6 agent-run goal)', () => {
  it('includes project (workspace) + goal (agent goal)', () => {
    expect(buildSpawnAncestry('Acme Redesign', 'Ship the pane')).toEqual({
      project: 'Acme Redesign',
      goal: 'Ship the pane',
    });
  });

  it('omits empty levels', () => {
    expect(buildSpawnAncestry(undefined, 'Ship the pane')).toEqual({ goal: 'Ship the pane' });
    expect(buildSpawnAncestry('Acme', undefined)).toEqual({ project: 'Acme' });
    expect(buildSpawnAncestry(undefined, undefined)).toEqual({});
  });
});
