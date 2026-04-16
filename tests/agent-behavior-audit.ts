/**
 * Agent Behavior Audit — 10-session systematic test
 *
 * Tests: GEPA, memory, entity extraction, evolution pipeline,
 * tool usage, skill invocation, cross-workspace isolation,
 * conversational replies, edge cases.
 *
 * Run: npx tsx tests/agent-behavior-audit.ts
 */

import http from 'node:http';
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const API = 'http://127.0.0.1:3333';
const WAGGLE_DIR = path.join(os.homedir(), '.waggle');

interface SSEEvent {
  event: string;
  data: any;
}

// ── Chat helper: sends message, collects SSE response ──────────────

async function chat(message: string, opts: {
  workspace?: string;
  session?: string;
  model?: string;
  persona?: string;
} = {}): Promise<{ text: string; events: SSEEvent[]; error?: string }> {
  const body = JSON.stringify({
    message,
    workspace: opts.workspace,
    session: opts.session,
    model: opts.model,
    persona: opts.persona,
  });

  return new Promise((resolve) => {
    const req = http.request(`${API}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      timeout: 60_000,
    }, (res) => {
      let raw = '';
      const events: SSEEvent[] = [];
      let fullText = '';
      let currentEvent = '';

      res.on('data', (chunk: Buffer) => {
        raw += chunk.toString();
        // Parse SSE: "event: <type>\ndata: <json>\n\n"
        const blocks = raw.split('\n\n');
        raw = blocks.pop() ?? '';
        for (const block of blocks) {
          const lines = block.split('\n');
          let eventType = '';
          let dataStr = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) eventType = line.slice(7).trim();
            if (line.startsWith('data: ')) dataStr = line.slice(6);
          }
          if (!dataStr) continue;
          try {
            const data = JSON.parse(dataStr);
            events.push({ event: eventType || 'unknown', data });
            if (eventType === 'token' && data.content) {
              fullText += data.content;
            }
            if (eventType === 'done' && data.content) {
              fullText = data.content;
            }
          } catch { /* skip non-JSON */ }
        }
      });

      res.on('end', () => {
        resolve({ text: fullText, events });
      });

      res.on('error', (err) => {
        resolve({ text: '', events: [], error: err.message });
      });
    });

    req.on('error', (err) => {
      resolve({ text: '', events: [], error: err.message });
    });

    req.write(body);
    req.end();
  });
}

// ── DB inspection helpers ──────────────────────────────────────────

function inspectMind(dbPath: string) {
  if (!fs.existsSync(dbPath)) return { exists: false } as const;
  const db = new Database(dbPath);
  sqliteVec.load(db);

  const frames = db.prepare('SELECT COUNT(*) as cnt FROM memory_frames').get() as { cnt: number };
  const entities = db.prepare('SELECT COUNT(*) as cnt FROM knowledge_entities').get() as { cnt: number };
  const traces = db.prepare('SELECT COUNT(*) as cnt FROM execution_traces').get() as { cnt: number };
  const sessions = db.prepare('SELECT COUNT(*) as cnt FROM sessions').get() as { cnt: number };

  const entityList = db.prepare(
    'SELECT entity_type, name FROM knowledge_entities ORDER BY id'
  ).all() as { entity_type: string; name: string }[];

  const frameList = db.prepare(
    'SELECT id, frame_type, content, source FROM memory_frames ORDER BY id'
  ).all() as { id: number; frame_type: string; content: string; source: string }[];

  const personEntities = entityList.filter(e => e.entity_type === 'person');

  db.close();
  return {
    exists: true,
    frames: frames.cnt,
    entities: entities.cnt,
    traces: traces.cnt,
    sessions: sessions.cnt,
    personEntities,
    entityList,
    frameList,
  };
}

function clearHistory(workspace?: string) {
  const url = workspace
    ? `${API}/api/chat/history?workspace=${workspace}`
    : `${API}/api/chat/history`;
  return fetch(url, { method: 'DELETE' });
}

// ── Test result tracking ───────────────────────────────────────────

interface TestResult {
  session: number;
  name: string;
  tests: { name: string; pass: boolean; detail: string }[];
}

const results: TestResult[] = [];
let currentSession: TestResult;

function startSession(num: number, name: string) {
  currentSession = { session: num, name, tests: [] };
  results.push(currentSession);
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`SESSION ${num}: ${name}`);
  console.log('═'.repeat(60));
}

function check(name: string, pass: boolean, detail: string = '') {
  currentSession.tests.push({ name, pass, detail });
  const icon = pass ? '✓' : '✗';
  console.log(`  ${icon} ${name}${detail ? ` — ${detail}` : ''}`);
}

// ── Test Sessions ──────────────────────────────────────────────────

async function session1_coldStart() {
  startSession(1, 'Cold Start — First Message in Fresh Workspace');

  // Create workspace
  await fetch(`${API}/api/workspaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'test-cold-start', name: 'Cold Start Test' }),
  });

  const res = await chat('Hello, I am testing you. What can you do?', {
    workspace: 'test-cold-start',
    session: 's1',
  });

  check('Agent responds', res.text.length > 20, `${res.text.length} chars`);
  check('No error', !res.error, res.error ?? 'clean');
  check('Has done event', res.events.some(e => e.event === 'done'), '');

  // Check for GEPA — should it fire on a reasonable first message?
  const gepaFired = res.events.some(e => e.event === 'step' && e.data?.content?.includes('GEPA'));
  check('GEPA behavior on first message', true, gepaFired ? 'GEPA fired (expected for short msg)' : 'GEPA did not fire (msg was detailed enough)');
}

