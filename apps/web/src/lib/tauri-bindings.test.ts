// CC Sesija A §2.5 Task A16 — tauri-bindings runtime detection + wrapper tests.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the @tauri-apps/api/core invoke before importing the bindings so the
// wrappers under test pick up the mock. Each test resets the mock body.
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async () => () => {/* unlisten */}),
}));

import { invoke } from '@tauri-apps/api/core';
import {
  isTauri,
  recallMemory,
  saveMemory,
  searchEntities,
  getIdentity,
  compileWikiSection,
  getWikiPages,
  getWikiPage,
  getWikiPageContent,
  isFirstLaunch,
  markFirstLaunchComplete,
  resetFirstLaunch,
} from './tauri-bindings';

const mockedInvoke = vi.mocked(invoke);

describe('isTauri() runtime detection', () => {
  afterEach(() => {
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it('returns false when __TAURI_INTERNALS__ is not present', () => {
    expect(isTauri()).toBe(false);
  });

  it('returns true when __TAURI_INTERNALS__ is present on window', () => {
    (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {};
    expect(isTauri()).toBe(true);
  });
});

describe('memory + identity bindings', () => {
  beforeEach(() => {
    mockedInvoke.mockReset();
  });

  it('recallMemory invokes the recall_memory command with args', async () => {
    mockedInvoke.mockResolvedValue({ results: [], count: 0 });
    await recallMemory({ query: 'test', scope: 'all', limit: 5 });
    expect(mockedInvoke).toHaveBeenCalledWith('recall_memory', {
      query: 'test',
      scope: 'all',
      limit: 5,
    });
  });

  it('saveMemory invokes save_memory with content + optional fields', async () => {
    mockedInvoke.mockResolvedValue({ id: 'frame-123' });
    await saveMemory({ content: 'hello', importance: 'high', source: 'user_stated' });
    expect(mockedInvoke).toHaveBeenCalledWith('save_memory', {
      content: 'hello',
      importance: 'high',
      source: 'user_stated',
    });
  });

  it('searchEntities defaults args to empty object', async () => {
    mockedInvoke.mockResolvedValue({ nodes: [], edges: [] });
    await searchEntities();
    expect(mockedInvoke).toHaveBeenCalledWith('search_entities', {});
  });

  it('getIdentity invokes the get_identity command', async () => {
    mockedInvoke.mockResolvedValue({ configured: false, name: null });
    const r = await getIdentity();
    expect(mockedInvoke).toHaveBeenCalledWith('get_identity');
    expect(r.configured).toBe(false);
  });
});

describe('wiki bindings', () => {
  beforeEach(() => {
    mockedInvoke.mockReset();
  });

  it('compileWikiSection defaults args + invokes', async () => {
    mockedInvoke.mockResolvedValue({});
    await compileWikiSection();
    expect(mockedInvoke).toHaveBeenCalledWith('compile_wiki_section', {});
  });

  it('getWikiPages takes no args', async () => {
    mockedInvoke.mockResolvedValue([]);
    await getWikiPages();
    expect(mockedInvoke).toHaveBeenCalledWith('get_wiki_pages');
  });

  it('getWikiPage passes slug', async () => {
    mockedInvoke.mockResolvedValue({ slug: 's', title: 't' });
    await getWikiPage('my-slug');
    expect(mockedInvoke).toHaveBeenCalledWith('get_wiki_page', { slug: 'my-slug' });
  });

  it('getWikiPageContent passes slug', async () => {
    mockedInvoke.mockResolvedValue({ slug: 's', content: '# md' });
    await getWikiPageContent('my-slug');
    expect(mockedInvoke).toHaveBeenCalledWith('get_wiki_page_content', { slug: 'my-slug' });
  });
});

describe('onboarding flag bindings (A10)', () => {
  beforeEach(() => {
    mockedInvoke.mockReset();
  });

  it('isFirstLaunch resolves a boolean from the IPC', async () => {
    mockedInvoke.mockResolvedValue(true);
    expect(await isFirstLaunch()).toBe(true);
    expect(mockedInvoke).toHaveBeenCalledWith('is_first_launch');
  });

  it('markFirstLaunchComplete invokes void IPC', async () => {
    mockedInvoke.mockResolvedValue(undefined);
    await markFirstLaunchComplete();
    expect(mockedInvoke).toHaveBeenCalledWith('mark_first_launch_complete');
  });

  it('resetFirstLaunch invokes void IPC', async () => {
    mockedInvoke.mockResolvedValue(undefined);
    await resetFirstLaunch();
    expect(mockedInvoke).toHaveBeenCalledWith('reset_first_launch');
  });
});
