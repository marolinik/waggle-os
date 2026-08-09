import fs from 'node:fs';

/**
 * Compose the E6 matched-50 headline number — general, multi-iteration.
 * Sources in precedence order (later overrides earlier for the CURRENT-CODE
 * config = latest prompt per ability). Also reports a best-per-ability variant
 * (max ability-mean across all iterations — post-hoc dev-set selection).
 *
 *   pilot          — all 10 abilities, OpenAI-direct gpt-5.
 *   iter2-REJUDGED — 6 changed abilities, OpenRouter gpt-5.
 *   iter3          — preference, temporal (OpenRouter gpt-5 inline).
 *   iter4          — temporal, knowledge_update, preference, event_ordering.
 */

const RESULTS = 'D:/Projects/waggle-os/benchmarks/results/beam/';
const OUT = 'beam-1m-e6-ledger-composed-matched50.json';
const REJUDGE_JSON = 'beam-1m-e6-ledger-rejudge-OR.json';

// precedence low -> high
const SOURCES = [
  { name: 'pilot', file: 'beam-1m-e6-ledger-pilot-anthropic-claude-sonnet-4.6.jsonl' },
  { name: 'iter2-OR', file: 'beam-1m-e6-ledger-iter2-REJUDGED.jsonl' },
  { name: 'iter3', file: 'beam-1m-e6-ledger-iter3-anthropic-claude-sonnet-4.6.jsonl' },
  { name: 'iter4', file: 'beam-1m-e6-ledger-iter4-anthropic-claude-sonnet-4.6.jsonl' },
  { name: 'iter5', file: 'beam-1m-e6-ledger-iter5-anthropic-claude-sonnet-4.6.jsonl' },
  { name: 'iter6', file: 'beam-1m-e6-ledger-iter6-anthropic-claude-sonnet-4.6.jsonl' },
];
const ALL = ['abstention', 'contradiction_resolution', 'event_ordering', 'information_extraction', 'instruction_following', 'knowledge_update', 'multi_session_reasoning', 'preference_following', 'summarization', 'temporal_reasoning'];

const REFS: [string, number][] = [
  ['baseline (no read-time stack)', 0.5533],
  ['best read-time stack', 0.6198],
  ['pilot (iter1, all-direct judge)', 0.6825],
  ['iter2-composed', 0.7073],
  ['iter3-composed', 0.7323],
  ['Eywa on same-50 (MATCH target)', 0.7704],
  ['clear-SOTA target', 0.80],
];

type Row = { instance_id: string; memory_ability: string; score: number };
const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;

function loadIfExists(f: string): Row[] {
  const p = RESULTS + f;
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf-8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l) as Row);
}

function main(): void {
  // per-source, per-ability mean + rows
  const srcAbilityMean: Record<string, Record<string, number>> = {};
  const srcAbilityRows: Record<string, Record<string, Row[]>> = {};
  for (const s of SOURCES) {
    const rows = loadIfExists(s.file);
    const byAb: Record<string, Row[]> = {};
    for (const r of rows) (byAb[r.memory_ability] ??= []).push(r);
    srcAbilityRows[s.name] = byAb;
    srcAbilityMean[s.name] = {};
    for (const a of Object.keys(byAb)) srcAbilityMean[s.name][a] = mean(byAb[a].map(r => r.score));
  }

  const iter1OR = (JSON.parse(fs.readFileSync(RESULTS + REJUDGE_JSON, 'utf-8')) as { iter1_OR_ability_means: Record<string, number> }).iter1_OR_ability_means;

  // current-code: latest source (highest precedence) that has the ability
  const chosen: Record<string, { src: string; rows: Row[]; mean: number }> = {};
  for (const a of ALL) {
    for (let i = SOURCES.length - 1; i >= 0; i--) {
      const s = SOURCES[i].name;
      if (srcAbilityRows[s][a]?.length) { chosen[a] = { src: s, rows: srcAbilityRows[s][a], mean: srcAbilityMean[s][a] }; break; }
    }
  }
  // best-per-ability: max ability-mean across sources
  const best: Record<string, { src: string; mean: number }> = {};
  for (const a of ALL) {
    let bv = -1, bs = '';
    for (const s of SOURCES) { const m = srcAbilityMean[s.name][a]; if (m !== undefined && m > bv) { bv = m; bs = s.name; } }
    best[a] = { src: bs, mean: bv };
  }

  const composedRows: Row[] = ALL.flatMap(a => chosen[a].rows);
  const currentMicro = mean(composedRows.map(r => r.score));
  const currentMacro = mean(ALL.map(a => chosen[a].mean));
  const bestMacro = mean(ALL.map(a => best[a].mean));

  console.log(`composed rows: ${composedRows.length} (expect 50)`);
  console.log('\nability                     current  src         best   bestSrc     iter1-OR');
  for (const a of ALL) {
    const i1 = iter1OR[a] !== undefined ? iter1OR[a].toFixed(3) : '  -  ';
    console.log(`${a.padEnd(27)} ${chosen[a].mean.toFixed(3)}   ${chosen[a].src.padEnd(9)}  ${best[a].mean.toFixed(3)}  ${best[a].src.padEnd(9)}  ${i1}`);
  }

  console.log(`\nCOMPOSED (current code)     micro=${currentMicro.toFixed(4)}  macro=${currentMacro.toFixed(4)}`);
  console.log(`COMPOSED (best-per-ability) macro=${bestMacro.toFixed(4)}`);
  console.log('\nvs reference (current-code micro):');
  for (const [name, val] of REFS) {
    const d = currentMicro - val;
    console.log(`  ${name.padEnd(34)} ${val.toFixed(4)}  Δ=${(d >= 0 ? '+' : '') + d.toFixed(4)}  ${currentMicro >= val ? 'REACHED' : 'short'}`);
  }
  console.log(`\nMATCH >=0.7704: current ${currentMicro >= 0.7704 ? 'YES' : 'NO'} | best ${bestMacro >= 0.7704 ? 'YES' : 'NO'}   CLEAR >=0.80: current ${currentMicro >= 0.80 ? 'YES' : 'NO'} | best ${bestMacro >= 0.80 ? 'YES' : 'NO'}`);

  fs.writeFileSync(RESULTS + OUT, JSON.stringify({
    composed_current_code_micro: currentMicro, composed_current_code_macro: currentMacro,
    composed_best_per_ability_macro: bestMacro,
    current_code: Object.fromEntries(ALL.map(a => [a, { mean: chosen[a].mean, src: chosen[a].src }])),
    best_per_ability: Object.fromEntries(ALL.map(a => [a, best[a]])),
    per_source_ability_means: srcAbilityMean,
    iter1_OR_ability_means: iter1OR,
    reached: { match_current: currentMicro >= 0.7704, match_best: bestMacro >= 0.7704, clear_current: currentMicro >= 0.80 },
    reference_points: Object.fromEntries(REFS),
    generated_at: new Date().toISOString(),
  }, null, 2));
  console.log('\nwrote', RESULTS + OUT);
}
main();
