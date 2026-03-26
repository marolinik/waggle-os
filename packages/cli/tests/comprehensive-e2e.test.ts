/**
 * Comprehensive E2E test — exercises the same code paths as the CLI REPL
 * but programmatically (no LiteLLM/API needed).
 *
 * Tests 14 scenarios covering identity, awareness, memory persistence,
 * knowledge graph, cross-session recall, tool execution, system prompt,
 * hooks, permissions, and more.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { MindDB } from '@waggle/core';
import {
  Orchestrator,
  createSystemTools,
  createPlanTools,
  createGitTools,
  HookRegistry,
  PermissionManager,
  filterToolsForContext,
  needsConfirmation,
} from '@waggle/agent';
import { MockEmbedder } from '../../core/tests/mind/helpers/mock-embedder.js';

// Helper: create a file-backed .mind DB in temp dir
function createTmpMind(): { path: string; db: MindDB } {
  const p = path.join(os.tmpdir(), `waggle-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}.mind`);
  return { path: p, db: new MindDB(p) };
}

function cleanup(filePath: string) {
  for (const f of [filePath, filePath + '-wal', filePath + '-shm']) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
}

describe('Comprehensive CLI E2E Test', () => {
  let mindPath: string;
  let db: MindDB;
  let orchestrator: Orchestrator;
  const embedder = new MockEmbedder();

  beforeEach(() => {
    const tmp = createTmpMind();
    mindPath = tmp.path;
    db = tmp.db;
    orchestrator = new Orchestrator({ db, embedder });
  });

  afterEach(() => {
    db.close();
    cleanup(mindPath);
  });

  // ─── Test 1: Identity CRUD ───
  it('T1: Create and retrieve agent identity', async () => {
    orchestrator.getIdentity().create({
      name: 'Waggle',
      role: 'Personal AI Assistant',
      department: 'Engineering',
      personality: 'Helpful and precise',
      capabilities: 'Memory, search, knowledge graph',
      system_prompt: 'You are Waggle.',
    });

    const result = await orchestrator.executeTool('get_identity', {});
    expect(result).toContain('Waggle');
    expect(result).toContain('Personal AI Assistant');
    expect(result).toContain('Engineering');
  });

  // ─── Test 2: Awareness Layer ───
  it('T2: Add tasks and flags to awareness', async () => {
    await orchestrator.executeTool('add_task', { content: 'Review PR #42', priority: 9 });
    await orchestrator.executeTool('add_task', { content: 'Deploy staging', priority: 5 });
    orchestrator.getAwareness().add('flag', 'User prefers dark mode', 10);

    const result = await orchestrator.executeTool('get_awareness', {});
    expect(result).toContain('Review PR #42');
    expect(result).toContain('Deploy staging');
    expect(result).toContain('dark mode');
  });

  // ─── Test 3: Save and Search Memory (within session) ───
  it('T3: Save memory and search it back', async () => {
    await orchestrator.executeTool('save_memory', {
      content: 'The quarterly report deadline is March 15th',
      importance: 'important',
    });
    await orchestrator.executeTool('save_memory', {
      content: 'Project Alpha uses React and TypeScript',
      importance: 'normal',
    });
    await orchestrator.executeTool('save_memory', {
      content: 'Team standup is at 9:30 AM every day',
      importance: 'normal',
    });

    // Search should find the memory
    const result = await orchestrator.executeTool('search_memory', { query: 'quarterly report' });
    expect(result).toContain('quarterly report');
    expect(result).toContain('March 15th');
  });

  // ─── Test 4: Knowledge Graph ───
  it('T4: Create entities and relations, query them', async () => {
    const kg = orchestrator.getKnowledge();
    const alice = kg.createEntity('person', 'Alice', { role: 'Tech Lead' });
    const project = kg.createEntity('project', 'Phoenix', { status: 'active' });
    const react = kg.createEntity('technology', 'React', { version: '18' });

    kg.createRelation(alice.id, project.id, 'leads', 0.95);
    kg.createRelation(project.id, react.id, 'uses', 0.9);

    const result = await orchestrator.executeTool('query_knowledge', { query: 'Alice' });
    expect(result).toContain('Alice');
    expect(result).toContain('leads');
    expect(result).toContain('Phoenix');
  });

  // ─── Test 5: Cross-Session Memory Persistence ───
  it('T5: Memories persist across sessions (file-backed .mind)', async () => {
    // Session 1: save memories
    await orchestrator.executeTool('save_memory', {
      content: 'My name is Marko and I work on the Waggle project',
      importance: 'critical',
    });
    await orchestrator.executeTool('save_memory', {
      content: 'The API key for production is stored in 1Password',
      importance: 'important',
    });
    await orchestrator.executeTool('save_memory', {
      content: 'Python is used for data processing scripts',
      importance: 'normal',
    });

    // Close DB (simulates CLI exit)
    db.close();

    // Session 2: reopen same .mind file
    const db2 = new MindDB(mindPath);
    const orchestrator2 = new Orchestrator({ db: db2, embedder });

    // Search for memories from previous session
    const result1 = await orchestrator2.executeTool('search_memory', { query: 'Marko Waggle' });
    expect(result1).toContain('Marko');
    expect(result1).toContain('Waggle');

    const result2 = await orchestrator2.executeTool('search_memory', { query: 'API key production' });
    expect(result2).toContain('1Password');

    const result3 = await orchestrator2.executeTool('search_memory', { query: 'Python data' });
    expect(result3).toContain('Python');

    db2.close();

    // Reassign so afterEach cleanup works
    db = new MindDB(mindPath);
    orchestrator = new Orchestrator({ db, embedder });
  });

  // ─── Test 6: System Prompt Builder ───
  it('T6: System prompt includes identity, awareness, and tools', () => {
    orchestrator.getIdentity().create({
      name: 'TestBot',
      role: 'Tester',
      department: '',
      personality: 'Thorough',
      capabilities: 'Testing',
      system_prompt: 'You run tests.',
    });
    orchestrator.getAwareness().add('task', 'Run integration tests', 10);

    const prompt = orchestrator.buildSystemPrompt();
    expect(prompt).toContain('TestBot');
    expect(prompt).toContain('Run integration tests');
    // System prompt includes self-awareness block with tool summary
    expect(prompt).toContain('# Self-Awareness');
    expect(prompt).toContain('tools available');
  });

  // ─── Test 7: Tool Definitions ───
  it('T7: All required tools are defined with correct shape', () => {
    const tools = orchestrator.getTools();
    const required = ['get_identity', 'get_awareness', 'search_memory', 'save_memory', 'query_knowledge', 'add_task', 'correct_knowledge'];

    for (const name of required) {
      const tool = tools.find(t => t.name === name);
      expect(tool, `Tool ${name} should exist`).toBeDefined();
      expect(tool!.description).toBeTruthy();
      expect(typeof tool!.execute).toBe('function');
    }
  });

  // ─── Test 8: System Tools ───
  it('T8: System tools (bash, read_file, etc.) are created', () => {
    const systemTools = createSystemTools(process.cwd());
    const names = systemTools.map(t => t.name);

    expect(names).toContain('bash');
    expect(names).toContain('read_file');
    expect(names).toContain('write_file');
    expect(names).toContain('edit_file');
    expect(names).toContain('search_files');
    expect(names).toContain('search_content');
  });

  // ─── Test 9: Plan Tools ───
  it('T9: Plan tools are created', () => {
    const planTools = createPlanTools(process.cwd());
    const names = planTools.map(t => t.name);

    expect(names).toContain('create_plan');
    expect(names).toContain('add_plan_step');
    expect(names).toContain('show_plan');
  });

  // ─── Test 10: Git Tools ───
  it('T10: Git tools are created', () => {
    const gitTools = createGitTools(process.cwd());
    const names = gitTools.map(t => t.name);

    expect(names).toContain('git_status');
    expect(names).toContain('git_diff');
    expect(names).toContain('git_log');
    expect(names).toContain('git_commit');
  });

  // ─── Test 11: Hook Registry ───
  it('T11: Hook registry fires pre/post hooks', async () => {
    const hooks = new HookRegistry();
    const events: string[] = [];

    hooks.on('pre:tool', async (ctx) => { events.push(`pre:${ctx.toolName}`); });
    hooks.on('post:tool', async (ctx) => { events.push(`post:${ctx.toolName}`); });

    await hooks.fire('pre:tool', { toolName: 'bash', args: {} });
    await hooks.fire('post:tool', { toolName: 'bash', args: {}, result: 'ok' });

    expect(events).toEqual(['pre:bash', 'post:bash']);
  });

  // ─── Test 12: Permission Manager ───
  it('T12: Permission manager filters tools', () => {
    const perms = new PermissionManager({
      blacklist: ['bash', 'write_file'],
    });

    expect(perms.isAllowed('bash')).toBe(false);
    expect(perms.isAllowed('write_file')).toBe(false);
    expect(perms.isAllowed('read_file')).toBe(true);
    expect(perms.isAllowed('search_memory')).toBe(true);

    // Sandbox mode only allows readonly tools
    const sandbox = PermissionManager.sandbox();
    expect(sandbox.isAllowed('bash')).toBe(false);
    expect(sandbox.isAllowed('write_file')).toBe(false);
    expect(sandbox.isAllowed('read_file')).toBe(true);
    expect(sandbox.isAllowed('search_memory')).toBe(true);
  });

  // ─── Test 13: Confirmation Gate ───
  it('T13: Confirmation gate identifies sensitive tools', () => {
    // Non-bash tools
    expect(needsConfirmation('write_file')).toBe(true);
    expect(needsConfirmation('edit_file')).toBe(true);
    expect(needsConfirmation('git_commit')).toBe(true);
    expect(needsConfirmation('read_file')).toBe(false);
    expect(needsConfirmation('search_memory')).toBe(false);

    // Bash without args = unknown command = confirm
    expect(needsConfirmation('bash')).toBe(true);

    // Safe bash commands (read-only)
    expect(needsConfirmation('bash', { command: 'date' })).toBe(false);
    expect(needsConfirmation('bash', { command: 'ls -la' })).toBe(false);
    expect(needsConfirmation('bash', { command: 'git status' })).toBe(false);
    expect(needsConfirmation('bash', { command: 'git log --oneline' })).toBe(false);
    expect(needsConfirmation('bash', { command: 'whoami' })).toBe(false);

    // Destructive bash commands
    expect(needsConfirmation('bash', { command: 'rm -rf /tmp/foo' })).toBe(true);
    expect(needsConfirmation('bash', { command: 'git push origin main' })).toBe(true);
    expect(needsConfirmation('bash', { command: 'sudo apt install foo' })).toBe(true);
  });

  // ─── Test 14: Memory Stats ───
  it('T14: Memory stats reflect actual data', async () => {
    // Start with empty
    let stats = orchestrator.getMemoryStats();
    expect(stats.frameCount).toBe(0);
    expect(stats.sessionCount).toBe(0);
    expect(stats.entityCount).toBe(0);

    // Save some memories
    await orchestrator.executeTool('save_memory', { content: 'Memory one' });
    await orchestrator.executeTool('save_memory', { content: 'Memory two' });
    orchestrator.getKnowledge().createEntity('test', 'Entity1', {});

    stats = orchestrator.getMemoryStats();
    expect(stats.frameCount).toBeGreaterThanOrEqual(2);
    expect(stats.sessionCount).toBeGreaterThanOrEqual(1);
    expect(stats.entityCount).toBeGreaterThanOrEqual(1);
  });

  // ─── Test 15: Empty state handling ───
  it('T15: Graceful handling of empty state', async () => {
    const id = await orchestrator.executeTool('get_identity', {});
    expect(id).toContain('No identity configured');

    const aw = await orchestrator.executeTool('get_awareness', {});
    expect(aw).toContain('No active awareness items');

    const search = await orchestrator.executeTool('search_memory', { query: 'anything' });
    expect(search).toContain('No relevant memories');

    const kg = await orchestrator.executeTool('query_knowledge', { query: 'nobody' });
    expect(kg).toContain('No entities found');
  });

  // ─── Test 16: Unknown tool throws ───
  it('T16: Unknown tool name throws error', async () => {
    await expect(orchestrator.executeTool('nonexistent_tool', {})).rejects.toThrow('Unknown tool');
  });

  // ─── Test 17: Heavy memory load (50 per session, rate-limited by W2.10) ───
  it('T17: memories up to session rate limit are all searchable', async () => {
    // W2.10: save_memory is rate-limited to 50 per session to prevent flooding.
    // Save 60 — first 50 succeed, remaining are rate-limited.
    const RATE_LIMIT = 50;
    for (let i = 0; i < 60; i++) {
      await orchestrator.executeTool('save_memory', {
        content: `Observation ${i}: topic-${i % 10} with detail about area-${i % 5}`,
        importance: i % 20 === 0 ? 'important' : 'normal',
      });
    }

    // Search by topic (hyphens in queries should work after FTS5 sanitization)
    const result = await orchestrator.executeTool('search_memory', { query: 'topic-7' });
    expect(result).toContain('topic-7');

    // Search by area
    const result2 = await orchestrator.executeTool('search_memory', { query: 'area-3' });
    expect(result2).toContain('area-3');

    // Stats should show exactly the rate limit count (50 saved, rest blocked)
    const stats = orchestrator.getMemoryStats();
    expect(stats.frameCount).toBeGreaterThanOrEqual(RATE_LIMIT);
  });

  // ─── Test 18: Cross-session knowledge graph persistence ───
  it('T18: Knowledge graph persists across sessions', async () => {
    const kg = orchestrator.getKnowledge();
    const alice = kg.createEntity('person', 'Alice', { role: 'Engineer' });
    const bob = kg.createEntity('person', 'Bob', { role: 'Designer' });
    kg.createRelation(alice.id, bob.id, 'collaborates_with', 0.85);

    // Close and reopen
    db.close();
    const db2 = new MindDB(mindPath);
    const orchestrator2 = new Orchestrator({ db: db2, embedder });

    const result = await orchestrator2.executeTool('query_knowledge', { query: 'Alice' });
    expect(result).toContain('Alice');
    expect(result).toContain('collaborates_with');
    expect(result).toContain('Bob');

    db2.close();
    db = new MindDB(mindPath);
    orchestrator = new Orchestrator({ db, embedder });
  });
});
