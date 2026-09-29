// Repro: (a) GEPA baseline is scored only on the micro-screen sample while the
// winner is scored on the anchor sample -> evolution-orchestrator.ts:187-189
// subtracts means over different samples; (b) EvolutionOrchestrator mines
// traces via EvalDatasetBuilder.sourceFromTraces() and bypasses build(), so a
// trace containing a secret reaches the judge/executor unredacted; (c) the
// frozen schema from Stage 1 is not passed into Stage 2 execution.
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DIST = 'D:/Projects/waggle-os/packages/agent/dist';
const load = (f) => import(pathToFileURL(path.join(DIST, f)).href);
const { IterativeGEPA } = await load('iterative-optimizer.js');
const { EvolutionOrchestrator } = await load('evolution-orchestrator.js');
const { detectSecrets } = await load('eval-dataset.js');
const { RUNNING_JUDGE_BRAND } = await load('evolution-llm-wiring.js');

// ── (a) mismatched-sample delta ─────────────────────────────────────────
const examples = Array.from({ length: 400 }, (_, i) => ({
  input: `question ${i}`, expected_output: `answer ${i}`, metadata: { source: 'trace' },
}));
const BASE = 'BASELINE PROMPT';
const mk = (o) => ({ overall: o, weighted: o, correctness: o, procedureFollowing: o, conciseness: o, lengthPenalty: 1, feedback: 'fb', parsed: true });
const judge = {
  [RUNNING_JUDGE_BRAND]: true,
  async score({ input, actual }) {
    const i = Number(input.split(' ')[1]);
    if (actual === BASE) return mk(i % 2 === 0 ? 0.5 : 0.9); // true mean over all 400 = 0.70
    return mk(0.95); // child dominates on every dimension
  },
};
const gepa = await new IterativeGEPA().run({
  baseline: BASE, examples, judge, mutate: async () => 'CHILD PROMPT',
  populationSize: 1, generations: 1, microScreenSize: 50, miniEvalSize: 64, anchorEvalSize: 400, seed: 1,
});
const b = gepa.history[0].score, w = gepa.winner.score;
console.log('(a) baseline history[0].score.n =', b.n, ' winner.score.n =', w.n);
console.log('(a) baseline overall (micro sample) =', b.overall.toFixed(4), ' true mean over 400 = 0.7000');
console.log('(a) GEPARunResult.delta =', gepa.delta.toFixed(4), ' delta if baseline were scored on the same 400 =', (w.overall - 0.7).toFixed(4));

// ── (b) secret reaches judge/executor; (c) schema not passed to Stage 2 ──
const SECRET = 'sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const trace = {
  id: 1, outcome: 'success', persona_id: 'coder', task_shape: null, model: 'm',
  payload: { input: `deploy with key ${SECRET} please`, output: 'done', tags: [] },
};
const seenByJudge = [];
const seenBySchemaExecute = [];
const traceStore = { queryParsed: () => [trace], query: () => [trace], count: () => 1 };
const runs = [];
const runStore = {
  create: (i) => { const r = { run_uuid: 'u1', status: 'proposed', ...i }; runs.push(r); return r; },
  reject: (u, reason) => ({ run_uuid: u, status: 'rejected', failure_reason: reason }),
  accept: () => undefined, markDeployed: () => undefined, markFailed: () => undefined,
  list: () => runs, getByUuid: () => runs[0],
};
const recordingJudge = {
  [RUNNING_JUDGE_BRAND]: true,
  async score(args) { seenByJudge.push(args.input); return mk(0.9); },
};
const schemaBaseline = { name: 's', version: 1, fields: [{ name: 'answer', type: 'string', description: 'd', required: true, constraints: [] }] };
const orch = new EvolutionOrchestrator({ traceStore, runStore });
const res = await orch.runOnce({
  targetKind: 'persona-system-prompt', targetName: 'coder', baseline: 'BASE', schemaBaseline,
  compose: {
    schema: { execute: async ({ schema, input }) => { seenBySchemaExecute.push(input); return { actual: '{"answer":"x"}', parsed: true }; }, judge: recordingJudge, examples: [], populationSize: 1, generations: 1 },
    instructions: { judge: recordingJudge, mutate: async () => 'CHILD', examples: [], populationSize: 1, generations: 1 },
  },
});
console.log('(b) detectSecrets(trace.input) =', detectSecrets(trace.payload.input), ' (build() would reject it)');
console.log('(b) secret reached judge?', seenByJudge.some(s => s.includes(SECRET)), ' reached schema executor?', seenBySchemaExecute.some(s => s.includes(SECRET)));
console.log('(c) outcome =', res.outcome, ' winnerSchema persisted?', Boolean(res.run?.winnerSchema), ' frozenSchema field count =', res.compose?.frozenSchema.fields.length);
