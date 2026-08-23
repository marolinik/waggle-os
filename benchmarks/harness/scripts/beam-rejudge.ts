/**
 * Standalone BEAM re-judge: take an existing answers jsonl (produced by
 * beam-run-1m — rows carry `question`, `answer`, `memory_ability`, and
 * `nugget_scores[].nugget` = the gold rubric), and RE-SCORE the SAME answer
 * texts with a chosen judge model. This isolates judge-model effects from
 * answerer effects: the answers never change, only the judge does.
 *
 * Usage:
 *   node --import tsx scripts/beam-rejudge.ts \
 *     --answers results/beam/E2-sonnet-answers.jsonl \
 *     --judge-model gpt-5 \
 *     --out results/beam/E2-sonnet-answers.judged-gpt5.jsonl
 *
 * The judge is the SAME transport-agnostic judgeQuestion used by beam-run-1m,
 * so scoring is byte-identical to the in-run judge — only the LLM differs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createBeamOpenAiClient } from '../src/beam-openai-client.js';
import { judgeQuestion, type BeamLlmResult } from '../src/beam-nugget-judge.js';
import { computeBeamMetrics, formatBeamMetrics, type BeamQuestionResult } from '../src/beam-metrics.js';

interface AnswerRow {
  instance_id: string;
  conv?: number;
  memory_ability: string;
  question: string;
  answer: string;
  nugget_scores: Array<{ nugget: string; score: number; reason: string }>;
}

function parseArgs() {
  const argv = process.argv.slice(2);
  let answers = '';
  let judgeModel = 'gpt-5';
  let out = '';
  let computeTau = false;
  for (let i = 0; i < argv.length; i++) {
    const f = argv[i];
    const next = argv[i + 1];
    if (f === '--answers' && next) { answers = path.resolve(next); i++; }
    else if (f === '--judge-model' && next) { judgeModel = next; i++; }
    else if (f === '--out' && next) { out = path.resolve(next); i++; }
    else if (f === '--tau') { computeTau = true; }
  }
  if (!answers) { console.error('[beam-rejudge] --answers <path> required'); process.exit(2); }
  if (!out) out = answers.replace(/\.jsonl$/, `.judged-${judgeModel.replace(/[^a-z0-9]+/gi, '')}.jsonl`);
  return { answers, judgeModel, out, computeTau };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const judge = createBeamOpenAiClient({ model: args.judgeModel });
  const rows: AnswerRow[] = fs.readFileSync(args.answers, 'utf-8')
    .split('\n').map(l => l.trim()).filter(Boolean)
    .map(l => JSON.parse(l) as AnswerRow);
  console.log(`[beam-rejudge] ${rows.length} answers  judge=${args.judgeModel}  -> ${path.basename(args.out)}`);

  const outStream = fs.createWriteStream(args.out, { flags: 'w' });
  const perQuestion: BeamQuestionResult[] = [];
  let costUsd = 0;
  const acc = (r: BeamLlmResult): void => { costUsd += r.costUsd; };

  for (const row of rows) {
    const rubric = (row.nugget_scores ?? []).map(n => n.nugget);
    const { judgement, llmResults } = await judgeQuestion(
      judge,
      { question: row.question, rubric, memoryAbility: row.memory_ability, answer: row.answer },
      { computeTau: args.computeTau },
    );
    for (const r of llmResults) acc(r);
    perQuestion.push({ instanceId: row.instance_id, memoryAbility: row.memory_ability, score: judgement.score, ...(judgement.error ? { error: judgement.error } : {}) });
    outStream.write(JSON.stringify({
      instance_id: row.instance_id,
      conv: row.conv,
      memory_ability: row.memory_ability,
      question: row.question,
      answer: row.answer,
      score: judgement.score,
      judgment: judgement.judgment,
      nugget_scores: judgement.nuggetScores,
      n_nuggets: rubric.length,
      judge_model: args.judgeModel,
    }) + '\n');
    process.stdout.write(`  ${row.memory_ability.padEnd(24)} score=${judgement.score.toFixed(2)}  $${costUsd.toFixed(3)}\n`);
  }
  outStream.end();

  const metrics = computeBeamMetrics(perQuestion);
  console.log(`\n════════ BEAM re-judge (${args.judgeModel}) ════════`);
  console.log(formatBeamMetrics(metrics));
  console.log(`cost=$${costUsd.toFixed(4)}`);
  const summaryPath = args.out.replace(/\.jsonl$/, '.summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify({ judgeModel: args.judgeModel, answers: path.basename(args.answers), costUsd, metrics }, null, 2));
  console.log(`jsonl:   ${args.out}`);
  console.log(`summary: ${summaryPath}`);
}

main().catch(err => { console.error(err); process.exit(1); });
