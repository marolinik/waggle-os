// E4 aggregation — per-ability + overall for each config, on the matched-50 ids.
import fs from 'node:fs';
import path from 'node:path';
const R = path.resolve('benchmarks/results/beam');
const ids = new Set(fs.readFileSync('benchmarks/harness/scripts/matched50.txt', 'utf8').split('\n').map(s => s.trim()).filter(Boolean));
const ABIL = ['abstention','contradiction_resolution','event_ordering','information_extraction','instruction_following','knowledge_update','multi_session_reasoning','preference_following','summarization','temporal_reasoning'];

function load(p, filterIds = true) {
  if (!fs.existsSync(p)) return null;
  const rows = fs.readFileSync(p, 'utf8').split('\n').filter(l => l.trim()).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  // dedupe by instance_id, keep LAST
  const m = new Map();
  for (const r of rows) if (!filterIds || ids.has(r.instance_id)) m.set(r.instance_id, r);
  return [...m.values()];
}
function agg(rows) {
  if (!rows) return null;
  const by = {}; let all = [];
  for (const r of rows) { (by[r.memory_ability] = by[r.memory_ability] || []).push(r.score); all.push(r.score); }
  const out = { _overall: +(all.reduce((a,b)=>a+b,0)/(all.length||1)).toFixed(4), _n: all.length };
  for (const a of ABIL) { const s = by[a]; out[a] = s ? +(s.reduce((x,y)=>x+y,0)/s.length).toFixed(3) : null; }
  return out;
}

const configs = {
  baseline: load(path.join(R, 'beam-1m-FULL700-gpt5-retv2.jsonl')),
  'retonly(gpt5,noBel)': load(path.join(R, 'beam-1m-e4-retonly-gpt-5.jsonl')),
  'combo(gpt5,+Bel)': load(path.join(R, 'beam-1m-e4-combo-gpt5-gpt-5.jsonl')),
  'combo(Sonnet,+Bel)': load(path.join(R, 'beam-1m-e4-combo-sonnet-anthropic-claude-sonnet-4.6.jsonl')),
  'abl(gpt5,V+T only)': load(path.join(R, 'beam-1m-e4-abl-noent-gpt-5.jsonl')),
};
const A = {};
for (const [k, v] of Object.entries(configs)) A[k] = agg(v);

// Print table
const cols = Object.keys(A).filter(k => A[k]);
const base = A.baseline;
console.log('\n=== E4 matched-50 per-ability avg_score ===');
const pad = (s, n) => String(s).padEnd(n);
console.log(pad('ability', 26) + cols.map(c => pad(c, 20)).join(''));
for (const a of ABIL) {
  let line = pad(a, 26);
  for (const c of cols) {
    const v = A[c] ? A[c][a] : null;
    const d = (c !== 'baseline' && v != null && base[a] != null) ? ` (${v - base[a] >= 0 ? '+' : ''}${(v - base[a]).toFixed(2)})` : '';
    line += pad(v == null ? '-' : v.toFixed(3) + d, 20);
  }
  console.log(line);
}
let line = pad('OVERALL', 26);
for (const c of cols) {
  const v = A[c] ? A[c]._overall : null;
  const d = (c !== 'baseline' && v != null) ? ` (${v - base._overall >= 0 ? '+' : ''}${((v - base._overall)*100).toFixed(1)}pp)` : '';
  line += pad(v == null ? '-' : v.toFixed(4) + d, 20);
}
console.log(line);
line = pad('n', 26);
for (const c of cols) line += pad(A[c] ? A[c]._n : '-', 20);
console.log(line);

// Target-ability gate check for combo(Sonnet)
const targets = ['temporal_reasoning','event_ordering','multi_session_reasoning','summarization'];
for (const cfg of ['combo(Sonnet,+Bel)','combo(gpt5,+Bel)','retonly(gpt5,noBel)']) {
  if (!A[cfg]) continue;
  console.log(`\n-- gate check: ${cfg} vs baseline --`);
  console.log(`  overall delta: ${((A[cfg]._overall - base._overall)*100).toFixed(1)}pp (need >=+4pp)`);
  const regress = targets.filter(t => A[cfg][t] != null && base[t] != null && A[cfg][t] < base[t] - 1e-9);
  console.log(`  target-ability regressions: ${regress.length ? regress.map(t=>`${t}(${(A[cfg][t]-base[t]).toFixed(2)})`).join(', ') : 'NONE'}`);
}
