#!/usr/bin/env node

/**
 * Harvest Claude Code memories + compile the wiki.
 *
 * 1. Run entity cleanup (dedup + noise removal)
 * 2. Harvest from ~/.claude/ (Claude Code adapter)
 * 3. Compile wiki pages
 * 4. Print results
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import {
  MindDB,
  FrameStore,
  KnowledgeGraph,
  SessionStore,
  HybridSearch,
  HarvestSourceStore,
  ClaudeCodeAdapter,
  createEmbeddingProvider,
  normalizeEntityName,
} from '@waggle/core';
import { WikiCompiler, CompilationState } from '@waggle/wiki-compiler';

// ── Setup ─────────────────────────────────────────────────────────

const dataDir = process.env.WAGGLE_DATA_DIR
  ? process.env.WAGGLE_DATA_DIR.replace('~', os.homedir())
  : path.join(os.homedir(), '.waggle');

const mindPath = path.join(dataDir, 'personal.mind');
console.log(`\n🧠 Opening: ${mindPath}`);

const db = new MindDB(mindPath);
const frameStore = new FrameStore(db);
const kg = new KnowledgeGraph(db);
const sessions = new SessionStore(db);
const harvestStore = new HarvestSourceStore(db);
const embedder = await createEmbeddingProvider({ provider: 'mock' });
const search = new HybridSearch(db, embedder);
const raw = db.getDatabase();

// ── Step 1: Entity cleanup ────────────────────────────────────────

console.log('\n🧹 Step 1: Entity cleanup...');

// Dedup entities by normalized name
const allEntities = kg.getEntities(10000);
const normalizedGroups = new Map();
for (const entity of allEntities) {
  const key = `${normalizeEntityName(entity.name)}::${entity.entity_type.toLowerCase()}`;
  let group = normalizedGroups.get(key);
  if (!group) {
    group = [];
    normalizedGroups.set(key, group);
  }
  group.push(entity);
}

let dedupCount = 0;
const dedupTx = raw.transaction(() => {
  for (const group of normalizedGroups.values()) {
    if (group.length <= 1) continue;
    // Keep first, retire rest
    const keep = group[0];
    for (let i = 1; i < group.length; i++) {
      kg.retireEntity(group[i].id);
      dedupCount++;
    }
  }
});
dedupTx();

// Retire orphan entities (no relations, not person/project/org/technology)
const significantTypes = new Set(['person', 'project', 'organization', 'technology', 'concept']);
const afterDedup = kg.getEntities(10000);
let orphanCount = 0;
const orphanTx = raw.transaction(() => {
  for (const e of afterDedup) {
    if (significantTypes.has(e.entity_type)) continue;
    const outRels = kg.getRelationsFrom(e.id);
    const inRels = kg.getRelationsTo(e.id);
    if (outRels.length === 0 && inRels.length === 0) {
      kg.retireEntity(e.id);
      orphanCount++;
    }
  }
});
orphanTx();

console.log(`   Duplicates merged: ${dedupCount}`);
console.log(`   Orphans retired: ${orphanCount}`);
console.log(`   Active entities: ${kg.getEntityCount()}`);

// ── Step 2: Harvest Claude Code ───────────────────────────────────

console.log('\n🌾 Step 2: Harvesting Claude Code memories...');

const claudeDir = path.join(os.homedir(), '.claude');
if (!fs.existsSync(claudeDir)) {
  console.log('   ⚠️ ~/.claude/ not found — skipping harvest');
} else {
  const adapter = new ClaudeCodeAdapter();
  const items = adapter.scan(claudeDir);
  console.log(`   Found ${items.length} items in ~/.claude/`);

  // Count by type
  const byType = {};
  for (const item of items) {
    byType[item.type] = (byType[item.type] || 0) + 1;
  }
  console.log(`   By type: ${JSON.stringify(byType)}`);

  // Save as frames
  const session = sessions.ensure('harvest:claude-code', undefined, 'Claude Code harvest');
  const batchStart = new Date().toISOString();
  let framesCreated = 0;
  let duplicatesSkipped = 0;

  for (const item of items) {
    const content = item.title
      ? `[claude-code] ${item.title}: ${item.content.slice(0, 2000)}`
      : `[claude-code] ${item.content.slice(0, 2000)}`;

    const frame = frameStore.createIFrame(session.gop_id, content, 'normal', 'import');
    const isNew = frame.created_at >= batchStart;

    if (isNew) {
      framesCreated++;
      try { await search.indexFrame(frame.id, content); } catch {}
    } else {
      duplicatesSkipped++;
    }
  }

  // Record sync
  harvestStore.upsert('claude-code', 'Claude Code', claudeDir);
  harvestStore.recordSync('claude-code', items.length, framesCreated);

  console.log(`   Frames created: ${framesCreated}`);
  console.log(`   Duplicates skipped: ${duplicatesSkipped}`);
}

// ── Step 3: Compile Wiki ──────────────────────────────────────────

console.log('\n📖 Step 3: Compiling wiki...');

const state = new CompilationState(db);
const compiler = new WikiCompiler(kg, frameStore, search, state, {
  synthesize: async (prompt) => {
    // Echo synthesizer — extracts key info from prompt
    const frameMatch = prompt.match(/## Source Frames \((\d+) total\)/);
    const frameCount = frameMatch ? frameMatch[1] : '?';
    const entityMatch = prompt.match(/about "([^"]+)"/);
    const entityName = entityMatch ? entityMatch[1] : 'this topic';

    return [
      `## Summary`,
      `Compiled from ${frameCount} source frames about ${entityName}.`,
      '',
      `## Key Facts`,
      `- Data compiled from ${frameCount} memory frames`,
      `- Cross-referenced with knowledge graph relations`,
      '',
      `> Connect an LLM provider for richer synthesis.`,
    ].join('\n');
  },
});

// Auto-detect concepts from KG
const concepts = ['Waggle OS', 'KVARK', 'Memory Harvest', 'Wiki Compiler', 'EU AI Act', 'Tier Strategy'];

const result = await compiler.compile({
  incremental: false, // full compile on first run
  concepts,
});

console.log(`   Pages created: ${result.pagesCreated}`);
console.log(`   Pages updated: ${result.pagesUpdated}`);
console.log(`   Pages unchanged: ${result.pagesUnchanged}`);
console.log(`   Entity pages: ${result.entityPages.join(', ') || 'none'}`);
console.log(`   Concept pages: ${result.conceptPages.join(', ') || 'none'}`);
console.log(`   Synthesis pages: ${result.synthesisPages.join(', ') || 'none'}`);
console.log(`   Health issues: ${result.healthIssues}`);
console.log(`   Duration: ${result.durationMs}ms`);

// ── Step 4: Health report ─────────────────────────────────────────

console.log('\n🏥 Step 4: Health report...');

const health = compiler.compileHealth();
console.log(`   Data quality score: ${health.dataQualityScore}/100`);
console.log(`   Total entities: ${health.totalEntities}`);
console.log(`   Total frames: ${health.totalFrames}`);
console.log(`   Total pages: ${health.totalPages}`);
console.log(`   Issues: ${health.issues.length}`);

if (health.issues.length > 0) {
  console.log('\n   Top issues:');
  for (const issue of health.issues.slice(0, 10)) {
    console.log(`   [${issue.severity}] ${issue.type}: ${issue.description}`);
  }
}

// ── Step 5: List compiled pages ───────────────────────────────────

console.log('\n📄 Compiled pages:');
const allPages = state.getAllPages();
for (const page of allPages) {
  console.log(`   ${page.pageType.padEnd(10)} ${page.slug.padEnd(30)} ${page.name} (${page.sourceCount} sources)`);
}

// ── Final stats ───────────────────────────────────────────────────

const finalStats = frameStore.getStats();
console.log('\n📊 Final state:');
console.log(`   Frames: ${finalStats.total}`);
console.log(`   Entities: ${kg.getEntityCount()}`);
console.log(`   Wiki pages: ${allPages.length}`);
console.log(`   Watermark: frame #${state.getWatermark().lastFrameId}`);

console.log('\n✅ Harvest + compile complete!\n');

db.close();
