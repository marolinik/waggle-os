import { type MindDB, FrameStore, SessionStore } from '@waggle/core';
import { MemoryWeaver } from '@waggle/weaver';

export interface WeaverConfig {
  consolidationIntervalMs: number;
  decayIntervalMs: number;
}

const DEFAULT_CONFIG: WeaverConfig = {
  consolidationIntervalMs: 60 * 60 * 1000,
  decayIntervalMs: 24 * 60 * 60 * 1000,
};

export class WeaverScheduler {
  private weaver: MemoryWeaver;
  private sessions: SessionStore;
  private timers: NodeJS.Timeout[] = [];
  private config: WeaverConfig;

  constructor(db: MindDB, config: Partial<WeaverConfig> = {}) {
    const frames = new FrameStore(db);
    const sessions = new SessionStore(db);
    this.sessions = sessions;
    this.weaver = new MemoryWeaver(db, frames, sessions);
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  start(): void {
    this.timers.push(
      setInterval(() => this.runConsolidation(), this.config.consolidationIntervalMs)
    );
    this.timers.push(
      setInterval(() => this.runDecay(), this.config.decayIntervalMs)
    );
    process.stderr.write('waggle-weaver:started\n');
  }

  stop(): void {
    for (const timer of this.timers) {
      clearInterval(timer);
    }
    this.timers = [];
  }

  runConsolidation(): void {
    try {
      const activeSessions = this.sessions.getActive();
      for (const session of activeSessions) {
        this.weaver.consolidateGop(session.gop_id);
      }
    } catch (err) {
      process.stderr.write(`waggle-weaver:consolidation-error:${(err as Error).message}\n`);
    }
  }

  runDecay(): void {
    try {
      this.weaver.decayFrames();
      this.weaver.strengthenFrames();
    } catch (err) {
      process.stderr.write(`waggle-weaver:decay-error:${(err as Error).message}\n`);
    }
  }
}
