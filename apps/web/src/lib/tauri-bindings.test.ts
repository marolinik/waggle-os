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
import { listen } from '@tauri-apps/api/event';
import {
  isTauri,
  describeDesktopShellNotice,
  isDesktopNavigationPath,
  listenDesktopShellEvents,
  listenDesktopNavigation,
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
  ensureDesktopService,
  listenDesktopServiceLifecycle,
} from './tauri-bindings';

const mockedInvoke = vi.mocked(invoke);
const mockedListen = vi.mocked(listen);

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

describe('managed desktop service bindings', () => {
  beforeEach(() => {
    mockedInvoke.mockReset();
    mockedListen.mockReset();
    (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {};
  });

  afterEach(() => {
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it('returns the exact validated endpoint from ensure_service', async () => {
    mockedInvoke.mockResolvedValue({ port: 49151, instanceId: 'desktop-instance-a' });

    await expect(ensureDesktopService()).resolves.toEqual({
      port: 49151,
      instanceId: 'desktop-instance-a',
    });
    expect(mockedInvoke).toHaveBeenCalledWith('ensure_service');
  });

  it.each([
    [{ port: 0, instanceId: 'desktop-instance-a' }],
    [{ port: 65536, instanceId: 'desktop-instance-a' }],
    [{ port: 49151.5, instanceId: 'desktop-instance-a' }],
    [{ port: 49151, instanceId: '   ' }],
    [{ port: 49151 }],
  ])('rejects malformed ensure_service endpoint %#', async (endpoint) => {
    mockedInvoke.mockResolvedValue(endpoint);
    await expect(ensureDesktopService()).rejects.toThrow(/invalid desktop service endpoint/);
  });

  it('deduplicates paired restart signals, resets on ready, rejects malformed ready, and disposes both listeners', async () => {
    const handlers = new Map<string, (event: { payload: unknown }) => void>();
    const unlisteners = [vi.fn(), vi.fn()];
    mockedListen.mockImplementation(async (eventName, eventHandler) => {
      handlers.set(String(eventName), eventHandler as (event: { payload: unknown }) => void);
      return unlisteners[handlers.size - 1];
    });
    const onEvent = vi.fn();

    const dispose = await listenDesktopServiceLifecycle(onEvent);
    expect([...handlers.keys()]).toEqual([
      'waggle://service-status',
      'waggle://service-restart-needed',
    ]);

    handlers.get('waggle://service-restart-needed')?.({ payload: undefined });
    handlers.get('waggle://service-status')?.({ payload: { status: 'restarting' } });
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenLastCalledWith({ status: 'restarting' });

    handlers.get('waggle://service-status')?.({
      payload: {
        status: 'ready',
        endpoint: { port: 49151, instanceId: 'desktop-instance-a' },
      },
    });
    expect(onEvent).toHaveBeenLastCalledWith({
      status: 'ready',
      endpoint: { port: 49151, instanceId: 'desktop-instance-a' },
    });

    handlers.get('waggle://service-restart-needed')?.({ payload: undefined });
    expect(onEvent).toHaveBeenLastCalledWith({ status: 'restarting' });
    expect(onEvent).toHaveBeenCalledTimes(3);

    handlers.get('waggle://service-status')?.({
      payload: { status: 'ready', endpoint: { port: 0, instanceId: '' } },
    });
    expect(onEvent).toHaveBeenLastCalledWith({
      status: 'failed',
      error: 'Tauri emitted an invalid desktop service endpoint',
    });

    dispose();
    expect(unlisteners[0]).toHaveBeenCalledOnce();
    expect(unlisteners[1]).toHaveBeenCalledOnce();
  });

  it.each([
    'waggle://service-status',
    'waggle://service-restart-needed',
  ] as const)('disposes the surviving listener when %s registration fails', async (failedEvent) => {
    const registrationError = new Error(`${failedEvent} registration failed`);
    const survivingUnlisten = vi.fn();
    mockedListen.mockImplementation(async (eventName) => {
      if (eventName === failedEvent) throw registrationError;
      return survivingUnlisten;
    });

    await expect(listenDesktopServiceLifecycle(vi.fn())).rejects.toBe(registrationError);
    expect(survivingUnlisten).toHaveBeenCalledOnce();
  });
});

describe('desktop shell event bindings', () => {
  beforeEach(() => {
    mockedListen.mockReset();
  });

  it('accepts only shipped desktop navigation destinations', () => {
    expect(isDesktopNavigationPath('/settings')).toBe(true);
    expect(isDesktopNavigationPath('/about')).toBe(false);
    expect(isDesktopNavigationPath('https://waggle-os.ai')).toBe(false);
    expect(isDesktopNavigationPath(undefined)).toBe(false);
  });

  it('listens to desktop navigation events and filters unsupported payloads', async () => {
    let handler: ((event: { payload: unknown }) => void) | undefined;
    const unlisten = vi.fn();
    mockedListen.mockImplementationOnce(async (eventName, eventHandler) => {
      expect(eventName).toBe('waggle://navigate');
      handler = eventHandler as (event: { payload: unknown }) => void;
      return unlisten;
    });

    const onNavigate = vi.fn();
    const result = await listenDesktopNavigation(onNavigate);
    expect(result).toBe(unlisten);

    handler?.({ payload: '/about' });
    expect(onNavigate).not.toHaveBeenCalled();

    handler?.({ payload: '/settings' });
    expect(onNavigate).toHaveBeenCalledWith('/settings');
  });

  it('maps desktop service and update events to user-visible notices', () => {
    expect(describeDesktopShellNotice('waggle://service-status', { status: 'restarting' })).toEqual({
      title: 'Local service reconnecting',
      description: 'Waggle is restarting the local service. Work resumes automatically when it reconnects.',
    });
    expect(describeDesktopShellNotice('waggle://service-status', { status: 'failed' })).toEqual({
      title: 'Local service stopped',
      description: 'Waggle could not restart the local service. Restart the desktop app to recover.',
      variant: 'destructive',
    });
    expect(describeDesktopShellNotice('waggle://service-restart-needed')).toEqual({
      title: 'Local service restart needed',
      description: 'Waggle detected an unhealthy local service and is restarting it now.',
    });
    expect(describeDesktopShellNotice('waggle://update-available', { version: '1.2.3' })).toEqual({
      title: 'Update available',
      description: 'Waggle 1.2.3 is available. Use your configured release channel to update.',
    });
    expect(describeDesktopShellNotice('waggle://service-status', { status: 'healthy' })).toBeNull();
  });

  it('listens to desktop service/update events and disposes every listener', async () => {
    const handlers = new Map<string, (event: { payload: unknown }) => void>();
    const unlisteners = [vi.fn(), vi.fn(), vi.fn()];
    mockedListen.mockImplementation(async (eventName, eventHandler) => {
      handlers.set(String(eventName), eventHandler as (event: { payload: unknown }) => void);
      return unlisteners[handlers.size - 1];
    });

    const onNotice = vi.fn();
    const dispose = await listenDesktopShellEvents(onNotice);

    expect([...handlers.keys()]).toEqual([
      'waggle://service-status',
      'waggle://service-restart-needed',
      'waggle://update-available',
    ]);

    handlers.get('waggle://service-status')?.({ payload: { status: 'failed' } });
    expect(onNotice).toHaveBeenCalledWith(expect.objectContaining({ title: 'Local service stopped' }));

    handlers.get('waggle://service-status')?.({ payload: { status: 'healthy' } });
    expect(onNotice).toHaveBeenCalledTimes(1);

    dispose();
    for (const unlisten of unlisteners) {
      expect(unlisten).toHaveBeenCalled();
    }
  });

  it('disposes fulfilled listeners when a sibling shell registration rejects', async () => {
    const firstUnlisten = vi.fn();
    const thirdUnlisten = vi.fn();
    const registrationError = new Error('shell listener registration failed');
    mockedListen
      .mockResolvedValueOnce(firstUnlisten)
      .mockRejectedValueOnce(registrationError)
      .mockResolvedValueOnce(thirdUnlisten);

    await expect(listenDesktopShellEvents(vi.fn())).rejects.toBe(registrationError);
    expect(firstUnlisten).toHaveBeenCalledOnce();
    expect(thirdUnlisten).toHaveBeenCalledOnce();
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
