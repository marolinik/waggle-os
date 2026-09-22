/**
 * Unit tests for `TurnResources` (TD-CHAT-3, fifth slice).
 *
 * The route-level pins in `chat-turn-teardown-characterization.test.ts` assert
 * the order a real turn releases in, but two of the five releases are invisible
 * from outside the route: the chat runtime (it decrements a closure-private
 * cache) and the request-owned shared mind pin (a plain request resolves to the
 * managed default workspace instead). Here every release is observable, so this
 * file carries the full order and the swallow rules.
 *
 * These pin CURRENT behavior, not a specification — including the one release
 * that is deliberately unguarded.
 */
import { describe, expect, it } from 'vitest';
import { TurnResources } from '../../src/local/routes/chat-turn-resources.js';

function heldResources(log: string[], failing: string | null = null) {
  const resources = new TurnResources();
  const record = (name: string) => () => {
    log.push(name);
    if (failing === name) throw new Error(`${name} failed`);
  };
  resources.holdTurnScope(async () => { record('scope')(); });
  resources.holdChatRuntime(record('runtime'));
  resources.holdWorkspaceMindPin(record('workspaceMind'));
  resources.holdSharedMindPin(record('sharedMind'));
  resources.holdToolHook(record('hook'));
  return resources;
}

describe('TurnResources', () => {
  it('releases everything it holds in the route order', async () => {
    const log: string[] = [];

    await heldResources(log).releaseHeld();

    expect(log).toEqual(['scope', 'runtime', 'workspaceMind', 'sharedMind', 'hook']);
  });

  it('releases nothing it was never handed', async () => {
    const log: string[] = [];
    const resources = new TurnResources();
    resources.holdWorkspaceMindPin(() => log.push('workspaceMind'));

    await resources.releaseHeld();

    expect(log).toEqual(['workspaceMind']);
  });

  it('releases each resource once, even when called again', async () => {
    const log: string[] = [];
    const resources = heldResources(log);

    await resources.releaseHeld();
    await resources.releaseHeld();

    expect(log).toEqual(['scope', 'runtime', 'workspaceMind', 'sharedMind', 'hook']);
  });

  it.each([
    ['scope', ['scope', 'runtime', 'workspaceMind', 'sharedMind', 'hook']],
    ['workspaceMind', ['scope', 'runtime', 'workspaceMind', 'sharedMind', 'hook']],
    ['sharedMind', ['scope', 'runtime', 'workspaceMind', 'sharedMind', 'hook']],
    ['hook', ['scope', 'runtime', 'workspaceMind', 'sharedMind', 'hook']],
  ])('a throwing %s release is swallowed and the rest still run', async (failing, expected) => {
    const log: string[] = [];

    await expect(heldResources(log, failing).releaseHeld()).resolves.toBeUndefined();

    expect(log).toEqual(expected);
  });

  it('QUIRK: a throwing chat-runtime release is NOT swallowed, and the releases after it are skipped', async () => {
    const log: string[] = [];

    await expect(heldResources(log, 'runtime').releaseHeld()).rejects.toThrow('runtime failed');

    expect(log).toEqual(['scope', 'runtime']);
  });

  it('unhooks the tool hook on the happy path, so the later release is a no-op', async () => {
    const log: string[] = [];
    const resources = heldResources(log);

    resources.unhookTools();
    await resources.releaseHeld();

    expect(log).toEqual(['hook', 'scope', 'runtime', 'workspaceMind', 'sharedMind']);
  });

  it('a throwing happy-path unhook propagates and leaves the hook held for the finally', async () => {
    const log: string[] = [];
    const resources = heldResources(log, 'hook');

    expect(() => resources.unhookTools()).toThrow('hook failed');
    await resources.releaseHeld();

    expect(log).toEqual(['hook', 'scope', 'runtime', 'workspaceMind', 'sharedMind', 'hook']);
  });

  it('unhooking without a hook held does nothing', () => {
    expect(() => new TurnResources().unhookTools()).not.toThrow();
  });
});
