/**
 * L-16 — context-rail-fetch vitests. Pure helper; mocked adapter.
 */
import { describe, it, expect } from 'vitest';
import {
  buildMemoryQuery,
  rankNeighbors,
  fetchContextRailItems,
  DEFAULT_MEMORY_LIMIT,
  DEFAULT_NEIGHBOR_LIMIT,
  type ContextRailAdapter,
  type ContextRailTarget,
} from './context-rail-fetch';
import type { MemoryFrame, KGNode, KGEdge } from './types';

function mkFrame(overrides: Partial<MemoryFrame> = {}): MemoryFrame {
  return {
    id: 'f1',
    type: 'fact',
    title: 'Frame one',
    content: 'First line of frame content\nsecond line that should not show up in title',
    importance: 50,
    timestamp: '2026-04-19T12:00:00Z',
    workspaceId: 'ws-1',
    ...overrides,
  };
}

function mkNode(id: string, label: string, type = 'concept'): KGNode {
  return { id, label, type };
}

function mkEdge(source: string, target: string, relationship = 'relates-to'): KGEdge {
  return { source, target, relationship };
}

function mkAdapter(
  searchMemory: (query: string, scope?: string) => Promise<MemoryFrame[]>,
  getKnowledgeGraph: (ws: string, scope?: 'current' | 'personal' | 'all')
    => Promise<{ nodes: KGNode[]; edges: KGEdge[] }>,
): ContextRailAdapter {
  return { searchMemory, getKnowledgeGraph };
}

describe('buildMemoryQuery', () => {
  it('uses label for entity/frame/message targets', () => {
    const frame: ContextRailTarget = { type: 'frame', id: 'f1', label: 'Claude' };
    const entity: ContextRailTarget = { type: 'entity', id: 'e1', label: 'Anthropic' };
    const message: ContextRailTarget = { type: 'message', id: 'm1', label: 'hi there' };
    expect(buildMemoryQuery(frame)).toBe('Claude');
    expect(buildMemoryQuery(entity)).toBe('Anthropic');
    expect(buildMemoryQuery(message)).toBe('hi there');
  });

  it('falls back to id for file targets with empty label', () => {
    const target: ContextRailTarget = { type: 'file', id: '/notes/ideas.md', label: '' };
    expect(buildMemoryQuery(target)).toBe('/notes/ideas.md');
  });

  it('uses label for file targets when present', () => {
    const target: ContextRailTarget = { type: 'file', id: '/notes/ideas.md', label: 'ideas.md' };
    expect(buildMemoryQuery(target)).toBe('ideas.md');
  });
});

describe('rankNeighbors', () => {
  it('returns neighbors + edges around the target entity', () => {
    const nodes = [mkNode('a', 'A'), mkNode('b', 'B'), mkNode('c', 'C'), mkNode('d', 'D')];
    const edges = [mkEdge('a', 'b'), mkEdge('c', 'a'), mkEdge('b', 'd')];
    const { neighbors, relations } = rankNeighbors('a', nodes, edges);
    expect(neighbors.map(n => n.id).sort()).toEqual(['b', 'c']);
    expect(relations).toHaveLength(2);
  });

  it('ranks neighbors by degree, ties broken by label', () => {
    // b has degree 3, c has degree 1, d has degree 1. Among c/d (same degree),
    // label order decides: "C" < "D".
    const nodes = [mkNode('a', 'A'), mkNode('b', 'B'), mkNode('c', 'C'), mkNode('d', 'D')];
    const edges = [
      mkEdge('a', 'b'),
      mkEdge('a', 'c'),
      mkEdge('a', 'd'),
      mkEdge('b', 'c'),
      mkEdge('b', 'd'),
    ];
    const { neighbors } = rankNeighbors('a', nodes, edges);
    expect(neighbors.map(n => n.id)).toEqual(['b', 'c', 'd']);
  });

  it('ignores self-loops', () => {
    const nodes = [mkNode('a', 'A'), mkNode('b', 'B')];
    const edges = [mkEdge('a', 'a'), mkEdge('a', 'b')];
    const { neighbors } = rankNeighbors('a', nodes, edges);
    expect(neighbors.map(n => n.id)).toEqual(['b']);
  });

  it('returns empty when the target entity has no edges', () => {
    const nodes = [mkNode('a', 'A'), mkNode('b', 'B')];
    const edges = [mkEdge('b', 'a')];
    const { neighbors, relations } = rankNeighbors('z', nodes, edges);
    expect(neighbors).toEqual([]);
    expect(relations).toEqual([]);
  });
});

