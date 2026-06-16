/**
 * Continual-memory protocol harness — public barrel.
 * (02-CONTINUAL-MEMORY-PROTOCOL.md; 03-REDTEAM-RESOLUTIONS.md.)
 */
export {
  validateContinualTask,
  validateTaskPool,
  type ContinualTask,
  type StructureTag,
} from './task-pool.js';

export {
  buildPhaseSplit,
  type PhaseSplitInput,
  type PhaseSplitResult,
  type DifficultyDistribution,
} from './split-builder.js';

export {
  hashMindBytes,
  resolveHashMind,
  type HashMindFn,
} from './mind-hash.js';

export {
  buildAndFreezeMind,
  type PhaseAArtifact,
  type BuildMindInput,
  type BuildMindResult,
} from './mind-build.js';

export {
  runArmTask,
  type ArmTask,
  type ArmTaskInput,
  type ArmTaskResult,
  type ArmTrial,
  type AnswerFn,
  type AnswerResult,
  type ScorerFn,
} from './arm-runner.js';

export {
  maxNgramOverlap,
  auditGoalStructureOverlap,
  runReDerivabilityGate,
  type OverlapTask,
  type OverlapAuditInput,
  type OverlapAuditResult,
  type OverlapPerTask,
  type CosineFn,
  type ReDerivabilityInput,
  type ReDerivabilityResult,
  type OffSolveFn,
} from './overlap-audit.js';
