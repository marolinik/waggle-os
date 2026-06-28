import { describe, it, expect } from 'vitest';
import {
  connectorDataToItems,
  runConnectorFetch,
  type ConnectorLike,
} from '../../src/local/connector-harvest.js';

describe('connectorDataToItems', () => {
  it('maps an array of objects, picking a title field', () => {
    const items = connectorDataToItems([
      { name: 'repo-a', stars: 10 },
      { title: 'Issue 1', body: 'x' },
      { id: 42 },
    ]);
    expect(items).toHaveLength(3);
    expect(items[0].title).toBe('repo-a');
    expect(items[1].title).toBe('Issue 1');
    expect(items[2].title).toBe('42');
    expect(items[0].content).toContain('repo-a');
  });

  it('unwraps a single { key: array } wrapper (e.g. { events: [...] })', () => {
    const items = connectorDataToItems({ events: [{ summary: 'Standup' }, { summary: 'Lunch' }] });
    expect(items.map((i) => i.title)).toEqual(['Standup', 'Lunch']);
  });

  it('handles an array of strings', () => {
    const items = connectorDataToItems(['alpha', 'beta']);
    expect(items).toHaveLength(2);
    expect(items[0].content).toBe('alpha');
  });

  it('maps a single object to one item', () => {
    const items = connectorDataToItems({ name: 'profile', email: 'a@b.c' });
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('profile');
  });

  it('returns [] for empty / nullish data', () => {
    expect(connectorDataToItems(null)).toEqual([]);
    expect(connectorDataToItems([])).toEqual([]);
    expect(connectorDataToItems('')).toEqual([]);
  });

  it('caps the number of items', () => {
    const big = Array.from({ length: 200 }, (_, i) => ({ id: i }));
    expect(connectorDataToItems(big, { maxItems: 10 })).toHaveLength(10);
  });

  it('truncates long content', () => {
    const items = connectorDataToItems([{ blob: 'x'.repeat(9000) }]);
    expect(items[0].content.length).toBeLessThanOrEqual(4000);
  });
});

// ── runConnectorFetch ──
function fakeConnector(over: Partial<ConnectorLike> & { id: string }): ConnectorLike {
  return {
    name: over.id,
    execute: async () => ({ success: true, data: [{ name: `${over.id}-item` }] }),
    ...over,
  };
}

function harness() {
  const frames: string[] = [];
  let store: Record<string, string> = {};
  return {
    frames,
    writeFrame: (c: string) => frames.push(c),
    loadHashes: () => store,
    saveHashes: (h: Record<string, string>) => { store = h; },
    getStore: () => store,
  };
}

describe('runConnectorFetch', () => {
  it('harvests opted-in connectors and writes labelled frames', async () => {
    const h = harness();
    const res = await runConnectorFetch({
      connectors: [fakeConnector({ id: 'github', harvestAction: { action: 'list_repos' } })],
      writeFrame: h.writeFrame, loadHashes: h.loadHashes, saveHashes: h.saveHashes,
    });
    expect(res.connectorsFetched).toBe(1);
    expect(res.framesWritten).toBe(1);
    expect(h.frames[0]).toContain('[Harvest:connector:github]');
    expect(h.frames[0]).toContain('github-item');
  });

  it('skips connectors without a harvestAction', async () => {
    const h = harness();
    const res = await runConnectorFetch({
      connectors: [fakeConnector({ id: 'slack' })], // no harvestAction
      writeFrame: h.writeFrame, loadHashes: h.loadHashes, saveHashes: h.saveHashes,
    });
    expect(res.skippedNoAction).toBe(1);
    expect(res.framesWritten).toBe(0);
  });

  it('skips a connector whose result is unchanged since last run', async () => {
    const h = harness();
    const conn = fakeConnector({ id: 'gcal', harvestAction: { action: 'list_events' } });
    const first = await runConnectorFetch({ connectors: [conn], writeFrame: h.writeFrame, loadHashes: h.loadHashes, saveHashes: h.saveHashes });
    expect(first.framesWritten).toBe(1);
    const second = await runConnectorFetch({ connectors: [conn], writeFrame: h.writeFrame, loadHashes: h.loadHashes, saveHashes: h.saveHashes });
    expect(second.skippedUnchanged).toBe(1);
    expect(second.framesWritten).toBe(0);
    expect(h.frames).toHaveLength(1); // no duplicate frame
  });

  it('records an error and writes nothing when an action fails', async () => {
    const h = harness();
    const res = await runConnectorFetch({
      connectors: [{ id: 'jira', name: 'Jira', harvestAction: { action: 'x' }, execute: async () => ({ success: false, error: 'auth expired' }) }],
      writeFrame: h.writeFrame, loadHashes: h.loadHashes, saveHashes: h.saveHashes,
    });
    expect(res.errors).toEqual(['jira: auth expired']);
    expect(res.framesWritten).toBe(0);
  });

  it('isolates a throwing connector from the rest of the sweep', async () => {
    const h = harness();
    const res = await runConnectorFetch({
      connectors: [
        { id: 'bad', name: 'Bad', harvestAction: { action: 'x' }, execute: async () => { throw new Error('boom'); } },
        fakeConnector({ id: 'good', harvestAction: { action: 'list' } }),
      ],
      writeFrame: h.writeFrame, loadHashes: h.loadHashes, saveHashes: h.saveHashes,
    });
    expect(res.errors[0]).toContain('bad: boom');
    expect(res.connectorsFetched).toBe(1); // 'good' still harvested
    expect(h.frames[0]).toContain('[Harvest:connector:good]');
  });
});
