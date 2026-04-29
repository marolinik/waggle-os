// CC Sesija A §2.5 Task A17 — adapter isTauri() branch happy-path integration.
//
// Brief: briefs/2026-04-30-cc-sesija-A-waggle-apps-web-integration.md §2.5 Task A17
//
// Verifies the §2.2 adapter.ts isTauri() branches actually route through the
// Tauri command bindings when running inside the Tauri webview, instead of
// falling back to HTTP fetch. The full Tauri-test-harness e2e (launch app +
// onboarding + recall + save) is deferred to Track G Computer Use validation
// per PM 2026-04-30 — this test covers the JS-side wiring contract.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the @tauri-apps modules BEFORE importing adapter so the import chain
// in adapter.ts → tauri-bindings.ts → @tauri-apps/api picks up the mock.
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async () => () => {/* unlisten */}),
}));

import { invoke } from '@tauri-apps/api/core';
import { adapter } from './adapter';

const mockedInvoke = vi.mocked(invoke);

describe('adapter isTauri() branch routing', () => {
  beforeEach(() => {
    mockedInvoke.mockReset();
    // Activate Tauri detection — adapter's isTauri() reads from window.
    (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {};
  });

  afterEach(() => {
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it('searchMemory routes to recall_memory Tauri command (not HTTP fetch)', async () => {
    mockedInvoke.mockResolvedValue({
      results: [
        { id: 'f1', content: 'hit-1', frameType: 'I', importance: 'normal', timestamp: '2026-04-30' },
      ],
      count: 1,
    });

    const result = await adapter.searchMemory('hello world', 'all');

    expect(mockedInvoke).toHaveBeenCalledWith('recall_memory', {
      query: 'hello world',
      scope: 'all',
    });
    expect(result.length).toBe(1);
    expect(result[0].content).toBe('hit-1');
  });

  it('addMemoryFrame routes to save_memory Tauri command with importance string', async () => {
    mockedInvoke.mockResolvedValue({
      id: 'frame-new',
      content: 'saved',
      frameType: 'I',
      importance: 'high',
      timestamp: '2026-04-30',
    });

    await adapter.addMemoryFrame({
      type: 'insight',
      title: 'test',
      content: 'saved',
      importance: 3, // numeric → 'high' via IMPORTANCE_NUM_TO_STRING
      timestamp: '2026-04-30',
      workspaceId: 'ws-1',
      metadata: { source: 'user_stated' },
    });

    expect(mockedInvoke).toHaveBeenCalledWith('save_memory', {
      content: 'saved',
      workspaceId: 'ws-1',
      importance: 'high',
      source: 'user_stated',
    });
  });

  it('getKnowledgeGraph routes to search_entities Tauri command', async () => {
    mockedInvoke.mockResolvedValue({
      nodes: [{ id: 'n1', label: 'Entity', type: 'person' }],
      edges: [{ source: 'n1', target: 'n2', type: 'knows' }],
    });

    const result = await adapter.getKnowledgeGraph('ws-1', 'personal');

    expect(mockedInvoke).toHaveBeenCalledWith('search_entities', {
      scope: 'personal',
    });
    expect(result.nodes.length).toBe(1);
    expect(result.edges.length).toBe(1);
  });

  it('getKnowledgeGraph defaults to workspace-scoped when scope omitted', async () => {
    mockedInvoke.mockResolvedValue({ nodes: [], edges: [] });

    await adapter.getKnowledgeGraph('ws-2');

    expect(mockedInvoke).toHaveBeenCalledWith('search_entities', {
      workspaceId: 'ws-2',
    });
  });

  it('getIdentity routes to get_identity Tauri command + returns shape', async () => {
    mockedInvoke.mockResolvedValue({
      configured: true,
      name: 'Marko',
      role: 'Founder',
      department: 'Egzakta',
    });

    const id = await adapter.getIdentity();

    expect(mockedInvoke).toHaveBeenCalledWith('get_identity');
    expect(id.configured).toBe(true);
    expect(id.name).toBe('Marko');
  });
});

describe('adapter HTTP fallback when not in Tauri', () => {
  beforeEach(() => {
    mockedInvoke.mockReset();
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    // Stub fetch so HTTP calls return synthetic data without network.
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ results: [] }), { status: 200 }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('searchMemory uses fetch (HTTP) when isTauri() is false', async () => {
    await adapter.searchMemory('q', 'all');
    expect(mockedInvoke).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalled();
  });
});
