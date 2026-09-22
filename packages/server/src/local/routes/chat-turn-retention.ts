/**
 * Turn Retention — what one chat turn may leave behind.
 *
 * Three permissions decide it: memory persistence (auto-save, raw-turn capture),
 * derived persistence (traces, skill distillation, learned signals) and response
 * decoration (disclaimers, `/schedule` nudges, grounding hedges). The turn's
 * policy grants them before anything is known about the conversation. Once the
 * session history is loaded they are settled a second time, and may only
 * narrow: a first-turn explicit tool-free advisory request, or a turn bounded
 * to a forced read-only tool, keeps nothing.
 *
 * Before this module the three permissions and the tool-free flag were four
 * hoisted mutable variables inside the `POST /api/chat` closure, reassigned in
 * one place and read in about forty. Replace Method with Method Object applied
 * to that cluster (TD-CHAT-3): the settlement is one named method, and the
 * readers can no longer reassign what they read.
 *
 * It imports nothing.
 */

/**
 * The permissions a turn's policy grants before its history is known. The two
 * persistence fields are the shape `resolveTurnPersistencePermissions` returns.
 */
export type GrantedRetention = {
  allowMemoryPersistence: boolean;
  allowDerivedPersistence: boolean;
  allowResponseDecoration: boolean;
};

export class TurnRetention {
  private toolFree = false;
  private memory: boolean;
  private derived: boolean;
  private decoration: boolean;

  constructor(private readonly granted: GrantedRetention) {
    this.memory = granted.allowMemoryPersistence;
    this.derived = granted.allowDerivedPersistence;
    this.decoration = granted.allowResponseDecoration;
  }

  /**
   * Settle retention once the session history is loaded. A tool-free advisory
   * turn keeps nothing, and neither does a turn bounded to a forced read-only
   * tool; otherwise the policy's grant stands. Recomputed from the grant, so it
   * can only narrow what the policy allowed.
   */
  settle(options: { toolFreeAdvisory: boolean; forcedReadOnlyTurn: boolean }): void {
    this.toolFree = options.toolFreeAdvisory;
    const keeps = !options.toolFreeAdvisory && !options.forcedReadOnlyTurn;
    this.memory = keeps && this.granted.allowMemoryPersistence;
    this.derived = keeps && this.granted.allowDerivedPersistence;
    this.decoration = keeps && this.granted.allowResponseDecoration;
  }

  /** A first-turn explicit tool-free advisory request, answered from the message alone. */
  get toolFreeAdvisory(): boolean {
    return this.toolFree;
  }

  get allowMemoryPersistence(): boolean {
    return this.memory;
  }

  get allowDerivedPersistence(): boolean {
    return this.derived;
  }

  get allowResponseDecoration(): boolean {
    return this.decoration;
  }
}
