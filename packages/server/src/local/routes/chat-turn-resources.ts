/**
 * Turn Resources — what one chat turn holds, and the order it lets go.
 *
 * A turn acquires up to five releasable things: the workspace turn scope, the
 * chat runtime, a named workspace's turn-scoped mind pin, a request-owned
 * shared mind's pin, and the `pre:tool` hook registration. Every one of them
 * has to be released on every exit, which is why the route hoisted them in the
 * first place: the outer `finally` is the only place that sees all exits.
 *
 * Replace Method with Method Object applied to that cluster (TD-CHAT-3): each
 * holder registers a release closure, and `releaseHeld()` runs them in the
 * route's fixed order. The workspace activity lease deliberately stays in the
 * route, because it is released later still — after the SSE stream ends — and
 * that ordering is easier to see where the stream is ended.
 *
 * Two behaviors are preserved exactly, and both are load-bearing:
 *  - Order: scope, chat runtime, workspace mind pin, shared mind pin, tool
 *    hook. It is not the reverse of acquisition, so it cannot be derived.
 *  - The chat runtime's release is NOT guarded, while the other four are. A
 *    throwing runtime release therefore skips the releases after it, exactly as
 *    the hand-written `finally` did. Guarding it here would be a behavior
 *    change, so it is left to its own slice.
 *
 * It imports nothing.
 */

/** A release that may take a turn of the event loop (the workspace scope). */
export type AsyncRelease = () => Promise<void>;

/** A release that completes synchronously. */
export type SyncRelease = () => void;

export class TurnResources {
  private turnScope: AsyncRelease | undefined;
  private chatRuntime: SyncRelease | undefined;
  private workspaceMindPin: SyncRelease | undefined;
  private sharedMindPin: SyncRelease | undefined;
  private toolHook: SyncRelease | undefined;

  holdTurnScope(release: AsyncRelease): void {
    this.turnScope = release;
  }

  holdChatRuntime(release: SyncRelease): void {
    this.chatRuntime = release;
  }

  holdWorkspaceMindPin(release: SyncRelease): void {
    this.workspaceMindPin = release;
  }

  holdSharedMindPin(release: SyncRelease): void {
    this.sharedMindPin = release;
  }

  holdToolHook(release: SyncRelease): void {
    this.toolHook = release;
  }

  /**
   * Unregister the `pre:tool` hook on the happy path, as soon as the agent loop
   * is done with it. Unguarded, as the route had it: a throw reaches the outer
   * catch, and the hook stays held so `releaseHeld()` tries once more.
   */
  unhookTools(): void {
    const release = this.toolHook;
    if (!release) return;
    release();
    this.toolHook = undefined;
  }

  /**
   * Release everything still held, in the route's order. Best-effort except the
   * chat runtime: see the header.
   */
  async releaseHeld(): Promise<void> {
    if (this.turnScope) {
      // What is lost: this turn's place in the workspace queue, which the
      // coordinator reclaims when the scope's signal settles.
      try { await this.turnScope(); } catch { /* lease already released */ }
      this.turnScope = undefined;
    }
    if (this.chatRuntime) {
      const release = this.chatRuntime;
      this.chatRuntime = undefined;
      release();
    }
    for (const pin of [this.workspaceMindPin, this.sharedMindPin]) {
      if (!pin) continue;
      // What is lost: one pin on a mind the cache is already tearing down.
      try { pin(); } catch { /* cache already torn down */ }
    }
    this.workspaceMindPin = undefined;
    this.sharedMindPin = undefined;
    if (this.toolHook) {
      const release = this.toolHook;
      this.toolHook = undefined;
      // What is lost: nothing — the registry this hook lives on is per request
      // and is discarded with it.
      try { release(); } catch { /* registry already torn down — ignore */ }
    }
  }
}
