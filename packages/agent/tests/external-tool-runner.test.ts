import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BUILTIN_TOOL_MANIFESTS, type ToolManifest } from '@waggle/shared';
import {
  buildExternalToolEnv,
  runExternalTool,
  type ExternalRunEvent,
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

afterEach(() => {
  vi.useRealTimers();
});

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
      '-p', '--safe-mode', '--disable-slash-commands',
      '--max-budget-usd', '1.00', '--input-format', 'text', '--output-format',
      'stream-json', '--verbose', '--permission-mode', 'plan',
    ]);
    expect(captured?.args).not.toContain('--no-session-persistence');
    expect(child.stdin.value).toBe(baseRequest('claude-code').prompt);
    expect(result).toMatchObject({ status: 'completed', summary: 'Claude finished', sessionId: 'claude-session' });
    expect(events).toContain('tool');
    expect(events.at(-1)).toBe('completed');
    expect(captured?.env.SUPER_SECRET).toBeUndefined();
    expect(captured?.env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(captured?.env.WAGGLE_RUN_ID).toBe('run-1');
  });

  it('retains Claude assistant text while surfacing a zero-exit budget failure', async () => {
    const child = new FakeChild();
    const events: ExternalRunEvent[] = [];
    const promise = runExternalTool({
      ...baseRequest('claude-code'),
      onEvent: (event) => events.push(event),
    }, {
      resolveWorkspacePath: () => '/workspace',
      spawnProcess: () => {
        queueMicrotask(() => {
          child.stdout.emit('data', '{"type":"system","session_id":"claude-budget-session"}\n');
          child.stdout.emit('data', '{"type":"assistant","message":{"content":[{"type":"text","text":"OK"}]}}\n');
          child.stdout.emit('data', '{"type":"result","subtype":"error_max_budget_usd","is_error":false}\n');
          child.emit('exit', 0);
        });
        return child;
      },
    });

    const result = await promise;
    expect(result).toMatchObject({
      status: 'failed',
      summary: 'OK',
      error: 'error_max_budget_usd',
      sessionId: 'claude-budget-session',
    });
    expect(result.summary).not.toContain('"type":"system"');
    expect(events.at(-1)).toMatchObject({ type: 'failed', text: 'error_max_budget_usd' });
  });

  it('fails an empty Claude structured result without exposing protocol JSON', async () => {
    const child = new FakeChild();
    const promise = runExternalTool(baseRequest('claude-code'), {
      resolveWorkspacePath: () => '/workspace',
      spawnProcess: () => {
        queueMicrotask(() => {
          child.stdout.emit('data', '{"type":"system","session_id":"empty-session"}\n');
          child.stdout.emit('data', '{"type":"result","subtype":"success","is_error":false}\n');
          child.emit('exit', 0);
        });
        return child;
      },
    });

    const result = await promise;
    expect(result).toMatchObject({
      status: 'failed',
      summary: 'Claude Code completed without a final response',
      error: 'Claude Code completed without a final response',
      sessionId: 'empty-session',
    });
    expect(result.summary).not.toContain('"type":"system"');
    expect(result.stdoutTail).toContain('"type":"system"');
  });

  it('resumes the persisted Claude session without weakening safe mode', async () => {
    const child = new FakeChild();
    let args: string[] = [];
    const promise = runExternalTool({
      ...baseRequest('claude-code'),
      sessionId: 'claude-session',
    }, {
      resolveWorkspacePath: () => '/workspace',
      spawnProcess: (_binary, value) => {
        args = value;
        queueMicrotask(() => {
          child.stdout.emit('data', '{"type":"result","result":"Resumed","is_error":false}\n');
          child.emit('exit', 0);
        });
        return child;
      },
    });

    await expect(promise).resolves.toMatchObject({ status: 'completed', summary: 'Resumed' });
    expect(args).toEqual([
      '-p', '--safe-mode', '--disable-slash-commands', '--resume', 'claude-session',
      '--max-budget-usd', '1.00', '--input-format', 'text', '--output-format',
      'stream-json', '--verbose', '--permission-mode', 'plan',
    ]);
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
      '--ignore-user-config', '--ignore-rules', '--skip-git-repo-check',
      '--json', '--color', 'never', '-C', 'C:\\workspace', '-',
    ]);
    expect(args).not.toContain('--ephemeral');
    expect(child.stdin.value).toBe(baseRequest('codex').prompt);
    expect(result).toMatchObject({ status: 'completed', summary: 'Codex finished', sessionId: 'codex-session' });
  });

  it('resumes Codex with exec-level flags before the resume subcommand', async () => {
    const child = new FakeChild();
    let args: string[] = [];
    const promise = runExternalTool({
      ...baseRequest('codex'),
      sessionId: '00000000-0000-0000-0000-000000000000',
    }, {
      resolveWorkspacePath: () => 'C:\\workspace',
      spawnProcess: (_binary, value) => {
        args = value;
        queueMicrotask(() => {
          child.stdout.emit('data', '{"type":"item.completed","item":{"type":"agent_message","text":"Codex resumed"}}\n');
          child.emit('exit', 0);
        });
        return child;
      },
    });

    await expect(promise).resolves.toMatchObject({ status: 'completed', summary: 'Codex resumed' });
    expect(args).toEqual([
      '--ask-for-approval', 'never', '--sandbox', 'read-only', 'exec',
      '--ignore-user-config', '--ignore-rules', '--skip-git-repo-check',
      '--color', 'never', '-C', 'C:\\workspace', 'resume', '--json',
      '00000000-0000-0000-0000-000000000000', '-',
    ]);
    expect(args).not.toContain('--ephemeral');
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

  it('emits one stall per quiet episode, recovers on output, and clears its watchdog on exit', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const child = new FakeChild();
    const events: ExternalRunEvent[] = [];
    const promise = runExternalTool({
      ...baseRequest('claude-code'),
      timeoutMs: 120_000,
      stallAfterMs: 30_000,
      onEvent: (event) => events.push(event),
    }, {
      resolveWorkspacePath: () => '/workspace',
      spawnProcess: () => child,
    });

    await vi.advanceTimersByTimeAsync(30_000);
    expect(events.filter((event) => event.stalled === true)).toHaveLength(1);
    expect(events).toContainEqual(expect.objectContaining({
      type: 'progress',
      text: '[stalled] no output for 30s',
      stalled: true,
    }));

    await vi.advanceTimersByTimeAsync(30_000);
    expect(events.filter((event) => event.stalled === true)).toHaveLength(1);

    child.stdout.emit('data', '{"type":"system"}\n');
    expect(events).toContainEqual(expect.objectContaining({
      type: 'progress',
      text: '[recovered] output resumed',
      stalled: false,
    }));

    await vi.advanceTimersByTimeAsync(30_000);
    expect(events.filter((event) => event.stalled === true)).toHaveLength(2);

    child.emit('exit', 0);
    await promise;
    const eventCountAtExit = events.length;
    await vi.advanceTimersByTimeAsync(300_000);
    expect(events).toHaveLength(eventCountAtExit);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not emit a stall after cancellation while process exit is pending', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const child = new FakeChild();
    const controller = new AbortController();
    const events: ExternalRunEvent[] = [];
    const promise = runExternalTool({
      ...baseRequest('claude-code'),
      timeoutMs: 120_000,
      stallAfterMs: 30_000,
      signal: controller.signal,
      onEvent: (event) => events.push(event),
    }, {
      resolveWorkspacePath: () => '/workspace',
      spawnProcess: () => child,
      killTree: async () => undefined,
    });

    await vi.advanceTimersByTimeAsync(10_000);
    controller.abort();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(events.some((event) => event.stalled === true)).toBe(false);

    child.emit('exit', null);
    await expect(promise).resolves.toMatchObject({ status: 'cancelled' });
  });

  it.each([
    ['uses the default', undefined, 120_000],
    ['respects an override', 45_000, 45_000],
    ['clamps short overrides', 1_000, 30_000],
  ])('%s stall delay', async (_label, configuredStallAfterMs, expectedStallAfterMs) => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const child = new FakeChild();
    const events: ExternalRunEvent[] = [];
    const promise = runExternalTool({
      ...baseRequest('claude-code'),
      timeoutMs: 300_000,
      ...(configuredStallAfterMs === undefined ? {} : { stallAfterMs: configuredStallAfterMs }),
      onEvent: (event) => events.push(event),
    }, {
      resolveWorkspacePath: () => '/workspace',
      spawnProcess: () => child,
    });

    await vi.advanceTimersByTimeAsync(expectedStallAfterMs - 1);
    expect(events.some((event) => event.stalled === true)).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(events.filter((event) => event.stalled === true)).toHaveLength(1);

    child.emit('exit', 0);
    await promise;
  });

  it('disables the stall watchdog when its threshold is not below the run timeout', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const child = new FakeChild();
    const events: ExternalRunEvent[] = [];
    const promise = runExternalTool({
      ...baseRequest('claude-code'),
      timeoutMs: 30_000,
      stallAfterMs: 30_000,
      onEvent: (event) => events.push(event),
    }, {
      resolveWorkspacePath: () => '/workspace',
      spawnProcess: () => child,
      killTree: async () => undefined,
    });

    await vi.advanceTimersByTimeAsync(30_000);
    expect(events.some((event) => event.stalled !== undefined)).toBe(false);
    child.emit('exit', null);
    await expect(promise).resolves.toMatchObject({ status: 'timed_out' });
  });
});

