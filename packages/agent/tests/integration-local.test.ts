import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runAgentLoop, type AgentLoopConfig } from '../src/agent-loop.js';
import { createSystemTools } from '../src/system-tools.js';
import { Workspace } from '../src/workspace.js';

/**
 * Helper: create a mock fetch that returns predefined OpenAI-format responses in sequence.
 */
function mockFetch(
  responses: Array<{
    content: string | null;
    tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
    usage?: { prompt_tokens: number; completion_tokens: number };
  }>
) {
  let callIndex = 0;
  return vi.fn(async (_url: string, _init?: RequestInit) => {
    const resp = responses[callIndex++];
    const body = {
      choices: [
        {
          message: {
            role: 'assistant' as const,
            content: resp.content,
            tool_calls: resp.tool_calls,
          },
          finish_reason: resp.tool_calls ? 'tool_calls' : 'stop',
        },
      ],
      usage: resp.usage ?? { prompt_tokens: 10, completion_tokens: 5 },
    };
    return {
      ok: true,
      status: 200,
      json: async () => body,
    } as unknown as Response;
  });
}

function makeConfig(overrides: Partial<AgentLoopConfig> = {}): AgentLoopConfig {
  return {
    litellmUrl: 'http://localhost:4000',
    litellmApiKey: 'test-key',
    model: 'gpt-4',
    systemPrompt: 'You are a helpful assistant.',
    tools: [],
    messages: [{ role: 'user', content: 'Hello' }],
    ...overrides,
  };
}

