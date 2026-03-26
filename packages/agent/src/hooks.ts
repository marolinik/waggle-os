export type HookEvent =
  | 'pre:tool'
  | 'post:tool'
  | 'session:start'
  | 'session:end'
  | 'pre:response'
  | 'post:response'
  | 'pre:memory-write'
  | 'post:memory-write'
  | 'workflow:start'
  | 'workflow:end';

export interface HookContext {
  toolName?: string;
  args?: Record<string, unknown>;
  result?: string;
  sessionId?: string;
  content?: string;
  workspaceId?: string;
  memoryContent?: string;
  memoryType?: string;
  workflowName?: string;
  workflowTask?: string;
  [key: string]: unknown;
}

export interface HookResult {
  cancelled: boolean;
  reason?: string;
}

export interface HookActivityEntry {
  event: HookEvent;
  timestamp: number;
  cancelled: boolean;
  reason?: string;
  workspaceId?: string;
}

export type HookFn = (ctx: HookContext) => Promise<{ cancel?: boolean; reason?: string } | void> | { cancel?: boolean; reason?: string } | void;

export class HookRegistry {
  private hooks = new Map<HookEvent, Set<HookFn>>();
  private activityLog: HookActivityEntry[] = [];
  private static MAX_LOG = 50;

  on(event: HookEvent, fn: HookFn): () => void {
    if (!this.hooks.has(event)) this.hooks.set(event, new Set());
    this.hooks.get(event)!.add(fn);
    return () => { this.hooks.get(event)?.delete(fn); };
  }

  /** Register a hook scoped to a specific workspace. Only fires when context.workspaceId matches. */
  onScoped(event: HookEvent, fn: HookFn, options: { workspaceId: string }): () => void {
    const wrappedFn: HookFn = (ctx) => {
      if (ctx.workspaceId !== options.workspaceId) return;
      return fn(ctx);
    };
    return this.on(event, wrappedFn);
  }

  async fire(event: HookEvent, ctx: HookContext): Promise<HookResult> {
    const fns = this.hooks.get(event);
    if (!fns || fns.size === 0) {
      this.recordActivity(event, false, undefined, ctx.workspaceId);
      return { cancelled: false };
    }

    for (const fn of fns) {
      try {
        const result = await fn(ctx);
        if (result?.cancel) {
          this.recordActivity(event, true, result.reason, ctx.workspaceId);
          return { cancelled: true, reason: result.reason };
        }
      } catch {
        // Hook errors are non-fatal — log but continue
      }
    }
    this.recordActivity(event, false, undefined, ctx.workspaceId);
    return { cancelled: false };
  }

  getActivityLog(): readonly HookActivityEntry[] {
    return this.activityLog;
  }

  private recordActivity(event: HookEvent, cancelled: boolean, reason?: string, workspaceId?: string): void {
    this.activityLog.push({
      event,
      timestamp: Date.now(),
      cancelled,
      reason,
      workspaceId,
    });
    if (this.activityLog.length > HookRegistry.MAX_LOG) {
      this.activityLog = this.activityLog.slice(-HookRegistry.MAX_LOG);
    }
  }
}
