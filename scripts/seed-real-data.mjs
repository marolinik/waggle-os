#!/usr/bin/env node

/**
 * Real-Data Seed Script — populates personal.mind with Marko's actual context.
 *
 * This is NOT test data. This is real information about:
 * - Marko Markovic (identity, role, preferences)
 * - Waggle OS (product, architecture, decisions)
 * - KVARK (enterprise AI platform)
 * - Egzakta Group (parent company)
 * - Technology stack, business strategy, team context
 *
 * Run: node scripts/seed-real-data.mjs
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import {
  MindDB,
  FrameStore,
  KnowledgeGraph,
  IdentityLayer,
  AwarenessLayer,
  SessionStore,
  HybridSearch,
  WorkspaceManager,
  createEmbeddingProvider,
} from '@waggle/core';
import { CompilationState } from '@waggle/wiki-compiler';

// ── Setup ─────────────────────────────────────────────────────────

const dataDir = process.env.WAGGLE_DATA_DIR
  ? process.env.WAGGLE_DATA_DIR.replace('~', os.homedir())
  : path.join(os.homedir(), '.waggle');

fs.mkdirSync(dataDir, { recursive: true });

const mindPath = path.join(dataDir, 'personal.mind');
console.log(`\n📂 Data directory: ${dataDir}`);
console.log(`🧠 Mind path: ${mindPath}`);

const db = new MindDB(mindPath);
const frameStore = new FrameStore(db);
const kg = new KnowledgeGraph(db);
const identity = new IdentityLayer(db);
const awareness = new AwarenessLayer(db);
const sessions = new SessionStore(db);
const wsManager = new WorkspaceManager(dataDir);

// Use mock embedder for seeding (fast, no network)
const embedder = await createEmbeddingProvider({ provider: 'mock' });
const search = new HybridSearch(db, embedder);

// ── Step 1: Wipe test pollution ───────────────────────────────────

console.log('\n🧹 Step 1: Wiping test pollution...');

const raw = db.getDatabase();
const importCount = raw.prepare("SELECT COUNT(*) as cnt FROM memory_frames WHERE source = 'import'").get();
console.log(`   Import frames to delete: ${importCount.cnt}`);

// Delete import frames using FrameStore.delete() which handles FK cascades
const importIds = raw.prepare("SELECT id FROM memory_frames WHERE source = 'import'").all();
for (const { id } of importIds) {
  frameStore.delete(id);
}

// Retire noise entities
const allEntities = kg.getEntities(10000);
const noisePatterns = /^(step|phase|part|begin|end|test|true|false|null|yes|no|ok|the |a |an )/i;
let noiseRetired = 0;
const noiseTx = raw.transaction(() => {
  for (const e of allEntities) {
    if (e.name.length <= 2 || /^\d+$/.test(e.name) || noisePatterns.test(e.name)) {
      kg.retireEntity(e.id);
      noiseRetired++;
    }
  }
});
noiseTx();
console.log(`   Noise entities retired: ${noiseRetired}`);

// Clean wiki compilation state if exists
try {
  raw.prepare('DELETE FROM wiki_pages').run();
  raw.prepare('DELETE FROM wiki_watermark').run();
} catch { /* tables may not exist yet */ }

const statsAfter = frameStore.getStats();
console.log(`   Frames remaining: ${statsAfter.total}`);

// ── Step 2: Set identity ──────────────────────────────────────────

console.log('\n👤 Step 2: Setting Marko\'s identity...');

