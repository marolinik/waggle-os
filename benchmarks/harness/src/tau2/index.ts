/** τ²-bench adapter surface — barrel re-export. */
export {
  TAU2_REPO_URL,
  TAU2_PINNED_COMMIT,
  TAU2_LICENSE_SPDX,
  resolveUpstreamDir,
  readVendoredCommit,
  assertVendoredLicense,
} from './vendor-pin.js';
export {
  buildTau2RunArgv,
  resolveTau2ResultsDir,
  runTau2,
  type Tau2RunSpec,
  type Tau2RunResult,
  type Tau2RunOptions,
} from './tau2-cli.js';
export {
  parseTau2Results,
  computeTaskOutcomes,
  loadTau2ResultsFile,
  REWARD_PASS,
  type Tau2TaskOutcome,
} from './tau2-results.js';
export {
  toTau2JsonlRecords,
  writeTau2Jsonl,
  type Tau2EmitContext,
  type Tau2JsonlRecord,
} from './tau2-emit.js';
export type {
  Tau2Results,
  Tau2SimulationRun,
  Tau2RewardInfo,
  Tau2RewardType,
  Tau2Message,
} from './tau2-types.js';
