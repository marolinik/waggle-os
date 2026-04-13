import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { MindDB, FrameStore, KnowledgeGraph, HybridSearch, createEmbeddingProvider } from '@waggle/core';
import { WikiCompiler, CompilationState, resolveSynthesizer } from '@waggle/wiki-compiler';

const db = new MindDB(path.join(os.homedir(), '.waggle', 'personal.mind'));
const kg = new KnowledgeGraph(db);
const frameStore = new FrameStore(db);
const embedder = await createEmbeddingProvider({
  provider: process.env.WAGGLE_EMBEDDING_PROVIDER ?? 'inprocess',
  inprocess: { cacheDir: path.join(os.homedir(), '.waggle', 'models') },
});
const search = new HybridSearch(db, embedder);
const state = new CompilationState(db);
const synth = await resolveSynthesizer();
console.log('Synthesizer:', synth.provider, '| Model:', synth.model);

const compiler = new WikiCompiler(kg, frameStore, search, state, {
  synthesize: synth.synthesize,
});

// Output dir
const outDir = path.join(process.cwd(), 'docs', 'wiki-live');
fs.mkdirSync(outDir, { recursive: true });

// Compile key pages and write to disk + print
const pagesToCompile = [
  { type: 'entity', name: 'Marko Markovic' },
  { type: 'entity', name: 'Waggle OS' },
  { type: 'entity', name: 'KVARK' },
  { type: 'entity', name: 'Egzakta Group' },
  { type: 'concept', name: 'Memory Harvest' },
  { type: 'concept', name: 'Wiki Compiler' },
  { type: 'synthesis', name: 'Waggle OS' },
];

for (const p of pagesToCompile) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Compiling: ${p.type} — ${p.name}`);
  console.log('='.repeat(70));

  let page;
  if (p.type === 'entity') {
    const entity = kg.searchEntities(p.name, 1).find(e => e.name === p.name);
    if (!entity) { console.log('Entity not found:', p.name); continue; }
    page = await compiler.compileEntityPage(entity);
  } else if (p.type === 'concept') {
    page = await compiler.compileConceptPage(p.name);
  } else if (p.type === 'synthesis') {
    page = await compiler.compileSynthesisPage(p.name);
  }

  if (!page) { console.log('No page generated (insufficient data)'); continue; }

  // Write to disk
  const filePath = path.join(outDir, `${page.slug}.md`);
  fs.writeFileSync(filePath, page.markdown);
  console.log(`Written: ${filePath}`);

  // Print content
  console.log('\n' + page.markdown);
}

// Also compile and write index
const indexPage = compiler.compileIndex();
fs.writeFileSync(path.join(outDir, 'index.md'), indexPage.markdown);
console.log(`\nIndex written: ${path.join(outDir, 'index.md')}`);

db.close();
console.log('\nDone! Pages at docs/wiki-live/');