try {
  if (identity.exists()) {
    identity.update({
      name: 'Marko Markovic',
      role: 'CEO & Technical Co-founder',
      department: 'Executive / Engineering',
      personality: 'Direct, strategic, moves fast. Prefers concise communication. Values shipping over perfection. Thinks in systems and business models.',
      capabilities: 'Full-stack development, AI/ML architecture, product strategy, enterprise sales, team leadership. Deep expertise in TypeScript, React, Node.js, Tauri, SQLite. Building AI-native products.',
      system_prompt: 'Marko is building Waggle OS (AI workspace platform) and KVARK (enterprise sovereign AI) at Egzakta Group. He values speed, real results, and hates unnecessary process. Help him ship.',
    });
  } else {
    identity.create({
      name: 'Marko Markovic',
      role: 'CEO & Technical Co-founder',
      department: 'Executive / Engineering',
      personality: 'Direct, strategic, moves fast. Prefers concise communication. Values shipping over perfection. Thinks in systems and business models.',
      capabilities: 'Full-stack development, AI/ML architecture, product strategy, enterprise sales, team leadership. Deep expertise in TypeScript, React, Node.js, Tauri, SQLite. Building AI-native products.',
      system_prompt: 'Marko is building Waggle OS (AI workspace platform) and KVARK (enterprise sovereign AI) at Egzakta Group. He values speed, real results, and hates unnecessary process. Help him ship.',
    });
  }
  console.log('   ✅ Identity configured');
} catch (err) {
  console.log(`   ⚠️ Identity: ${err.message}`);
}

// ── Step 3: Create workspaces ─────────────────────────────────────

console.log('\n🏗️  Step 3: Creating workspaces...');

const workspaces = [
  { name: 'Waggle OS', group: 'products', icon: '🐝' },
  { name: 'KVARK', group: 'products', icon: '⚛️' },
  { name: 'Egzakta Group', group: 'company', icon: '🏢' },
  { name: 'AI Research', group: 'research', icon: '🔬' },
  { name: 'Sales Pipeline', group: 'business', icon: '💼' },
];

for (const ws of workspaces) {
  try {
    const existing = wsManager.list().find(w => w.name === ws.name);
    if (!existing) {
      wsManager.create({ name: ws.name, group: ws.group });
      console.log(`   ✅ Created workspace: ${ws.name}`);
    } else {
      console.log(`   ⏭️  Workspace exists: ${ws.name}`);
    }
  } catch (err) {
    console.log(`   ⚠️ ${ws.name}: ${err.message}`);
  }
}

// ── Step 4: Save real memories ────────────────────────────────────

console.log('\n💾 Step 4: Saving real memories...');