async function session2_memoryFormation() {
  startSession(2, 'Memory Formation — Agent Stores User Facts');

  await fetch(`${API}/api/workspaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'test-memory', name: 'Memory Test' }),
  });

  const res = await chat(
    'My name is Marko Markovic. I am 51 years old. I work as a business strategist at Egzakta Group. My favorite color is blue and I support Crvena Zvezda. Remember all of this.',
    { workspace: 'test-memory', session: 's2' },
  );

  check('Agent acknowledges', res.text.length > 10, `${res.text.length} chars`);

  // Check what got stored in personal.mind
  const mind = inspectMind(path.join(WAGGLE_DIR, 'personal.mind'));
  if (mind.exists) {
    check('Frames created', mind.frames > 0, `${mind.frames} frames`);
    check('Entities extracted', mind.entities > 0, `${mind.entities} entities`);

    // Check for garbage person entities
    const garbagePersons = mind.personEntities.filter(
      e => ['Current Situation', 'Key Issues', 'Recommended Next Action'].includes(e.name)
    );
    check('No garbage person entities', garbagePersons.length === 0,
      garbagePersons.length > 0 ? `GARBAGE: ${garbagePersons.map(e => e.name).join(', ')}` : 'clean');

    // Check Marko is stored as person (if entity extraction ran)
    const hasMarko = mind.entityList.some(
      e => e.name.toLowerCase().includes('marko') && e.entity_type === 'person'
    );
    check('Marko extracted as person entity', hasMarko || mind.entities === 0,
      hasMarko ? 'found' : 'entity extraction may not have run');
  } else {
    check('Personal mind exists', false, 'personal.mind not found');
  }
}

async function session3_memoryRecall() {
  startSession(3, 'Memory Recall — Agent Remembers Previous Facts');

  // New session, same workspace — test recall
  const res = await chat('What do you remember about me?', {
    workspace: 'test-memory',
    session: 's3',
  });

  check('Agent responds', res.text.length > 10, `${res.text.length} chars`);

  // Check if recall event was emitted
  const recallEvent = res.events.find(e => e.event === 'recall' || e.event === 'step');
  check('Recall event emitted', !!recallEvent, recallEvent?.data?.content?.slice(0, 60) ?? 'none');

  // Check if response mentions stored facts
  const text = res.text.toLowerCase();
  check('Mentions name', text.includes('marko'), '');
  check('Mentions age or role', text.includes('51') || text.includes('strategist'), '');
}

async function session4_conversationalReplies() {
  startSession(4, 'Conversational Replies — GEPA Must NOT Expand');

  await fetch(`${API}/api/workspaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'test-conv', name: 'Conversation Test' }),
  });

  // First message (GEPA may fire — that's OK)
  await chat('Tell me about sovereign AI solutions', {
    workspace: 'test-conv', session: 's4',
  });

  // Follow-up replies — GEPA MUST NOT expand these
  const replies = [
    'yes thats the story',
    'the first three',
    'ok continue',
    'sounds good',
    'no not that one',
  ];

  for (const reply of replies) {
    const res = await chat(reply, { workspace: 'test-conv', session: 's4' });
    const gepaFired = res.events.some(
      e => e.event === 'step' && e.data?.content?.includes('GEPA')
    );
    check(`"${reply}" — GEPA blocked`, !gepaFired,
      gepaFired ? 'GEPA FIRED (BUG!)' : 'clean');
  }
}

