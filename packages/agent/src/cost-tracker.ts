export interface ModelPricing {
  inputPer1k: number;
  outputPer1k: number;
}

export interface UsageEntry {
  model: string;
  input: number;
  output: number;
  timestamp: string;
  workspaceId?: string;
  billingClass?: ModelSpendBillingClass;
  fixedCostUsd?: number;
}

export interface UsageStats {
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCost: number;
  turns: number;
  byModel: Record<string, { input: number; output: number; cost: number }>;
}

/** Default pricing for common models (per 1K tokens). Model IDs cross-checked
 *  against litellm-config.yaml (repo root) — the canonical router catalog. */
export const DEFAULT_MODEL_PRICING: Record<string, ModelPricing> = {
  // ── Anthropic Claude — Opus class ($15/$75 per 1M) ──
  'claude-opus-4-8': { inputPer1k: 0.015, outputPer1k: 0.075 },
  'claude-opus-4-7': { inputPer1k: 0.015, outputPer1k: 0.075 },
  'claude-opus-4-6': { inputPer1k: 0.015, outputPer1k: 0.075 },
  // ── Claude — Sonnet class ($3/$15 per 1M) ──
  'claude-sonnet-5': { inputPer1k: 0.003, outputPer1k: 0.015 },
  'claude-sonnet-4-6': { inputPer1k: 0.003, outputPer1k: 0.015 },
  'claude-sonnet-4-20250514': { inputPer1k: 0.003, outputPer1k: 0.015 },
  'claude-3-5-sonnet-20241022': { inputPer1k: 0.003, outputPer1k: 0.015 },
  // ── Claude — Haiku class ──
  'claude-haiku-4-5': { inputPer1k: 0.001, outputPer1k: 0.005 }, // 4.5 ($1/$5 per 1M)
  'claude-haiku-4-5-20251001': { inputPer1k: 0.001, outputPer1k: 0.005 },
  'claude-haiku-3-5': { inputPer1k: 0.00025, outputPer1k: 0.00125 },
  'claude-3-5-haiku-20241022': { inputPer1k: 0.00025, outputPer1k: 0.00125 },
  // Gemini 2.5 Flash standard text rates ($0.30/$2.50 per 1M)
  'gemini-2.5-flash': { inputPer1k: 0.0003, outputPer1k: 0.0025 },
  'google/gemini-2.5-flash': { inputPer1k: 0.0003, outputPer1k: 0.0025 },
  // GPT-5.3-Codex standard text rates ($1.75/$14 per 1M)
  'gpt-5.3-codex': { inputPer1k: 0.00175, outputPer1k: 0.014 },
  'openai/gpt-5.3-codex': { inputPer1k: 0.00175, outputPer1k: 0.014 },
  'openrouter/openai/gpt-5.3-codex': { inputPer1k: 0.00175, outputPer1k: 0.014 },
};

/**
 * Family-aware fallback pricing for a model id with no explicit entry. Keys off
 * the Anthropic tier word in the id so an unrecognized Opus snapshot isn't
 * costed at ~5× under Sonnet rates. Defaults to Sonnet for everything else.
 */
function fallbackPricingFor(
  model: string,
  inferOllamaFree = true,
): { label: string; pricing: ModelPricing } {
  const m = model.toLowerCase();
  // Ollama runs on the user's machine and does not incur provider charges.
  // Treat unknown local model tags as explicitly free instead of inventing a
  // cloud-model estimate or emitting a misleading warning.
  if (inferOllamaFree && m.startsWith('ollama/')) {
    return { label: 'Local (free)', pricing: { inputPer1k: 0, outputPer1k: 0 } };
  }
  if (m.includes('opus')) return { label: 'Opus', pricing: { inputPer1k: 0.015, outputPer1k: 0.075 } };
  if (m.includes('haiku')) return { label: 'Haiku', pricing: { inputPer1k: 0.001, outputPer1k: 0.005 } };
  return { label: 'Sonnet', pricing: { inputPer1k: 0.003, outputPer1k: 0.015 } };
}