const realMemories = [
  // ── Waggle OS Architecture ──
  {
    session: 'waggle-architecture',
    summary: 'Waggle OS architecture decisions',
    frames: [
      { content: 'Waggle OS is a workspace-native AI agent platform with persistent memory. Ships as a Tauri 2.0 desktop binary for Windows and macOS with a React frontend and a Node.js sidecar.', importance: 'critical' },
      { content: 'The memory engine uses SQLite with FrameStore (I/P/B frames), HybridSearch (FTS5 + sqlite-vec), and KnowledgeGraph (entity-relation). All stored in a single .mind file per workspace.', importance: 'critical' },
      { content: 'Frontend is React 18 + TypeScript + Vite + Tailwind + shadcn/ui. Desktop shell is Tauri 2.0 (Rust). Backend is Fastify sidecar (Node.js, bundled). Design system is Hive DS with honey #e5a000 accent.', importance: 'important' },
      { content: 'Agent runtime at packages/agent/src/agent-loop.ts. 22 personas available. Behavioral spec v2.0 governs agent behavior. Tool filtering per persona via allowlist/denylist.', importance: 'important' },
      { content: 'Authentication via Clerk (JWT-based). Tier system: Trial (15d) → Free → Pro ($19/mo) → Teams ($49/seat/mo) → Enterprise (KVARK). Memory + Harvest free forever as moat.', importance: 'critical' },
      { content: 'The Room is the desktop canvas — multiple chat windows, per-window personas, workspace rail, cross-workspace tools. Autonomy levels: Normal, Trusted, YOLO.', importance: 'important' },
      { content: 'Memory MCP plugin at packages/memory-mcp/ — 18 MCP tools + 4 resources. Works with Claude Code, Claude Desktop, and any MCP-compatible AI. Data stored in ~/.waggle/.', importance: 'important' },
    ],
  },

  // ── KVARK Strategy ──
  {
    session: 'kvark-strategy',
    summary: 'KVARK enterprise AI platform strategy',
    frames: [
      { content: 'KVARK is Egzakta Group\'s sovereign enterprise AI platform. Everything Waggle does — on your infrastructure, connected to all your internal systems. Full data pipeline injection, your permissions, complete audit trail, governance. Your data never leaves your perimeter.', importance: 'critical' },
      { content: 'KVARK has EUR 1.2M in contracted revenue. Waggle OS is the demand-generation and qualification engine for KVARK — solo users learn what AI-native work feels like, then enterprises want it on their infrastructure.', importance: 'critical' },
      { content: 'Waggle tier funnel: Solo (Free) teaches individuals → Basic ($15/mo) removes limits → Teams ($79/mo) creates institutional dependency → Enterprise leads to KVARK consultative sale at www.kvark.ai.', importance: 'important' },
      { content: 'KVARK differentiators: sovereign deployment (on-prem or private cloud), full Microsoft 365 integration, EU AI Act compliance by default, enterprise governance, custom model pools, audit trail.', importance: 'important' },
    ],
  },

  // ── Egzakta Group ──
  {
    session: 'egzakta-company',
    summary: 'Egzakta Group company context',
    frames: [
      { content: 'Egzakta Group is the parent company building Waggle OS and KVARK. Founded by Marko Markovic. Focus on enterprise AI solutions with a sovereign-first approach.', importance: 'important' },
      { content: 'LM TEK is the hardware arm — provides GPU infrastructure for KVARK deployments. Enables fully on-premises AI without cloud dependencies.', importance: 'normal' },
      { content: 'Business model: Waggle OS is freemium SaaS (demand gen) → KVARK is enterprise consultative sale (EUR 1.2M contracted). Memory Harvest is the free moat that locks users in.', importance: 'important' },
    ],
  },

  // ── Technical Decisions ──
  {
    session: 'tech-decisions',
    summary: 'Key technology decisions and rationale',
    frames: [
      { content: 'Decision: Use SQLite + sqlite-vec for embeddings instead of a separate vector database. Rationale: single-file portability (.mind file), no infrastructure dependencies, good enough for personal/workspace scale.', importance: 'important' },
      { content: 'Decision: Tauri 2.0 over Electron. Rationale: 10x smaller binary, Rust security, native performance. Trade-off: harder to debug, less ecosystem.', importance: 'important' },
      { content: 'Decision: Ship Memory MCP as standalone npm package. Rationale: works with ANY MCP client (Claude Code, Claude Desktop, Cursor, etc.), not just Waggle. Expands TAM massively.', importance: 'critical' },
      { content: 'Decision: Wiki Compiler uses Karpathy-style LLM wiki approach. Memory frames are raw material, LLM synthesizes them into interlinked markdown wiki pages. Incremental compilation via watermarks.', importance: 'critical' },
      { content: 'Decision: EU AI Act compliance baked into memory system. Art. 12/13/14/19/26/50 mapped to specific features. Compliance by default, not as afterthought. Aug 2 2026 deadline.', importance: 'important' },
      { content: 'Decision: All tiers get unlimited embedding quotas. Previous per-tier quotas removed during tier restructure. Memory + Harvest are free forever — they are the moat.', importance: 'normal' },
    ],
  },

  // ── Wiki Compiler ──
  {
    session: 'wiki-compiler',
    summary: 'Wiki Compiler concept and implementation',
    frames: [
      { content: 'Wiki Compiler is inspired by Karpathy\'s LLM Wiki concept — using LLMs to incrementally build and maintain a persistent, interlinked markdown wiki from accumulated knowledge. The key insight: answers should compound into permanent knowledge, not disappear with the chat.', importance: 'critical' },
      { content: 'Competitive landscape analyzed: Google Brain markdown+PGLite, Mem0 facts graph, Zep temporal, Hindsight auto-capture, Cognee scientific. Waggle Wiki Compiler combines best of all with source provenance and incremental compilation.', importance: 'important' },
      { content: 'Wiki page types: entity (person/project/org), concept (topic synthesis), synthesis (cross-source patterns — the killer feature), index (catalog), health (contradictions/gaps/orphans).', importance: 'important' },
      { content: 'Universal source pipeline: 30+ adapters in 3 tiers. Phase 1 ships with markdown, plaintext, PDF, URL adapters plus existing ChatGPT/Claude/Gemini/ClaudeCode harvest adapters.', importance: 'normal' },
      { content: 'Privacy architecture: local-first processing, PII filtering (redact/flag/pass/ask modes), GDPR data portability (single .mind file export), zero telemetry by default, end-to-end encryption for team sync.', importance: 'important' },
    ],
  },

  // ── Development Velocity ──
  {
    session: 'dev-velocity',
    summary: 'Development progress and velocity',
    frames: [
      { content: 'Waggle OS development velocity: 29 commits in a single MEGA session, entire backlog cleared. Team memory, S3 storage, global KG, trial modal, budget cap, Ollama integration, 13k dead code removed.', importance: 'normal' },
      { content: 'Phase A (The Room) + Phase B (Real Filesystem + Tiered Autonomy) completed in approximately one working day. Per-session orchestrators, per-window personas, Room canvas, window restoration, workspace rail.', importance: 'normal' },
      { content: 'E2E test suite: 96 Playwright tests covering all critical user flows. API tests + visual baseline tests. Onboarding skip via addInitScript before goto.', importance: 'normal' },
      { content: 'Memory MCP plugin has 18 MCP tools and 4 resources. Handles persistent memory, knowledge graph, identity, awareness, workspace management, harvest, cleanup, ingestion, and wiki compilation.', importance: 'normal' },
    ],
  },

  // ── Preferences & Working Style ──
  {
    session: 'working-style',
    summary: 'Marko\'s working style and preferences',
    frames: [
      { content: 'Marko prefers terse, action-oriented communication. No summaries of what was just done — he can read the diff. Lead with Playwright E2E testing, don\'t make him click through the UI manually.', importance: 'important' },
      { content: 'When Marko says "you decide" or "you lead" — take initiative, make decisions, keep moving. Don\'t ask for permission on obvious next steps. Ship first, polish later.', importance: 'important' },
      { content: 'Marko values real integration tests over mocked tests. Got burned when mock tests passed but production migration failed. Use real database connections in tests.', importance: 'normal' },
      { content: 'For refactors, Marko prefers one bundled PR over many small ones. Splitting certain changes creates unnecessary churn. Use judgment on when to bundle vs split.', importance: 'normal' },
    ],
  },
];

