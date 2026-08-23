import fs from 'node:fs';
import { createBeamOpenAiClient, OPENAI_PRICING, loadDotEnv } from '../src/beam-openai-client.js';
import { judgeQuestion } from '../src/beam-nugget-judge.js';

async function main() {
  loadDotEnv();
  const judge = createBeamOpenAiClient({ model: 'gpt-5', pricing: OPENAI_PRICING['gpt-5'], timeoutMs: 300_000, maxRetries: 2 });
  const p = 'D:/Projects/waggle-os/benchmarks/results/beam/beam-1m-e6-ledger-iter2-anthropic-claude-sonnet-4.6.jsonl';
  const rows = fs.readFileSync(p, 'utf-8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
  for (const r of rows) {
    const rubric = (r.nugget_scores || []).map((n: any) => n.nugget);
    const { judgement } = await judgeQuestion(judge, { question: r.question, rubric, memoryAbility: r.memory_ability, answer: r.answer }, { computeTau: false });
    const anyParseErr = judgement.nuggetScores.some(n => n.reason.startsWith('Parse error'));
    console.log(`${r.instance_id}  old=${r.score}  NEW=${judgement.score.toFixed(3)}  parseErr=${anyParseErr}  nug=[${judgement.nuggetScores.map(n=>n.score).join(',')}]`);
  }
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
