/**
 * Loop executor — the report-only (L1) tick for `job_type:'loop'` automations.
 *
 * A "Loop" is a stateful, memory-powered scheduled automation for knowledge
 * work. Each tick composes pieces Waggle already ships:
 *
 *   recall (HybridSearch)  → what does this workspace's memory say about the goal?
 *   prior state (Awareness)→ what did the PREVIOUS tick report? (cross-tick spine)
 *   maker (toolless chat)  → produce a report grounded in the above
 *   checker (LLMJudge)     → verify the report against a rubric (the gate)
 *   write-back (FrameStore + Awareness) → persist into the local mind
 *
 * L1 / report-only guarantee: the maker is a plain text completion with NO
 * tools wired, so a tick cannot send an email, write a file, or touch any
 * external system — the only side effect is writing to the workspace's own
 * `.mind` (local, sovereign). This is what makes Loop v0 safe by construction;
 * the headless ConfirmationGate deny-default (confirmation.ts) is the second
 * line of defence for the day tools are added.
 *
 * Everything here is reused infrastructure — no new abstractions. The executor
 * is extracted from index.ts only so it can be unit-tested with an in-memory
 * MindDB + a stubbed chat function.
 */

import {
  AwarenessLayer,
  FrameStore,
  SessionStore,
  HybridSearch,
  type MindDB,
  type Embedder,
} from '@waggle/core';
import { LLMJudge, scanForInjection } from '@waggle/agent';

/** Minimal slice of a CronSchedule the loop executor needs (decoupled for tests). */
export interface LoopSchedule {
  id: number;
  name: string;
  job_config: string;
  last_run_at: string | null;
}

/** A single LLM completion. maxTokens lets the checker run cheaper than the maker. */
export type LoopChat = (prompt: string, maxTokens?: number) => Promise<string>;

export interface LoopLogger {
  info: (msg: string) => void;
  warn: (msg: string) => void;
}

export interface LoopTickDeps {
  schedule: LoopSchedule;
  /** The already-resolved workspace (or personal) mind for this loop. */
  mindDb: MindDB;
  /** Embedder for recall-by-meaning. */
  embedder: Embedder;
  /** Toolless completion against the local proxy/LiteLLM. */
  chat: LoopChat;
  log: LoopLogger;
}

export interface LoopTickResult {
  /** true when the tick did no work (no prompt, throttled, empty output). */
  skipped?: boolean;
  reason?: string;
  /** ≤200-char notification body. */
  summary: string;
  /** Judge overall score 0..1 (undefined when the checker failed). */
  score?: number;
  /** Whether a memory frame was written this tick. */
  wrote?: boolean;
}

/**
 * Cost floor: a loop is 1–2 LLM round-trips, so an unguarded `* * * * *` cron
 * would burn tokens every 60s. Skip a tick that fires within this window of the
 * previous run. Mirrors connector_fetch's frequency-floor philosophy (a tighter
 * cron is treated as "as often as the floor allows", never an error). Override
 * per-loop via job_config.minIntervalMs.
 */
export const LOOP_MIN_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

interface LoopSpec {
  prompt: string;
  query: string;
  rubric?: string;
  writeToMemory: boolean;
  minIntervalMs: number;
}

/** Parse + validate the loop's job_config blob into a LoopSpec. */
export function parseLoopSpec(jobConfig: string): LoopSpec | null {
  let cfg: Record<string, unknown>;
  try {
    cfg = JSON.parse(jobConfig || '{}') as Record<string, unknown>;
  } catch {
    return null;
  }
  const prompt = typeof cfg.prompt === 'string' ? cfg.prompt.trim() : '';
  if (!prompt) return null;
  const queryRaw = typeof cfg.query === 'string' ? cfg.query.trim() : '';
  const minRaw = typeof cfg.minIntervalMs === 'number' && Number.isFinite(cfg.minIntervalMs)
    ? cfg.minIntervalMs
    : LOOP_MIN_INTERVAL_MS;
  return {
    prompt,
    query: queryRaw || prompt,
    rubric: typeof cfg.rubric === 'string' && cfg.rubric.trim() ? cfg.rubric : undefined,
    writeToMemory: cfg.writeToMemory !== false,
    minIntervalMs: Math.max(0, minRaw),
  };
}

/** Build the maker prompt: grounds the report in prior-tick state + recalled memory. */
export function buildMakerPrompt(opts: {
  name: string;
  prompt: string;
  priorResult: string;
  recalled: string;
}): string {
  const parts = [
    `You are running a scheduled knowledge-work automation called "${opts.name}".`,
  ];
  if (opts.priorResult) {
    parts.push(`What you reported on the previous run:\n${opts.priorResult}`);
  }
  if (opts.recalled) {
    parts.push(`Relevant context recalled from this workspace's memory:\n${opts.recalled}`);
  }
  parts.push(`Your task:\n${opts.prompt}`);
  parts.push(
    'Produce a concise, factual report. Emphasise what is NEW or changed since the previous ' +
      'run. Do not invent facts — ground every claim in the recalled context, or say plainly ' +
      'what you could not determine. This is a report only; do not take any action.',
  );
  return parts.join('\n\n');
}

/**
 * Run one Loop tick. Pure-ish: all I/O goes through `deps` (mindDb, embedder,
 * chat). Throws are intentionally NOT swallowed for the maker/judge LLM path so
 * the scheduler records the failure in cron_execution_history and auto-disables
 * after repeated failures (feeds the engine-liveness/health story); recall and
 * memory-write failures ARE caught (best-effort, must not fail the whole tick).
 */
