import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

type FetchCall = {
  url: string;
  init?: RequestInit;
};

type RuntimeInstalledListener = () => void;
type ContextMenuClickListener = (
  info: { menuItemId?: string; selectionText?: string },
  tab?: { title?: string; url?: string },
) => Promise<void> | void;

function response(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

function loadBackground(options?: {
  sessionToken?: string;
  pairStatus?: number;
  pairBody?: unknown;
}) {
  const source = fs.readFileSync(path.resolve(process.cwd(), 'apps/browser-ext/background.js'), 'utf8');
  const storage: Record<string, unknown> = {};
  if (options?.sessionToken) storage.sessionToken = options.sessionToken;
  const calls: FetchCall[] = [];
  const createdMenus: unknown[] = [];
  const badgeTextCalls: unknown[] = [];
  const badgeColorCalls: unknown[] = [];
  let installedListener: RuntimeInstalledListener | null = null;
  let contextMenuClickListener: ContextMenuClickListener | null = null;

  const chrome = {
    storage: {
      local: {
        async get(keys: string[]) {
          return Object.fromEntries(keys.map((key) => [key, storage[key]]));
        },
        async set(values: Record<string, unknown>) {
          Object.assign(storage, values);
        },
      },
    },
    runtime: {
      onMessage: { addListener() {} },
      onInstalled: {
        addListener(listener: RuntimeInstalledListener) {
          installedListener = listener;
        },
      },
    },
    contextMenus: {
      create(menu: unknown) {
        createdMenus.push(menu);
      },
      onClicked: {
        addListener(listener: ContextMenuClickListener) {
          contextMenuClickListener = listener;
        },
      },
    },
    action: {
      async setBadgeText(options: unknown) {
        badgeTextCalls.push(options);
      },
      async setBadgeBackgroundColor(options: unknown) {
        badgeColorCalls.push(options);
      },
    },
  };

  const context = {
    chrome,
    setTimeout,
    fetch: async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith('/api/browser-ext/session-token')) {
        return response(options?.pairStatus ?? 200, options?.pairBody ?? { token: 'paired-token' });
      }
      if (url.endsWith('/api/memory/frames')) {
        const headers = init?.headers as Record<string, string> | undefined;
        if (headers?.Authorization !== 'Bearer paired-token' && headers?.Authorization !== 'Bearer stored-token') {
          return response(401, { error: 'Unauthorized', code: 'MISSING_TOKEN' });
        }
        return response(200, { saved: true, frameId: 'frame-1' });
      }
      return response(200, { ok: true, activeWorkspace: 'test-workspace' });
    },
  };

  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'apps/browser-ext/background.js' });
  return {
    context: context as typeof context & { saveMemory: (payload: { content: string }) => Promise<unknown> },
    calls,
    storage,
    createdMenus,
    badgeTextCalls,
    badgeColorCalls,
    getInstalledListener: () => installedListener,
    getContextMenuClickListener: () => contextMenuClickListener,
  };
}

describe('Browser Companion background pairing', () => {
  it('fetches and stores a session token before saving when the extension is not paired yet', async () => {
    const { context, calls, storage } = loadBackground();

    const result = await context.saveMemory({ content: 'hello from a page' });

    expect(result).toMatchObject({ saved: true, frameId: 'frame-1' });
    expect(storage.sessionToken).toBe('paired-token');
    expect(calls.map((call) => call.url)).toEqual([
      'http://127.0.0.1:3333/api/browser-ext/session-token',
      'http://127.0.0.1:3333/api/memory/frames',
    ]);
    expect(calls[1].init?.headers).toMatchObject({ Authorization: 'Bearer paired-token' });
  });

  it('keeps an actionable pairing error when token bootstrap is rejected', async () => {
    const { context } = loadBackground({
      pairStatus: 403,
      pairBody: { error: 'Forbidden', code: 'EXTENSION_NOT_ALLOWLISTED' },
    });

    await expect(context.saveMemory({ content: 'hello from a page' })).resolves.toMatchObject({
      saved: false,
      error: expect.stringContaining('allowlisted'),
    });
  });

  it('registers and handles the selection context menu save path', async () => {
    const background = loadBackground();

    background.getInstalledListener()?.();

    expect(background.createdMenus).toContainEqual({
      id: 'waggle-save-selection',
      title: 'Save to Waggle memory',
      contexts: ['selection'],
    });

    const clickListener = background.getContextMenuClickListener();
    expect(clickListener).toBeTypeOf('function');

    await clickListener?.(
      { menuItemId: 'waggle-save-selection', selectionText: 'context menu selected text' },
      { title: 'Context Menu Page', url: 'https://example.test/context-menu' },
    );

    expect(background.calls.map((call) => call.url)).toEqual([
      'http://127.0.0.1:3333/api/browser-ext/session-token',
      'http://127.0.0.1:3333/api/memory/frames',
    ]);
    const saveBody = JSON.parse(String(background.calls[1].init?.body));
    expect(saveBody).toMatchObject({ source: 'import', importance: 'normal' });
    expect(saveBody.content).toContain('Selection from Context Menu Page');
    expect(saveBody.content).toContain('context menu selected text');
    expect(background.badgeTextCalls[0]).toMatchObject({ text: expect.any(String) });
    expect(background.badgeColorCalls[0]).toMatchObject({ color: '#10b981' });
  });
});