describe('Integration: Local Mode', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-integration-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('agent uses system tools to read and write files', async () => {
    // 1. Create a test file in workspace
    const testContent = 'Hello from the test file!\nLine two.';
    fs.writeFileSync(path.join(tmpDir, 'test.txt'), testContent, 'utf-8');

    // 2. Create system tools scoped to workspace
    const tools = createSystemTools(tmpDir);

    // 3. Mock LiteLLM fetch that simulates tool use:
    //    - First call: agent decides to read_file
    //    - Second call: agent responds with file contents
    const fetch = mockFetch([
      {
        content: null,
        tool_calls: [
          {
            id: 'call_read_1',
            function: {
              name: 'read_file',
              arguments: JSON.stringify({ path: 'test.txt' }),
            },
          },
        ],
      },
      {
        content: `I read the file. It contains: ${testContent}`,
      },
    ]);

    // 4. Run agent loop with mock fetch
    const result = await runAgentLoop(
      makeConfig({
        fetch,
        tools,
        messages: [{ role: 'user', content: 'Read the file test.txt' }],
      })
    );

    // 5. Verify result contains file content
    expect(result.content).toContain(testContent);

    // 6. Verify toolsUsed includes 'read_file'
    expect(result.toolsUsed).toContain('read_file');

    // Verify fetch was called twice (tool call + final response)
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('workspace logs session and audit', () => {
    // 1. Create workspace, init it
    const ws = new Workspace(tmpDir);
    ws.init();

    // 2. Start session, log turns and audit
    const sessionId = ws.startSession();

    ws.logTurn(sessionId, 'user', 'What is 2+2?');
    ws.logTurn(sessionId, 'assistant', 'The answer is 4.', ['calculator']);
    ws.logAudit(sessionId, 'calculator', { expression: '2+2' }, '4');

    // 3. Verify JSONL files exist with correct content
    const sessionsDir = path.join(tmpDir, '.waggle', 'sessions');
    const auditDir = path.join(tmpDir, '.waggle', 'audit');

    const sessionFile = path.join(sessionsDir, `${sessionId}.jsonl`);
    const auditFile = path.join(auditDir, `${sessionId}.jsonl`);

    expect(fs.existsSync(sessionFile)).toBe(true);
    expect(fs.existsSync(auditFile)).toBe(true);

    // Parse session JSONL
    const sessionLines = fs.readFileSync(sessionFile, 'utf-8').trim().split('\n');
    expect(sessionLines).toHaveLength(2);

    const turn1 = JSON.parse(sessionLines[0]);
    expect(turn1.role).toBe('user');
    expect(turn1.content).toBe('What is 2+2?');
    expect(turn1.tools_used).toBeUndefined();

    const turn2 = JSON.parse(sessionLines[1]);
    expect(turn2.role).toBe('assistant');
    expect(turn2.content).toBe('The answer is 4.');
    expect(turn2.tools_used).toEqual(['calculator']);

    // Parse audit JSONL
    const auditLines = fs.readFileSync(auditFile, 'utf-8').trim().split('\n');
    expect(auditLines).toHaveLength(1);

    const auditEntry = JSON.parse(auditLines[0]);
    expect(auditEntry.tool).toBe('calculator');
    expect(auditEntry.input).toEqual({ expression: '2+2' });
    expect(auditEntry.output).toBe('4');
    expect(auditEntry.timestamp).toBeDefined();
  });

  it('system tools write and edit files', async () => {
    // 1. Create system tools
    const tools = createSystemTools(tmpDir);
    const toolMap = new Map(tools.map((t) => [t.name, t]));

    // 2. Use write_file tool to create a file
    const writeResult = await toolMap.get('write_file')!.execute({
      path: 'output.txt',
      content: 'Hello World',
    });
    expect(writeResult).toContain('Successfully wrote');

    // Verify file was created
    const filePath = path.join(tmpDir, 'output.txt');
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('Hello World');

    // 3. Use edit_file tool to modify it
    const editResult = await toolMap.get('edit_file')!.execute({
      path: 'output.txt',
      old_string: 'World',
      new_string: 'Waggle',
    });
    expect(editResult).toContain('Successfully edited');

    // 4. Verify final file content
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('Hello Waggle');
  });

  it('agent loop handles tool errors gracefully', async () => {
    // 1. Create system tools
    const tools = createSystemTools(tmpDir);

    // 2. Mock fetch that calls read_file on non-existent file
    const fetch = mockFetch([
      {
        content: null,
        tool_calls: [
          {
            id: 'call_err_1',
            function: {
              name: 'read_file',
              arguments: JSON.stringify({ path: 'nonexistent.txt' }),
            },
          },
        ],
      },
      {
        content: 'The file does not exist. I could not read it.',
      },
    ]);

    // 3. Verify agent loop handles the error and continues
    const result = await runAgentLoop(
      makeConfig({
        fetch,
        tools,
        messages: [{ role: 'user', content: 'Read nonexistent.txt' }],
      })
    );

    // The agent should complete without throwing
    expect(result.content).toContain('does not exist');
    expect(result.toolsUsed).toContain('read_file');

    // Verify the tool result message sent to LLM contains the error
    const secondCallBody = JSON.parse(fetch.mock.calls[1][1]!.body as string);
    const toolMsg = secondCallBody.messages.find(
      (m: any) => m.role === 'tool' && m.tool_call_id === 'call_err_1'
    );
    expect(toolMsg).toBeDefined();
    expect(toolMsg.content).toContain('Error:');
  });

  it('agent writes a file via tool call and it persists on disk', async () => {
    const tools = createSystemTools(tmpDir);

    const fetch = mockFetch([
      {
        content: null,
        tool_calls: [
          {
            id: 'call_write_1',
            function: {
              name: 'write_file',
              arguments: JSON.stringify({
                path: 'created-by-agent.txt',
                content: 'Agent was here!',
              }),
            },
          },
        ],
      },
      {
        content: 'I created the file.',
      },
    ]);

    const result = await runAgentLoop(
      makeConfig({
        fetch,
        tools,
        messages: [{ role: 'user', content: 'Create a file' }],
      })
    );

    expect(result.toolsUsed).toContain('write_file');

    // Verify the file actually exists on disk
    const filePath = path.join(tmpDir, 'created-by-agent.txt');
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('Agent was here!');
  });

  it('full flow: workspace + agent loop + logging', async () => {
    // Combine workspace logging with agent loop execution
    const ws = new Workspace(tmpDir);
    ws.init();
    const sessionId = ws.startSession();

    // Create a test file
    fs.writeFileSync(path.join(tmpDir, 'data.txt'), 'key=value', 'utf-8');

    const tools = createSystemTools(tmpDir);
    const onToolUse = vi.fn((name: string, input: Record<string, unknown>) => {
      ws.logAudit(sessionId, name, input, 'pending');
    });

    const userMessage = 'Read data.txt';
    ws.logTurn(sessionId, 'user', userMessage);

    const fetch = mockFetch([
      {
        content: null,
        tool_calls: [
          {
            id: 'call_full_1',
            function: {
              name: 'read_file',
              arguments: JSON.stringify({ path: 'data.txt' }),
            },
          },
        ],
      },
      {
        content: 'The file contains key=value',
      },
    ]);

    const result = await runAgentLoop(
      makeConfig({
        fetch,
        tools,
        messages: [{ role: 'user', content: userMessage }],
        onToolUse,
      })
    );

    ws.logTurn(sessionId, 'assistant', result.content, result.toolsUsed);

    // Verify session log has both turns
    const sessionFile = path.join(tmpDir, '.waggle', 'sessions', `${sessionId}.jsonl`);
    const sessionLines = fs.readFileSync(sessionFile, 'utf-8').trim().split('\n');
    expect(sessionLines).toHaveLength(2);

    const userTurn = JSON.parse(sessionLines[0]);
    expect(userTurn.role).toBe('user');

    const assistantTurn = JSON.parse(sessionLines[1]);
    expect(assistantTurn.role).toBe('assistant');
    expect(assistantTurn.tools_used).toContain('read_file');

    // Verify audit log was written via onToolUse
    const auditFile = path.join(tmpDir, '.waggle', 'audit', `${sessionId}.jsonl`);
    expect(fs.existsSync(auditFile)).toBe(true);
    const auditLines = fs.readFileSync(auditFile, 'utf-8').trim().split('\n');
    expect(auditLines.length).toBeGreaterThanOrEqual(1);

    const auditEntry = JSON.parse(auditLines[0]);
    expect(auditEntry.tool).toBe('read_file');

    // Verify onToolUse was called
    expect(onToolUse).toHaveBeenCalledWith('read_file', { path: 'data.txt' });
  });
});