export async function runLoopTick(deps: LoopTickDeps): Promise<LoopTickResult> {
  const { schedule, mindDb, embedder, chat, log } = deps;

  const spec = parseLoopSpec(schedule.job_config);
  if (!spec) {
    log.warn(`[loop] "${schedule.name}" has no usable prompt in job_config — skipping`);
    return { skipped: true, reason: 'no prompt', summary: '' };
  }

  const stateKey = `loop:${schedule.id}`; // namespaced so loops don't collide on awareness.status
  const awareness = new AwarenessLayer(mindDb);
  const prior = awareness.getByStatus(stateKey)[0];
  const priorMeta = prior ? awareness.parseMetadata(prior) : undefined;
  let priorResult = priorMeta ? String(priorMeta.result ?? '') : '';

  // Cost floor — throttle a loop that ran within its min interval. Measured
  // against the awareness `lastTickAt` (ISO-8601 + timezone, written ONLY after
  // a genuine run), NOT schedule.last_run_at: the scheduler rewrites that via
  // markRun even on a SKIP (which would reset the window every tick), and it is
  // SQLite's `datetime('now')` space format that V8 parses as LOCAL time
  // (timezone-dependent breakage). lastTickAt is the correct, TZ-safe signal.
  const lastTick = priorMeta?.lastTickAt ? Date.parse(String(priorMeta.lastTickAt)) : NaN;
  if (Number.isFinite(lastTick)) {
    const elapsed = Date.now() - lastTick;
    if (elapsed >= 0 && elapsed < spec.minIntervalMs) {
      return { skipped: true, reason: 'within min interval', summary: '' };
    }
  }

  // Recall prior context by meaning (best-effort — a recall failure must not kill the tick).
  let recalled = '';
  try {
    const hits = await new HybridSearch(mindDb, embedder).search(spec.query, { limit: 8 });
    recalled = hits.map(h => h.frame.content).join('\n---\n');
  } catch (err) {
    log.warn(`[loop] "${schedule.name}" recall failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Defense-in-depth: recalled memory and the prior tick's output are untrusted
  // input to the maker prompt — drop any context that trips the injection
  // scanner (the same guard connector-harvest applies before a memory write).
  // Matters more once loops gain tools, but cheap and consistent to enforce at L1.
  if (recalled && !scanForInjection(recalled, 'tool_output').safe) {
    log.warn(`[loop] "${schedule.name}" recalled memory tripped injection scan — dropping context`);
    recalled = '';
  }
  if (priorResult && !scanForInjection(priorResult, 'tool_output').safe) {
    log.warn(`[loop] "${schedule.name}" prior-tick state tripped injection scan — dropping context`);
    priorResult = '';
  }

  // Maker — toolless report generation.
  const report = (await chat(buildMakerPrompt({
    name: schedule.name,
    prompt: spec.prompt,
    priorResult,
    recalled,
  }), 2048)).trim();
  if (!report) {
    return { skipped: true, reason: 'empty report', summary: '' };
  }

  // Checker — LLMJudge verifies the report (the verification gate). Best-effort:
  // the judge never throws (returns an errorScore on failure), but the LLM call
  // it makes could, so guard it — a low/absent score still reports at L1.
  let score: number | undefined;
  try {
    const judge = new LLMJudge((p) => chat(p, 512), spec.rubric ? { rubricOverride: spec.rubric } : {});
    const judged = await judge.score({
      input: spec.query,
      expected: 'A correct, complete, well-grounded report.',
      actual: report,
      context: priorResult ? `Prior tick result:\n${priorResult}` : undefined,
    });
    if (judged.parsed) score = judged.overall;
  } catch (err) {
    log.warn(`[loop] "${schedule.name}" checker failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Write the report into the local mind (the durable spine). Best-effort.
  let wrote = false;
  if (spec.writeToMemory) {
    try {
      // FK: memory_frames.gop_id references sessions — ensure the 'loop' session
      // exists before createIFrame (mirrors connector_fetch's 'harvest' ensure).
      new SessionStore(mindDb).ensure('loop', 'loop', 'Loop automation outputs');
      const header = `[Loop: ${schedule.name}] ${new Date().toISOString()}${score !== undefined ? ` · score ${score.toFixed(2)}` : ''}`;
      // ISO timestamp in the body keeps each tick's frame distinct (defeats the
      // content-hash dedup that would otherwise collapse identical reports).
      new FrameStore(mindDb).createIFrame('loop', `${header}\n\n${report}`, 'normal', 'agent_inferred');
      wrote = true;
    } catch (err) {
      log.warn(`[loop] "${schedule.name}" memory write failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Update cross-tick state so the NEXT tick sees what this one reported.
  const meta = {
    status: stateKey,
    result: report,
    lastTickAt: new Date().toISOString(),
    ...(score !== undefined ? { score: String(score) } : {}),
  };
  try {
    if (prior) awareness.updateMetadata(prior.id, meta);
    else awareness.add('pending', `Loop: ${schedule.name}`, 0, undefined, meta);
  } catch (err) {
    log.warn(`[loop] "${schedule.name}" state update failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  const summary = report.length > 200 ? `${report.slice(0, 197)}...` : report;
  return { summary, score, wrote };
}
