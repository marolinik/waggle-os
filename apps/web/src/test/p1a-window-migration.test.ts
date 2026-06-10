/**
 * P1a Stage B — §3.3 `waggle-window-state-v1` migration (acceptance check 6):
 * populated key → salvaged route + chat state + key removed; corrupt value →
 * /home + key removed, no throw; 'local-default' placeholder → /home + the
 * §3.3.3 re-key contract; multi-window same-workspace → last-write-wins.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  computeWindowStateMigration,
  runWindowStateMigration,
  WINDOW_STATE_KEY,
  type LegacyWindowState,
} from '@/lib/window-state-migration';
import {
  CHAT_STATE_KEY,
  loadChatEntries,
  rekeyLocalDefaultChatState,
} from '@/hooks/useChatWidgetState';

function win(over: Partial<LegacyWindowState> = {}): LegacyWindowState {
  return {
    instanceId: `i-${Math.random()}`, appId: 'home',
    zIndex: 10, minimized: false, cascadeOffset: 0,
    ...over,
  };
}

function setLegacy(windows: LegacyWindowState[]): void {
  localStorage.setItem(WINDOW_STATE_KEY, JSON.stringify({ version: 1, windows }));
}

beforeEach(() => {
  localStorage.clear();
});

describe('runWindowStateMigration (§3.3)', () => {
  it('salvages the highest-zIndex non-minimized window as the initial route, salvages chat state, and removes the key', () => {
    setLegacy([
      win({ appId: 'memory', zIndex: 5 }),
      win({
        appId: 'chat', workspaceId: 'ws-1', zIndex: 9,
        personaId: 'coder', autonomyLevel: 'trusted', autonomyExpiresAt: null,
      }),
    ]);

    const result = runWindowStateMigration();

    expect(result.initialRoute).toBe('/workspaces/ws-1/chat');
    expect(loadChatEntries()['ws-1']).toMatchObject({
      personaId: 'coder', personaLabel: 'Coder',
      autonomyLevel: 'trusted', autonomyExpiresAt: null,
    });
    expect(localStorage.getItem(WINDOW_STATE_KEY)).toBeNull();
    expect(localStorage.getItem(CHAT_STATE_KEY)).toContain('ws-1');
  });

  it('skips minimized windows for the route salvage (all-minimized → /home)', () => {
    setLegacy([
      win({ appId: 'capabilities', zIndex: 99, minimized: true }),
      win({ appId: 'scheduled-jobs', zIndex: 3 }),
    ]);
    expect(runWindowStateMigration().initialRoute).toBe('/automations');

    setLegacy([win({ appId: 'memory', zIndex: 1, minimized: true })]);
    expect(runWindowStateMigration().initialRoute).toBe('/home');
  });

  it('routes killed ids through the §2.2 retargets and workspace-desktop to /workspaces/:id', () => {
    setLegacy([win({ appId: 'dashboard', zIndex: 4 })]);
    expect(runWindowStateMigration().initialRoute).toBe('/home');

    setLegacy([win({ appId: 'workspace-desktop', workspaceId: 'ws-7', zIndex: 4 })]);
    expect(runWindowStateMigration().initialRoute).toBe('/workspaces/ws-7');
  });

  it('corrupt value → /home, key removed, no throw, no chat state', () => {
    localStorage.setItem(WINDOW_STATE_KEY, '{not json');

    let result: ReturnType<typeof runWindowStateMigration> | undefined;
    expect(() => { result = runWindowStateMigration(); }).not.toThrow();

    expect(result!.initialRoute).toBe('/home');
    expect(result!.chatState).toEqual({});
    expect(localStorage.getItem(WINDOW_STATE_KEY)).toBeNull();
    expect(localStorage.getItem(CHAT_STATE_KEY)).toBeNull();
  });

  it('wrong version / malformed shape → /home, key removed', () => {
    localStorage.setItem(WINDOW_STATE_KEY, JSON.stringify({ version: 2, windows: [win()] }));
    expect(runWindowStateMigration().initialRoute).toBe('/home');
    expect(localStorage.getItem(WINDOW_STATE_KEY)).toBeNull();

    localStorage.setItem(WINDOW_STATE_KEY, JSON.stringify({ version: 1, windows: 'nope' }));
    expect(runWindowStateMigration().initialRoute).toBe('/home');
    expect(localStorage.getItem(WINDOW_STATE_KEY)).toBeNull();
  });

  it('absent key → /home and nothing written', () => {
    const result = runWindowStateMigration();
    expect(result.initialRoute).toBe('/home');
    expect(result.chatState).toEqual({});
    expect(localStorage.getItem(CHAT_STATE_KEY)).toBeNull();
  });

  it("'local-default'-stamped chat → /home, entry written as-is, then re-keyed by the store (§3.3.3)", () => {
    setLegacy([
      win({ appId: 'chat', workspaceId: 'local-default', personaId: 'writer', zIndex: 99 }),
    ]);

    const result = runWindowStateMigration();
    expect(result.initialRoute).toBe('/home');
    expect(loadChatEntries()['local-default']).toMatchObject({ personaId: 'writer' });

    // The re-key contract: when the store first sees the real workspace list,
    // the placeholder entry moves onto the first real workspace.
    rekeyLocalDefaultChatState('ws-first');
    expect(loadChatEntries()['local-default']).toBeUndefined();
    expect(loadChatEntries()['ws-first']).toMatchObject({ personaId: 'writer' });
  });

  it('multiple chat windows on one workspace collapse last-write-wins', () => {
    setLegacy([
      win({ appId: 'chat', workspaceId: 'ws-1', personaId: 'coder', autonomyLevel: 'yolo', autonomyExpiresAt: 123, zIndex: 1 }),
      win({ appId: 'chat', workspaceId: 'ws-1', personaId: 'writer', zIndex: 2 }),
    ]);

    const { chatState } = runWindowStateMigration();
    expect(chatState['ws-1']).toEqual({ personaId: 'writer', personaLabel: 'Writer' });
    expect(loadChatEntries()['ws-1']).toEqual({ personaId: 'writer', personaLabel: 'Writer' });
  });
});

describe('computeWindowStateMigration (pure)', () => {
  it('drops chat windows without a workspaceId and ignores unknown appIds for routing', () => {
    const { initialRoute, chatState } = computeWindowStateMigration([
      win({ appId: 'chat', zIndex: 50 }), // no workspaceId → /home route, no entry
      win({ appId: 'not-an-app', zIndex: 99 }),
    ]);
    expect(initialRoute).toBe('/home');
    expect(chatState).toEqual({});
  });

  it('writes an empty entry for a plain chat window so P4 inheritance treats it as seen', () => {
    const { chatState } = computeWindowStateMigration([
      win({ appId: 'chat', workspaceId: 'ws-plain' }),
    ]);
    expect(chatState).toHaveProperty('ws-plain');
    expect(chatState['ws-plain']).toEqual({});
  });
});
