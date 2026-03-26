/**
 * Real session simulation.
 *
 * Part 1: Populate the .mind file with actual project context
 *         from today's work session (M3c completion, bug fixes, test improvements).
 *
 * Part 2: Cold-start a new orchestrator and query it —
 *         what does the agent actually know?
 *
 * Uses the real ~/.waggle/default.mind file, not a temp file.
 */
import { MindDB } from '@waggle/core';
import { Orchestrator } from '@waggle/agent';
import { MockEmbedder } from '../../core/tests/mind/helpers/mock-embedder.js';
import * as fs from 'node:fs';

const MIND_PATH = 'C:/Users/MarkoMarkovic/.waggle/default.mind';

// ═══════════════════════════════════════════════════════════════════
// PART 1: Populate with real project context
// ═══════════════════════════════════════════════════════════════════

async function populateSession() {
  console.log('\n═══ SESSION 1: Loading real project context ═══\n');

  const db = new MindDB(MIND_PATH);
  const embedder = new MockEmbedder();
  const orch = new Orchestrator({ db, embedder });

  // --- Identity ---
  orch.getIdentity().create({
    name: 'Waggle',
    role: 'Senior Engineering Assistant',
    department: 'Waggle Platform Team',
    personality: 'Direct, thorough, remembers everything. Never guesses — uses tools to find answers.',
    capabilities: 'Memory (search_memory, save_memory), knowledge graph (query_knowledge), system tools (bash, read_file, write_file, edit_file, search_files, search_content), git tools, plan tools. Persistent .mind file stores everything across sessions.',
    system_prompt: 'You are Waggle, a senior engineering assistant for Marko Markovic. You help build the Waggle platform — a personal AI agent swarm for every knowledge worker. You have persistent memory in a .mind file. Always search memory before answering questions about the project.',
  });

  // --- Awareness: current state ---
  orch.getAwareness().add('flag', 'User: Marko Markovic, Windows 11, prefers direct communication, not deeply technical', 10);
  orch.getAwareness().add('flag', 'Project: Waggle — personal AI agent swarm platform. Open core, $9-15/user/mo Pro tier.', 10);
  orch.getAwareness().add('flag', 'Codebase: D:\\Projects\\MS Claw\\waggle-poc (monorepo, 11 packages, GitHub: marolinik/waggle)', 10);
  orch.getAwareness().add('flag', 'Tech stack: Node.js, TypeScript, better-sqlite3, Vitest, Fastify, Drizzle, BullMQ, Clerk', 8);
  orch.getAwareness().add('task', 'NEXT: M4 — Tauri 2.0 desktop app (Windows first)', 9);
  orch.getAwareness().add('task', 'THEN: M5 — Web app', 7);
  orch.getAwareness().add('task', 'LATER: Agent intelligence polish (system prompt, context management, smart tool use)', 6);

  // --- Milestone history ---
  await orch.executeTool('save_memory', {
    content: 'Milestone M0 (POC): COMPLETE. Scientific validation of all core components — .mind file, memory frames, knowledge graph, hybrid search, memory weaver, optimizer.',
    importance: 'important',
  });
  await orch.executeTool('save_memory', {
    content: 'Milestone M1 (MVP Desktop App): COMPLETE. Basic Tauri app, 11 tasks. Proved the desktop concept.',
    importance: 'important',
  });
  await orch.executeTool('save_memory', {
    content: 'Milestone M2 (Developer Platform): COMPLETE. 232 tests, 6 packages — @waggle/core, @waggle/agent, @waggle/optimizer, @waggle/weaver, @waggle/cli, @waggle/sdk. CLI with REPL, model router, config system, plugin system, skill SDK.',
    importance: 'important',
  });
  await orch.executeTool('save_memory', {
    content: 'Milestone M3 (Team Pilot): COMPLETE. 417 tests, 5 new packages — @waggle/server (Fastify 5), @waggle/worker (BullMQ), @waggle/shared (Zod schemas), @waggle/admin-web (React), @waggle/waggle-dance (messaging). 16 Drizzle tables, Clerk auth, WebSocket gateway, role-based access, task board, cron scheduler, 3 daemon agents (Scout, Subconscious, Hive Mind).',
    importance: 'important',
  });
  await orch.executeTool('save_memory', {
    content: 'Milestone M3a (CLI→Server + Real LLM): COMPLETE. 475 tests. LiteLLM proxy for model-agnostic routing. System tools: bash, read_file, write_file, edit_file, search_files, search_content (Claude Code parity). Shared runAgentLoop() in @waggle/agent. Browser OAuth via Clerk. Mode detection: auto local/team. Worker wired to real agent loop. Streaming via WebSocket.',
    importance: 'important',
  });

  // --- M3b and M3c (today's work) ---
  await orch.executeTool('save_memory', {
    content: 'Milestone M3b (Agent Intelligence): COMPLETE. Self-awareness module (agent knows its own tools, model, memory stats). Auto-identity on first run. CostTracker for token/cost tracking. HookRegistry for pre/post tool events. LoopGuard to detect infinite tool call loops. Eval framework with promptfoo-style test runner. LiteLLM embeddings integration.',
    importance: 'critical',
  });
  await orch.executeTool('save_memory', {
    content: 'Milestone M3c (Agent Power): COMPLETE. 17 tasks. HookRegistry event system with cancel support. PermissionManager with whitelist/blacklist and sandbox mode. ConfirmationGate for sensitive tools (bash, write_file, edit_file, git_commit). Plan tools (create_plan, add_plan_step, show_plan). Git tools (git_status, git_diff, git_log, git_commit). Ontology layer for .mind schema. AuditTools for traceability. MemoryLinker for cross-frame references. FeedbackHandler for knowledge graph corrections.',
    importance: 'critical',
  });

  // --- Bug fixes from today ---
  await orch.executeTool('save_memory', {
    content: 'BUG FIX (critical): LiteLLM→Anthropic tool_calls format conversion was broken. Streaming tool call accumulation was missing type: "function" field, causing LiteLLM to drop assistant tool_use messages. Fix in packages/agent/src/agent-loop.ts. Also fixed content: null → content: "" when tool_calls present.',
    importance: 'important',
  });
  await orch.executeTool('save_memory', {
    content: 'BUG FIX (critical): Cross-session memory was completely broken. CognifyPipeline was never wired into Orchestrator — save_memory used raw frame creation without vector indexing. Fixed by wiring CognifyPipeline in Orchestrator constructor. Also added LIKE fallback scan in search_memory when hybrid search returns empty.',
    importance: 'important',
  });
  await orch.executeTool('save_memory', {
    content: 'BUG FIX: FTS5 query sanitization — queries with hyphens like "topic-7" crashed with SqliteError because FTS5 interpreted hyphens as NOT operator. Fixed in packages/core/src/mind/search.ts by auto-quoting each token. Try/catch fallback for FTS5 parse errors.',
    importance: 'important',
  });
  await orch.executeTool('save_memory', {
    content: 'BUG FIX: WS gateway Redis subscribe crash — join_team returned "Invalid message" when Redis PUBSUB call failed. Wrapped Redis subscribe in try/catch. Also fixed all test isolation issues: unique queue names for BullMQ, unique slugs/clerkIds, poll-based assertions instead of fixed sleeps.',
    importance: 'normal',
  });

  // --- Current test status ---
  await orch.executeTool('save_memory', {
    content: 'Test status after all fixes: 85 test files, 679 tests — ALL PASSING. Zero flaky tests. Key test files: packages/cli/tests/comprehensive-e2e.test.ts (18 tests), packages/cli/tests/memory-persistence-hard.test.ts (4 tests simulating 3 work sessions + cold start recall). Test suite runs in ~7 seconds.',
    importance: 'important',
  });

  // --- Architecture decisions ---
  await orch.executeTool('save_memory', {
    content: 'Architecture: .mind file is a single SQLite database (better-sqlite3) containing everything — memory frames, knowledge graph, identity, awareness, sessions, FTS5 index, sqlite-vec embeddings. Portable: copy the file = copy the brain. Format inspired by video codecs: I-frames (snapshots) + P-frames (deltas) + B-frames (cross-references).',
    importance: 'critical',
  });
  await orch.executeTool('save_memory', {
    content: 'Architecture: CognifyPipeline is the memory enrichment pipeline. When save_memory is called: (1) create P-frame in current session, (2) extract entities via regex patterns, (3) upsert entities into knowledge graph, (4) create relations between entities, (5) index frame for vector search via embeddings, (6) index in FTS5 for keyword search.',
    importance: 'important',
  });

  // --- What's missing / known issues ---
  await orch.executeTool('save_memory', {
    content: 'KNOWN GAPS: (1) No real embeddings in CLI — using MockEmbedder (deterministic hash), so semantic search does not work (color≠colour). Need LiteLLM embeddings endpoint. (2) No Memory Weaver daemon running — consolidation is manual. (3) No GraphContext integration yet — knowledge graph is basic, no SHACL validation. (4) Agent intelligence needs polish — system prompt is decent but not Claude Code level.',
    importance: 'important',
  });
  await orch.executeTool('save_memory', {
    content: 'DECISION: Build platforms first (M4 Tauri desktop, M5 web app), polish agent intelligence last. Reasoning: agent code is shared (@waggle/agent), improvements land everywhere at once. Can\'t know what "smart" means until real UX exists. Diminishing returns on agent tuning now vs compounding returns from having platforms.',
    importance: 'critical',
  });

  // --- Plan file locations ---
  await orch.executeTool('save_memory', {
    content: 'Plan documents location: D:\\Projects\\MS Claw\\docs\\plans\\. Key files: 2026-03-09-waggle-full-roadmap.md (master roadmap), 2026-03-06-waggle-poc-design.md (original POC design), 2026-03-09-waggle-m3b-implementation.md (M3b plan), 2026-03-09-waggle-m3c-implementation.md (M3c plan). Architecture visualization: D:\\Projects\\MS Claw\\waggle-architecture.html',
    importance: 'important',
  });

  // --- Knowledge graph ---
  const kg = orch.getKnowledge();
  const marko = kg.createEntity('person', 'Marko Markovic', { role: 'Founder & Tech Lead', platform: 'Windows 11' });
  const waggle = kg.createEntity('project', 'Waggle', { status: 'active', stage: 'M3c complete, M4 next', repo: 'marolinik/waggle', license: 'open-core' });
  const mindFile = kg.createEntity('technology', '.mind file', { format: 'SQLite', purpose: 'portable agent brain' });
  const litellm = kg.createEntity('technology', 'LiteLLM', { purpose: 'model-agnostic LLM routing', port: '4000' });
  const tauri = kg.createEntity('technology', 'Tauri 2.0', { purpose: 'desktop app framework', language: 'Rust + WebView2' });
  const core = kg.createEntity('package', '@waggle/core', { purpose: 'MindDB, identity, awareness, frames, sessions, search, knowledge graph' });
  const agent = kg.createEntity('package', '@waggle/agent', { purpose: 'Orchestrator, tools, agent loop, CognifyPipeline, hooks, permissions' });
  const cli = kg.createEntity('package', '@waggle/cli', { purpose: 'Interactive REPL, commands, rendering' });
  const server = kg.createEntity('package', '@waggle/server', { purpose: 'Fastify REST API, WebSocket gateway, Drizzle ORM' });
  const worker = kg.createEntity('package', '@waggle/worker', { purpose: 'BullMQ job processor, handler registry' });

  kg.createRelation(marko.id, waggle.id, 'founded', 1.0);
  kg.createRelation(waggle.id, mindFile.id, 'uses', 1.0);
  kg.createRelation(waggle.id, litellm.id, 'uses', 0.9);
  kg.createRelation(waggle.id, tauri.id, 'will_use', 0.8);
  kg.createRelation(waggle.id, core.id, 'contains', 1.0);
  kg.createRelation(waggle.id, agent.id, 'contains', 1.0);
  kg.createRelation(waggle.id, cli.id, 'contains', 1.0);
  kg.createRelation(waggle.id, server.id, 'contains', 1.0);
  kg.createRelation(waggle.id, worker.id, 'contains', 1.0);
  kg.createRelation(agent.id, core.id, 'depends_on', 1.0);
  kg.createRelation(cli.id, agent.id, 'depends_on', 1.0);

  const stats = orch.getMemoryStats();
  console.log(`Populated: ${stats.frameCount} frames, ${stats.sessionCount} sessions, ${stats.entityCount} entities`);
  db.close();
  console.log('Session 1 closed.\n');
}