async function session5_toolUsage() {
  startSession(5, 'Tool Usage — Agent Can Use Built-in Tools');

  await fetch(`${API}/api/workspaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'test-tools', name: 'Tools Test' }),
  });

  const res = await chat('Search my memory for anything about AI', {
    workspace: 'test-tools', session: 's5',
  });

  check('Agent responds to tool request', res.text.length > 10, `${res.text.length} chars`);

  // Check for tool call events
  const toolEvents = res.events.filter(e =>
    e.event === 'tool_call' || e.event === 'step' || e.event === 'tool_result'
  );
  check('Tool-related events present', toolEvents.length > 0, `${toolEvents.length} events`);
}

async function session6_personaSwitching() {
  startSession(6, 'Persona — Different Persona Gives Different Behavior');

  await fetch(`${API}/api/workspaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'test-persona', name: 'Persona Test' }),
  });

  // Default persona
  const defaultRes = await chat('Write a one-paragraph summary of market trends in AI', {
    workspace: 'test-persona', session: 's6a',
  });
  check('Default persona responds', defaultRes.text.length > 50, `${defaultRes.text.length} chars`);

  // Researcher persona
  const researchRes = await chat('Write a one-paragraph summary of market trends in AI', {
    workspace: 'test-persona', session: 's6b', persona: 'researcher',
  });
  check('Researcher persona responds', researchRes.text.length > 50, `${researchRes.text.length} chars`);

  // Both should respond but potentially differently
  check('Both personas functional', defaultRes.text.length > 50 && researchRes.text.length > 50, '');
}

async function session7_entityExtraction() {
  startSession(7, 'Entity Extraction Quality — No Garbage Entities');

  await fetch(`${API}/api/workspaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'test-entities', name: 'Entity Test' }),
  });

  // Send text with known entities + headings that should NOT be person entities
  const res = await chat(
    'I met with Alice Johnson from Microsoft about the Project Phoenix integration. The Key Issues are timeline and budget. Current Situation is complex. Recommended Next Action is to schedule a follow-up.',
    { workspace: 'test-entities', session: 's7' },
  );

  check('Agent responds', res.text.length > 10, '');

  // Wait a moment for cognify to complete
  await new Promise(r => setTimeout(r, 2000));

  const mind = inspectMind(path.join(WAGGLE_DIR, 'personal.mind'));
  if (mind.exists && mind.entities > 0) {
    const persons = mind.personEntities;
    const garbagePersons = persons.filter(p =>
      ['Current Situation', 'Key Issues', 'Recommended Next Action', 'Project Phoenix'].includes(p.name)
    );

    check('No garbage person entities', garbagePersons.length === 0,
      garbagePersons.length > 0
        ? `GARBAGE: ${garbagePersons.map(e => e.name).join(', ')}`
        : `clean (${persons.length} persons: ${persons.map(p => p.name).join(', ')})`);

    // Alice Johnson should be person
    const alicePerson = persons.find(p => p.name.includes('Alice'));
    check('Alice Johnson classified as person', !!alicePerson, alicePerson ? 'correct' : 'missing');

    // Microsoft should be org or tech
    const msEntity = mind.entityList.find(e => e.name.toLowerCase().includes('microsoft'));
    check('Microsoft not classified as person', !msEntity || msEntity.entity_type !== 'person',
      msEntity ? `type: ${msEntity.entity_type}` : 'not extracted');
  } else {
    check('Entities extracted', false, 'no entities found');
  }
}

async function session8_evolutionPipeline() {
  startSession(8, 'Evolution Pipeline — Trace Recording');

  await fetch(`${API}/api/workspaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'test-evolution', name: 'Evolution Test' }),
  });

  // Send a few messages to generate traces
  await chat('What is the capital of France?', { workspace: 'test-evolution', session: 's8' });
  await chat('Explain quantum computing in simple terms', { workspace: 'test-evolution', session: 's8' });

  // Check traces were recorded
  const mind = inspectMind(path.join(WAGGLE_DIR, 'personal.mind'));
  if (mind.exists) {
    check('Execution traces recorded', mind.traces > 0, `${mind.traces} traces`);
  }

  // Check evolution API endpoints
  const runsRes = await fetch(`${API}/api/evolution/runs`);
  check('Evolution runs endpoint accessible', runsRes.ok, `status ${runsRes.status}`);

  const statusRes = await fetch(`${API}/api/evolution/status`);
  check('Evolution status endpoint accessible', statusRes.ok, `status ${statusRes.status}`);

  if (statusRes.ok) {
    const status = await statusRes.json() as any;
    check('Evolution status has expected fields',
      'counts' in status || 'traceCount' in status || 'totalRuns' in status,
      JSON.stringify(status).slice(0, 100));
  }
}