/** Models already warned about — keeps the unknown-model warning to once each. */
const warnedUnknownModels = new Set<string>();

export type BudgetMode = 'soft' | 'hard';
export type ModelSpendBillingClass = 'priced' | 'free';

export interface ModelSpendReservationRequest {
  model: string;
  inputTokens: number;
  maxOutputTokens: number;
  workspaceId?: string;
  /** Set only after the server has verified an offline/free provider route. */
  billingClass?: ModelSpendBillingClass;
}

export interface ModelSpendReservation {
  readonly id: string;
}

export const MODEL_SPEND_RESERVATION_HEADER = 'x-waggle-model-spend-reservation';

export interface ModelSpendReservationHandoff {
  reservation: ModelSpendReservation;
  estimatedCostUsd: number;
  durableTraceId?: number;
}

export type ModelSpendReservationDisposition = 'commit' | 'release';

function isCanonicalModelSpendReservationTarget(targetUrl: string): boolean {
  const match = /^http:\/\/127\.0\.0\.1:([1-9]\d{0,4})\/v1$/.exec(targetUrl);
  if (!match) return false;
  const port = Number(match[1]);
  return Number.isInteger(port) && port <= 65_535;
}

export interface ModelSpendBudget {
  reserveModelSpend(request: ModelSpendReservationRequest): ModelSpendReservation;
  reconcileModelSpend(
    reservation: ModelSpendReservation,
    usage: { inputTokens: number; outputTokens: number },
  ): boolean;
  commitReservedModelSpend(reservation: ModelSpendReservation): boolean;
  releaseReservedModelSpend(reservation: ModelSpendReservation): boolean;
  issueModelSpendReservationHandoff?(
    reservation: ModelSpendReservation,
    requestBinding: string,
    targetUrl: string,
    durableTraceId?: number,
  ): { token: string } | undefined;
  claimModelSpendReservationHandoff?(
    token: string,
    requestBinding: string,
  ): ModelSpendReservationHandoff | undefined;
  discardModelSpendReservationHandoff?(token: string): void;
  setModelSpendReservationHandoffDisposition?(
    token: string,
    disposition: ModelSpendReservationDisposition,
  ): void;
  takeModelSpendReservationHandoffDisposition?(
    token: string,
  ): ModelSpendReservationDisposition | undefined;
  registerModelSpendReservationTarget?(targetUrl: string): boolean;
  unregisterModelSpendReservationTarget?(targetUrl: string): void;
  markModelSpendPersistenceUnavailable?(cause: unknown): void;
}

interface StoredModelSpendReservation extends ModelSpendReservation {
  day: string;
  createdAt: string;
  model: string;
  inputTokens: number;
  maxOutputTokens: number;
  workspaceId?: string;
  billingClass: ModelSpendBillingClass;
  estimatedCostUsd: number;
}

export class BudgetExceededError extends Error {
  public readonly code = 'DAILY_MODEL_BUDGET_EXCEEDED';
  public readonly budgetUsd: number;
  public readonly currentUsd: number;
  constructor(budgetUsd: number, currentUsd: number) {
    super(`Daily budget exceeded: $${currentUsd.toFixed(4)} / $${budgetUsd.toFixed(2)} (hard cap)`);
    this.name = 'BudgetExceededError';
    this.budgetUsd = budgetUsd;
    this.currentUsd = currentUsd;
  }
}

export class BudgetPricingUnavailableError extends Error {
  public readonly code = 'DAILY_MODEL_BUDGET_PRICING_UNAVAILABLE';
  constructor(model: string) {
    super(`Hard daily budget cannot price model "${model}" from the trusted catalog`);
    this.name = 'BudgetPricingUnavailableError';
  }
}

export class BudgetPersistenceUnavailableError extends Error {
  public readonly code = 'DAILY_MODEL_BUDGET_LEDGER_UNAVAILABLE';

  constructor(cause?: unknown) {
    super('Hard daily model budget cannot continue without a durable spend ledger', { cause });
    this.name = 'BudgetPersistenceUnavailableError';
  }
}

