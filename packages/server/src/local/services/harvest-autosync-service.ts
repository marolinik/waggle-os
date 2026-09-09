const DEFAULT_INTERVAL_MS = 30 * 60 * 1000;

export interface HarvestAutoSyncServiceOptions {
  runSync: () => Promise<void>;
  intervalMs?: number;
  onError?: (error: unknown) => void;
}

/** Single-flight lifecycle guard for the periodic personal-memory Harvest pass. */
export class HarvestAutoSyncService {
  private readonly runSync: () => Promise<void>;
  private readonly intervalMs: number;
  private readonly onError: (error: unknown) => void;
  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight: Promise<void> | null = null;
  private stopping = false;

  constructor(options: HarvestAutoSyncServiceOptions) {
    this.runSync = options.runSync;
    this.intervalMs = Number.isFinite(options.intervalMs) && (options.intervalMs ?? 0) > 0
      ? Math.max(1, Math.trunc(options.intervalMs as number))
      : DEFAULT_INTERVAL_MS;
    this.onError = options.onError ?? (() => undefined);
  }

  start(): void {
    if (this.timer || this.stopping) return;
    this.timer = setInterval(() => {
      void this.runNow().catch(this.onError);
    }, this.intervalMs);
    this.timer.unref?.();
  }

  runNow(): Promise<void> {
    if (this.stopping) return Promise.resolve();
    if (this.inFlight) return this.inFlight;

    const task = Promise.resolve().then(this.runSync);
    this.inFlight = task;
    void task.then(
      () => {
        if (this.inFlight === task) this.inFlight = null;
      },
      () => {
        if (this.inFlight === task) this.inFlight = null;
      },
    );
    return task;
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;

    const active = this.inFlight;
    if (!active) return;
    try {
      await active;
    } catch (error) {
      this.onError(error);
    }
  }
}
