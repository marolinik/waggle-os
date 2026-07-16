import fs from 'node:fs';
import { BeamOpenAiClient, OPENAI_PRICING, loadDotEnv } from '../src/beam-openai-client.js';
import { judgeQuestion } from '../src/beam-nugget-judge.js';

const CHANGED = ['contradiction_resolution','event_ordering','instruction_following','knowledge_update','preference_following','temporal_reasoning'];
const load = f => fs.readFileSync('D:/Projects/waggle-os/benchmarks/results/beam/'+f,'utf-8').split('\n').filter(l=>l.trim()).map(l=>JSON.parse(l));

async function judgeSet(judge, rows) {
  const out = new Map();
  for (const r of rows) {
    const rubric = (r.nugget_scores||[]).map(n=>n.nugget);
    const { judgement } = await judgeQuestion(judge, { question:r.question, rubric, memoryAbility:r.memory_ability, answer:r.answer }, { computeTau:false });
    const pe = judgement.nuggetScores.some(n=>n.reason.startsWith('Parse error'));
    out.set(r.instance_id, { score: judgement.score, pe });
  }
  return out;
}

async function main() {
  loadDotEnv();
  const key = process.env.OPENROUTER_API_KEY;
  const judge = new BeamOpenAiClient({ model:'openai/gpt-5', apiKey:key, baseUrl:'https://openrouter.ai/api/v1', pricing:OPENAI_PRICING['gpt-5'], timeoutMs:120_000, maxRetries:3 });
  const iter1 = load('beam-1m-e6-ledger-pilot-anthropic-claude-sonnet-4.6.jsonl').filter(r=>r.instance_id.startsWith('beam_1M_1_') && CHANGED.includes(r.memory_ability));
  const iter2 = load('beam-1m-e6-ledger-iter2-anthropic-claude-sonnet-4.6.jsonl').filter(r=>r.instance_id.startsWith('beam_1M_1_') && CHANGED.includes(r.memory_ability));
  console.log('re-judging iter1 conv1 (n='+iter1.length+') on OR-gpt5...');
  const j1 = await judgeSet(judge, iter1);
  console.log('re-judging iter2 conv1 (n='+iter2.length+') on OR-gpt5...');
  const j2 = await judgeSet(judge, iter2);
  const byAb = {};
  for (const r of iter2) {
    const a = r.memory_ability; (byAb[a] ??= {i1:[],i2:[]});
    byAb[a].i2.push(j2.get(r.instance_id).score);
    byAb[a].i1.push(j1.get(r.instance_id)?.score ?? null);
  }
  console.log('\nability                    iter1-OR  iter2-OR   Δ   (per-q iter1->iter2)');
  const anyPe = [...j1.values(),...j2.values()].some(v=>v.pe);
  for (const a of Object.keys(byAb).sort()) {
    const s1=byAb[a].i1, s2=byAb[a].i2;
    const m1=s1.reduce((x,y)=>x+y,0)/s1.length, m2=s2.reduce((x,y)=>x+y,0)/s2.length;
    console.log(`${a.padEnd(26)} ${m1.toFixed(3)}     ${m2.toFixed(3)}   ${(m2-m1>=0?'+':'')}${(m2-m1).toFixed(3)}   [${s1.map(x=>x.toFixed(2)).join(',')}] -> [${s2.map(x=>x.toFixed(2)).join(',')}]`);
  }
  console.log('\nparseErrors present:', anyPe);
}
main().catch(e=>{console.error('FATAL',e);process.exit(1);});