export class CostTracker implements ModelSpendBudget {
  private pricing: Record<string, ModelPricing>;
  private usage: UsageEntry[] = [];
  private dailyCarryover: { day: string; costUsd: number } | null = null;
  private dailyBudgetUsd: number | null = null;
  private budgetMode: BudgetMode = 'soft';
  private reservations = new Map<string, StoredModelSpendReservation>();
  private reservationHandoffs = new Map<string, {
    reservationId: string;
    requestBinding: string;
    targetUrl: string;
    durableTraceId?: number;
    state: 'issued' | 'claimed';
  }>();
  private reservationHandoffDispositions = new Map<string, ModelSpendReservationDisposition>();
  private modelSpendReservationTargets = new Set<string>();
  private modelSpendPersistenceFailure: unknown;
  private nextReservationId = 0;

  constructor(pricing: Record<string, ModelPricing> = {}) {
    this.pricing = { ...DEFAULT_MODEL_PRICING, ...pricing };
  }

  setBudget(dailyUsd: number | null, mode: BudgetMode = 'soft'): void {
    if (dailyUsd !== null && (!Number.isFinite(dailyUsd) || dailyUsd < 0)) {
      throw new RangeError('Daily budget must be a non-negative finite number or null');
    }
    this.dailyBudgetUsd = dailyUsd === 0 ? null : dailyUsd;
    this.budgetMode = mode;
  }

  getBudget(): { dailyBudgetUsd: number | null; mode: BudgetMode } {
    return { dailyBudgetUsd: this.dailyBudgetUsd, mode: this.budgetMode };
  }

  /**
   * Check if daily budget allows proceeding. Returns true if OK.
   * In hard mode, throws BudgetExceededError. In soft mode, returns false but doesn't throw.
   */
  checkBudget(): boolean {
    if (this.dailyBudgetUsd === null) return true;
    const current = this.getDailyTotal() + this.getReservedDailyTotal();
    if (current >= this.dailyBudgetUsd) {
      if (this.budgetMode === 'hard') {
        throw new BudgetExceededError(this.dailyBudgetUsd, current);
      }
      return false;
    }
    return true;
  }

  addUsage(
    model: string,
    inputTokens: number,
    outputTokens: number,
    workspaceId?: string,
    accounting: Pick<UsageEntry, 'billingClass' | 'fixedCostUsd'> = {},
  ): void {
    this.assertValidTokens(inputTokens, outputTokens);
    if (
      accounting.fixedCostUsd !== undefined
      && (!Number.isFinite(accounting.fixedCostUsd) || accounting.fixedCostUsd < 0)
    ) {
      throw new RangeError('Fixed model spend must be a non-negative finite number');
    }
    if (
      accounting.billingClass !== undefined
      && accounting.billingClass !== 'free'
      && accounting.billingClass !== 'priced'
    ) {
      throw new RangeError('Model spend billing class must be priced or free');
    }
    this.usage.push({
      model,
      input: inputTokens,
      output: outputTokens,
      timestamp: new Date().toISOString(),
      workspaceId,
      billingClass: accounting.billingClass,
      fixedCostUsd: accounting.fixedCostUsd,
    });
  }

