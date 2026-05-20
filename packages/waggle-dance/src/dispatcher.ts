import type { WaggleMessage } from '@waggle/shared';
import { validateMessageTypeCombo } from './protocol.js';

export interface DispatchDeps {
  // ── v1 (team-internal) ─────────────────────────────────────────────

  /** Search memory for a query. */
  searchMemory: (query: string) => Promise<string>;

  /** Resolve a capability via the router. */
  resolveCapability: (
    query: string,
  ) => Array<{
    source: string;
    name: string;
    description: string;
    available: boolean;
  }>;

  /** Spawn a worker for a task delegation. */
  spawnWorker: (task: string, role: string, context?: string) => Promise<string>;

  // ── v2 (cross-tool activity bus, AI-OS Phase 1) ───────────────────

  /**
   * Emit a broadcast signal to the activity bus. Used by `discovery`,
   * `routed_share`, and `model_recipe` subtypes. Implementations
   * persist the message (DB) and push to live listeners (SSE / WS).
   *
   * Optional. When absent, the dispatcher still reports `handled=true`
   * so a caller wiring persistence outside the dispatcher (e.g. via
   * a Fastify route handler) does not see false negatives. The route
   * layer is the authoritative persistence boundary.
   */
  emitSignal?: (message: WaggleMessage) => Promise<void>;

  /**
   * Record a response message. Used by `knowledge_match` and
   * `task_claim`. Implementations persist the response and correlate
   * to the original request via `message.referenceId`.
   *
   * Optional. Same fall-through semantics as `emitSignal`.
   */
  recordResponse?: (message: WaggleMessage) => Promise<void>;

  /**
   * Recommend a model for a `model_recommendation` request. The
   * `context` argument carries any additional content fields (budget,
   * latency hint, etc.) the implementation may use to score candidates.
   *
   * Optional. When absent the dispatcher returns a friendly
   * not-configured response (still `handled=true`).
   */
  recommendModel?: (
    query: string,
    context: Record<string, unknown>,
  ) => Promise<string | null>;
}

export interface DispatchResult {
  handled: boolean;
  response?: string;
  error?: string;
}

/**
 * Dispatches Waggle Dance protocol messages to real handlers.
 *
 * v1 (team-internal) subtypes: task_delegation, knowledge_check,
 *   skill_request, skill_share.
 *
 * v2 (cross-tool activity bus, AI-OS Phase 1): discovery, routed_share,
 *   model_recipe, knowledge_match, task_claim, model_recommendation.
 *
 * All v2 callbacks are optional — Phase 1A introduces the branches
 * with safe defaults so the route layer can wire emitters / response
 * recorders / model recommenders incrementally (Phase 1B/1C).
 */
export class WaggleDanceDispatcher {
  private deps: DispatchDeps;

  constructor(deps: DispatchDeps) {
    this.deps = deps;
  }

  /** Dispatch a Waggle Dance message to the appropriate handler. */
  async dispatch(message: WaggleMessage): Promise<DispatchResult> {
    // Validate the message type-subtype combo first.
    if (!validateMessageTypeCombo(message.type, message.subtype)) {
      return {
        handled: false,
        error: `Invalid message: ${message.type}/${message.subtype}`,
      };
    }

    switch (message.subtype) {
      // ── v1 ────────────────────────────────────────────────────────
      case 'task_delegation':
        return this.handleTaskDelegation(message);
      case 'knowledge_check':
        return this.handleKnowledgeCheck(message);
      case 'skill_request':
        return this.handleSkillRequest(message);
      case 'skill_share':
        return this.handleSkillShare(message);

      // ── v2 — broadcasts ──────────────────────────────────────────
      case 'discovery':
      case 'routed_share':
      case 'model_recipe':
        return this.handleBroadcastSignal(message);

      // ── v2 — responses ───────────────────────────────────────────
      case 'knowledge_match':
      case 'task_claim':
        return this.handleResponseRelay(message);

      // ── v2 — model_recommendation request ────────────────────────
      case 'model_recommendation':
        return this.handleModelRecommendation(message);

      default:
        return {
          handled: false,
          error: `Unhandled subtype: ${(message as { subtype: string }).subtype}`,
        };
    }
  }

  // ── v1 handlers (unchanged) ──────────────────────────────────────

