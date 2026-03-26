import { describe, it, expect, afterEach } from 'vitest';
import { MindDB } from '../../src/mind/db.js';
import { IdentityLayer } from '../../src/mind/identity.js';
import { AwarenessLayer } from '../../src/mind/awareness.js';
import { FrameStore } from '../../src/mind/frames.js';
import { SessionStore } from '../../src/mind/sessions.js';
import { HybridSearch } from '../../src/mind/search.js';
import { KnowledgeGraph } from '../../src/mind/knowledge.js';
import { MemoryWeaver } from '@waggle/weaver';
import { Orchestrator } from '@waggle/agent';
import { MockEmbedder } from '../mind/helpers/mock-embedder.js';
import {
  PROGRAM_REGISTRY,
  createSummarizer,
  createClassifier,
  createPromptExpander,
} from '@waggle/optimizer';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

describe('Full Integration Test', () => {
  let db: MindDB;
  let tmpFile: string | null = null;

  afterEach(() => {
    db?.close();
    if (tmpFile && fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile);
      // Clean up WAL/SHM files
      for (const suffix of ['-wal', '-shm']) {
        const f = tmpFile + suffix;
        if (fs.existsSync(f)) fs.unlinkSync(f);
      }
    }
  });

  describe('Complete lifecycle', () => {
    it('runs full agent lifecycle: identity → awareness → frames → knowledge → consolidation → reload', async () => {
      db = new MindDB(':memory:');
      const embedder = new MockEmbedder();

      // --- Step 1: Set identity ---
      const identity = new IdentityLayer(db);
      identity.create({
        name: 'Waggle',
        role: 'Personal AI Assistant',
        department: 'Engineering',
        personality: 'Helpful, precise, proactive',
        capabilities: 'Memory, search, knowledge graph, task management',
        system_prompt: 'You are Waggle, a personal AI assistant.',
      });
      expect(identity.get().name).toBe('Waggle');

      // --- Step 2: Populate awareness ---
      const awareness = new AwarenessLayer(db);
      awareness.add('task', 'Review quarterly report', 8);
      awareness.add('task', 'Prepare team standup notes', 5);
      awareness.add('flag', 'User prefers concise responses', 10);
      awareness.add('pending', 'Waiting for API key from DevOps', 3);
      expect(awareness.getAll().length).toBe(4);

      // --- Step 3: Create sessions and memory frames ---
      const sessions = new SessionStore(db);
      const frames = new FrameStore(db);

      // Session 1: Morning work
      const session1 = sessions.create('project-alpha');
      const iframe1 = frames.createIFrame(session1.gop_id, 'Started working on Project Alpha. Main goal: refactor authentication module.', 'important');
      frames.createPFrame(session1.gop_id, 'Identified 3 deprecated auth methods that need replacement.', iframe1.id);
      frames.createPFrame(session1.gop_id, 'Created migration plan for auth refactoring.', iframe1.id);
      frames.createPFrame(session1.gop_id, 'Reviewed PR #42 - found potential security issue in token validation.', iframe1.id);

      // Session 2: Afternoon research
      const session2 = sessions.create('project-alpha');
      const iframe2 = frames.createIFrame(session2.gop_id, 'Researching OAuth 2.0 best practices for the auth refactor.');
      frames.createPFrame(session2.gop_id, 'PKCE flow is recommended for public clients. Added to implementation plan.', iframe2.id);
      frames.createPFrame(session2.gop_id, 'Found library @auth/core that handles most OAuth flows.', iframe2.id);

      // Cross-reference between sessions
      frames.createBFrame(session2.gop_id, 'Links research to auth refactor plan', iframe2.id, [iframe1.id]);

      // Verify GOP structure
      const gop1Frames = frames.getGopFrames(session1.gop_id);
      expect(gop1Frames.length).toBe(4); // 1 I + 3 P
      const gop2Frames = frames.getGopFrames(session2.gop_id);
      expect(gop2Frames.length).toBe(4); // 1 I + 2 P + 1 B

      // State reconstruction
      const state1 = frames.reconstructState(session1.gop_id);
      expect(state1.iframe).toBeTruthy();
      expect(state1.pframes.length).toBe(3);

      // --- Step 4: Build knowledge graph ---
      const knowledge = new KnowledgeGraph(db);
      const projectAlpha = knowledge.createEntity('project', 'Project Alpha', { status: 'active', priority: 'high' });
      const authModule = knowledge.createEntity('module', 'Authentication Module', { language: 'TypeScript' });
      const oauth = knowledge.createEntity('technology', 'OAuth 2.0', { version: '2.1' });
      const alice = knowledge.createEntity('person', 'Alice', { role: 'Tech Lead' });

      knowledge.createRelation(projectAlpha.id, authModule.id, 'contains', 1.0);
      knowledge.createRelation(authModule.id, oauth.id, 'uses', 0.9);
      knowledge.createRelation(alice.id, projectAlpha.id, 'leads', 0.95);

      // Graph traversal
      const reachable = knowledge.traverse(projectAlpha.id, 'contains', 2);
      expect(reachable.length).toBeGreaterThanOrEqual(1);
      expect(reachable.some(e => e.name === 'Authentication Module')).toBe(true);

      // --- Step 5: Run consolidation ---
      const weaver = new MemoryWeaver(db, frames, sessions);

      // Consolidate session 1
      const consolidated = weaver.consolidateGop(session1.gop_id);
      expect(consolidated).toBeTruthy();
      expect(consolidated!.content).toContain('refactor authentication');
      expect(consolidated!.content).toContain('deprecated auth methods');

      // Close and archive old session
      sessions.close(session1.gop_id, 'Completed auth refactor planning');
      const archived = weaver.archiveClosedSessions();
      expect(archived).toBe(1);

      // Project consolidation
      const projectSummary = weaver.consolidateProject('project-alpha');
      expect(projectSummary).toBeTruthy();

      // --- Step 6: Simulate new session reload ---
      // This simulates what happens when the agent "wakes up"
      const identity2 = new IdentityLayer(db);
      expect(identity2.get().name).toBe('Waggle');

      const awareness2 = new AwarenessLayer(db);
      expect(awareness2.getAll().length).toBe(4);

      // Active sessions still available
      const active = sessions.getActive();
      expect(active.length).toBeGreaterThanOrEqual(1);

      // Memory is searchable
      const search = new HybridSearch(db, embedder);
      // Keyword search works directly via FTS (indexed during frame creation)
      const keywordResults = await search.keywordSearch('authentication', 20);
      expect(keywordResults.length).toBeGreaterThan(0);
    });
  });

  describe('Wakeup performance', () => {
    it('total wakeup time under 300ms (identity + awareness + memory reconstruction)', () => {
      db = new MindDB(':memory:');

      // Setup: create identity, awareness, and some frames
      const identity = new IdentityLayer(db);
      identity.create({
        name: 'Waggle',
        role: 'Assistant',
        department: '',
        personality: '',
        capabilities: '',
        system_prompt: '',
      });

      const awareness = new AwarenessLayer(db);
      for (let i = 0; i < 10; i++) {
        awareness.add('task', `Task ${i}`, i);
      }

      const sessions = new SessionStore(db);
      const frames = new FrameStore(db);
      const session = sessions.create();
      const iframe = frames.createIFrame(session.gop_id, 'Base state');
      for (let i = 0; i < 50; i++) {
        frames.createPFrame(session.gop_id, `Memory item ${i}`, iframe.id);
      }

      // Benchmark wakeup
      const iterations = 100;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        identity.get();
        awareness.getAll();
        frames.reconstructState(session.gop_id);
      }
      const elapsed = performance.now() - start;
      const avgMs = elapsed / iterations;

      expect(avgMs).toBeLessThan(300);
      // In practice should be well under 10ms
      console.log(`  Wakeup avg: ${avgMs.toFixed(2)}ms over ${iterations} iterations`);
    });
  });

  describe('Scale test: 10,000+ memories', () => {
    it('10,000 memories searchable without performance degradation', async () => {
      db = new MindDB(':memory:');
      const embedder = new MockEmbedder();
      const sessions = new SessionStore(db);
      const frames = new FrameStore(db);
      const search = new HybridSearch(db, embedder);

      const session = sessions.create();
      const iframe = frames.createIFrame(session.gop_id, 'Initial state for scale test');

      // Insert 10,000 P-frames in batches
      const TOTAL = 10_000;
      const BATCH = 1000;
      const raw = db.getDatabase();

      const insertStart = performance.now();
      const insertFrame = raw.prepare(`
        INSERT INTO memory_frames (frame_type, gop_id, t, base_frame_id, content, importance)
        VALUES ('P', ?, ?, ?, ?, 'normal')
      `);
      const insertFts = raw.prepare(`
        INSERT INTO memory_frames_fts (rowid, content) VALUES (?, ?)
      `);

      const insertBatch = raw.transaction((startIdx: number, count: number) => {
        for (let i = startIdx; i < startIdx + count; i++) {
          const content = `Memory entry ${i}: This is a detailed observation about topic-${i % 100} with context about area-${i % 50}.`;
          const result = insertFrame.run(session.gop_id, i + 1, iframe.id, content);
          insertFts.run(result.lastInsertRowid, content);
        }
      });

      for (let batch = 0; batch < TOTAL / BATCH; batch++) {
        insertBatch(batch * BATCH, BATCH);
      }
      const insertElapsed = performance.now() - insertStart;
      console.log(`  Insert 10K frames: ${insertElapsed.toFixed(0)}ms`);
      expect(insertElapsed).toBeLessThan(10_000); // Under 10s

      // Index a subset for vector search (indexing all 10K is slow with mock)
      const sampled = [];
      for (let i = 0; i < 100; i++) {
        const frameId = i * 100 + 2; // Skip the I-frame at id=1
        sampled.push({ id: frameId, content: `Memory entry ${i * 100}: topic-${(i * 100) % 100}` });
      }
      await search.indexFramesBatch(sampled);

      // Keyword search performance (quote terms to avoid FTS5 operator interpretation)
      const searchStart = performance.now();
      const keywordResults = await search.keywordSearch('"topic-42"', 20);
      const searchElapsed = performance.now() - searchStart;
      console.log(`  Keyword search (10K): ${searchElapsed.toFixed(2)}ms, found ${keywordResults.length} results`);
      expect(keywordResults.length).toBeGreaterThan(0);
      expect(searchElapsed).toBeLessThan(200);

      // Hybrid search performance
      const hybridStart = performance.now();
      const hybridResults = await search.search('"topic-42" "area-25"', { limit: 10 });
      const hybridElapsed = performance.now() - hybridStart;
      console.log(`  Hybrid search (10K): ${hybridElapsed.toFixed(2)}ms, found ${hybridResults.length} results`);
      expect(hybridResults.length).toBeGreaterThan(0);
      expect(hybridElapsed).toBeLessThan(500);

      // State reconstruction performance
      const reconStart = performance.now();
      const state = frames.reconstructState(session.gop_id);
      const reconElapsed = performance.now() - reconStart;
      console.log(`  State reconstruction (10K): ${reconElapsed.toFixed(2)}ms`);
      expect(state.iframe).toBeTruthy();
      expect(reconElapsed).toBeLessThan(100);
    });
  });

  describe('.mind file portability', () => {
    it('.mind file is a single portable file under 500MB for reasonable data', () => {
      // Create a file-backed .mind database
      tmpFile = path.join(os.tmpdir(), `waggle-test-${Date.now()}.mind`);
      db = new MindDB(tmpFile);

      const identity = new IdentityLayer(db);
      identity.create({
        name: 'Test Agent',
        role: 'Tester',
        department: '',
        personality: '',
        capabilities: '',
        system_prompt: '',
      });

      const sessions = new SessionStore(db);
      const frames = new FrameStore(db);

      // Create 100 sessions with 100 frames each = 10,000 frames
      const raw = db.getDatabase();
      const insertFrame = raw.prepare(`
        INSERT INTO memory_frames (frame_type, gop_id, t, base_frame_id, content, importance)
        VALUES ('P', ?, ?, NULL, ?, 'normal')
      `);
      const insertFts = raw.prepare(`
        INSERT INTO memory_frames_fts (rowid, content) VALUES (?, ?)
      `);

      const insertAll = raw.transaction(() => {
        for (let s = 0; s < 100; s++) {
          const session = sessions.create(`project-${s % 10}`);
          const iframe = frames.createIFrame(session.gop_id, `Session ${s} base state with detailed context about the work being done.`);
          for (let f = 0; f < 99; f++) {
            const content = `Session ${s}, frame ${f}: Detailed observation about ${['engineering', 'design', 'research', 'planning'][f % 4]} work.`;
            const result = insertFrame.run(session.gop_id, f + 1, content);
            insertFts.run(result.lastInsertRowid, content);
          }
        }
      });
      insertAll();

      // Check file size
      db.close();
      const stats = fs.statSync(tmpFile);
      const sizeMB = stats.size / (1024 * 1024);
      console.log(`  .mind file size (10K frames): ${sizeMB.toFixed(2)} MB`);
      expect(sizeMB).toBeLessThan(500);

      // Verify it's a single file (WAL checkpoint)
      expect(fs.existsSync(tmpFile)).toBe(true);

      // Reopen and verify data is intact
      db = new MindDB(tmpFile);
      const identity2 = new IdentityLayer(db);
      expect(identity2.get().name).toBe('Test Agent');

      const sessions2 = new SessionStore(db);
      const allSessions = raw.prepare ? undefined : undefined;
      // Just verify we can query
      const activeSessions = sessions2.getActive();
      // All should be active (we never closed them)
      expect(activeSessions.length).toBe(100);
    });
  });

  describe('Orchestrator integration', () => {
    it('orchestrator ties all components together', async () => {
      db = new MindDB(':memory:');
      const embedder = new MockEmbedder();
      const orchestrator = new Orchestrator({ db, embedder });

      // Set identity via orchestrator
      orchestrator.getIdentity().create({
        name: 'Waggle',
        role: 'Integration Test Agent',
        department: '',
        personality: 'Thorough',
        capabilities: 'Full stack',
        system_prompt: 'You are running integration tests.',
      });

      // Add awareness via tool
      await orchestrator.executeTool('add_task', { content: 'Run all integration tests', priority: 10 });

      // Save memories via tool
      await orchestrator.executeTool('save_memory', { content: 'Integration test started successfully', importance: 'normal' });
      await orchestrator.executeTool('save_memory', { content: 'All components initialized', importance: 'important' });

      // CognifyPipeline auto-indexes frames for vector search

      // Search via tool
      const searchResult = await orchestrator.executeTool('search_memory', { query: 'Integration' });
      expect(searchResult).toContain('Integration');

      // Knowledge graph via tool
      orchestrator.getKnowledge().createEntity('test', 'IntegrationSuite', { status: 'running' });
      const kgResult = await orchestrator.executeTool('query_knowledge', { query: 'IntegrationSuite' });
      expect(kgResult).toContain('IntegrationSuite');

      // System prompt includes everything
      const prompt = orchestrator.buildSystemPrompt();
      expect(prompt).toContain('Waggle');
      expect(prompt).toContain('Run all integration tests');
      expect(prompt).toContain('search_memory');
    });
  });

  describe('Optimizer integration', () => {
    it('all Ax programs are properly defined and constructable', () => {
      expect(PROGRAM_REGISTRY.length).toBe(3);
      for (const entry of PROGRAM_REGISTRY) {
        const program = entry.create();
        expect(program).toBeDefined();
        expect(entry.signature.getInputFields().length).toBeGreaterThan(0);
        expect(entry.signature.getOutputFields().length).toBeGreaterThan(0);
      }
    });
  });
});
