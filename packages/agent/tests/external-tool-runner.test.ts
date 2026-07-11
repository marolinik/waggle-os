import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { BUILTIN_TOOL_MANIFESTS, type ToolManifest } from '@waggle/shared';
import {
  buildExternalToolEnv,
  runExternalTool,
  type ExternalProcessHandle,
} from '../src/external-tool-runner.js';
import { loadThirdPartyManifests } from '../src/tool-manifest-loader.js';

class FakeStream extends EventEmitter {
  override on(event: 'data', cb: (chunk: Buffer | string) => void): this {
    return super.on(event, cb);
  }
}

class FakeStdin {
  value = '';
  ended = false;
  write(value: string) { this.value += value; }
  end() { this.ended = true; }
}

class FakeChild extends EventEmitter implements ExternalProcessHandle {
  pid = 4321;
  stdout = new FakeStream();
  stderr = new FakeStream();
  stdin = new FakeStdin();
  override once(event: 'error' | 'exit', cb: (...args: never[]) => void): this {
    return super.once(event, cb);
  }
}

function manifest(id: string): ToolManifest {
  const found = BUILTIN_TOOL_MANIFESTS.find((item) => item.id === id);
  if (!found) throw new Error(`manifest not found: ${id}`);
  return found;
}

function baseRequest(id: string) {
  return {
    manifest: manifest(id),
    binary: `/bin/${id}`,
    workspaceId: 'workspace-1',
    workspacePath: '/workspace',
    runId: 'run-1',
    roomId: 'room-1',
    prompt: 'Review this workspace; do not leak $SECRETS',
    access: 'read-only' as const,
  };
}

