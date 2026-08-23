import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isMarketplaceBackgroundSyncDisabled,
  scheduleMarketplaceBackgroundSync,
} from '../../src/local/marketplace-background-sync.js';

describe('marketplace background sync startup control', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is disabled by the Playwright/local E2E escape hatch', () => {
    expect(isMarketplaceBackgroundSyncDisabled({ WAGGLE_DISABLE_MARKETPLACE_SYNC: '1' })).toBe(true);
    expect(isMarketplaceBackgroundSyncDisabled({ WAGGLE_SKIP_MARKETPLACE_SYNC: '1' })).toBe(true);
    expect(isMarketplaceBackgroundSyncDisabled({})).toBe(false);
  });

  it('does not schedule sync work when disabled', async () => {
    vi.useFakeTimers();
    const syncAll = vi.fn().mockResolvedValue([{ added: 1 }]);

    scheduleMarketplaceBackgroundSync({
      marketplaceDb: {} as never,
      log: { info: vi.fn() },
      env: { WAGGLE_DISABLE_MARKETPLACE_SYNC: '1' },
      delayMs: 10,
      createSync: () => ({ syncAll }),
    });

    await vi.advanceTimersByTimeAsync(100);
    expect(syncAll).not.toHaveBeenCalled();
  });

  it('keeps the first minute after startup free of marketplace sync work by default', async () => {
    vi.useFakeTimers();
    const syncAll = vi.fn().mockResolvedValue([]);
    const stop = scheduleMarketplaceBackgroundSync({
      marketplaceDb: {} as never,
      log: { info: vi.fn() },
      env: {},
      createSync: () => ({ syncAll }),
    });

    await vi.advanceTimersByTimeAsync(59_999);
    expect(syncAll).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(syncAll).toHaveBeenCalledTimes(1);
    stop();
  });

  it('runs after the delay, repeats daily, and stops cleanly', async () => {
    vi.useFakeTimers();
    const log = { info: vi.fn() };
    const syncAll = vi.fn().mockResolvedValue([{ added: 2 }]);

    const stop = scheduleMarketplaceBackgroundSync({
      marketplaceDb: {} as never,
      log,
      env: {},
      delayMs: 10,
      intervalMs: 100,
      createSync: () => ({ syncAll }),
    });

    await vi.advanceTimersByTimeAsync(10);
    expect(syncAll).toHaveBeenCalledTimes(1);
    expect(log.info).toHaveBeenCalledWith('[marketplace] Sync: +2 new packages');

    await vi.advanceTimersByTimeAsync(100);
    expect(syncAll).toHaveBeenCalledTimes(2);

    stop();
    await vi.advanceTimersByTimeAsync(500);
    expect(syncAll).toHaveBeenCalledTimes(2);
  });
});