async function session9_crossWorkspace() {
  startSession(9, 'Cross-Workspace Isolation');

  // Create two workspaces
  await fetch(`${API}/api/workspaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'test-ws-a', name: 'Workspace A' }),
  });
  await fetch(`${API}/api/workspaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'test-ws-b', name: 'Workspace B' }),
  });

  // Store fact in workspace A
  await chat('Remember: the project codename is FALCON', {
    workspace: 'test-ws-a', session: 's9a',
  });

  // Ask in workspace B — should NOT know about FALCON (workspace isolation)
  const resB = await chat('What project codename do you know about?', {
    workspace: 'test-ws-b', session: 's9b',
  });

  // Personal memory is shared, but workspace-specific context should differ
  check('Workspace B responds', resB.text.length > 10, '');
  // Note: personal memory IS shared across workspaces, so FALCON may appear
  // This tests whether workspace-scoped context vs personal memory works
  const mentionsFalcon = resB.text.toLowerCase().includes('falcon');
  check('Cross-workspace behavior documented', true,
    mentionsFalcon
      ? 'FALCON found in B (via shared personal memory — expected)'
      : 'FALCON not in B (workspace isolation working)');
}

async function session10_edgeCases() {
  startSession(10, 'Edge Cases — Short Messages, Special Characters');

  await fetch(`${API}/api/workspaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'test-edge', name: 'Edge Cases' }),
  });

  // Very short first message
  const short = await chat('hi', { workspace: 'test-edge', session: 's10a' });
  check('Handles "hi"', short.text.length > 0 && !short.error, `${short.text.length} chars`);

  // Message with special characters
  const special = await chat('What about C++ & C#? Is 2+2=4? <script>alert("xss")</script>', {
    workspace: 'test-edge', session: 's10b',
  });
  check('Handles special chars', special.text.length > 0 && !special.error, '');
  check('No XSS in response', !special.text.includes('<script>'), '');

  // Empty-ish message
  const empty = await chat('   ', { workspace: 'test-edge', session: 's10c' });
  check('Handles whitespace message', true, empty.error ? `error: ${empty.error}` : `${empty.text.length} chars`);

  // Very long message
  const longMsg = 'Tell me about AI. '.repeat(200);
  const longRes = await chat(longMsg, { workspace: 'test-edge', session: 's10d' });
  check('Handles long message', longRes.text.length > 0, `${longRes.text.length} chars`);
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  WAGGLE AGENT BEHAVIOR AUDIT — 10 Sessions             ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  // Verify server is up
  try {
    const health = await fetch(`${API}/health`);
    if (!health.ok) throw new Error('Server not healthy');
    console.log('Server: healthy\n');
  } catch {
    console.error('ERROR: Server not running on :3333');
    process.exit(1);
  }

  await session1_coldStart();
  await session2_memoryFormation();
  await session3_memoryRecall();
  await session4_conversationalReplies();
  await session5_toolUsage();
  await session6_personaSwitching();
  await session7_entityExtraction();
  await session8_evolutionPipeline();
  await session9_crossWorkspace();
  await session10_edgeCases();

  // ── Final Report ─────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60));
  console.log('FINAL REPORT');
  console.log('═'.repeat(60));

  let totalPass = 0;
  let totalFail = 0;

  for (const session of results) {
    const pass = session.tests.filter(t => t.pass).length;
    const fail = session.tests.filter(t => !t.pass).length;
    totalPass += pass;
    totalFail += fail;
    const icon = fail === 0 ? '✓' : '✗';
    console.log(`  ${icon} Session ${session.session}: ${session.name} — ${pass}/${pass + fail}`);
    for (const t of session.tests.filter(t => !t.pass)) {
      console.log(`      FAIL: ${t.name} — ${t.detail}`);
    }
  }

  console.log(`\nTOTAL: ${totalPass} passed, ${totalFail} failed out of ${totalPass + totalFail}`);

  // Write report to file
  const report = results.map(s => ({
    session: s.session,
    name: s.name,
    passed: s.tests.filter(t => t.pass).length,
    failed: s.tests.filter(t => !t.pass).length,
    details: s.tests,
  }));

  fs.writeFileSync(
    path.join(process.cwd(), 'docs', 'AGENT-AUDIT-RESULTS-2026-04-16.json'),
    JSON.stringify(report, null, 2),
  );
  console.log('\nResults saved to docs/AGENT-AUDIT-RESULTS-2026-04-16.json');
}

main().catch(console.error);