  /** Reserve conservative provider spend before any network dispatch. */
  reserveModelSpend(request: ModelSpendReservationRequest): ModelSpendReservation {
    if (!Number.isFinite(request.inputTokens) || request.inputTokens < 0
      || !Number.isFinite(request.maxOutputTokens) || request.maxOutputTokens < 0) {
      throw new RangeError('Model spend token estimates must be non-negative finite numbers');
    }

    if (
      this.budgetMode === 'hard'
      && this.dailyBudgetUsd !== null
      && this.modelSpendPersistenceFailure !== undefined
    ) {
      throw new BudgetPersistenceUnavailableError(this.modelSpendPersistenceFailure);
    }

    const now = new Date().toISOString();
    const day = now.slice(0, 10);
    const billingClass = request.billingClass ?? 'priced';
    if (
      billingClass === 'priced'
      && this.budgetMode === 'hard'
      && this.dailyBudgetUsd !== null
      && this.resolveTrustedPricing(request.model) === undefined
    ) {
      throw new BudgetPricingUnavailableError(request.model);
    }
    const estimatedCostUsd = billingClass === 'free'
      ? 0
      : this.roundUpUsd(this.calculateCostWithPolicy(
          request.inputTokens,
          request.maxOutputTokens,
          request.model,
          false,
        ));
    const committed = this.getDailyTotal();
    const reserved = this.getReservedDailyTotal(day);

    if (
      this.budgetMode === 'hard'
      && this.dailyBudgetUsd !== null
      && estimatedCostUsd > 0
      && committed + reserved + estimatedCostUsd > this.dailyBudgetUsd
    ) {
      throw new BudgetExceededError(this.dailyBudgetUsd, committed + reserved);
    }

    const id = `${day}:${++this.nextReservationId}`;
    this.reservations.set(id, {
      id,
      day,
      createdAt: now,
      model: request.model,
      inputTokens: request.inputTokens,
      maxOutputTokens: request.maxOutputTokens,
      workspaceId: request.workspaceId,
      billingClass,
      estimatedCostUsd,
    });
    return { id };
  }

  issueModelSpendReservationHandoff(
    reservation: ModelSpendReservation,
    requestBinding: string,
    targetUrl: string,
    durableTraceId?: number,
  ): { token: string } | undefined {
    if (!this.reservations.has(reservation.id) || !this.modelSpendReservationTargets.has(targetUrl)) {
      return undefined;
    }
    if (durableTraceId !== undefined && (!Number.isSafeInteger(durableTraceId) || durableTraceId <= 0)) {
      return undefined;
    }
    for (const handoff of this.reservationHandoffs.values()) {
      if (handoff.reservationId === reservation.id) return undefined;
    }
    const token = crypto.randomUUID();
    this.reservationHandoffs.set(token, {
      reservationId: reservation.id,
      requestBinding,
      targetUrl,
      durableTraceId,
      state: 'issued',
    });
    return { token };
  }

  claimModelSpendReservationHandoff(
    token: string,
    requestBinding: string,
  ): ModelSpendReservationHandoff | undefined {
    const handoff = this.reservationHandoffs.get(token);
    if (!handoff || handoff.state !== 'issued') return undefined;
    const stored = this.reservations.get(handoff.reservationId);
    if (!stored) {
      this.reservationHandoffs.delete(token);
      return undefined;
    }
    if (handoff.requestBinding !== requestBinding) {
      this.reservationHandoffs.delete(token);
      this.reservationHandoffDispositions.delete(token);
      return undefined;
    }
    handoff.state = 'claimed';
    return {
      reservation: { id: stored.id },
      estimatedCostUsd: stored.estimatedCostUsd,
      ...(handoff.durableTraceId === undefined ? {} : { durableTraceId: handoff.durableTraceId }),
    };
  }

  discardModelSpendReservationHandoff(token: string): void {
    this.reservationHandoffs.delete(token);
    this.reservationHandoffDispositions.delete(token);
  }

  setModelSpendReservationHandoffDisposition(
    token: string,
    disposition: ModelSpendReservationDisposition,
  ): void {
    if (this.reservationHandoffs.get(token)?.state !== 'claimed') return;
    this.reservationHandoffDispositions.set(token, disposition);
  }

  takeModelSpendReservationHandoffDisposition(
    token: string,
  ): ModelSpendReservationDisposition | undefined {
    const disposition = this.reservationHandoffDispositions.get(token);
    this.reservationHandoffDispositions.delete(token);
    return disposition;
  }

  registerModelSpendReservationTarget(targetUrl: string): boolean {
    if (!isCanonicalModelSpendReservationTarget(targetUrl)) return false;
    this.modelSpendReservationTargets.add(targetUrl);
    return true;
  }

