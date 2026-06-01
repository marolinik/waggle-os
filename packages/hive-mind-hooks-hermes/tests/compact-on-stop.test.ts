import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  compactStatePath,
  isCompactEnabled,
  maybeCompactOnStop,
  readLastCompactTs,
  resolveWindowMs,
  writeLastCompactTs,
} from '../src/compact-on-stop.js';
import { makeMockBridge } from './hooks/_test-helpers.js';
import type { HookContext } from '@waggle/hive-mind-hooks-core';
import type { Logger } from '@waggle/hive-mind-shim-core';
import type { MockBridge } from './hooks/_test-helpers.js';

const FLAG = 'WAGGLE_HERMES_COMPACT_ON_STOP';
const WINDOW_ENV = 'WAGGLE_HERMES_COMPACT_WINDOW_MIN';
const MINUTE_MS = 60_000;

function makeLogger(): Logger {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  } as unknown as Logger;
}

function makeCtx(bridge: MockBridge): HookContext {
  return { bridge, logger: makeLogger() };
}

describe('compact-on-stop unit', () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'hmher-compact-'));
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(home, { recursive: true, force: true });
  });

  // case 1
  it('flag off → cleanupFrames NOT called and no state file written', async () => {
    vi.stubEnv(FLAG, '');
    const bridge = makeMockBridge();
    await maybeCompactOnStop(makeCtx(bridge), { now: () => 1_000_000, home });
    expect(bridge.cleanupFrames).not.toHaveBeenCalled();
    const last = await readLastCompactTs(compactStatePath(home));
    expect(last).toBeUndefined();
  });

  // case 2
  it('flag on, no prior timestamp → cleanupFrames called once and state file holds now', async () => {
    vi.stubEnv(FLAG, '1');
    const bridge = makeMockBridge();
    const now = 5_000_000;
    await maybeCompactOnStop(makeCtx(bridge), { now: () => now, home });
    expect(bridge.cleanupFrames).toHaveBeenCalledTimes(1);
    const last = await readLastCompactTs(compactStatePath(home));
    expect(last).toBe(now);
  });

  // case 3
  it('flag on, last = now - 1min, window 10min → NOT called (inside window)', async () => {
    vi.stubEnv(FLAG, '1');
    const bridge = makeMockBridge();
    const now = 10_000_000;
    await writeLastCompactTs(compactStatePath(home), now - 1 * MINUTE_MS);
    await maybeCompactOnStop(makeCtx(bridge), { now: () => now, home, windowMs: 10 * MINUTE_MS });
    expect(bridge.cleanupFrames).not.toHaveBeenCalled();
    // timestamp untouched
    const last = await readLastCompactTs(compactStatePath(home));
    expect(last).toBe(now - 1 * MINUTE_MS);
  });

  // case 4
  it('flag on, last = now - 11min, window 10min → called and timestamp updated to now', async () => {
    vi.stubEnv(FLAG, '1');
    const bridge = makeMockBridge();
    const now = 20_000_000;
    await writeLastCompactTs(compactStatePath(home), now - 11 * MINUTE_MS);
    await maybeCompactOnStop(makeCtx(bridge), { now: () => now, home, windowMs: 10 * MINUTE_MS });
    expect(bridge.cleanupFrames).toHaveBeenCalledTimes(1);
    const last = await readLastCompactTs(compactStatePath(home));
    expect(last).toBe(now);
  });

  // case 5
  it('flag on, cleanupFrames rejects → resolves (no throw) and state file NOT updated', async () => {
    vi.stubEnv(FLAG, '1');
    const bridge = makeMockBridge();
    bridge.cleanupFrames.mockRejectedValueOnce(new Error('cli unreachable'));
    const now = 30_000_000;
    await expect(
      maybeCompactOnStop(makeCtx(bridge), { now: () => now, home }),
    ).resolves.toBeUndefined();
    const last = await readLastCompactTs(compactStatePath(home));
    expect(last).toBeUndefined();
  });

  // case 6
  it('flag on, state-file write fails (home is a FILE) → resolves, no throw, cleanupFrames still attempted', async () => {
    vi.stubEnv(FLAG, '1');
    const homeFile = join(home, 'home-as-file');
    await writeFile(homeFile, 'not a dir');
    const bridge = makeMockBridge();
    const now = 40_000_000;
    await expect(
      maybeCompactOnStop(makeCtx(bridge), { now: () => now, home: homeFile }),
    ).resolves.toBeUndefined();
    expect(bridge.cleanupFrames).toHaveBeenCalledTimes(1);
  });

  // case 7
  it('WAGGLE_HERMES_COMPACT_WINDOW_MIN=5 honored; compactWindowMs opt overrides env', () => {
    vi.stubEnv(WINDOW_ENV, '5');
    expect(resolveWindowMs(process.env)).toBe(5 * MINUTE_MS);
    // opt override wins over env
    expect(resolveWindowMs(process.env, 2 * MINUTE_MS)).toBe(2 * MINUTE_MS);
  });

  it('resolveWindowMs default is 10min when env unset/invalid', () => {
    expect(resolveWindowMs({})).toBe(600_000);
    expect(resolveWindowMs({ [WINDOW_ENV]: 'garbage' })).toBe(600_000);
    expect(resolveWindowMs({ [WINDOW_ENV]: '0' })).toBe(600_000);
    expect(resolveWindowMs({ [WINDOW_ENV]: '-3' })).toBe(600_000);
  });

  // case 8
  it('isCompactEnabled truth table', () => {
    expect(isCompactEnabled({})).toBe(false);
    expect(isCompactEnabled({ [FLAG]: '' })).toBe(false);
    expect(isCompactEnabled({ [FLAG]: '0' })).toBe(false);
    expect(isCompactEnabled({ [FLAG]: 'false' })).toBe(false);
    expect(isCompactEnabled({ [FLAG]: 'FALSE' })).toBe(false);
    expect(isCompactEnabled({ [FLAG]: '1' })).toBe(true);
    expect(isCompactEnabled({ [FLAG]: 'true' })).toBe(true);
    expect(isCompactEnabled({ [FLAG]: 'yes' })).toBe(true);
  });

  it('compactStatePath lives under the hermes dir', () => {
    const p = compactStatePath(home);
    expect(p).toBe(join(home, '.hermes', '.hive-mind-last-compact'));
  });

  it('readLastCompactTs returns undefined on garbage content', async () => {
    const p = compactStatePath(home);
    await writeLastCompactTs(p, 123);
    // overwrite with garbage
    await writeFile(p, 'not-a-number');
    expect(await readLastCompactTs(p)).toBeUndefined();
  });

  it('readLastCompactTs returns undefined when file is missing', async () => {
    expect(await readLastCompactTs(join(home, 'does-not-exist'))).toBeUndefined();
  });

  it('writeLastCompactTs mkdirs the parent recursively then writes', async () => {
    const p = compactStatePath(home); // parent .hermes does not exist yet
    await writeLastCompactTs(p, 777);
    const raw = await readFile(p, 'utf-8');
    expect(raw).toBe('777');
  });
});
