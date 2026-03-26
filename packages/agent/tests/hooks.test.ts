import { describe, it, expect, vi } from 'vitest';
import { HookRegistry, type HookEvent, type HookContext } from '../src/hooks.js';

describe('HookRegistry', () => {
  it('registers and fires pre:tool hooks', async () => {
    const registry = new HookRegistry();
    const fn = vi.fn();
    registry.on('pre:tool', fn);

    const ctx: HookContext = { toolName: 'bash', args: { command: 'ls' } };
    await registry.fire('pre:tool', ctx);

    expect(fn).toHaveBeenCalledWith(ctx);
  });

  it('registers and fires post:tool hooks', async () => {
    const registry = new HookRegistry();
    const fn = vi.fn();
    registry.on('post:tool', fn);

    const ctx: HookContext = { toolName: 'bash', result: 'file1.txt' };
    await registry.fire('post:tool', ctx);

    expect(fn).toHaveBeenCalledWith(ctx);
  });

  it('fires session:start and session:end hooks', async () => {
    const registry = new HookRegistry();
    const startFn = vi.fn();
    const endFn = vi.fn();
    registry.on('session:start', startFn);
    registry.on('session:end', endFn);

    await registry.fire('session:start', { sessionId: 'abc' });
    await registry.fire('session:end', { sessionId: 'abc' });

    expect(startFn).toHaveBeenCalledWith({ sessionId: 'abc' });
    expect(endFn).toHaveBeenCalledWith({ sessionId: 'abc' });
  });

  it('supports multiple hooks for same event', async () => {
    const registry = new HookRegistry();
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    registry.on('pre:tool', fn1);
    registry.on('pre:tool', fn2);

    await registry.fire('pre:tool', { toolName: 'read' });

    expect(fn1).toHaveBeenCalled();
    expect(fn2).toHaveBeenCalled();
  });

  it('pre:tool hooks can cancel by returning { cancel: true, reason }', async () => {
    const registry = new HookRegistry();
    registry.on('pre:tool', () => ({ cancel: true, reason: 'blocked by policy' }));

    const result = await registry.fire('pre:tool', { toolName: 'bash', args: { command: 'rm -rf /' } });

    expect(result.cancelled).toBe(true);
    expect(result.reason).toBe('blocked by policy');
  });

  it('unregisters hooks via unsub function', async () => {
    const registry = new HookRegistry();
    const fn = vi.fn();
    const unsub = registry.on('post:tool', fn);

    unsub();
    await registry.fire('post:tool', { toolName: 'bash' });

    expect(fn).not.toHaveBeenCalled();
  });

  it('handles hook errors gracefully — second hook still runs', async () => {
    const registry = new HookRegistry();
    const errorFn = vi.fn(() => { throw new Error('boom'); });
    const okFn = vi.fn();
    registry.on('pre:response', errorFn);
    registry.on('pre:response', okFn);

    const result = await registry.fire('pre:response', { content: 'hello' });

    expect(errorFn).toHaveBeenCalled();
    expect(okFn).toHaveBeenCalled();
    expect(result.cancelled).toBe(false);
  });
});
