/**
 * Retail task-pool builder — map τ²-bench retail `tasks.json` into the continual
 * `ContinualTask` shape so `buildPhaseSplit` can carve a deterministic, SHA'd
 * Phase-B held-out set for the conforming-claim pilot.
 *
 * PILOT SCOPE (not the full study): `difficulty` is uniform (the pilot runs the
 * SAME Phase-B tasks across every arm, so difficulty is held constant by
 * PAIRING — stratified-by-difficulty splitting only matters for the full
 * study's "A and B difficulty-matched" claim, 03 B6). `structure_tag` is 'NONE'
 * and the C5/C7 controls are off for the pilot — formal structure tagging +
 * overlap audit are deferred to the pre-registered full study. The values still
 * satisfy `validateContinualTask`, so the same downstream split/audit apparatus
 * runs unchanged when those inputs are upgraded.
 */

import { readFileSync } from 'node:fs';
import { validateTaskPool, type ContinualTask } from './task-pool.js';

/** The subset of a τ² retail task object this builder reads. */
interface Tau2Action {
  name?: string;
  arguments?: Record<string, unknown>;
}
interface Tau2RetailTask {
  id: string | number;
  user_scenario?: { instructions?: { reason_for_call?: string; known_info?: string } };
  evaluation_criteria?: { actions?: Tau2Action[] };
}

/** Action-name substrings that indicate a state-changing (write) tool — the
 *  task's procedure family is the first such write, else it is read-only. */
const WRITE_HINTS: readonly string[] = [
  'cancel', 'modify', 'return', 'exchange', 'update', 'apply', 'place', 'add', 'remove',
];

/** Derive a COARSE procedure-family cluster id from a task's gold action
 *  sequence: the alphabetically-first write-hint matched by any action
 *  (e.g. `exchange_delivered_order_items` → 'exchange'), else 'read_only' /
 *  'no_action'. Coarse hints group tasks into readable families (exchange,
 *  cancel, return, modify) for clustering/stratification. */
export function primaryFamily(actions: readonly Tau2Action[]): string {
  const names = actions.map(a => (a.name ?? '').trim().toLowerCase()).filter(n => n.length > 0);
  if (names.length === 0) return 'no_action';
  const hits = new Set<string>();
  for (const n of names) {
    for (const h of WRITE_HINTS) if (n.includes(h)) hits.add(h);
  }
  return hits.size > 0 ? [...hits].sort()[0] : 'read_only';
}

/** Parse the recurring-user persona name from a task's `known_info`
 *  ("You are <Name> in zip code …"); null when no persona is stated (non-M4). */
export function extractRecurringUser(knownInfo: string | undefined): string | null {
  if (!knownInfo) return null;
  const m = knownInfo.match(/You are (.+?) in /i);
  return m ? m[1].trim() : null;
}

/** Serialize the τ² gold action sequence into a deterministic string used by
 *  the firewall (no gold substring may appear in any minded artifact) + the
 *  overlap audit. Never shown to the agent. */
export function synthesizeGold(actions: readonly Tau2Action[]): string {
  if (actions.length === 0) return 'no_action';
  return actions
    .map(a => `${a.name ?? '?'}(${a.arguments ? JSON.stringify(a.arguments) : '{}'})`)
    .join(' ; ');
}

export interface RetailPoolOptions {
  /** Path to τ² retail tasks.json (the vendored upstream fixture). */
  tasksJsonPath: string;
  /** Uniform difficulty proxy for the pilot (pairing controls difficulty).
   *  Default 0.5. Replace with measured per-task pass-rates for the full study. */
  difficulty?: number;
}

/** Build + validate the retail ContinualTask pool from τ² tasks.json. */
export function buildRetailTaskPool(opts: RetailPoolOptions): ContinualTask[] {
  const raw = JSON.parse(readFileSync(opts.tasksJsonPath, 'utf-8')) as unknown;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('retail tasks.json must be a non-empty array');
  }
  const difficulty = opts.difficulty ?? 0.5;
  const pool: ContinualTask[] = (raw as Tau2RetailTask[]).map(t => {
    const actions = t.evaluation_criteria?.actions ?? [];
    const instr = t.user_scenario?.instructions;
    return {
      task_id: String(t.id),
      goal: (instr?.reason_for_call ?? '').trim(),
      gold: synthesizeGold(actions),
      difficulty,
      procedure_family: primaryFamily(actions),
      recurring_user: extractRecurringUser(instr?.known_info),
      structure_tag: 'NONE',
      is_near_dup: false,
      is_negative_control: false,
    };
  });
  return validateTaskPool(pool);
}