describe('external adapter safety', () => {
  it('passes OS context and explicit run identity but no ambient secrets', () => {
    const env = buildExternalToolEnv(
      {
        PATH: 'C:\\Windows\\System32', USERPROFILE: 'C:\\Users\\tester',
        APPDATA: 'C:\\Users\\tester\\AppData\\Roaming', TERM: 'xterm-256color',
        ANTHROPIC_API_KEY: 'anthropic-secret', OPENAI_API_KEY: 'openai-secret',
        OPENROUTER_API_KEY: 'openrouter-secret', GOOGLE_API_KEY: 'google-secret',
        GEMINI_API_KEY: 'gemini-secret', XAI_API_KEY: 'xai-secret',
        STRIPE_SECRET_KEY: 'stripe-secret', AWS_SECRET_ACCESS_KEY: 'aws-secret',
        DATABASE_URL: 'database-secret', SSH_AUTH_SOCK: 'credential-socket',
        GIT_ASKPASS: 'credential-helper', HTTPS_PROXY: 'https://user:secret@proxy.invalid',
        NODE_OPTIONS: '--require C:\\malicious.js', WAGGLE_RUN_TOKEN: 'stale-token',
      },
      {
        runId: 'run', roomId: 'room', workspaceId: 'workspace',
        dance: {
          url: 'http://127.0.0.1:3333', token: 'run-token-123456789012345678901234',
          nodePath: '/runtime/node', cliEntry: '/runtime/hive-mind-cli.js',
        },
        dataDir: '/waggle-data',
      },
      '/workspace',
      'win32',
    );
    expect(env).toMatchObject({
      PATH: 'C:\\Windows\\System32',
      USERPROFILE: 'C:\\Users\\tester',
      APPDATA: 'C:\\Users\\tester\\AppData\\Roaming',
      TERM: 'xterm-256color',
    });
    for (const name of [
      'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY',
      'GOOGLE_API_KEY', 'GEMINI_API_KEY', 'XAI_API_KEY',
      'STRIPE_SECRET_KEY', 'AWS_SECRET_ACCESS_KEY', 'DATABASE_URL',
      'SSH_AUTH_SOCK', 'GIT_ASKPASS', 'HTTPS_PROXY', 'NODE_OPTIONS',
    ]) {
      expect(env[name], name).toBeUndefined();
    }
    expect(env.WAGGLE_DANCE_TEAM_ID).toBe('room::room');
    expect(env.WAGGLE_DANCE_URL).toBe('http://127.0.0.1:3333');
    expect(env.WAGGLE_RUN_TOKEN).toBe('run-token-123456789012345678901234');
    expect(env.WAGGLE_CLI_NODE_PATH).toBe('/runtime/node');
    expect(env.WAGGLE_CLI_ENTRY).toBe('/runtime/hive-mind-cli.js');
    expect(env.HIVE_MIND_DATA_DIR).toBe('/waggle-data');

    const withoutDance = buildExternalToolEnv(
      { WAGGLE_RUN_TOKEN: 'stale-ambient-token' },
      { runId: 'run', roomId: 'room', workspaceId: 'workspace' },
      '/workspace',
      'win32',
    );
    expect(withoutDance.WAGGLE_RUN_TOKEN).toBeUndefined();
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
