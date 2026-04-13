import path from 'node:path';
import os from 'node:os';
import { MindDB, KnowledgeGraph, FrameStore, HybridSearch, createEmbeddingProvider } from '@waggle/core';
import { WikiCompiler, CompilationState } from '@waggle/wiki-compiler';

const db = new MindDB(path.join(os.homedir(), '.waggle', 'personal.mind'));
const kg = new KnowledgeGraph(db);
const raw = db.getDatabase();

// 1. Retire ALL entities and relations
console.log('Nuclear: retiring all entities and relations...');
raw.prepare("UPDATE knowledge_relations SET valid_to = datetime('now') WHERE valid_to IS NULL").run();
raw.prepare("UPDATE knowledge_entities SET valid_to = datetime('now') WHERE valid_to IS NULL").run();
console.log('Active entities after nuke:', kg.getEntityCount());

// 2. Re-create only the real entities
function ent(type, name, props = {}) { return kg.createEntity(type, name, props); }
function rel(srcId, tgtId, relType, conf = 1.0) { try { kg.createRelation(srcId, tgtId, relType, conf); } catch {} }

const marko = ent('person', 'Marko Markovic', { role: 'CEO & CTO', company: 'Egzakta Group' });
const egzakta = ent('organization', 'Egzakta Group', { focus: 'enterprise AI' });
const lmtek = ent('organization', 'LM TEK', { focus: 'GPU infrastructure' });
const anthropic = ent('organization', 'Anthropic', { relation: 'LLM provider' });
const waggle = ent('project', 'Waggle OS', { type: 'AI workspace platform' });
const kvark = ent('project', 'KVARK', { type: 'enterprise sovereign AI', revenue: 'EUR 1.2M' });
const wikiP = ent('project', 'Wiki Compiler', { status: 'v1 built' });
const mmcp = ent('project', 'Memory MCP', { tools: 18 });
const react = ent('technology', 'React', { version: '18' });
const ts = ent('technology', 'TypeScript', {});
const tauri = ent('technology', 'Tauri', { version: '2.0' });
const sqlite = ent('technology', 'SQLite', {});
const fastify = ent('technology', 'Fastify', {});
const clerk = ent('technology', 'Clerk', {});
const mcpT = ent('technology', 'MCP Protocol', {});
const hiveMind = ent('concept', 'Hive Mind', { desc: 'Personal wiki from memory frames' });
const harvestC = ent('concept', 'Memory Harvest', { desc: 'Import from external AI' });
const aiAct = ent('concept', 'EU AI Act', { deadline: 'Aug 2 2026' });
const tierC = ent('concept', 'Tier Strategy', { pricing: 'Free/Pro/Teams/Enterprise' });
const sovC = ent('concept', 'Data Sovereignty', { desc: 'Customer data on their infra' });

rel(marko.id, egzakta.id, 'founded');
rel(marko.id, waggle.id, 'leads');
rel(marko.id, kvark.id, 'leads');
rel(egzakta.id, waggle.id, 'builds');
rel(egzakta.id, kvark.id, 'builds');
rel(egzakta.id, lmtek.id, 'owns');
rel(waggle.id, kvark.id, 'feeds_demand_to');
rel(waggle.id, mmcp.id, 'includes');
rel(waggle.id, wikiP.id, 'includes');
rel(kvark.id, sovC.id, 'implements');
rel(waggle.id, react.id, 'uses');
rel(waggle.id, ts.id, 'uses');
rel(waggle.id, tauri.id, 'uses');
rel(waggle.id, sqlite.id, 'uses');
rel(waggle.id, fastify.id, 'uses');
rel(waggle.id, clerk.id, 'uses');
rel(mmcp.id, mcpT.id, 'implements');
rel(wikiP.id, hiveMind.id, 'implements');
rel(waggle.id, harvestC.id, 'provides');
rel(waggle.id, aiAct.id, 'complies_with');
rel(waggle.id, tierC.id, 'follows');

console.log('Rebuilt:', kg.getEntityCount(), 'entities');

// 3. Clear wiki state
try { raw.prepare('DELETE FROM wiki_pages').run(); } catch {}
try { raw.prepare('DELETE FROM wiki_watermark').run(); } catch {}

// 4. Compile
const frameStore = new FrameStore(db);
const embedder = await createEmbeddingProvider({ provider: 'mock' });
const search = new HybridSearch(db, embedder);
const state = new CompilationState(db);

const compiler = new WikiCompiler(kg, frameStore, search, state, {
  synthesize: async (prompt) => {
    const fc = prompt.match(/\((\d+) total\)/)?.[1] ?? '?';
    const nm = prompt.match(/about "([^"]+)"/)?.[1] ?? prompt.match(/concept "([^"]+)"/)?.[1] ?? 'topic';
    const lines = (prompt.match(/\[Frame #\d+.*?\]: .+/g) || []);
    const facts = lines.slice(0, 8).map(l => {
      const m = l.match(/\[Frame (#\d+).*?\]: (.+)/);
      return m ? `- ${m[2].slice(0, 200)} *(${m[1]})*` : null;
    }).filter(Boolean);
    return `## Summary\nSynthesized from ${fc} frames about ${nm}.\n\n` +
      (facts.length > 0 ? `## Key Facts\n${facts.join('\n')}\n\n` : '') +
      `> *Connect LLM for deeper synthesis.*`;
  },
});

const concepts = ['Waggle OS', 'KVARK', 'Memory Harvest', 'Wiki Compiler', 'EU AI Act', 'Tier Strategy', 'Data Sovereignty'];
const result = await compiler.compile({ incremental: false, concepts });

console.log('\n--- RESULTS ---');
console.log('Entity pages:', result.entityPages.length, '-', result.entityPages.join(', '));
console.log('Concept pages:', result.conceptPages.length, '-', result.conceptPages.join(', '));
console.log('Synthesis pages:', result.synthesisPages.length, '-', result.synthesisPages.join(', '));
console.log('Total:', result.pagesCreated, 'pages in', result.durationMs, 'ms');

const health = compiler.compileHealth();
console.log('\nHealth:', health.dataQualityScore + '/100');
console.log('Frames:', health.totalFrames, '| Entities:', health.totalEntities, '| Pages:', health.totalPages);

console.log('\nAll pages:');
for (const p of state.getAllPages()) {
  console.log(`  ${p.pageType.padEnd(10)} ${p.name.padEnd(25)} (${p.sourceCount} sources)`);
}

db.close();
console.log('\nDone!');