  private async handleTaskDelegation(
    message: WaggleMessage,
  ): Promise<DispatchResult> {
    const task = (message.content.task as string) ?? '';
    const role = (message.content.role as string) ?? 'analyst';
    const context = (message.content.context as string) ?? undefined;

    if (!task) {
      return { handled: false, error: 'task_delegation requires content.task' };
    }

    try {
      const result = await this.deps.spawnWorker(task, role, context);
      return { handled: true, response: result };
    } catch (err) {
      return {
        handled: false,
        error: `Worker spawn failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  private async handleKnowledgeCheck(
    message: WaggleMessage,
  ): Promise<DispatchResult> {
    const query =
      (message.content.query as string) ??
      (message.content.topic as string) ??
      '';
    if (!query) {
      return {
        handled: false,
        error: 'knowledge_check requires content.query or content.topic',
      };
    }

    try {
      const result = await this.deps.searchMemory(query);
      return { handled: true, response: result };
    } catch (err) {
      return {
        handled: false,
        error: `Memory search failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  private async handleSkillShare(
    message: WaggleMessage,
  ): Promise<DispatchResult> {
    const skillName =
      (message.content.name as string) ??
      (message.content.skill as string) ??
      '';
    const skillContent = (message.content.content as string) ?? '';

    if (!skillName || !skillContent) {
      return {
        handled: false,
        error: 'skill_share requires content.name and content.content',
      };
    }

    return {
      handled: true,
      response: JSON.stringify({
        action: 'install_shared_skill',
        skillName,
        skillContent,
        sharedBy: (message.content.sharedBy as string) ?? 'unknown',
      }),
    };
  }

  private async handleSkillRequest(
    message: WaggleMessage,
  ): Promise<DispatchResult> {
    const query =
      (message.content.skill as string) ??
      (message.content.query as string) ??
      '';
    if (!query) {
      return {
        handled: false,
        error: 'skill_request requires content.skill or content.query',
      };
    }

    const routes = this.deps.resolveCapability(query);
    if (routes.length === 0) {
      return { handled: true, response: `No capability found for "${query}"` };
    }

    const available = routes.filter((r) => r.available);
    const routeList = routes
      .map(
        (r) =>
          `- [${r.source}] ${r.name}: ${r.description} (${r.available ? 'available' : 'not available'})`,
      )
      .join('\n');

    return {
      handled: true,
      response: `Found ${routes.length} capabilities (${available.length} available):\n${routeList}`,
    };
  }

  // ── v2 handlers ──────────────────────────────────────────────────

  /**
   * Shared handler for `discovery`, `routed_share`, and `model_recipe`
   * broadcasts. All three share the same shape (persist + emit);
   * downstream consumers differentiate on `subtype`.
   */
  private async handleBroadcastSignal(
    message: WaggleMessage,
  ): Promise<DispatchResult> {
    if (!this.deps.emitSignal) {
      // Route layer is the authoritative persistence boundary. Reporting
      // handled=true keeps the dispatcher composable with callers that
      // do persistence externally.
      return { handled: true, response: `${message.subtype} accepted` };
    }
    try {
      await this.deps.emitSignal(message);
      return { handled: true, response: `${message.subtype} emitted` };
    } catch (err) {
      return {
        handled: false,
        error: `Signal emit failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  /**
   * Shared handler for `knowledge_match` and `task_claim` responses.
   * Both are correlated to a prior request via `referenceId`; the
   * dispatcher's job is to persist (or accept) the response and let
   * downstream subscribers reconstruct the request/response pair.
   */
  private async handleResponseRelay(
    message: WaggleMessage,
  ): Promise<DispatchResult> {
    if (!this.deps.recordResponse) {
      return { handled: true, response: `${message.subtype} accepted` };
    }
    try {
      await this.deps.recordResponse(message);
      return { handled: true, response: `${message.subtype} recorded` };
    } catch (err) {
      return {
        handled: false,
        error: `Response record failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  private async handleModelRecommendation(
    message: WaggleMessage,
  ): Promise<DispatchResult> {
    const query = (message.content.query as string) ?? '';
    if (!query) {
      return {
        handled: false,
        error: 'model_recommendation requires content.query',
      };
    }
    if (!this.deps.recommendModel) {
      return {
        handled: true,
        response: 'no model recommender configured',
      };
    }
    // Pass everything except `query` as context so the recommender
    // can score on caller-provided hints (budget, latency, …).
    const { query: _drop, ...rest } = message.content;
    try {
      const recommendation = await this.deps.recommendModel(query, rest);
      if (!recommendation) {
        return {
          handled: true,
          response: `no recommendation available for "${query}"`,
        };
      }
      return { handled: true, response: recommendation };
    } catch (err) {
      return {
        handled: false,
        error: `Model recommendation failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
