import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { buildLocalServer } from '../src/local/index.js';
import type { FastifyInstance } from 'fastify';
import { injectWithAuth } from './test-utils.js';

describe('Workspace & Session API', () => {
  let server: FastifyInstance;
  let dataDir: string;
  let workspaceId: string;

  beforeAll(async () => {
    // Create isolated temp dir for tests
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-ws-api-'));

    // Write a minimal config.json so WaggleConfig doesn't error
    fs.writeFileSync(
      path.join(dataDir, 'config.json'),
      JSON.stringify({ defaultModel: 'test/model', providers: {} }),
      'utf-8'
    );

    // Create personal.mind as empty file (MindDB will init schema)
    // Don't create it — let MultiMind handle it
    server = await buildLocalServer({ dataDir, port: 0 });
  });

  afterAll(async () => {
    await server.close();
    // Clean up temp dir
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  // First, create a workspace to use for session tests
  it('creates a workspace for session tests', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/workspaces',
      payload: { name: 'Session Test WS', group: 'Test' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.id).toBeTruthy();
    workspaceId = body.id;
  });

  // --- I2: Team Workspace Creation ---

  it('creates a team workspace with team fields', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/workspaces',
      payload: {
        name: 'Team Project Alpha',
        group: 'Team',
        teamId: 'team-123',
        teamServerUrl: 'https://team.example.com',
        teamRole: 'member',
        teamUserId: 'user-456',
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.name).toBe('Team Project Alpha');
    expect(body.group).toBe('Team');
    expect(body.teamId).toBe('team-123');
    expect(body.teamServerUrl).toBe('https://team.example.com');
    expect(body.teamRole).toBe('member');
    expect(body.teamUserId).toBe('user-456');

    // Verify it appears in workspace list
    const listRes = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/workspaces',
    });
    const list = JSON.parse(listRes.body);
    const teamWs = list.find((ws: { teamId?: string }) => ws.teamId === 'team-123');
    expect(teamWs).toBeTruthy();
    expect(teamWs.teamServerUrl).toBe('https://team.example.com');

    // Clean up
    await injectWithAuth(server, { method: 'DELETE', url: `/api/workspaces/${body.id}` });
  });

  it('creates a regular workspace without team fields', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/workspaces',
      payload: { name: 'Regular WS', group: 'Personal' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.teamId).toBeUndefined();
    expect(body.teamServerUrl).toBeUndefined();

    // Clean up
    await injectWithAuth(server, { method: 'DELETE', url: `/api/workspaces/${body.id}` });
  });

  // --- Session Tests ---

  it('lists sessions (empty initially)', async () => {
    const res = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/workspaces/${workspaceId}/sessions`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(0);
  });

  let sessionId: string;

  it('creates a session', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/sessions`,
      payload: { title: 'My First Chat' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.id).toMatch(/^session-/);
    expect(body.title).toBe('My First Chat');
    expect(body.messageCount).toBe(0);
    expect(body.lastActive).toBeTruthy();
    expect(body.created).toBeTruthy();
    sessionId = body.id;
  });

  it('creates a session without title (uses id as title)', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/sessions`,
      payload: {},
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.title).toMatch(/^session-/);
  });

  it('lists sessions (shows created sessions)', async () => {
    const res = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/workspaces/${workspaceId}/sessions`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.length).toBe(2);
    // Should find our named session
    const named = body.find((s: { title: string }) => s.title === 'My First Chat');
    expect(named).toBeTruthy();
    expect(named.messageCount).toBe(0);
  });

  it('reads session metadata including message count', async () => {
    // Append messages to the session JSONL file (meta line already exists from creation)
    const sessionPath = path.join(
      dataDir, 'workspaces', workspaceId, 'sessions', `${sessionId}.jsonl`
    );
    // Read existing meta line
    const existing = fs.readFileSync(sessionPath, 'utf-8');
    const messages = [
      JSON.stringify({ role: 'user', content: 'Hello there', timestamp: new Date().toISOString() }),
      JSON.stringify({ role: 'assistant', content: 'Hi! How can I help?', timestamp: new Date().toISOString() }),
    ];
    fs.writeFileSync(sessionPath, existing + messages.join('\n') + '\n', 'utf-8');

    const res = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/workspaces/${workspaceId}/sessions`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const session = body.find((s: { id: string }) => s.id === sessionId);
    expect(session).toBeTruthy();
    expect(session.messageCount).toBe(2);
    // Title should come from meta line (set during creation)
    expect(session.title).toBe('My First Chat');
  });

  it('auto-generates summary for session with 4+ messages', async () => {
    // Create a new session with enough messages to trigger summary generation
    const createRes = await injectWithAuth(server, {
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/sessions`,
      payload: { title: 'Summary Test Session' },
    });
    const { id: summarySessionId } = JSON.parse(createRes.body);

    // Add 6 messages (3 exchanges) to the session file
    const sessionPath = path.join(
      dataDir, 'workspaces', workspaceId, 'sessions', `${summarySessionId}.jsonl`
    );
    const existing = fs.readFileSync(sessionPath, 'utf-8');
    const messages = [
      JSON.stringify({ role: 'user', content: 'Help me plan the Q2 marketing campaign', timestamp: '2026-03-09T10:00:00Z' }),
      JSON.stringify({ role: 'assistant', content: 'I can help with that. Let me search for context about your marketing goals.', timestamp: '2026-03-09T10:01:00Z' }),
      JSON.stringify({ role: 'user', content: 'We decided to focus on social media this quarter', timestamp: '2026-03-09T10:02:00Z' }),
      JSON.stringify({ role: 'assistant', content: 'Good decision. Social media aligns well with your budget constraints.', timestamp: '2026-03-09T10:03:00Z' }),
      JSON.stringify({ role: 'user', content: 'Can you draft an outline?', timestamp: '2026-03-09T10:04:00Z' }),
      JSON.stringify({ role: 'assistant', content: 'Here is a draft marketing plan outline with 5 key initiatives.', timestamp: '2026-03-09T10:05:00Z' }),
    ];
    fs.writeFileSync(sessionPath, existing + messages.join('\n') + '\n', 'utf-8');

    // List sessions — this triggers lazy summary generation
    const listRes = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/workspaces/${workspaceId}/sessions`,
    });
    const sessions = JSON.parse(listRes.body);
    const summarySession = sessions.find((s: { id: string }) => s.id === summarySessionId);
    expect(summarySession).toBeTruthy();
    expect(summarySession.summary).toBeTruthy();
    expect(typeof summarySession.summary).toBe('string');
    expect(summarySession.summary.length).toBeGreaterThan(5);

    // Verify summary was persisted to the JSONL meta line
    const updatedContent = fs.readFileSync(sessionPath, 'utf-8');
    const firstLine = JSON.parse(updatedContent.split('\n')[0]);
    expect(firstLine.summary).toBe(summarySession.summary);

    // Clean up
    await injectWithAuth(server, {
      method: 'DELETE',
      url: `/api/sessions/${summarySessionId}?workspace=${workspaceId}`,
    });
  });

  it('does not generate summary for sessions with fewer than 4 messages', async () => {
    // The session we created earlier had only 2 messages (added in a previous test)
    // Create a session with just 2 messages
    const createRes = await injectWithAuth(server, {
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/sessions`,
      payload: { title: 'Short Session' },
    });
    const { id: shortSessionId } = JSON.parse(createRes.body);

    const sessionPath = path.join(
      dataDir, 'workspaces', workspaceId, 'sessions', `${shortSessionId}.jsonl`
    );
    const existing = fs.readFileSync(sessionPath, 'utf-8');
    const messages = [
      JSON.stringify({ role: 'user', content: 'Quick question', timestamp: '2026-03-09T10:00:00Z' }),
      JSON.stringify({ role: 'assistant', content: 'Sure, what is it?', timestamp: '2026-03-09T10:01:00Z' }),
    ];
    fs.writeFileSync(sessionPath, existing + messages.join('\n') + '\n', 'utf-8');

    const listRes = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/workspaces/${workspaceId}/sessions`,
    });
    const sessions = JSON.parse(listRes.body);
    const shortSession = sessions.find((s: { id: string }) => s.id === shortSessionId);
    expect(shortSession).toBeTruthy();
    expect(shortSession.summary).toBeNull();

    // Clean up
    await injectWithAuth(server, {
      method: 'DELETE',
      url: `/api/sessions/${shortSessionId}?workspace=${workspaceId}`,
    });
  });

  it('deletes a session', async () => {
    const res = await injectWithAuth(server, {
      method: 'DELETE',
      url: `/api/sessions/${sessionId}?workspace=${workspaceId}`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.deleted).toBe(true);

    // Verify it's gone
    const listRes = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/workspaces/${workspaceId}/sessions`,
    });
    const sessions = JSON.parse(listRes.body);
    const deleted = sessions.find((s: { id: string }) => s.id === sessionId);
    expect(deleted).toBeUndefined();
  });

  it('returns 404 when deleting non-existent session', async () => {
    const res = await injectWithAuth(server, {
      method: 'DELETE',
      url: `/api/sessions/nonexistent-session?workspace=${workspaceId}`,
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns empty array for sessions of non-existent workspace (graceful degradation)', async () => {
    const res = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/workspaces/nonexistent-ws/sessions',
    });
    // Returns 200 with empty array — intentional graceful degradation
    // (default workspace might not be registered on first startup)
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual([]);
  });

  // --- Knowledge Graph Tests ---

  it('returns knowledge graph (empty for fresh mind)', async () => {
    const res = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/memory/graph',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty('entities');
    expect(body).toHaveProperty('relations');
    expect(Array.isArray(body.entities)).toBe(true);
    expect(Array.isArray(body.relations)).toBe(true);
  });

  it('returns knowledge graph for workspace mind', async () => {
    const res = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/memory/graph?workspace=${workspaceId}`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty('entities');
    expect(body).toHaveProperty('relations');
  });

  it('returns 404 for knowledge graph of non-existent workspace', async () => {
    const res = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/memory/graph?workspace=nonexistent',
    });
    expect(res.statusCode).toBe(404);
  });

  // --- API Key Test Endpoint ---

  it('validates OpenAI key format (valid)', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/settings/test-key',
      payload: { provider: 'openai', apiKey: 'sk-1234567890abcdefghij' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.valid).toBe(true);
  });

  it('validates OpenAI key format (invalid prefix)', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/settings/test-key',
      payload: { provider: 'openai', apiKey: 'bad-key-1234567890' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.valid).toBe(false);
    expect(body.error).toMatch(/sk-/);
  });

  it('validates Anthropic key format (valid)', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/settings/test-key',
      payload: { provider: 'anthropic', apiKey: 'sk-ant-1234567890abcdefg' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.valid).toBe(true);
  });

  it('validates Anthropic key format (invalid)', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/settings/test-key',
      payload: { provider: 'anthropic', apiKey: 'sk-1234567890abcdefg' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.valid).toBe(false);
    expect(body.error).toMatch(/sk-ant-/);
  });

  it('rejects test-key request without provider or apiKey', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/settings/test-key',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('validates unknown provider key (just length check)', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/settings/test-key',
      payload: { provider: 'some-provider', apiKey: 'abcdefghij' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.valid).toBe(true);
  });

  // --- E3: Progress extraction tests ---

  it('extracts progress items from session content', async () => {
    // Create a workspace and session with task/completion/blocker language
    const wsRes = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/workspaces',
      payload: { name: 'Progress Test', group: 'Test' },
    });
    const ws = JSON.parse(wsRes.body);

    const sessRes = await injectWithAuth(server, {
      method: 'POST',
      url: `/api/workspaces/${ws.id}/sessions`,
      payload: { title: 'Planning Session' },
    });
    const sess = JSON.parse(sessRes.body);

    // Write messages with progress language
    const sessionPath = path.join(
      dataDir, 'workspaces', ws.id, 'sessions', `${sess.id}.jsonl`
    );
    const existing = fs.readFileSync(sessionPath, 'utf-8');
    const messages = [
      JSON.stringify({ role: 'user', content: 'We need to implement the search feature for the dashboard', timestamp: '2026-03-12T10:00:00Z' }),
      JSON.stringify({ role: 'assistant', content: 'I can help with that. What kind of search?', timestamp: '2026-03-12T10:01:00Z' }),
      JSON.stringify({ role: 'user', content: 'Full text search. Also, we completed the user authentication module last week.', timestamp: '2026-03-12T10:02:00Z' }),
      JSON.stringify({ role: 'assistant', content: 'Great, the auth module is done. For search, we\'re blocked by the missing indexing service — it depends on the infrastructure team.', timestamp: '2026-03-12T10:03:00Z' }),
      JSON.stringify({ role: 'user', content: 'Right, we should also plan the API documentation for the new endpoints', timestamp: '2026-03-12T10:04:00Z' }),
      JSON.stringify({ role: 'assistant', content: 'Makes sense. Let me draft an outline for the API docs.', timestamp: '2026-03-12T10:05:00Z' }),
    ];
    fs.writeFileSync(sessionPath, existing + messages.join('\n') + '\n', 'utf-8');

    // Fetch workspace context — should include progressItems
    const ctxRes = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/workspaces/${ws.id}/context`,
    });
    expect(ctxRes.statusCode).toBe(200);
    const ctx = JSON.parse(ctxRes.body);

    expect(ctx.progressItems).toBeDefined();
    expect(Array.isArray(ctx.progressItems)).toBe(true);

    // Should find at least a task (need to, should) and a blocker (blocked by)
    const types = ctx.progressItems.map((p: { type: string }) => p.type);
    expect(types).toContain('task');

    // Clean up
    await injectWithAuth(server, { method: 'DELETE', url: `/api/workspaces/${ws.id}` });
  });

  // --- F1: Session search tests ---

  it('searches sessions by content and returns matching snippets', async () => {
    // Create a workspace with sessions containing searchable content
    const wsRes = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/workspaces',
      payload: { name: 'Search Test WS', group: 'Test' },
    });
    const ws = JSON.parse(wsRes.body);

    // Create two sessions — one with matching content, one without
    const sess1Res = await injectWithAuth(server, {
      method: 'POST',
      url: `/api/workspaces/${ws.id}/sessions`,
      payload: { title: 'Database Design' },
    });
    const sess1 = JSON.parse(sess1Res.body);

    const sess2Res = await injectWithAuth(server, {
      method: 'POST',
      url: `/api/workspaces/${ws.id}/sessions`,
      payload: { title: 'Marketing Plan' },
    });
    const sess2 = JSON.parse(sess2Res.body);

    // Add content to session 1 (should match "database")
    const path1 = path.join(dataDir, 'workspaces', ws.id, 'sessions', `${sess1.id}.jsonl`);
    const existing1 = fs.readFileSync(path1, 'utf-8');
    fs.writeFileSync(path1, existing1 +
      JSON.stringify({ role: 'user', content: 'How should we design the database schema?' }) + '\n' +
      JSON.stringify({ role: 'assistant', content: 'For your use case, a PostgreSQL database with normalized tables would work well.' }) + '\n',
      'utf-8');

    // Add content to session 2 (should NOT match "database")
    const path2 = path.join(dataDir, 'workspaces', ws.id, 'sessions', `${sess2.id}.jsonl`);
    const existing2 = fs.readFileSync(path2, 'utf-8');
    fs.writeFileSync(path2, existing2 +
      JSON.stringify({ role: 'user', content: 'What social media channels should we target?' }) + '\n' +
      JSON.stringify({ role: 'assistant', content: 'Focus on LinkedIn and Twitter for B2B marketing.' }) + '\n',
      'utf-8');

    // Search for "database"
    const res = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/workspaces/${ws.id}/sessions/search?q=database`,
    });
    expect(res.statusCode).toBe(200);
    const results = JSON.parse(res.body);
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(1);
    expect(results[0].sessionId).toBe(sess1.id);
    expect(results[0].title).toBe('Database Design');
    expect(results[0].matchCount).toBeGreaterThan(0);
    expect(results[0].snippets.length).toBeGreaterThan(0);
    expect(results[0].snippets[0].text.toLowerCase()).toContain('database');

    // Clean up
    await injectWithAuth(server, { method: 'DELETE', url: `/api/workspaces/${ws.id}` });
  });

  it('returns 400 for search query shorter than 2 characters', async () => {
    const wsRes = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/workspaces',
      payload: { name: 'Short Query WS', group: 'Test' },
    });
    const ws = JSON.parse(wsRes.body);

    const res = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/workspaces/${ws.id}/sessions/search?q=a`,
    });
    expect(res.statusCode).toBe(400);

    await injectWithAuth(server, { method: 'DELETE', url: `/api/workspaces/${ws.id}` });
  });

  it('returns empty results when no sessions match', async () => {
    const wsRes = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/workspaces',
      payload: { name: 'No Match WS', group: 'Test' },
    });
    const ws = JSON.parse(wsRes.body);

    // Create a session
    const sessRes = await injectWithAuth(server, {
      method: 'POST',
      url: `/api/workspaces/${ws.id}/sessions`,
      payload: { title: 'Random Session' },
    });
    const sess = JSON.parse(sessRes.body);

    const sessPath = path.join(dataDir, 'workspaces', ws.id, 'sessions', `${sess.id}.jsonl`);
    const existing = fs.readFileSync(sessPath, 'utf-8');
    fs.writeFileSync(sessPath, existing +
      JSON.stringify({ role: 'user', content: 'Hello there' }) + '\n',
      'utf-8');

    const res = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/workspaces/${ws.id}/sessions/search?q=quantum`,
    });
    expect(res.statusCode).toBe(200);
    const results = JSON.parse(res.body);
    expect(results).toHaveLength(0);

    await injectWithAuth(server, { method: 'DELETE', url: `/api/workspaces/${ws.id}` });
  });

  it('returns empty progressItems for workspace with no sessions', async () => {
    const wsRes = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/workspaces',
      payload: { name: 'Empty Progress', group: 'Test' },
    });
    const ws = JSON.parse(wsRes.body);

    const ctxRes = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/workspaces/${ws.id}/context`,
    });
    const ctx = JSON.parse(ctxRes.body);
    expect(ctx.progressItems).toBeDefined();
    expect(ctx.progressItems).toHaveLength(0);

    await injectWithAuth(server, { method: 'DELETE', url: `/api/workspaces/${ws.id}` });
  });

  // ── F2: File registry tests ─────────────────────────────────────

  it('returns empty file list for workspace with no ingested files', async () => {
    const wsRes = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/workspaces',
      payload: { name: 'Files Empty', group: 'Test' },
    });
    const ws = JSON.parse(wsRes.body);

    const res = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/workspaces/${ws.id}/files`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.files).toEqual([]);

    await injectWithAuth(server, { method: 'DELETE', url: `/api/workspaces/${ws.id}` });
  });

  it('records ingested files in registry and returns them via files endpoint', async () => {
    const wsRes = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/workspaces',
      payload: { name: 'Files Test', group: 'Test' },
    });
    const ws = JSON.parse(wsRes.body);

    // Ingest a text file into the workspace
    const textContent = Buffer.from('Hello world, this is a test file.').toString('base64');
    const ingestRes = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/ingest',
      payload: {
        files: [{ name: 'readme.txt', content: textContent }],
        workspaceId: ws.id,
      },
    });
    expect(ingestRes.statusCode).toBe(200);

    // Check files endpoint returns the ingested file
    const filesRes = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/workspaces/${ws.id}/files`,
    });
    expect(filesRes.statusCode).toBe(200);
    const filesBody = JSON.parse(filesRes.body);
    expect(filesBody.files).toHaveLength(1);
    expect(filesBody.files[0].name).toBe('readme.txt');
    expect(filesBody.files[0].type).toBe('text');
    expect(filesBody.files[0].sizeBytes).toBeGreaterThan(0);
    expect(filesBody.files[0].ingestedAt).toBeDefined();

    // Check file count appears in workspace context
    const ctxRes = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/workspaces/${ws.id}/context`,
    });
    const ctx = JSON.parse(ctxRes.body);
    expect(ctx.stats.fileCount).toBe(1);

    await injectWithAuth(server, { method: 'DELETE', url: `/api/workspaces/${ws.id}` });
  });

  // ── F3: Session export tests ─────────────────────────────────────

  it('exports a session as markdown with title and messages', async () => {
    // Create workspace + session
    const wsRes = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/workspaces',
      payload: { name: 'Export Test', group: 'Test' },
    });
    const ws = JSON.parse(wsRes.body);

    const sessRes = await injectWithAuth(server, {
      method: 'POST',
      url: `/api/workspaces/${ws.id}/sessions`,
      payload: { title: 'My Test Chat' },
    });
    const sess = JSON.parse(sessRes.body);

    // Add messages to the session JSONL
    const sessionsDir = path.join(dataDir, 'workspaces', ws.id, 'sessions');
    const filePath = path.join(sessionsDir, `${sess.id}.jsonl`);
    const existingContent = fs.readFileSync(filePath, 'utf-8');
    fs.writeFileSync(filePath, existingContent
      + JSON.stringify({ role: 'user', content: 'Hello, what can you help me with?', timestamp: '2026-03-12T10:00:00Z' }) + '\n'
      + JSON.stringify({ role: 'assistant', content: 'I can help you with many things!', timestamp: '2026-03-12T10:00:05Z' }) + '\n'
    );

    // Export
    const exportRes = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/workspaces/${ws.id}/sessions/${sess.id}/export`,
    });
    expect(exportRes.statusCode).toBe(200);
    expect(exportRes.headers['content-type']).toContain('text/markdown');

    const md = exportRes.body;
    expect(md).toContain('# My Test Chat');
    expect(md).toContain('**You**');
    expect(md).toContain('Hello, what can you help me with?');
    expect(md).toContain('**Assistant**');
    expect(md).toContain('I can help you with many things!');

    await injectWithAuth(server, { method: 'DELETE', url: `/api/workspaces/${ws.id}` });
  });

  it('returns 404 when exporting non-existent session', async () => {
    const res = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/workspaces/${workspaceId}/sessions/nonexistent-session/export`,
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 for files of non-existent workspace', async () => {
    const res = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/workspaces/nonexistent-ws-999/files',
    });
    expect(res.statusCode).toBe(404);
  });

  // J4: Team catch-up context
  it('workspace context includes teamContext for team workspaces', async () => {
    // Create a team workspace
    const createRes = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/workspaces',
      payload: { name: 'Team WS', group: 'Team', teamId: 'team-test-123' },
    });
    const teamWsId = JSON.parse(createRes.body).id;

    // Get context
    const contextRes = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/workspaces/${teamWsId}/context`,
    });
    expect(contextRes.statusCode).toBe(200);
    const context = JSON.parse(contextRes.body);
    expect(context.teamContext).toBeDefined();
    expect(context.teamContext.isTeam).toBe(true);
    expect(context.teamContext.teamId).toBe('team-test-123');
  });

  it('workspace context omits teamContext for non-team workspaces', async () => {
    const contextRes = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/workspaces/${workspaceId}/context`,
    });
    const context = JSON.parse(contextRes.body);
    expect(context.teamContext).toBeUndefined();
  });
});
