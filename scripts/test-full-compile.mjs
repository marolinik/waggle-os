import path from 'node:path';
import os from 'node:os';
import { MindDB, FrameStore, KnowledgeGraph, HybridSearch, createEmbeddingProvider } from '@waggle/core';
import { WikiCompiler, CompilationState, resolveSynthesizer } from '@waggle/wiki-compiler';

const db = new MindDB(path.join(os.homedir(), '.waggle', 'personal.mind'));
const synth = await resolveSynthesizer();
console.log('Synthesizer:', synth.provider, '(' + synth.model + ')');

const embedder = await createEmbeddingProvider({ provider: 'mock' });
const state = new CompilationState(db);
const compiler = new WikiCompiler(
  new KnowledgeGraph(db), new FrameStore(db),
  new HybridSearch(db, embedder), state,
  { synthesize: synth.synthesize },
);

// Clear wiki state for fresh compile
try { db.getDatabase().prepare('DELETE FROM wiki_pages').run(); } catch {}
try { db.getDatabase().prepare('DELETE FROM wiki_watermark').run(); } catch {}

const result = await compiler.compile({ incremental: false, concepts: ['Waggle OS', 'KVARK'] });
console.log('\nPages:', result.pagesCreated);
console.log('Entity:', result.entityPages.join(', '));
console.log('Concept:', result.conceptPages.join(', '));
console.log('Synthesis:', result.synthesisPages.join(', '));
console.log('Health issues:', result.healthIssues);
console.log('Duration:', result.durationMs, 'ms');

db.close();