describe('runExternalTool', () => {
  it('runs Claude Code headlessly with literal stdin and structured result parsing', async () => {
    const child = new FakeChild();
    let captured: { args: string[]; env: NodeJS.ProcessEnv } | undefined;
    const events: string[] = [];
    const promise = runExternalTool({
      ...baseRequest('claude-code'),
      onEvent: (event) => events.push(event.type),
    }, {
      resolveWorkspacePath: () => '/workspace',
      baseEnv: { PATH: '/bin', SUPER_SECRET: 'must-not-pass', ANTHROPIC_API_KEY: '12345678-secret' },
      spawnProcess: (_binary, args, options) => {
        captured = { args, env: options.env };
        queueMicrotask(() => {
          child.stdout.emit('data', '{"type":"system","session_id":"claude-session"}\n');
          child.stdout.emit('data', '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Read"}]}}\n');
          child.stdout.emit('data', '{"type":"result","result":"Claude finished","is_error":false}\n');
          child.emit('exit', 0);
        });
        return child;
      },
    });

    const result = await promise;
    expect(captured?.args).toEqual([
      '-p', '--safe-mode', '--disable-slash-commands', '--no-session-persistence',
      '--max-budget-usd', '0.25', '--input-format', 'text', '--output-format',
      'stream-json', '--verbose', '--permission-mode', 'plan',
    ]);
    expect(child.stdin.value).toBe(baseRequest('claude-code').prompt);
    expect(result).toMatchObject({ status: 'completed', summary: 'Claude finished', sessionId: 'claude-session' });
    expect(events).toContain('tool');
    expect(events.at(-1)).toBe('completed');
    expect(captured?.env.SUPER_SECRET).toBeUndefined();
    expect(captured?.env.WAGGLE_RUN_ID).toBe('run-1');
  });

  it('runs Codex through exec with an explicit workspace sandbox', async () => {
    const child = new FakeChild();
    let args: string[] = [];
    const promise = runExternalTool({
      ...baseRequest('codex'),
      access: 'workspace-write',
    }, {
      resolveWorkspacePath: () => 'C:\\workspace',
      spawnProcess: (_binary, value) => {
        args = value;
        queueMicrotask(() => {
          child.stdout.emit('data', '{"type":"thread.started","thread_id":"codex-session"}\n');
          child.stdout.emit('data', '{"type":"item.completed","item":{"type":"agent_message","text":"Codex finished"}}\n');
          child.emit('exit', 0);
        });
        return child;
      },
    });
    const result = await promise;
    expect(args).toEqual([
      '--ask-for-approval', 'never', '--sandbox', 'workspace-write', 'exec',
      '--ignore-user-config', '--ignore-rules', '--ephemeral', '--skip-git-repo-check',
      '--json', '--color', 'never', '-C', 'C:\\workspace', '-',
    ]);
    expect(child.stdin.value).toBe(baseRequest('codex').prompt);
    expect(result).toMatchObject({ status: 'completed', summary: 'Codex finished', sessionId: 'codex-session' });
  });

  it('uses Hermes quiet query mode without unsafe yolo/oneshot flags', async () => {
    const child = new FakeChild();
    let args: string[] = [];
    const prompt = baseRequest('hermes').prompt;
    const promise = runExternalTool({ ...baseRequest('hermes'), access: 'native' }, {
      resolveWorkspacePath: () => '/workspace',
      spawnProcess: (_binary, value) => {
        args = value;
        queueMicrotask(() => {
          child.stdout.emit('data', 'Hermes finished\nSession ID: hermes-session\n');
          child.emit('exit', 0);
        });
        return child;
      },
    });
    const result = await promise;
    expect(args).toEqual([
      'chat', '-q', prompt, '-Q', '--source', 'tool', '--ignore-rules',
      '--max-turns', '12', '--checkpoints',
    ]);
    expect(args).not.toContain('--yolo');
    expect(args).not.toContain('--oneshot');
    expect(child.stdin.value).toBe('');
    expect(result).toMatchObject({ status: 'completed', summary: 'Hermes finished', sessionId: 'hermes-session' });
  });

  it('keeps Hermes reasoning as progress and parses its stderr session trailer', async () => {
    const child = new FakeChild();
    const events: Array<{ type: string; text?: string }> = [];
    const promise = runExternalTool({
      ...baseRequest('hermes'),
      access: 'native',
      onEvent: (event) => events.push({ type: event.type, text: event.text }),
    }, {
      platform: 'win32',
      resolveWorkspacePath: () => 'C:\\workspace',
      spawnProcess: () => {
        queueMicrotask(() => {
          child.stdout.emit('data', '\u001b[2;3mInspecting the workspace first.\u001b[0m\r\n');
          child.stdout.emit('data', '\u001b[2;3mChecking the relevant tests.\u001b[0m\r\n');
          child.stdout.emit('data', 'Hermes completed the requested review.\r\n');
          child.stderr.emit('data', 'Warning: terminal capability fallback\r\n\rsession_');
          child.stderr.emit('data', 'id: 20260711_hermes123\r\n');
          child.emit('exit', 0);
        });
        return child;
      },
    });

    const result = await promise;
    expect(result).toMatchObject({
      status: 'completed',
      summary: 'Hermes completed the requested review.',
      sessionId: '20260711_hermes123',
    });
    expect(result.summary).not.toContain('\u001b');
    expect(result.stderrTail).toContain('terminal capability fallback');
    expect(events).toContainEqual({ type: 'progress', text: 'Inspecting the workspace first.' });
    expect(events).toContainEqual({ type: 'progress', text: 'Checking the relevant tests.' });
    expect(events.at(-1)).toEqual({ type: 'completed', text: result.summary });
  });

  it('binds OpenClaw to a managed workspace agent and deletes its prompt file', async () => {
    const child = new FakeChild();
    let args: string[] = [];
    let promptFileContent = '';
    let cleaned = false;
    const promise = runExternalTool({
      ...baseRequest('openclaw'),
      access: 'native',
      managedAgentId: 'waggle-workspace-1',
    }, {
      resolveWorkspacePath: () => '/workspace',
      createPromptFile: (prompt) => {
        promptFileContent = prompt;
        return { path: '/tmp/prompt.txt', cleanup: () => { cleaned = true; } };
      },
      spawnProcess: (_binary, value) => {
        args = value;
        queueMicrotask(() => {
          child.stdout.emit('data', JSON.stringify({
            status: 'ok', sessionId: 'openclaw-session', result: { payloads: [{ text: 'OpenClaw finished' }] },
          }));
          child.emit('exit', 0);
        });
        return child;
      },
    });
    const result = await promise;
    expect(args).toEqual([
      'agent', '--agent', 'waggle-workspace-1', '--session-key',
      'agent:waggle-workspace-1:waggle:run-1', '--message-file', '/tmp/prompt.txt',
      '--json', '--timeout', '600',
    ]);
    expect(promptFileContent).toBe(baseRequest('openclaw').prompt);
    expect(cleaned).toBe(true);
    expect(result).toMatchObject({ status: 'completed', summary: 'OpenClaw finished', sessionId: 'openclaw-session' });
  });

  it('rejects GUI-only tools instead of pretending that launch equals task execution', async () => {
    await expect(runExternalTool(baseRequest('cursor'), {
      resolveWorkspacePath: () => '/workspace',
      spawnProcess: () => { throw new Error('must not spawn'); },
    })).rejects.toThrow(/TOOL_NOT_HEADLESS/);
  });

  it('redacts the narrow collaboration credential from structured output', async () => {
    const child = new FakeChild();
    const token = 'run-token-that-must-never-be-persisted-12345';
    const promise = runExternalTool({
      ...baseRequest('claude-code'),
      dance: {
        url: 'http://127.0.0.1:3333', token,
        nodePath: '/runtime/node', cliEntry: '/runtime/hive-mind-cli.js',
      },
      dataDir: '/waggle-data',
    }, {
      resolveWorkspacePath: () => '/workspace',
      spawnProcess: () => {
        queueMicrotask(() => {
          child.stdout.emit('data', `{"type":"result","result":"accidental ${token}","is_error":false}\n`);
          child.emit('exit', 0);
        });
        return child;
      },
    });

    const result = await promise;
    expect(result.summary).toContain('[REDACTED]');
    expect(result.summary).not.toContain(token);
    expect(result.stdoutTail).not.toContain(token);
  });

  it('cancels one process tree exactly once', async () => {
    const child = new FakeChild();
    const controller = new AbortController();
    let kills = 0;
    const promise = runExternalTool({ ...baseRequest('claude-code'), signal: controller.signal }, {
      resolveWorkspacePath: () => '/workspace',
      spawnProcess: () => {
        queueMicrotask(() => {
          controller.abort();
          setTimeout(() => child.emit('exit', null), 0);
        });
        return child;
      },
      killTree: async () => { kills++; },
    });
    const result = await promise;
    expect(kills).toBe(1);
    expect(result.status).toBe('cancelled');
  });
});

