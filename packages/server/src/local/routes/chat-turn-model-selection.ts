/**
 * One chat turn's model selection (TD-CHAT-3).
 *
 * The handler kept the selected model, the reason it differs from the
 * primary, and whether it is the budget model as three `let`s, and wrote the
 * "budget model failed or is unavailable: return to the primary, else the
 * configured fallback" rule out twice: once at preflight, when the selected
 * model is not routable, and once in the fallback chain, when a budget run
 * fails. Both copies now live here, beside the de-duplication of the
 * `model_switch` announcement.
 *
 * The attempts themselves stay in the route: this class only decides which
 * model the next attempt uses and why. `resolve` confirms a model is routable
 * (and may normalize it); a model it cannot route makes it throw.
 */

export type ResolveUsableModel = (model: string) => Promise<string>;

export interface TurnModelSelectionOptions {
  primaryModel: string;
  fallbackModel: string | null | undefined;
  /** Canonical form of a model reference, used to tell a normalization from a substitution. */
  canonicalize: (model: string) => string;
}

export interface ModelSwitchAnnouncement {
  model: string;
  reason: string;
  primary: string;
}

export class TurnModelSelection {
  private readonly primaryModel: string;
  private readonly fallbackModel: string | null | undefined;
  private readonly canonicalize: (model: string) => string;
  private current: string;
  private reason: string | null = null;
  private budgetSelected = false;
  private announcedSwitchKey: string | null = null;

  constructor(options: TurnModelSelectionOptions) {
    this.primaryModel = options.primaryModel;
    this.fallbackModel = options.fallbackModel;
    this.canonicalize = options.canonicalize;
    this.current = options.primaryModel;
  }

  /** The model the next attempt uses; after the turn, the model that answered. */
  get model(): string {
    return this.current;
  }

  /** Why the selected model is not the primary, or null when nothing switched. */
  get switchReason(): string | null {
    return this.reason;
  }

  get budgetModelSelected(): boolean {
    return this.budgetSelected;
  }

  /** Routes an over-budget simple turn to `model`, recording `reason` when it differs from the primary. */
  selectBudgetModel(model: string, reason: string): void {
    this.current = model;
    this.budgetSelected = this.current !== this.primaryModel;
    if (this.budgetSelected) {
      this.reason = reason;
    }
  }

  /**
   * Confirms the selected model is routable before any attempt. On failure
   * it falls back budget -> primary -> configured fallback, and rethrows the
   * last resolution error when no step is left.
   */
  async resolvePreflight(resolve: ResolveUsableModel): Promise<void> {
    try {
      const selectedModelBeforeResolution = this.current.trim();
      this.current = await resolve(this.current);
      const normalizedOnly = this.current
        === this.canonicalize(selectedModelBeforeResolution);
      if (!normalizedOnly) {
        this.budgetSelected = false;
        this.reason = `${selectedModelBeforeResolution} unavailable; ${this.current} selected`;
      }
    } catch (selectedResolutionError) {
      const unavailableModel = this.current;
      if (this.budgetSelected && unavailableModel !== this.primaryModel) {
        try {
          this.current = await resolve(this.primaryModel);
          this.budgetSelected = false;
          this.reason = `${unavailableModel} unavailable; primary selected`;
        } catch (primaryResolutionError) {
          if (!this.fallbackModel || this.fallbackModel === unavailableModel) throw primaryResolutionError;
          this.current = await resolve(this.fallbackModel);
          this.budgetSelected = false;
          this.reason = `${unavailableModel} and ${this.primaryModel} unavailable; configured fallback selected`;
        }
      } else {
        if (!this.fallbackModel || this.fallbackModel === unavailableModel) throw selectedResolutionError;
        this.current = await resolve(this.fallbackModel);
        this.reason = `${unavailableModel} unavailable; configured fallback selected`;
      }
    }
  }

  /** The budget model a failed attempt ran on, or null when the attempt was not a budget run. */
  failedBudgetModel(): string | null {
    return this.budgetSelected && this.current !== this.primaryModel ? this.current : null;
  }

  /**
   * After a failed budget run, selects the primary, or the configured
   * fallback when the primary cannot be resolved. Rethrows the primary's
   * resolution error when no usable fallback is left.
   */
  async returnFromFailedBudgetModel(
    failedBudgetModel: string,
    resolve: ResolveUsableModel,
  ): Promise<'primary' | 'fallback'> {
    try {
      this.current = await resolve(this.primaryModel);
      this.budgetSelected = false;
      this.reason = `${failedBudgetModel} failed; primary selected`;
      return 'primary';
    } catch (primaryResolutionError) {
      this.budgetSelected = false;
      if (!this.fallbackModel || this.fallbackModel === failedBudgetModel) throw primaryResolutionError;
      this.current = await resolve(this.fallbackModel);
      this.reason = `${failedBudgetModel} failed and ${this.primaryModel} unavailable; configured fallback selected`;
      return 'fallback';
    }
  }

  /** Whether a configured fallback remains that has not already failed or is not already selected. */
  canSwitchToFallback(failedBudgetModel: string | null): boolean {
    return Boolean(this.fallbackModel
      && this.fallbackModel !== failedBudgetModel
      && this.current !== this.fallbackModel);
  }

  /** Selects the configured fallback after the current model failed with `failure`. */
  async switchToFallbackAfter(failure: unknown, resolve: ResolveUsableModel): Promise<void> {
    const failedModel = this.current;
    this.current = await resolve(this.fallbackModel as string);
    this.reason = `${failedModel} failed (${(failure as { status?: number }).status ?? 'timeout'}); configured fallback selected`;
  }

  /**
   * The `model_switch` announcement for an attempt on `attemptModel`, or null
   * when nothing switched or this model and reason were already announced.
   */
  takeSwitchAnnouncement(attemptModel: string): ModelSwitchAnnouncement | null {
    if (!this.reason) return null;
    const switchKey = `${attemptModel}\u0000${this.reason}`;
    if (this.announcedSwitchKey === switchKey) return null;
    this.announcedSwitchKey = switchKey;
    return { model: attemptModel, reason: this.reason, primary: this.primaryModel };
  }
}
