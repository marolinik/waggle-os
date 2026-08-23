import fs from 'node:fs';
import { createBeamOpenAiClient, OPENAI_PRICING, loadDotEnv } from '../src/beam-openai-client.js';
import { judgeQuestion, buildNuggetJudgePrompt, BEAM_JUDGE_SYSTEM_PROMPT } from '../src/beam-nugget-judge.js';

async function main() {
  loadDotEnv();
  const judge = createBeamOpenAiClient({ model: 'gpt-5', pricing: OPENAI_PRICING['gpt-5'], timeoutMs: 300_000, maxRetries: 2 });

  // Test A: trivial gpt-5 JSON call
  console.log('--- TEST A: trivial gpt-5 call ---');
  const a = await judge.chat({ system: BEAM_JUDGE_SYSTEM_PROMPT, user: 'Return JSON: {"score": 1.0, "reason": "test"}', jsonMode: true, maxTokens: 300 });
  console.log('A: failureMode=', a.failureMode, 'textLen=', a.text.length, 'in=', a.inputTokens, 'out=', a.outputTokens, 'text=', JSON.stringify(a.text.slice(0, 120)));

  // Test B: re-judge one ITER1 (known-good) answer
  console.log('\n--- TEST B: re-judge an iter1 answer (was 0.625) ---');
  const p1 = 'D:/Projects/waggle-os/benchmarks/results/beam/beam-1m-e6-ledger-pilot-anthropic-claude-sonnet-4.6.jsonl';
  const r1 = fs.readFileSync(p1, 'utf-8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l)).find(r => r.instance_id === 'beam_1M_1_contradiction_resolution_q0');
  const rubric1 = (r1.nugget_scores || []).map((n: any) => n.nugget);
  const jb = await judgeQuestion(judge, { question: r1.question, rubric: rubric1, memoryAbility: r1.memory_ability, answer: r1.answer }, { computeTau: false });
  console.log('B: NEW score=', jb.judgement.score, 'nug=', jb.judgement.nuggetScores.map(n => `${n.score}(${n.reason.slice(0,30)})`).join(' | '));

  // Test C: single raw nugget judge call on an iter2 answer, dump raw text
  console.log('\n--- TEST C: raw judge call on iter2 answer ---');
  const p2 = 'D:/Projects/waggle-os/benchmarks/results/beam/beam-1m-e6-ledger-iter2-anthropic-claude-sonnet-4.6.jsonl';
  const r2 = fs.readFileSync(p2, 'utf-8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l))[0];
  const nug = r2.nugget_scores[0].nugget;
  const c = await judge.chat({ system: BEAM_JUDGE_SYSTEM_PROMPT, user: buildNuggetJudgePrompt(r2.question, nug, r2.answer), jsonMode: true, maxTokens: 300 });
  console.log('C: failureMode=', c.failureMode, 'textLen=', c.text.length, 'in=', c.inputTokens, 'out=', c.outputTokens, 'text=', JSON.stringify(c.text.slice(0, 200)));
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
