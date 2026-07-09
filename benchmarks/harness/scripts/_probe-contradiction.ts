/** Precise probe: for the two failed contradiction questions on conv 1, report
 *  the exact rank of each side's frame in top-k retrieval (raw + obs minds). */
import { createOllamaEmbedder } from '@waggle/core';
import { createSubstrate } from '../src/substrate.js';

const CASES = [
  {
    q: 'Have I implemented the language detection microservice using franc v6.1.0 before?',
    db: 'benchmarks/data/beam/minds-1M/beam_1M_1.mind', k: 30, label: 'raw langdet',
    want: { pos: 161, neg: 325 },
  },
  {
    q: 'Have I completed the translation microservice that supports 12 languages with 98% accuracy using the DeepL API v2?',
    db: 'benchmarks/data/beam/minds-1M-obs/beam_1M_1.mind', k: 100, label: 'obs translation',
    want: { neg: 833 },
  },
  {
    q: 'Have I completed the translation microservice that supports 12 languages with 98% accuracy using the DeepL API v2?',
    db: 'benchmarks/data/beam/minds-1M/beam_1M_1.mind', k: 30, label: 'raw translation',
    want: {},
  },
];

async function main() {
  for (const c of CASES) {
    const substrate = createSubstrate({ dbPath: c.db, embedder: createOllamaEmbedder() });
    try {
      const results = await substrate.search.search(c.q, { limit: c.k, gopId: 'beam_1' });
      const ranks: Record<string, number> = {};
      for (const [name, id] of Object.entries(c.want)) ranks[name] = results.findIndex(r => r.frame.id === id);
      console.log(`[${c.label}] k=${c.k} retrieved=${results.length} ranks=${JSON.stringify(ranks)}`);
      // also: any frame in results mentioning the key noun phrases of BOTH sides
      results.forEach((r, i) => {
        const t = r.frame.content.toLowerCase();
        if ((t.includes('never') || t.includes("haven't")) && (t.includes('microservice') || t.includes('translation') || t.includes('language detection')))
          console.log(`   NEGATION-ish @${i} (frame ${r.frame.id}): ${r.frame.content.slice(0, 160).replace(/\s+/g, ' ')}`);
        if (t.includes('98%') || t.includes('93%'))
          console.log(`   CLAIM-ish    @${i} (frame ${r.frame.id}): ${r.frame.content.slice(0, 160).replace(/\s+/g, ' ')}`);
      });
    } finally { substrate.close(); }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
