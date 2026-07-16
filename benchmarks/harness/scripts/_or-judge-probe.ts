import fs from 'node:fs';
import { BeamOpenAiClient, OPENAI_PRICING, loadDotEnv } from '../src/beam-openai-client.js';
import { judgeQuestion } from '../src/beam-nugget-judge.js';

async function main() {
  loadDotEnv();
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('no OPENROUTER_API_KEY');
  // Route gpt-5 judge via OpenRouter (funded). Same model, same pricing.
  const judge = new BeamOpenAiClient({
    model: 'openai/gpt-5', apiKey: key, baseUrl: 'https://openrouter.ai/api/v1',
    pricing: OPENAI_PRICING['gpt-5'], timeoutMs: 120_000, maxRetries: 2,
  });
  const p2 = 'D:/Projects/waggle-os/benchmarks/results/beam/beam-1m-e6-ledger-iter2-anthropic-claude-sonnet-4.6.jsonl';
  const rows = fs.readFileSync(p2, 'utf-8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
  for (const r of rows.slice(0, 3)) {
    const rubric = (r.nugget_scores || []).map((n: any) => n.nugget);
    const { judgement } = await judgeQuestion(judge, { question: r.question, rubric, memoryAbility: r.memory_ability, answer: r.answer }, { computeTau: false });
    const pe = judgement.nuggetScores.some(n => n.reason.startsWith('Parse error'));
    console.log(`${r.instance_id} old=${r.score} OR-gpt5=${judgement.score.toFixed(3)} parseErr=${pe} nug=[${judgement.nuggetScores.map(n=>n.score).join(',')}]`);
    console.log('   reason[0]:', judgement.nuggetScores[0].reason.slice(0, 120));
  }
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
