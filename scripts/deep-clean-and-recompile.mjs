#!/usr/bin/env node

/**
 * Deep clean KG + recompile wiki — only keep entities with real relations.
 */

import path from 'node:path';
import os from 'node:os';
import {
  MindDB, FrameStore, KnowledgeGraph, SessionStore,
  HybridSearch, createEmbeddingProvider,
} from '@waggle/core';
import { WikiCompiler, CompilationState } from '@waggle/wiki-compiler';

const dataDir = process.env.WAGGLE_DATA_DIR?.replace('~', os.homedir()) ?? path.join(os.homedir(), '.waggle');
const db = new MindDB(path.join(dataDir, 'personal.mind'));
const frameStore = new FrameStore(db);
const kg = new KnowledgeGraph(db);
const sessions = new SessionStore(db);
const embedder = await createEmbeddingProvider({ provider: 'mock' });
const search = new HybridSearch(db, embedder);
const raw = db.getDatabase();

// ── Step 1: Aggressive KG cleanup ─────────────────────────────────

console.log('\n🔥 Deep KG cleanup — keeping only entities with relations or known-good names...');

// Known-good entities to always keep
const KEEP_NAMES = new Set([
  'marko markovic', 'waggle os', 'kvark', 'egzakta group', 'lm tek',
  'react', 'typescript', 'tauri', 'sqlite', 'fastify', 'clerk', 'stripe',
  'mcp protocol', 'hive mind', 'memory harvest', 'eu ai act', 'tier strategy',
  'data sovereignty', 'wiki compiler', 'memory mcp',
  'adam ramecz', 'aleksandar radojicic', 'alfred friedacher', 'ana petrovi',
  'christian fuhrmann', 'briant gerlach', 'alan ford',
  'claude', 'claude code', 'anthropic', 'chatgpt', 'openai', 'gemini', 'google',
  'microsoft', 'ollama', 'vite', 'tailwind', 'playwright',
  'node.js', 'nodejs', 'bun', 'rust', 'python',
  'aws', 'azure', 'docker', 'kubernetes',
]);

const allEntities = kg.getEntities(10000);
let retired = 0;
let kept = 0;

const cleanTx = raw.transaction(() => {
  for (const e of allEntities) {
    const lower = e.name.toLowerCase().trim();

    // Always keep known-good
    if (KEEP_NAMES.has(lower)) {
      kept++;
      continue;
    }

    // Keep entities with actual relations
    const outRels = kg.getRelationsFrom(e.id);
    const inRels = kg.getRelationsTo(e.id);
    if (outRels.length > 0 || inRels.length > 0) {
      kept++;
      continue;
    }

    // Keep real people (>2 words, reasonable name pattern)
    if (e.entity_type === 'person') {
      const words = e.name.split(/\s+/);
      if (words.length >= 2 && words.length <= 4 && words.every(w => /^[A-Z][a-z]+$/.test(w))) {
        kept++;
        continue;
      }
    }

    // Retire everything else
    kg.retireEntity(e.id);
    retired++;
  }
});
cleanTx();

console.log(`   Retired: ${retired}`);
console.log(`   Kept: ${kept}`);
console.log(`   Active entities: ${kg.getEntityCount()}`);

// ── Step 2: Wipe old wiki pages ───────────────────────────────────

console.log('\n🗑️  Wiping old wiki pages...');
try {
  raw.prepare('DELETE FROM wiki_pages').run();
  raw.prepare('DELETE FROM wiki_watermark').run();
  console.log('   ✅ Wiki state cleared');
} catch { console.log('   ⏭️  No wiki tables to clear'); }

// ── Step 3: Recompile ─────────────────────────────────────────────

console.log('\n📖 Recompiling wiki with clean data...');

const state = new CompilationState(db);
const compiler = new WikiCompiler(kg, frameStore, search, state, {
  synthesize: async (prompt) => {
    const frameMatch = prompt.match(/## Source Frames \((\d+) total\)/);
    const frameCount = frameMatch ? frameMatch[1] : '?';
    const entityMatch = prompt.match(/about "([^"]+)"/) || prompt.match(/about the concept "([^"]+)"/);
    const name = entityMatch ? entityMatch[1] : 'this topic';

    // Better echo synthesis — parse the prompt for actual frame content
    const frameLines = prompt.match(/\[Frame #\d+.*?\]: .+/g) || [];
    const uniqueFacts = frameLines.slice(0, 8).map(line => {
      const match = line.match(/\[Frame (#\d+).*?\]: (.+)/);
      if (match) return `- ${match[2].slice(0, 200)} *(${match[1]})*`;
      return null;
    }).filter(Boolean);

    return [
      `## Summary`,
      `Synthesized from ${frameCount} source frames about ${name}.`,
      '',
      ...(uniqueFacts.length > 0 ? ['## Key Facts', ...uniqueFacts, ''] : []),
      `> *Compiled with echo synthesizer. Connect LLM for deeper synthesis.*`,
    ].join('\n');
  },
});

const concepts = ['Waggle OS', 'KVARK', 'Memory Harvest', 'Wiki Compiler', 'EU AI Act', 'Tier Strategy', 'Data Sovereignty'];
const result = await compiler.compile({ incremental: false, concepts });

console.log(`\n📊 Results:`);
console.log(`   Entity pages: ${result.entityPages.length} — ${result.entityPages.join(', ')}`);
console.log(`   Concept pages: ${result.conceptPages.length} — ${result.conceptPages.join(', ')}`);
console.log(`   Synthesis pages: ${result.synthesisPages.length} — ${result.synthesisPages.join(', ')}`);
console.log(`   Total pages: ${result.pagesCreated}`);
console.log(`   Duration: ${result.durationMs}ms`);

// ── Step 4: Health ────────────────────────────────────────────────

const health = compiler.compileHealth();
console.log(`\n🏥 Health: ${health.dataQualityScore}/100`);
console.log(`   Frames: ${health.totalFrames}, Entities: ${health.totalEntities}, Pages: ${health.totalPages}`);
console.log(`   Issues: ${health.issues.length}`);

const highIssues = health.issues.filter(i => i.severity === 'high');
if (highIssues.length > 0) {
  console.log(`\n   High severity:`);
  for (const i of highIssues.slice(0, 5)) {
    console.log(`   ❗ ${i.description}`);
  }
}

// List all pages
console.log('\n📄 All compiled pages:');
const allPages = state.getAllPages();
for (const p of allPages) {
  console.log(`   ${p.pageType.padEnd(10)} ${p.name.padEnd(30)} (${p.sourceCount} sources)`);
}

console.log(`\n✅ Deep clean + recompile complete!\n`);
db.close();
