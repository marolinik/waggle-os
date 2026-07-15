/**
 * Router arc P1-B (B2) — wire types for the /api/route-proposals endpoints.
 * These shapes mirror SPEC-P1-router-core.md §A4 exactly (propose / confirm /
 * reject responses). The backend route is built concurrently at
 * packages/server/src/local/routes/route-proposals.ts — code against these
 * shapes, never against an ad-hoc parse.
 */

/** One workspace memory the brief would send out (propose → egress.items[]). */
export interface RouteProposalEgressItem {
  frameId: string;
  date: string;
  source: string;
  /** First 120 chars of the frame content. */
  preview: string;
}

/** Egress disclosure when a memory brief accompanies an external dispatch. */
export interface RouteProposalEgress {
  destination: string;
  items: RouteProposalEgressItem[];
  briefChars: number;
}

export interface RouteProposalSelected {
  id: string;
  displayName: string;
  /** Human-readable top scoring part, e.g. "best coding fit, available now". */
  reason: string;
}

export interface RouteProposalAlternative {
  id: string;
  displayName: string;
}

/** A hard-gated executor — greyed out in the override select with its reason. */
export interface RouteProposalRejection {
  id: string;
  reason: string;
}

export interface RouteProposalScore {
  id: string;
  total: number;
  parts: {
    taskFit: number;
    preference: number;
    reliability: number;
    quota: number;
    latency: number;
  };
}

/** POST /api/route-proposals response (SPEC A4 step 5). */
export interface RouteProposalPayload {
  routeDecisionId: string;
  /** null = no eligible executor (RouteDecision.selected is nullable). */
  selected: RouteProposalSelected | null;
  alternatives: RouteProposalAlternative[];
  rejected: RouteProposalRejection[];
  scores: RouteProposalScore[];
  /** null when no memory brief accompanies the dispatch (persona run, or brief blocked). */
  egress: RouteProposalEgress | null;
  /** Verbatim from the API — render as-is, never reworded. No dollar figures. */
  costLine: string;
  /** B1 injection gate tripped: egress is null and only "Run without memory" is offered. */
  briefBlocked?: boolean;
  briefBlockedReason?: string;
}

/** POST /api/route-proposals/:id/confirm success response (SPEC A4 step 5). */
export interface RouteProposalConfirmResponse {
  status: 'dispatched';
  mode: 'external' | 'internal';
  roomId?: string;
  runId?: string;
}

/** Confirm request body (SPEC A4): override + per-frame egress removals. */
export interface RouteProposalConfirmBody {
  executorId?: string;
  removeFrameIds?: string[];
}