let totalFrames = 0;
for (const mem of realMemories) {
  const session = sessions.ensure(
    `seed:${mem.session}`,
    undefined,
    mem.summary,
  );

  for (const frame of mem.frames) {
    const existing = frameStore.findDuplicate(frame.content);
    if (!existing) {
      const f = frameStore.createIFrame(session.gop_id, frame.content, frame.importance, 'user_stated');
      try { await search.indexFrame(f.id, frame.content); } catch {}
      totalFrames++;
    }
  }
}

console.log(`   ✅ Saved ${totalFrames} real memory frames across ${realMemories.length} sessions`);

// ── Step 5: Build KG entities & relations ─────────────────────────

console.log('\n🕸️  Step 5: Building knowledge graph...');

// Helper to create entity if not exists
function ensureEntity(type, name, properties = {}) {
  const existing = kg.searchEntities(name, 1);
  const match = existing.find(e => e.name.toLowerCase() === name.toLowerCase() && e.entity_type === type);
  if (match) return match;
  return kg.createEntity(type, name, properties);
}

// People
const marko = ensureEntity('person', 'Marko Markovic', { role: 'CEO & Technical Co-founder', company: 'Egzakta Group' });

// Organizations
const egzakta = ensureEntity('organization', 'Egzakta Group', { type: 'parent company', focus: 'enterprise AI' });
const lmtek = ensureEntity('organization', 'LM TEK', { type: 'hardware division', focus: 'GPU infrastructure' });

// Projects
const waggle = ensureEntity('project', 'Waggle OS', { type: 'AI workspace platform', stage: 'active development' });
const kvark = ensureEntity('project', 'KVARK', { type: 'enterprise sovereign AI', revenue: 'EUR 1.2M contracted' });
const wikiCompiler = ensureEntity('project', 'Wiki Compiler', { type: 'knowledge synthesis engine', status: 'v1 built' });
const memoryMcp = ensureEntity('project', 'Memory MCP', { type: 'MCP plugin', tools: 18 });