  unregisterModelSpendReservationTarget(targetUrl: string): void {
    this.modelSpendReservationTargets.delete(targetUrl);
    for (const [token, handoff] of this.reservationHandoffs) {
      if (handoff.targetUrl === targetUrl) {
        this.reservationHandoffs.delete(token);
        this.reservationHandoffDispositions.delete(token);
      }
    }
  }

  markModelSpendPersistenceUnavailable(cause: unknown): void {
    this.modelSpendPersistenceFailure = cause;
  }

  /** Replace a reservation with authoritative provider usage, exactly once. */
  reconcileModelSpend(
    reservation: ModelSpendReservation,
    usage: { inputTokens: number; outputTokens: number },
  ): boolean {
    if (!this.hasValidTokens(usage.inputTokens, usage.outputTokens)) {
      return this.commitReservedModelSpend(reservation);
    }
    const stored = this.takeReservation(reservation);
    if (!stored) return false;
    this.usage.push({
      model: stored.model,
      input: Math.max(0, usage.inputTokens),
      output: Math.max(0, usage.outputTokens),
      timestamp: stored.createdAt,
      workspaceId: stored.workspaceId,
      billingClass: stored.billingClass,
    });
    return true;
  }

  /** Conservatively charge the estimate after an ambiguous dispatched failure. */
  commitReservedModelSpend(reservation: ModelSpendReservation): boolean {
    const stored = this.takeReservation(reservation);
    if (!stored) return false;
    this.usage.push({
      model: stored.model,
      input: stored.inputTokens,
      output: stored.maxOutputTokens,
      timestamp: stored.createdAt,
      workspaceId: stored.workspaceId,
      billingClass: stored.billingClass,
      fixedCostUsd: stored.estimatedCostUsd,
    });
    return true;
  }

  /** Release only on a definite pre-inference provider rejection. */
  releaseReservedModelSpend(reservation: ModelSpendReservation): boolean {
    return Boolean(this.takeReservation(reservation));
  }

  getReservedDailyTotal(day = new Date().toISOString().slice(0, 10)): number {
    let total = 0;
    for (const reservation of this.reservations.values()) {
      if (reservation.day === day) total += reservation.estimatedCostUsd;
    }
    return total;
  }

  /** Get raw usage entries (for cost routes). */
  getUsageEntries(): ReadonlyArray<UsageEntry> {
    return this.usage;
  }

  /** Calculate cost for a single usage entry. */
  calculateCost(input: number, output: number, model: string): number {
    return this.calculateCostWithPolicy(input, output, model, true);
  }

  /** Calculate the authoritative cost of a recorded usage entry. */
  calculateUsageCost(
    entry: Pick<UsageEntry, 'model' | 'input' | 'output' | 'billingClass' | 'fixedCostUsd'>,
  ): number {
    if (entry.fixedCostUsd !== undefined) return entry.fixedCostUsd;
    if (entry.billingClass === 'free') return 0;
    if (entry.billingClass === 'priced') {
      return this.calculateCostWithPolicy(entry.input, entry.output, entry.model, false);
    }
    return this.calculateCost(entry.input, entry.output, entry.model);
  }

  private calculateCostWithPolicy(
    input: number,
    output: number,
    model: string,
    inferOllamaFree: boolean,
  ): number {
    const price = this.resolveTrustedPricing(model);
    if (price) {
      return (input / 1000) * price.inputPer1k + (output / 1000) * price.outputPer1k;
    }
    // Unknown model: fall back to family-aware pricing (not always Sonnet — an
    // unrecognized Opus id would otherwise under-report ~5×) and warn loudly
    // once so the cost isn't silently wrong.
    const { label, pricing } = fallbackPricingFor(model, inferOllamaFree);
    if (inferOllamaFree && model.toLowerCase().startsWith('ollama/')) {
      return (input / 1000) * pricing.inputPer1k + (output / 1000) * pricing.outputPer1k;
    }
    if (!warnedUnknownModels.has(model)) {
      warnedUnknownModels.add(model);
      console.warn(
        `[cost-tracker] Unknown model "${model}" — no pricing entry; estimating with ` +
          `${label} pricing ($${pricing.inputPer1k}/1K in, $${pricing.outputPer1k}/1K out). ` +
          `Cost may be inaccurate — add it to DEFAULT_MODEL_PRICING.`,
      );
    }
    return (input / 1000) * pricing.inputPer1k + (output / 1000) * pricing.outputPer1k;
  }

