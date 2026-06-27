import { MarketplaceSync, type MarketplaceDB } from '@waggle/marketplace';

type SyncResultLike = { added: number };
type MarketplaceSyncLike = { syncAll(): Promise<SyncResultLike[]> };
type LogLike = { info(message: string): void };

export function isMarketplaceBackgroundSyncDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.WAGGLE_DISABLE_MARKETPLACE_SYNC === '1'
    || env.WAGGLE_SKIP_MARKETPLACE_SYNC === '1';
}

export function scheduleMarketplaceBackgroundSync({
  marketplaceDb,
  log,
  env = process.env,
  delayMs = 15_000,
  intervalMs = 24 * 60 * 60 * 1000,
  createSync = (db) => new MarketplaceSync(db),
}: {
  marketplaceDb: MarketplaceDB | null;
  log: LogLike;
  env?: NodeJS.ProcessEnv;
  delayMs?: number;
  intervalMs?: number;
  createSync?: (db: MarketplaceDB) => MarketplaceSyncLike;
}): () => void {
  if (!marketplaceDb || isMarketplaceBackgroundSyncDisabled(env)) return () => {};
  const db = marketplaceDb;

  let interval: ReturnType<typeof setInterval> | null = null;

  async function runSync() {
    try {
      const sync = createSync(db);
      const results = await sync.syncAll();
      const added = results.reduce((s, r) => s + r.added, 0);
      if (added > 0) log.info(`[marketplace] Sync: +${added} new packages`);
    } catch (e) {
      log.info(`[marketplace] Sync error (non-blocking): ${(e as Error).message}`);
    }
  }

  const timeout = setTimeout(async () => {
    await runSync();
    interval = setInterval(runSync, intervalMs);
  }, delayMs);

  return () => {
    clearTimeout(timeout);
    if (interval) clearInterval(interval);
  };
}
