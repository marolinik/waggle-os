/**
 * Continual-memory protocol — task pool types + validators.
 *
 * A ContinualTask is one unit of the domain task pool the protocol partitions
 * into a Phase-A experience stream and a frozen Phase-B held-out test
 * (02-CONTINUAL-MEMORY-PROTOCOL.md §3.1). Every field downstream modules need
 * is here so the split builder, overlap audit, and arm runner share ONE shape.
 *
 * Design decisions (no placeholders):
 *  - `difficulty` ∈ [0,1] is the raw-model pass-rate proxy used to stratify
 *    the A/B split so the two phases are difficulty-matched (03 B6). It is an
 *    INPUT to this module (measured upstream by a raw-model pilot, Plan 09),
 *    not computed here.
 *  - `procedure_family` and `recurring_user` are the candidate CLUSTER ids the
 *    stats layer (Plan 04) resamples over (03 B2). `recurring_user` is null on
 *    non-M4 tasks.
 *  - `structure_tag` records which transfer mechanism (M1..M4) a task reuses
 *    (02 §2). Negative-control tasks carry the literal 'NONE' tag.
 *  - `is_near_dup` (C5 positive control) and `is_negative_control` (C7) are
 *    mutually exclusive flags; headline tasks have both false.
 */

/** Transfer-mechanism tag (02 §2). 'NONE' = a negative-control task that
 *  reuses NO Phase-A sub-structure (03 C7 — design predicts no lift). */
export type StructureTag = 'M1' | 'M2' | 'M3' | 'M4' | 'NONE';

const STRUCTURE_TAGS: readonly StructureTag[] = ['M1', 'M2', 'M3', 'M4', 'NONE'];

export interface ContinualTask {
  /** Stable id; unique within the pool. */
  task_id: string;
  /** The task statement shown to the agent (the goal). */
  goal: string;
  /** The gold answer / target end-state used for scoring. NEVER enters a mind. */
  gold: string;
  /** Raw-model pass-rate proxy ∈ [0,1] for difficulty-stratified splitting. */
  difficulty: number;
  /** Procedure-family cluster id (03 B2). */
  procedure_family: string;
  /** Recurring-user cluster id for M4 tasks; null otherwise. */
  recurring_user: string | null;
  /** Which transfer mechanism this task reuses (02 §2). */
  structure_tag: StructureTag;
  /** C5 positive-control flag: a deliberate near-dup of a Phase-A task. */
  is_near_dup: boolean;
  /** C7 negative-control flag: LOW structure-overlap; predicts no lift. */
  is_negative_control: boolean;
}

/** Validate one task; returns a defensive shallow copy (never mutates input). */
export function validateContinualTask(task: ContinualTask): ContinualTask {
  if (typeof task.task_id !== 'string' || task.task_id.trim().length === 0) {
    throw new Error('ContinualTask requires a non-empty task_id');
  }
  if (typeof task.goal !== 'string' || task.goal.trim().length === 0) {
    throw new Error(`ContinualTask ${task.task_id} requires a non-empty goal`);
  }
  if (typeof task.gold !== 'string' || task.gold.trim().length === 0) {
    throw new Error(`ContinualTask ${task.task_id} requires a non-empty gold`);
  }
  if (!Number.isFinite(task.difficulty) || task.difficulty < 0 || task.difficulty > 1) {
    throw new Error(
      `ContinualTask ${task.task_id} requires difficulty ∈ [0,1]; got ${task.difficulty}`,
    );
  }
  if (typeof task.procedure_family !== 'string' || task.procedure_family.trim().length === 0) {
    throw new Error(`ContinualTask ${task.task_id} requires a non-empty procedure_family`);
  }
  if (task.recurring_user !== null && (typeof task.recurring_user !== 'string' || task.recurring_user.trim().length === 0)) {
    throw new Error(`ContinualTask ${task.task_id} recurring_user must be null or a non-empty string`);
  }
  if (!STRUCTURE_TAGS.includes(task.structure_tag)) {
    throw new Error(
      `ContinualTask ${task.task_id} structure_tag must be one of ${STRUCTURE_TAGS.join(', ')}; got ${task.structure_tag}`,
    );
  }
  if (typeof task.is_near_dup !== 'boolean' || typeof task.is_negative_control !== 'boolean') {
    throw new Error(`ContinualTask ${task.task_id} is_near_dup and is_negative_control must be booleans`);
  }
  if (task.is_near_dup && task.is_negative_control) {
    throw new Error(
      `ContinualTask ${task.task_id}: is_near_dup and is_negative_control are mutually exclusive`,
    );
  }
  return {
    task_id: task.task_id,
    goal: task.goal,
    gold: task.gold,
    difficulty: task.difficulty,
    procedure_family: task.procedure_family,
    recurring_user: task.recurring_user,
    structure_tag: task.structure_tag,
    is_near_dup: task.is_near_dup,
    is_negative_control: task.is_negative_control,
  };
}

/** Validate a whole pool: non-empty, every task valid, ids unique. Returns
 *  the validated copies. */
export function validateTaskPool(pool: readonly ContinualTask[]): ContinualTask[] {
  if (!Array.isArray(pool) || pool.length === 0) {
    throw new Error('task pool must be a non-empty array');
  }
  const seen = new Set<string>();
  const out: ContinualTask[] = [];
  for (const t of pool) {
    const v = validateContinualTask(t);
    if (seen.has(v.task_id)) {
      throw new Error(`task pool has a duplicate task_id: ${v.task_id}`);
    }
    seen.add(v.task_id);
    out.push(v);
  }
  return out;
}