  getStats(): UsageStats {
    let totalInput = 0, totalOutput = 0, totalCost = 0;
    const byModel: Record<string, { input: number; output: number; cost: number }> = {};

    for (const u of this.usage) {
      totalInput += u.input;
      totalOutput += u.output;
      const cost = this.calculateUsageCost(u);
      totalCost += cost;
      if (!byModel[u.model]) byModel[u.model] = { input: 0, output: 0, cost: 0 };
      byModel[u.model].input += u.input;
      byModel[u.model].output += u.output;
      byModel[u.model].cost += cost;
    }

    return { totalInputTokens: totalInput, totalOutputTokens: totalOutput, estimatedCost: totalCost, turns: this.usage.length, byModel };
  }

  /** Get total estimated cost for a specific workspace (current session). */
  getWorkspaceCost(workspaceId: string): number {
    let total = 0;
    for (const u of this.usage) {
      if (u.workspaceId === workspaceId) {
        total += this.calculateUsageCost(u);
      }
    }
    return total;
  }

  hasDailyCarryover(day: string): boolean {
    return this.dailyCarryover?.day === day;
  }

  /** Resolve provider-wrapped IDs only when their suffix exists in the trusted catalog. */
  private resolveTrustedPricing(model: string): ModelPricing | undefined {
    let candidate = model;
    while (candidate.length > 0) {
      const price = this.pricing[candidate];
      if (price) return price;
      const separator = candidate.indexOf('/');
      if (separator < 0) return undefined;
      candidate = candidate.slice(separator + 1);
    }
    return undefined;
  }

  /** Seed cost persisted before this process started, once per UTC day. */
  initializeDailyCarryover(day: string, costUsd: number): void {
    if (this.hasDailyCarryover(day)) return;
    this.dailyCarryover = {
      day,
      costUsd: Number.isFinite(costUsd) ? Math.max(0, costUsd) : 0,
    };
  }

  /** Get today's persisted carryover plus in-process usage (UTC calendar day). */
  getDailyTotal(): number {
    const today = new Date().toISOString().slice(0, 10);
    let total = this.dailyCarryover?.day === today
      ? this.dailyCarryover.costUsd
      : 0;
    for (const entry of this.usage) {
      if (entry.timestamp.startsWith(today)) {
        total += this.calculateUsageCost(entry);
      }
    }
    return total;
  }

  formatSummary(): string {
    const stats = this.getStats();
    return `Tokens: ${stats.totalInputTokens} in / ${stats.totalOutputTokens} out (${stats.turns} turns) | Est. cost: $${stats.estimatedCost.toFixed(4)}`;
  }

  private takeReservation(
    reservation: ModelSpendReservation,
  ): StoredModelSpendReservation | undefined {
    const stored = this.reservations.get(reservation.id);
    if (!stored) return undefined;
    this.reservations.delete(reservation.id);
    for (const [token, handoff] of this.reservationHandoffs) {
      if (handoff.reservationId === reservation.id) {
        this.reservationHandoffs.delete(token);
        this.reservationHandoffDispositions.delete(token);
      }
    }
    return stored;
  }

  private hasValidTokens(inputTokens: number, outputTokens: number): boolean {
    return Number.isFinite(inputTokens) && inputTokens >= 0
      && Number.isFinite(outputTokens) && outputTokens >= 0;
  }

  private assertValidTokens(inputTokens: number, outputTokens: number): void {
    if (!this.hasValidTokens(inputTokens, outputTokens)) {
      throw new RangeError('Model usage tokens must be non-negative finite numbers');
    }
  }

  private roundUpUsd(value: number): number {
    return Math.ceil((Math.max(0, value) * 1_000_000) - 1e-9) / 1_000_000;
  }
}