// ═══════════════════════════════════════════════════════════════════
// PART 2: Cold start — what does the agent know?
// ═══════════════════════════════════════════════════════════════════

async function coldStartTest() {
  console.log('═══ SESSION 2: COLD START — Testing recall ═══\n');

  const db = new MindDB(MIND_PATH);
  const embedder = new MockEmbedder();
  const orch = new Orchestrator({ db, embedder });

  const tests: { name: string; query: string; tool: string; mustContain: string[] }[] = [
    {
      name: 'Who am I?',
      query: '',
      tool: 'get_identity',
      mustContain: ['Waggle', 'Senior Engineering Assistant'],
    },
    {
      name: 'What\'s the current state?',
      query: '',
      tool: 'get_awareness',
      mustContain: ['Marko', 'Waggle', 'M4'],
    },
    {
      name: 'What project are we building?',
      query: 'Waggle project what is it',
      tool: 'search_memory',
      mustContain: ['agent', 'waggle'],
    },
    {
      name: 'Which milestones are done?',
      query: 'milestones complete status',
      tool: 'search_memory',
      mustContain: ['COMPLETE'],
    },
    {
      name: 'What did we do in M3c?',
      query: 'M3c Agent Power tasks',
      tool: 'search_memory',
      mustContain: ['HookRegistry', 'Permission'],
    },
    {
      name: 'What bugs did we fix today?',
      query: 'bug fix critical today',
      tool: 'search_memory',
      mustContain: ['LiteLLM', 'tool_calls'],
    },
    {
      name: 'Why was cross-session memory broken?',
      query: 'cross-session memory broken CognifyPipeline',
      tool: 'search_memory',
      mustContain: ['CognifyPipeline', 'Orchestrator'],
    },
    {
      name: 'How many tests pass?',
      query: 'test status passing count',
      tool: 'search_memory',
      mustContain: ['679', 'PASSING'],
    },
    {
      name: 'What\'s the .mind file architecture?',
      query: '.mind file SQLite architecture portable',
      tool: 'search_memory',
      mustContain: ['SQLite', 'portable'],
    },
    {
      name: 'What\'s next after M3c?',
      query: 'next milestone M4 Tauri desktop',
      tool: 'search_memory',
      mustContain: ['Tauri', 'desktop'],
    },
    {
      name: 'Why polish agent last?',
      query: 'decision build platforms first polish agent last',
      tool: 'search_memory',
      mustContain: ['platforms first', 'shared'],
    },
    {
      name: 'What are the known gaps?',
      query: 'known gaps missing embeddings daemon',
      tool: 'search_memory',
      mustContain: ['MockEmbedder', 'semantic'],
    },
    {
      name: 'Where are the plan documents?',
      query: 'plan documents location roadmap',
      tool: 'search_memory',
      mustContain: ['docs\\plans', 'roadmap'],
    },
    {
      name: 'What packages does Waggle have? (knowledge graph)',
      query: 'Waggle',
      tool: 'query_knowledge',
      mustContain: ['@waggle/core', '@waggle/agent'],
    },
    {
      name: 'Who is Marko? (knowledge graph)',
      query: 'Marko',
      tool: 'query_knowledge',
      mustContain: ['Marko Markovic', 'founded'],
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    const args = test.tool === 'get_identity' || test.tool === 'get_awareness'
      ? {}
      : { query: test.query };

    const result = await orch.executeTool(test.tool, args);

    // Case-insensitive check across full result
    const resultLower = result.toLowerCase();
    const missing = test.mustContain.filter(s => !resultLower.includes(s.toLowerCase()));

    if (missing.length === 0) {
      console.log(`  ✓ ${test.name}`);
      passed++;
    } else {
      console.log(`  ✗ ${test.name}`);
      console.log(`    Missing: ${missing.join(', ')}`);
      console.log(`    Got (first 300): ${result.substring(0, 300)}...`);
      failed++;
    }
  }

  console.log(`\n═══ RESULTS: ${passed}/${tests.length} passed, ${failed} failed ═══`);

  // Show what the system prompt looks like on cold start
  console.log('\n═══ SYSTEM PROMPT (first 500 chars) ═══');
  const prompt = orch.buildSystemPrompt();
  console.log(prompt.substring(0, 500));
  console.log('...\n');

  const stats = orch.getMemoryStats();
  console.log(`Memory stats: ${stats.frameCount} frames, ${stats.sessionCount} sessions, ${stats.entityCount} entities`);

  db.close();
}

// ═══════════════════════════════════════════════════════════════════

async function main() {
  // Clean start
  for (const f of [MIND_PATH, MIND_PATH + '-wal', MIND_PATH + '-shm']) {
    try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch { /* ignore */ }
  }

  await populateSession();
  await coldStartTest();
}

main().catch(console.error);