describe('external adapter safety', () => {
  it('passes only an explicit environment allowlist plus run identity', () => {
    const env = buildExternalToolEnv(
      { PATH: '/bin', OPENAI_API_KEY: 'allowed-provider-key', DATABASE_URL: 'must-not-pass' },
      {
        runId: 'run', roomId: 'room', workspaceId: 'workspace',
        dance: {
          url: 'http://127.0.0.1:3333', token: 'run-token-123456789012345678901234',
          nodePath: '/runtime/node', cliEntry: '/runtime/hive-mind-cli.js',
        },
        dataDir: '/waggle-data',
      },
      '/workspace',
    );
    expect(env.PATH).toBe('/bin');
    expect(env.OPENAI_API_KEY).toBe('allowed-provider-key');
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.WAGGLE_DANCE_TEAM_ID).toBe('room::room');
    expect(env.WAGGLE_DANCE_URL).toBe('http://127.0.0.1:3333');
    expect(env.WAGGLE_RUN_TOKEN).toBe('run-token-123456789012345678901234');
    expect(env.WAGGLE_CLI_NODE_PATH).toBe('/runtime/node');
    expect(env.WAGGLE_CLI_ENTRY).toBe('/runtime/hive-mind-cli.js');
    expect(env.HIVE_MIND_DATA_DIR).toBe('/waggle-data');
  });

  it('loads only data-only generic task specs with known placeholders', () => {
    const base = {
      id: 'safe-cli', displayName: 'Safe', launchable: true, hookCapable: false,
      hookPointer: '.safe/hm.json', detect: { kind: 'path', binaryName: 'safe' },
    };
    const deps = (value: unknown) => ({
      dir: '/fake', readDir: () => ['adapter.json'], readFile: () => JSON.stringify(value),
    });
    const safe = loadThirdPartyManifests(deps({
      ...base,
      task: {
        argvTemplate: ['run', '--workspace', '{workspacePath}', '{prompt}'],
        accessArgs: { 'read-only': [] }, promptTransport: 'arg', outputDialect: 'jsonl',
        workspaceBinding: 'flag', permissionModes: ['read-only'], resumable: false,
      },
    }));
    expect(safe[0]?.capabilities?.headlessTask).toBe(true);

    expect(loadThirdPartyManifests(deps({
      ...base,
      task: {
        argvTemplate: ['run', '{executeJavascript}'], accessArgs: { native: [] },
        promptTransport: 'stdin', outputDialect: 'jsonl', workspaceBinding: 'cwd',
        permissionModes: ['native'], resumable: false,
      },
    }))).toEqual([]);
    expect(loadThirdPartyManifests(deps({ ...base, parserModule: './evil.js' }))).toEqual([]);
  });
});
