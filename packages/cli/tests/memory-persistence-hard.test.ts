/**
 * HARD memory persistence test.
 *
 * Simulates 3 real work sessions across a multi-day project,
 * then verifies a cold-start "session 4" can recall everything
 * that matters — not trivia, but the kind of context that makes
 * an assistant feel like it was there the whole time.
 *
 * This is the crown jewel test: .mind file = portable brain.
 */
import { describe, it, expect, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { MindDB } from '@waggle/core';
import { Orchestrator } from '@waggle/agent';
import { MockEmbedder } from '../../core/tests/mind/helpers/mock-embedder.js';

const MIND_PATH = path.join(os.tmpdir(), `waggle-hard-memory-${Date.now()}.mind`);
let lastDb: MindDB | null = null;

function cleanup() {
  lastDb?.close();
  lastDb = null;
  for (const f of [MIND_PATH, MIND_PATH + '-wal', MIND_PATH + '-shm']) {
    try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch { /* ignore */ }
  }
}

afterAll(cleanup);

describe('Hard Memory Persistence — Real Work Simulation', () => {
  const embedder = new MockEmbedder();

  // ═══════════════════════════════════════════════════════════════════
  // SESSION 1: Monday morning — project kickoff
  // ═══════════════════════════════════════════════════════════════════
  it('Session 1: Project kickoff — identity, decisions, architecture', async () => {
    const db = new MindDB(MIND_PATH);
    const orch = new Orchestrator({ db, embedder });

    // Set up identity
    orch.getIdentity().create({
      name: 'Waggle',
      role: 'Senior Engineering Assistant',
      department: 'Platform Team',
      personality: 'Thorough, opinionated, remembers everything',
      capabilities: 'Code review, architecture, memory, search, knowledge graph',
      system_prompt: 'You are Waggle, a senior engineering assistant for Marko.',
    });

    // User context
    orch.getAwareness().add('flag', 'User is Marko Markovic, prefers direct communication', 10);
    orch.getAwareness().add('flag', 'Project: Rewrite payment service from Python to Go', 10);
    orch.getAwareness().add('task', 'Design new payment service architecture', 9);
    orch.getAwareness().add('pending', 'Waiting for Stripe API credentials from DevOps (asked Alice)', 7);

    // Memories from the kickoff meeting
    await orch.executeTool('save_memory', {
      content: 'Architecture decision: Payment service will use Go with chi router, PostgreSQL, and connect to Stripe via their Go SDK. Rejected gRPC in favor of REST for simplicity. Team voted 4-1.',
      importance: 'critical',
    });
    await orch.executeTool('save_memory', {
      content: 'The current Python payment service handles 3 endpoints: POST /payments/charge, POST /payments/refund, GET /payments/:id. All must be preserved in the rewrite. The charge endpoint also calls an internal fraud-check service at http://fraud.internal:8080/check.',
      importance: 'critical',
    });
    await orch.executeTool('save_memory', {
      content: 'Alice (DevOps lead) said Stripe credentials will be in Vault at secret/data/stripe/production. She needs 2 business days. ETA: Wednesday.',
      importance: 'important',
    });
    await orch.executeTool('save_memory', {
      content: 'Marko raised concern about the fraud-check service being a single point of failure. Decision: implement circuit breaker with 5-second timeout, fallback to allowing the charge (business decision: false negatives are worse than false positives for fraud).',
      importance: 'critical',
    });
    await orch.executeTool('save_memory', {
      content: 'Database schema for payments table: id (uuid), amount_cents (bigint), currency (varchar(3)), stripe_charge_id (text), status (enum: pending/completed/failed/refunded), customer_id (uuid FK), created_at, updated_at. Using bigint for amount to avoid floating point issues.',
      importance: 'important',
    });

    // Knowledge graph — people and their roles
    const kg = orch.getKnowledge();
    const marko = kg.createEntity('person', 'Marko Markovic', { role: 'Tech Lead', preference: 'direct communication' });
    const alice = kg.createEntity('person', 'Alice Chen', { role: 'DevOps Lead', team: 'Infrastructure' });
    const bob = kg.createEntity('person', 'Bob Kumar', { role: 'Backend Engineer', expertise: 'Go' });
    const paymentSvc = kg.createEntity('service', 'payment-service', { language: 'Go', status: 'in-development', repo: 'github.com/acme/payment-service-go' });
    const fraudSvc = kg.createEntity('service', 'fraud-check-service', { url: 'http://fraud.internal:8080', owner: 'Risk Team' });
    const stripe = kg.createEntity('integration', 'Stripe', { sdk: 'stripe-go', env: 'production' });

    kg.createRelation(marko.id, paymentSvc.id, 'leads', 0.95);
    kg.createRelation(alice.id, paymentSvc.id, 'provides_infra', 0.9);
    kg.createRelation(bob.id, paymentSvc.id, 'implements', 0.9);
    kg.createRelation(paymentSvc.id, fraudSvc.id, 'depends_on', 1.0);
    kg.createRelation(paymentSvc.id, stripe.id, 'integrates', 1.0);

    db.close();
  });

  // ═══════════════════════════════════════════════════════════════════
  // SESSION 2: Tuesday — deep implementation work
  // ═══════════════════════════════════════════════════════════════════
  it('Session 2: Implementation day — code decisions, bugs found, PR reviews', async () => {
    const db = new MindDB(MIND_PATH);
    const orch = new Orchestrator({ db, embedder });

    await orch.executeTool('save_memory', {
      content: 'Started implementing the charge endpoint. Using chi router with middleware chain: logging → auth → rate-limit → handler. Bob suggested using errgroup for parallel Stripe + fraud-check calls — good idea, adopted it.',
      importance: 'important',
    });
    await orch.executeTool('save_memory', {
      content: 'Found a bug in the old Python service: refund endpoint doesn\'t check if payment is already refunded, allowing double refunds. Filed as JIRA PAY-142. Must fix in Go rewrite.',
      importance: 'critical',
    });
    await orch.executeTool('save_memory', {
      content: 'PR #87 review: Bob\'s implementation of the charge handler looks good but has a subtle race condition — if Stripe returns success but DB write fails, the charge is orphaned. Need to implement idempotency key pattern. Left detailed comment on the PR.',
      importance: 'important',
    });
    await orch.executeTool('save_memory', {
      content: 'Decided on error handling strategy: all errors return standard JSON { "error": { "code": "...", "message": "...", "request_id": "..." } }. HTTP status codes: 400 for validation, 402 for Stripe declined, 409 for duplicate/already-refunded, 500 for internal, 503 for circuit breaker open.',
      importance: 'important',
    });
    await orch.executeTool('save_memory', {
      content: 'Performance target from Marko: p99 latency under 200ms for charge endpoint (current Python service is 450ms). Go rewrite should easily beat this. Will add Prometheus metrics from day 1.',
      importance: 'important',
    });
    await orch.executeTool('save_memory', {
      content: 'Integration test strategy: use Stripe test mode with test API keys (not production). Alice confirmed test keys are already in Vault at secret/data/stripe/test. Docker compose setup with Postgres + test Stripe env.',
      importance: 'normal',
    });

    // Update knowledge graph
    const kg = orch.getKnowledge();
    kg.createEntity('bug', 'PAY-142: Double refund vulnerability', { severity: 'high', status: 'open', found_in: 'Python payment service' });
    kg.createEntity('pr', 'PR #87: Charge handler', { author: 'Bob Kumar', status: 'changes-requested', issue: 'race condition on DB write' });

    db.close();
  });

  // ═══════════════════════════════════════════════════════════════════
  // SESSION 3: Wednesday — blockers, decisions, progress
  // ═══════════════════════════════════════════════════════════════════
  it('Session 3: Midweek check-in — credentials arrived, new blocker, scope change', async () => {
    const db = new MindDB(MIND_PATH);
    const orch = new Orchestrator({ db, embedder });

    await orch.executeTool('save_memory', {
      content: 'Alice delivered Stripe production credentials to Vault as promised. Verified access works. Removed from pending items.',
      importance: 'normal',
    });
    await orch.executeTool('save_memory', {
      content: 'NEW BLOCKER: Legal team says we need PCI DSS compliance audit before go-live. This was not in the original scope. Meeting scheduled with compliance team Friday. Could delay launch by 2 weeks.',
      importance: 'critical',
    });
    await orch.executeTool('save_memory', {
      content: 'Bob fixed the race condition in PR #87 using Stripe idempotency keys. Approved and merged. The charge endpoint is now production-ready pending PCI review.',
      importance: 'important',
    });
    await orch.executeTool('save_memory', {
      content: 'Marko decided to descope the refund endpoint from the initial launch. Reason: the double-refund bug (PAY-142) needs careful handling and the PCI blocker already delays us. Refund stays in Python service for now, will be migrated in phase 2.',
      importance: 'critical',
    });
    await orch.executeTool('save_memory', {
      content: 'Updated launch plan: Phase 1 = charge + get payment (Go). Phase 2 = refund migration + PAY-142 fix. Phase 3 = deprecate Python service entirely. Each phase is ~2 weeks.',
      importance: 'important',
    });
    await orch.executeTool('save_memory', {
      content: 'Circuit breaker implementation complete. Using sony/gobreaker library. Settings: maxRequests=5, interval=60s, timeout=5s, trip after 3 consecutive failures. Tested with fault injection — works correctly.',
      importance: 'normal',
    });

    db.close();
  });

  // ═══════════════════════════════════════════════════════════════════
  // SESSION 4: Thursday — COLD START. Can the agent pick up where we left off?
  // ═══════════════════════════════════════════════════════════════════
  it('Session 4 (COLD START): Agent must recall project state without being told', async () => {
    const db = new MindDB(MIND_PATH);
    lastDb = db; // Track for cleanup
    const orch = new Orchestrator({ db, embedder });

    // ─── Test A: Identity survives ───
    const identity = await orch.executeTool('get_identity', {});
    expect(identity).toContain('Waggle');
    expect(identity).toContain('Senior Engineering Assistant');

    // ─── Test B: Awareness items survive ───
    const awareness = await orch.executeTool('get_awareness', {});
    expect(awareness).toContain('Marko Markovic');
    expect(awareness).toContain('payment service');

    // ─── Test C: "What are we working on?" ───
    const projectContext = await orch.executeTool('search_memory', {
      query: 'payment service architecture Go',
    });
    expect(projectContext).toContain('Go');
    expect(projectContext).toContain('chi router');
    expect(projectContext).toContain('Stripe');

    // ─── Test D: "What's blocking us?" ───
    const blockers = await orch.executeTool('search_memory', {
      query: 'blocker PCI compliance',
    });
    expect(blockers).toContain('PCI DSS');
    expect(blockers).toContain('compliance');

    // ─── Test E: "What happened with the Stripe credentials?" ───
    const credentials = await orch.executeTool('search_memory', {
      query: 'Stripe credentials Vault Alice',
    });
    expect(credentials).toContain('Vault');
    expect(credentials).toContain('Alice');

    // ─── Test F: "What's the current scope?" (must know about descoping) ───
    const scope = await orch.executeTool('search_memory', {
      query: 'launch plan phase refund descope',
    });
    expect(scope).toContain('Phase 1');
    expect(scope).toContain('refund');

    // ─── Test G: "Tell me about the double-refund bug" ───
    const bug = await orch.executeTool('search_memory', {
      query: 'double refund bug PAY-142',
    });
    expect(bug).toContain('PAY-142');
    expect(bug).toContain('refund');

    // ─── Test H: "What's Bob working on?" (knowledge graph) ───
    const bobInfo = await orch.executeTool('query_knowledge', {
      query: 'Bob',
    });
    expect(bobInfo).toContain('Bob Kumar');
    expect(bobInfo).toContain('implements');

    // ─── Test I: "What does our service depend on?" ───
    const deps = await orch.executeTool('query_knowledge', {
      query: 'payment-service',
    });
    expect(deps).toContain('payment-service');
    expect(deps).toContain('depends_on');
    expect(deps).toContain('fraud-check');

    // ─── Test J: "What was the error handling decision?" ───
    const errorHandling = await orch.executeTool('search_memory', {
      query: 'error handling JSON status codes',
    });
    expect(errorHandling).toContain('402');
    expect(errorHandling).toContain('circuit breaker');

    // ─── Test K: "What are the performance requirements?" ───
    const perf = await orch.executeTool('search_memory', {
      query: 'performance latency p99 target',
    });
    expect(perf).toContain('200ms');
    expect(perf).toContain('Prometheus');

    // ─── Test L: "What was decided about the race condition?" ───
    const raceCondition = await orch.executeTool('search_memory', {
      query: 'race condition idempotency PR 87',
    });
    expect(raceCondition).toContain('idempotency');

    // ─── Test M: "What's the database schema?" ───
    const schema = await orch.executeTool('search_memory', {
      query: 'database schema payments table',
    });
    expect(schema).toContain('amount_cents');
    expect(schema).toContain('bigint');

    // ─── Test N: Memory stats show realistic data ───
    const stats = orch.getMemoryStats();
    expect(stats.frameCount).toBeGreaterThanOrEqual(15); // We saved ~17 memories
    expect(stats.sessionCount).toBeGreaterThanOrEqual(1); // At least 1 session (CognifyPipeline reuses active)
    expect(stats.entityCount).toBeGreaterThanOrEqual(6); // 6+ entities in knowledge graph

    // ─── Test O: System prompt has everything for a cold-start ───
    const prompt = orch.buildSystemPrompt();
    expect(prompt).toContain('Waggle');
    expect(prompt).toContain('payment service');
    expect(prompt).toContain('search_memory');

    db.close();
  });
});