describe('fetchContextRailItems', () => {
  it('returns memory frames for a frame target', async () => {
    const adapter = mkAdapter(
      async () => [mkFrame()],
      async () => ({ nodes: [], edges: [] }),
    );
    const target: ContextRailTarget = { type: 'frame', id: 'f1', label: 'Claude' };
    const items = await fetchContextRailItems(target, adapter);
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('memory');
    expect(items[0].id).toBe('frame-f1');
    expect(items[0].title).toBe('First line of frame content');
  });

  it('adds entity + relation items for an entity target, in KG-first order', async () => {
    const nodes = [
      mkNode('target', 'Target', 'person'),
      mkNode('neighbor-1', 'N1'),
      mkNode('neighbor-2', 'N2'),
    ];
    const edges = [mkEdge('target', 'neighbor-1', 'works-with'), mkEdge('neighbor-2', 'target', 'reports-to')];
    const adapter = mkAdapter(
      async () => [mkFrame({ id: 'mem-1', content: 'Target info' })],
      async () => ({ nodes, edges }),
    );
    const target: ContextRailTarget = { type: 'entity', id: 'target', label: 'Target', workspaceId: 'ws-1' };
    const items = await fetchContextRailItems(target, adapter);
    // Entity-first ordering: entities, then relations, then memory.
    expect(items.map(i => i.kind)).toEqual(['entity', 'entity', 'relation', 'relation', 'memory']);
    expect(items.find(i => i.id === 'entity-neighbor-1')).toBeDefined();
  });

  it('deduplicates items by id', async () => {
    const adapter = mkAdapter(
      async () => [mkFrame({ id: 'dup' }), mkFrame({ id: 'dup' }), mkFrame({ id: 'other' })],
      async () => ({ nodes: [], edges: [] }),
    );
    const target: ContextRailTarget = { type: 'frame', id: 'f1', label: 'x' };
    const items = await fetchContextRailItems(target, adapter);
    expect(items.map(i => i.id).sort()).toEqual(['frame-dup', 'frame-other']);
  });

  it('respects memoryLimit opt', async () => {
    const frames = Array.from({ length: 25 }, (_, i) => mkFrame({ id: `f${i}` }));
    const adapter = mkAdapter(async () => frames, async () => ({ nodes: [], edges: [] }));
    const target: ContextRailTarget = { type: 'frame', id: 'root', label: 'q' };
    const items = await fetchContextRailItems(target, adapter, { memoryLimit: 3 });
    expect(items).toHaveLength(3);
  });

  it('caps entity neighbors at neighborLimit', async () => {
    const nodes = [
      mkNode('target', 'Target'),
      ...Array.from({ length: 10 }, (_, i) => mkNode(`n${i}`, `N${i}`)),
    ];
    const edges = Array.from({ length: 10 }, (_, i) => mkEdge('target', `n${i}`));
    const adapter = mkAdapter(
      async () => [],
      async () => ({ nodes, edges }),
    );
    const target: ContextRailTarget = { type: 'entity', id: 'target', label: 'Target' };
    const items = await fetchContextRailItems(target, adapter, { neighborLimit: 3, relationLimit: 0 });
    expect(items.filter(i => i.kind === 'entity')).toHaveLength(3);
    expect(items.filter(i => i.kind === 'relation')).toHaveLength(0);
  });

  it('falls back to memory when the KG fetch throws', async () => {
    const adapter = mkAdapter(
      async () => [mkFrame()],
      async () => { throw new Error('graph unreachable'); },
    );
    const target: ContextRailTarget = { type: 'entity', id: 'e1', label: 'E' };
    const items = await fetchContextRailItems(target, adapter);
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('memory');
  });

  it('returns the partial KG list when memory search throws', async () => {
    const adapter = mkAdapter(
      async () => { throw new Error('memory unreachable'); },
      async () => ({
        nodes: [mkNode('e1', 'E'), mkNode('n1', 'N1')],
        edges: [mkEdge('e1', 'n1')],
      }),
    );
    const target: ContextRailTarget = { type: 'entity', id: 'e1', label: 'E' };
    const items = await fetchContextRailItems(target, adapter);
    // One neighbor + one relation; no memory.
    expect(items.map(i => i.kind)).toEqual(['entity', 'relation']);
  });

  it('returns an empty list when both sources fail', async () => {
    const adapter = mkAdapter(
      async () => { throw new Error('x'); },
      async () => { throw new Error('y'); },
    );
    const target: ContextRailTarget = { type: 'frame', id: 'f1', label: 'nope' };
    const items = await fetchContextRailItems(target, adapter);
    expect(items).toEqual([]);
  });

  it('uses provided workspaceId for KG fetches', async () => {
    let receivedWs = '';
    const adapter = mkAdapter(
      async () => [],
      async (ws) => { receivedWs = ws; return { nodes: [], edges: [] }; },
    );
    const target: ContextRailTarget = { type: 'entity', id: 'x', label: 'X', workspaceId: 'my-ws' };
    await fetchContextRailItems(target, adapter);
    expect(receivedWs).toBe('my-ws');
  });

  it('exports the canonical default limits', () => {
    expect(DEFAULT_MEMORY_LIMIT).toBe(10);
    expect(DEFAULT_NEIGHBOR_LIMIT).toBe(5);
  });
});
