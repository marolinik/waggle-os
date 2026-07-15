// SPEC P1-A · A1 — Pure ExecutorRouter.
//
// Rules-first task→executor selection: hard eligibility gates first, then a
// transparent weighted score. Pure — no I/O, no Date.now(); the caller passes
// `nowMs`. See .planning/router-arc/SPEC-P1-router-core.md §A1 and RECON §Q2
// (routing brain). The sidecar-owned ExecutorRegistry (A3, later package)
// builds the candidate snapshot this router consumes.

export type TaskCategory = 'coding' | 'writing' | 'research' | 'analysis' | 'ops' | 'general';
export type PrivacyClass = 'normal' | 'private'; // private = must not leave machine-local executors
export type AuthClass = 'none' | 'api-key' | 'subscription-cli' | 'local';
export type RateLimitState = 'unknown' | 'available' | 'observed_exhausted';

export interface ExecutorCandidate {
  id: string; // 'persona:coder' | 'external:codex' ...
  kind: 'persona' | 'external';
  displayName: string;
  taskFit: Partial<Record<TaskCategory, number>>; // 0..1, from EXECUTOR_FIT
  authClass: AuthClass;
  installed: boolean; // personas: always true
  healthy: boolean;
  rateLimit: { state: RateLimitState; resumeAtMs?: number };
  supportsHeadless: boolean; // external only
  egressDestination: string | null; // 'Anthropic' | 'OpenAI' | null (local / persona via vault key)
  cooldownUntilMs?: number;
}

export interface RouteTask {
  category: TaskCategory;
  privacy: PrivacyClass;
  preferredExecutorId?: string;
}

export interface RouteRejection {
  id: string;
  reason: string; // human-readable, stable strings
}

export interface RouteScoreParts {
  taskFit: number;
  preference: number;
  reliability: number;
  quota: number;
  latency: number;
}

export interface RouteScore {
  id: string;
  total: number;
  parts: RouteScoreParts;
}

export interface RouteDecision {
  selected: ExecutorCandidate | null;
  alternatives: ExecutorCandidate[];
  rejected: RouteRejection[];
  scores: RouteScore[];
}

// Scoring weights (SPEC §A1). Parts below are already weighted; `total` is their sum.
const WEIGHT_TASK_FIT = 0.5;
const WEIGHT_PREFERENCE = 0.2;
const WEIGHT_RELIABILITY = 0.15;
const WEIGHT_QUOTA = 0.1;
const WEIGHT_LATENCY = 0.05;

const MAX_ALTERNATIVES = 3;
const TOTAL_EPSILON = 1e-9; // guards float noise in tie detection

/**
 * Evaluate a candidate against the hard eligibility gates, in fixed order.
 * Returns a stable rejection reason string, or null if the candidate is eligible.
 */
function gateReason(candidate: ExecutorCandidate, task: RouteTask, nowMs: number): string | null {
  if (!candidate.installed) {
    return 'not installed';
  }
  if (!candidate.healthy) {
    return 'unhealthy';
  }
  if (candidate.kind === 'external' && !candidate.supportsHeadless) {
    return 'does not support headless execution';
  }
  if (task.privacy === 'private' && candidate.egressDestination !== null) {
    return `blocked by private-task policy (egress to ${candidate.egressDestination})`;
  }
  if (candidate.rateLimit.state === 'observed_exhausted') {
    return typeof candidate.rateLimit.resumeAtMs === 'number'
      ? `rate limit exhausted (resumes at ${candidate.rateLimit.resumeAtMs})`
      : 'rate limit exhausted';
  }
  if (typeof candidate.cooldownUntilMs === 'number' && candidate.cooldownUntilMs > nowMs) {
    return `in cooldown until ${candidate.cooldownUntilMs}`;
  }
  return null;
}

/** Weighted score parts for an eligible candidate. */
function scoreParts(candidate: ExecutorCandidate, task: RouteTask): RouteScoreParts {
  const fit = candidate.taskFit[task.category] ?? 0;
  const preferred = task.preferredExecutorId === candidate.id;
  const quota = candidate.rateLimit.state === 'available' ? 1 : 0.6; // unknown = 0.6

  return {
    taskFit: WEIGHT_TASK_FIT * fit,
    preference: WEIGHT_PREFERENCE * (preferred ? 1 : 0.5),
    reliability: WEIGHT_RELIABILITY * 1, // eligible ⇒ healthy; reserved for verified reliability
    quota: WEIGHT_QUOTA * quota,
    latency: WEIGHT_LATENCY * (candidate.kind === 'persona' ? 1 : 0.7),
  };
}

function sumParts(parts: RouteScoreParts): number {
  return parts.taskFit + parts.preference + parts.reliability + parts.quota + parts.latency;
}

/**
 * Deterministic ordering: score descending, then persona over external,
 * then id ascending. Stable regardless of input candidate order.
 */
function compareScored(
  a: { score: RouteScore; candidate: ExecutorCandidate },
  b: { score: RouteScore; candidate: ExecutorCandidate },
): number {
  const totalDiff = b.score.total - a.score.total;
  if (Math.abs(totalDiff) > TOTAL_EPSILON) {
    return totalDiff;
  }
  const aKind = a.candidate.kind === 'persona' ? 0 : 1;
  const bKind = b.candidate.kind === 'persona' ? 0 : 1;
  if (aKind !== bKind) {
    return aKind - bKind;
  }
  if (a.candidate.id < b.candidate.id) return -1;
  if (a.candidate.id > b.candidate.id) return 1;
  return 0;
}

/**
 * Pure task router. Applies hard gates, scores survivors, and returns a
 * deterministic decision: selected executor, ranked alternatives, rejection
 * reasons, and the full score breakdown for survivors.
 */
export function routeTask(
  task: RouteTask,
  candidates: readonly ExecutorCandidate[],
  nowMs: number,
): RouteDecision {
  const rejected: RouteRejection[] = [];
  const scored: Array<{ score: RouteScore; candidate: ExecutorCandidate }> = [];

  for (const candidate of candidates) {
    const reason = gateReason(candidate, task, nowMs);
    if (reason !== null) {
      rejected.push({ id: candidate.id, reason });
      continue;
    }
    const parts = scoreParts(candidate, task);
    scored.push({ score: { id: candidate.id, total: sumParts(parts), parts }, candidate });
  }

  scored.sort(compareScored);

  const selected = scored.length > 0 ? scored[0].candidate : null;
  const alternatives = scored.slice(1, 1 + MAX_ALTERNATIVES).map((s) => s.candidate);
  const scores = scored.map((s) => s.score);

  return { selected, alternatives, rejected, scores };
}