// Technologies
const react = ensureEntity('technology', 'React', { version: '18', usage: 'frontend' });
const typescript = ensureEntity('technology', 'TypeScript', { usage: 'primary language' });
const tauri = ensureEntity('technology', 'Tauri', { version: '2.0', usage: 'desktop shell' });
const sqlite = ensureEntity('technology', 'SQLite', { usage: 'memory storage, .mind files' });
const fastify = ensureEntity('technology', 'Fastify', { usage: 'sidecar API server' });
const clerk = ensureEntity('technology', 'Clerk', { usage: 'authentication (JWT)' });
const stripe = ensureEntity('technology', 'Stripe', { usage: 'payments (pending)' });
const mcp = ensureEntity('technology', 'MCP Protocol', { usage: 'tool interop standard' });

// Concepts
const hiveMind = ensureEntity('concept', 'Hive Mind', { description: 'Personal wiki compiled from memory frames' });
const memoryHarvest = ensureEntity('concept', 'Memory Harvest', { description: 'Import from external AI systems' });
const aiAct = ensureEntity('concept', 'EU AI Act', { description: 'Compliance framework, Aug 2026 deadline' });
const tierStrategy = ensureEntity('concept', 'Tier Strategy', { description: 'Trial→Free→Pro→Teams→Enterprise→KVARK' });
const sovereignty = ensureEntity('concept', 'Data Sovereignty', { description: 'Customer data never leaves their perimeter' });

console.log(`   ✅ Created/verified ${15 + 5} entities`);

// Relations
const relations = [
  // Marko
  [marko.id, egzakta.id, 'founded', 1.0],
  [marko.id, waggle.id, 'leads', 1.0],
  [marko.id, kvark.id, 'leads', 1.0],

  // Company structure
  [egzakta.id, waggle.id, 'builds', 1.0],
  [egzakta.id, kvark.id, 'builds', 1.0],
  [egzakta.id, lmtek.id, 'owns', 0.9],

  // Product relationships
  [waggle.id, kvark.id, 'feeds_demand_to', 1.0],
  [waggle.id, memoryMcp.id, 'includes', 1.0],
  [waggle.id, wikiCompiler.id, 'includes', 1.0],
  [kvark.id, sovereignty.id, 'implements', 1.0],

  // Tech stack
  [waggle.id, react.id, 'uses', 1.0],
  [waggle.id, typescript.id, 'uses', 1.0],
  [waggle.id, tauri.id, 'uses', 1.0],
  [waggle.id, sqlite.id, 'uses', 1.0],
  [waggle.id, fastify.id, 'uses', 1.0],
  [waggle.id, clerk.id, 'uses', 0.9],
  [waggle.id, stripe.id, 'will_use', 0.7],
  [memoryMcp.id, mcp.id, 'implements', 1.0],

  // Concepts
  [wikiCompiler.id, hiveMind.id, 'implements', 1.0],
  [waggle.id, memoryHarvest.id, 'provides', 1.0],
  [waggle.id, aiAct.id, 'complies_with', 0.8],
  [waggle.id, tierStrategy.id, 'follows', 1.0],
];

let relationsCreated = 0;
for (const [srcId, tgtId, type, confidence] of relations) {
  try {
    kg.createRelation(srcId, tgtId, type, confidence);
    relationsCreated++;
  } catch { /* may already exist */ }
}

console.log(`   ✅ Created ${relationsCreated} relations`);

// ── Step 6: Summary ───────────────────────────────────────────────

const finalStats = frameStore.getStats();
const entityCount = kg.getEntityCount();

console.log('\n📊 Final State:');
console.log(`   Frames: ${finalStats.total} (by type: I=${finalStats.byType['I'] ?? 0}, P=${finalStats.byType['P'] ?? 0})`);
console.log(`   Entities: ${entityCount}`);
console.log(`   Workspaces: ${wsManager.list().length}`);
console.log(`   Identity: ${identity.exists() ? '✅ configured' : '❌ missing'}`);

// Verify wiki tables exist
try {
  const compilationState = new CompilationState(db);
  const wm = compilationState.getWatermark();
  console.log(`   Wiki watermark: frame #${wm.lastFrameId}`);
} catch (err) {
  console.log(`   Wiki state: not initialized yet`);
}

console.log('\n✅ Real data seeded successfully!');
console.log('   Next: harvest Claude Code memories, then compile wiki.\n');

db.close();
