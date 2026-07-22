import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertQualifiedChatCase,
  assertCopiedModelIdentity,
  assertObservedDispatch,
  assertRuntimeStartOwned,
  assertSourceSnapshot,
  aliasesForOwnedCleanup,
  BUDGET_PROMPT,
  buildOwnedProxyTarget,
  buildRouterSettings,
  buildSanitizedEnvironment,
  canonicalizeManifestDigest,
  parseSse,
  partitionWindowsProcesses,
  postJsonForStatus,
  recordAliasBeforeCopy,
} from './qualify-smart-router.js';
import { routeMessage } from '../packages/agent/src/smart-router.js';

describe('qualify-smart-router helpers', () => {
  it('strictly parses JSON SSE events', () => {
    const events = parseSse([
      'event: token',
      'data: {"content":"hello"}',
      '',
      'event: model_switch',
      'data: {"model":"ollama/fallback","reason":"primary unavailable; configured fallback selected","primary":"ollama/primary"}',
      '',
      'event: done',
      'data: {"content":"hello","model":"ollama/fallback","toolsUsed":[]}',
      '',
    ].join('\r\n'));

    assert.deepEqual(events, [
      { event: 'token', data: { content: 'hello' } },
      {
        event: 'model_switch',
        data: {
          model: 'ollama/fallback',
          reason: 'primary unavailable; configured fallback selected',
          primary: 'ollama/primary',
        },
      },
      { event: 'done', data: { content: 'hello', model: 'ollama/fallback', toolsUsed: [] } },
    ]);
  });

  it('rejects malformed or ambiguous SSE frames', () => {
    assert.throws(() => parseSse('data: {"content":"orphan"}\n\n'), /event field/i);
    assert.throws(() => parseSse('event: done\nevent: done\ndata: {}\n\n'), /duplicate event/i);
    assert.throws(() => parseSse('event: done\ndata: not-json\n\n'), /invalid JSON/i);
    assert.throws(() => parseSse('event: done\nunknown: value\n\n'), /unsupported SSE field/i);
  });

  it('requires HTTP SSE success, one done, content, expected model, and exact switch policy', () => {
    const rawSse = [
      'event: tool',
      'data: {"name":"auto_recall","input":{"query":"test"}}',
      '',
      'event: tool_result',
      'data: {"name":"auto_recall","result":"No relevant memories found","isError":false}',
      '',
      'event: model_switch',
      'data: {"model":"ollama/fallback","reason":"ollama/primary unavailable; configured fallback selected","primary":"ollama/primary"}',
      '',
      'event: token',
      'data: {"content":"fallback answer"}',
      '',
      'event: done',
      'data: {"content":"fallback answer","model":"ollama/fallback","toolsUsed":[]}',
      '',
    ].join('\n');

    const result = assertQualifiedChatCase({
      httpStatus: 200,
      contentType: 'text/event-stream; charset=utf-8',
      rawSse,
      expectedModel: 'ollama/fallback',
      expectedSwitch: {
        model: 'ollama/fallback',
        primary: 'ollama/primary',
        reason: 'ollama/primary unavailable; configured fallback selected',
      },
    });

    assert.equal(result.content, 'fallback answer');
    assert.equal(result.events.filter(({ event }) => event === 'done').length, 1);
    assert.equal(result.events.filter(({ event }) => event === 'model_switch').length, 1);
  });

  it('fails closed on errors, duplicate done events, wrong models, or unexpected switches', () => {
    const done = 'event: token\ndata: {"content":"ok"}\n\nevent: done\ndata: {"content":"ok","model":"ollama/primary","toolsUsed":[]}\n\n';
    assert.throws(() => assertQualifiedChatCase({
      httpStatus: 500,
      contentType: 'text/event-stream',
      rawSse: done,
      expectedModel: 'ollama/primary',
    }), /HTTP 200/i);
    assert.throws(() => assertQualifiedChatCase({
      httpStatus: 200,
      contentType: 'application/json',
      rawSse: done,
      expectedModel: 'ollama/primary',
    }), /text\/event-stream/i);
    assert.throws(() => assertQualifiedChatCase({
      httpStatus: 200,
      contentType: 'text/event-stream',
      rawSse: `event: error\ndata: {"message":"boom"}\n\n${done}`,
      expectedModel: 'ollama/primary',
    }), /zero error/i);
    assert.throws(() => assertQualifiedChatCase({
      httpStatus: 200,
      contentType: 'text/event-stream',
      rawSse: done + done,
      expectedModel: 'ollama/primary',
    }), /exactly one done/i);
    assert.throws(() => assertQualifiedChatCase({
      httpStatus: 200,
      contentType: 'text/event-stream',
      rawSse: done,
      expectedModel: 'ollama/budget',
    }), /done\.model/i);
    assert.throws(() => assertQualifiedChatCase({
      httpStatus: 200,
      contentType: 'text/event-stream',
      rawSse: `event: model_switch\ndata: {"model":"ollama/fallback","reason":"unexpected","primary":"ollama/primary"}\n\n${done}`,
      expectedModel: 'ollama/primary',
    }), /zero model_switch/i);
    assert.throws(() => assertQualifiedChatCase({
      httpStatus: 200,
      contentType: 'text/event-stream',
      rawSse: `${done}event: step\ndata: {"content":"late"}\n\n`,
      expectedModel: 'ollama/primary',
    }), /final event/i);
    assert.throws(() => assertQualifiedChatCase({
      httpStatus: 200,
      contentType: 'text/event-stream',
      rawSse: 'event: token\ndata: {"content":"different"}\n\nevent: done\ndata: {"content":"ok","model":"ollama/primary","toolsUsed":[]}\n\n',
      expectedModel: 'ollama/primary',
    }), /token content/i);
    assert.throws(() => assertQualifiedChatCase({
      httpStatus: 200,
      contentType: 'text/event-stream',
      rawSse: 'event: token\ndata: {"content":"ok"}\n\nevent: done\ndata: {"content":"ok","model":"ollama/primary","toolsUsed":["bash"]}\n\n',
      expectedModel: 'ollama/primary',
    }), /zero tools/i);
    assert.throws(() => assertQualifiedChatCase({
      httpStatus: 200,
      contentType: 'text/event-stream',
      rawSse: 'event: tool\ndata: {"name":"bash","input":{}}\n\nevent: token\ndata: {"content":"ok"}\n\nevent: done\ndata: {"content":"ok","model":"ollama/primary","toolsUsed":[]}\n\n',
      expectedModel: 'ollama/primary',
    }), /zero tools/i);
  });

  it('canonicalizes immutable Ollama manifest digests and rejects weak identities', () => {
    const digest = 'A'.repeat(64);
    assert.equal(canonicalizeManifestDigest(digest), `sha256:${'a'.repeat(64)}`);
    assert.equal(canonicalizeManifestDigest(`sha256:${digest}`), `sha256:${'a'.repeat(64)}`);
    assert.throws(() => canonicalizeManifestDigest('latest'), /manifest digest/i);
  });

  it('requires a newly started owned watchdog and Ollama process', () => {
    assert.doesNotThrow(() => assertRuntimeStartOwned({
      installedNow: false,
      startedNow: true,
      status: { source: 'waggle-managed', running: true },
    }, [
      { processId: 101, name: 'node.exe', executablePath: 'C:\\node.exe', creationDate: 'one' },
      { processId: 102, name: 'ollama.exe', executablePath: 'C:\\proof\\ollama.exe', creationDate: 'two' },
    ]));
    assert.throws(() => assertRuntimeStartOwned({
      installedNow: false,
      startedNow: false,
      status: { source: 'waggle-managed', running: true },
    }, []), /newly started/i);
  });

  it('does not classify the qualifier or launcher as an owned runtime process', () => {
    const runtimeRoot = 'C:\\proof\\managed-runtime';
    const snapshot = partitionWindowsProcesses([
      {
        processId: 100,
        name: 'node.exe',
        executablePath: 'C:\\Program Files\\nodejs\\node.exe',
        creationDate: 'one',
        commandLine: `node qualify-smart-router.ts --runtime-data-dir ${runtimeRoot}`,
      },
      {
        processId: 101,
        name: 'node.exe',
        executablePath: 'C:\\Program Files\\nodejs\\node.exe',
        creationDate: 'two',
        commandLine: `node -e "const stopTree = () => {}; process.once('disconnect', stopTree)" ${runtimeRoot}\\runtimes\\ollama\\0.32.0\\ollama.exe ["serve"]`,
      },
      {
        processId: 102,
        name: 'ollama.exe',
        executablePath: `${runtimeRoot}\\runtimes\\ollama\\0.32.0\\ollama.exe`,
        creationDate: 'three',
        commandLine: 'ollama.exe serve',
      },
      {
        processId: 103,
        name: 'ollama.exe',
        executablePath: 'C:\\Program Files\\Ollama\\ollama.exe',
        creationDate: 'four',
        commandLine: 'ollama.exe serve',
      },
    ], runtimeRoot, new Set([100]));

    assert.deepEqual(snapshot.owned.map(({ processId }) => processId), [101, 102]);
    assert.deepEqual(snapshot.externalOllama.map(({ processId }) => processId), [103]);
  });

  it('never mutates aliases when runtime ownership was not confirmed', () => {
    assert.deepEqual(aliasesForOwnedCleanup(false, ['primary:latest', 'fallback:latest']), []);
    assert.deepEqual(aliasesForOwnedCleanup(true, ['primary:latest', 'fallback:latest']), [
      'primary:latest',
      'fallback:latest',
    ]);
  });

  it('records an owned alias before a copy response can fail', async () => {
    const attemptedAliases = new Set<string>();
    await assert.rejects(() => recordAliasBeforeCopy(
      attemptedAliases,
      'primary:latest',
      async () => { throw new Error('response lost'); },
    ), /response lost/i);
    assert.deepEqual([...attemptedAliases], ['primary:latest']);
  });

  it('accepts an empty successful Ollama copy response and rejects failed status', async () => {
    await assert.doesNotReject(() => postJsonForStatus(
      'http://127.0.0.1:11434/api/copy',
      { source: 'base', destination: 'alias' },
      async () => new Response(null, { status: 200 }),
    ));
    await assert.rejects(() => postJsonForStatus(
      'http://127.0.0.1:11434/api/copy',
      { source: 'base', destination: 'alias' },
      async () => new Response('copy failed', { status: 500 }),
    ), /HTTP 500.*copy failed/i);
  });

  it('pins audit-proxy requests to the owned runtime origin', () => {
    assert.equal(
      buildOwnedProxyTarget('/v1/chat/completions?proof=1', 'http://127.0.0.1:51111').href,
      'http://127.0.0.1:51111/v1/chat/completions?proof=1',
    );
    assert.throws(() => buildOwnedProxyTarget(
      'http://foreign.example/v1/chat/completions',
      'http://127.0.0.1:51111',
    ), /absolute-form/i);
    assert.throws(() => buildOwnedProxyTarget(
      '//foreign.example/v1/chat/completions',
      'http://127.0.0.1:51111',
    ), /absolute-form/i);
  });

  it('binds every copied alias to the immutable base-model digest', () => {
    const digest = 'a'.repeat(64);
    const aliases = {
      primary: 'router-primary:latest',
      budget: 'router-budget:latest',
      fallback: 'router-fallback:latest',
    };
    assert.deepEqual(assertCopiedModelIdentity({
      baseModel: 'qwen3:1.7b',
      aliases,
      models: [
        { name: 'qwen3:1.7b', digest },
        ...Object.values(aliases).map((name) => ({ name, digest: `sha256:${digest}` })),
      ],
    }), {
      baseModelDigest: `sha256:${digest}`,
      aliasDigests: Object.fromEntries(Object.values(aliases).map((name) => [name, `sha256:${digest}`])),
    });
    assert.throws(() => assertCopiedModelIdentity({
      baseModel: 'qwen3:1.7b',
      aliases,
      models: [
        { name: 'qwen3:1.7b', digest },
        { name: aliases.primary, digest: 'b'.repeat(64) },
        { name: aliases.budget, digest },
        { name: aliases.fallback, digest },
      ],
    }), /does not match the base model digest/i);
  });

  it('requires independently observed Ollama dispatch to the expected alias', () => {
    const dispatches = [
      { at: 'now', path: '/v1/chat/completions', model: 'router-primary:latest', bodySha256: 'a'.repeat(64) },
    ];
    assert.deepEqual(assertObservedDispatch(dispatches, 0, 'router-primary:latest'), dispatches);
    assert.throws(() => assertObservedDispatch(dispatches, 0, 'router-budget:latest'), /observed Ollama dispatch/i);
  });

  it('builds the real model-pilot settings payload', () => {
    assert.deepEqual(buildRouterSettings({
      primary: 'router-primary:latest',
      budget: 'router-budget:latest',
      fallback: 'router-fallback:latest',
    }), {
      defaultModel: 'ollama/router-primary:latest',
      budgetModel: 'ollama/router-budget:latest',
      fallbackModel: 'ollama/router-fallback:latest',
      dailyBudget: 1,
      budgetHardCap: false,
      budgetThreshold: 0.8,
      providers: {},
    });
  });

  it('keeps the exact live arithmetic prompt inside the closed budget allowlist', () => {
    assert.deepEqual(routeMessage(BUDGET_PROMPT, 'ollama/primary', 'ollama/budget'), {
      model: 'ollama/budget',
      reason: 'simple_turn',
    });
  });

  it('fails sealing when the source snapshot changes during qualification', () => {
    assert.doesNotThrow(() => assertSourceSnapshot({
      expectedRevision: 'a'.repeat(40),
      expectedScriptSha256: 'b'.repeat(64),
      actualRevision: 'a'.repeat(40),
      trackedStatus: '',
      actualScriptSha256: 'b'.repeat(64),
    }));
    assert.throws(() => assertSourceSnapshot({
      expectedRevision: 'a'.repeat(40),
      expectedScriptSha256: 'b'.repeat(64),
      actualRevision: 'c'.repeat(40),
      trackedStatus: '',
      actualScriptSha256: 'b'.repeat(64),
    }), /source revision changed/i);
    assert.throws(() => assertSourceSnapshot({
      expectedRevision: 'a'.repeat(40),
      expectedScriptSha256: 'b'.repeat(64),
      actualRevision: 'a'.repeat(40),
      trackedStatus: ' M packages/server/src/local/routes/chat.ts',
      actualScriptSha256: 'b'.repeat(64),
    }), /tracked source changed/i);
  });

  it('removes every provider, proxy, Docker, and inherited Waggle runtime credential', () => {
    const environment = buildSanitizedEnvironment({
      PATH: 'safe-path',
      ANTHROPIC_API_KEY: 'secret',
      OPENAI_API_KEY: 'secret',
      GEMINI_API_KEY: 'secret',
      GOOGLE_API_KEY: 'secret',
      XAI_API_KEY: 'secret',
      DEEPSEEK_API_KEY: 'secret',
      MISTRAL_API_KEY: 'secret',
      DASHSCOPE_API_KEY: 'secret',
      MINIMAX_API_KEY: 'secret',
      ZHIPU_API_KEY: 'secret',
      MOONSHOT_API_KEY: 'secret',
      PERPLEXITY_API_KEY: 'secret',
      OPENROUTER_API_KEY: 'secret',
      VOYAGE_API_KEY: 'secret',
      WAGGLE_VOYAGE_API_KEY: 'secret',
      LITELLM_API_KEY: 'secret',
      LITELLM_MASTER_KEY: 'secret',
      WAGGLE_LITELLM_URL: 'https://proxy.example',
      DOCKER_HOST: 'tcp://docker.example',
      WAGGLE_DATA_DIR: 'foreign-data',
      OLLAMA_HOST: 'http://127.0.0.1:11434',
      http_proxy: 'http://lowercase-proxy.example',
      https_proxy: 'http://lowercase-proxy.example',
      docker_host: 'tcp://lowercase-docker.example',
      ollama_host: 'http://127.0.0.1:59999',
      waggle_data_dir: 'lowercase-foreign-data',
    }, {
      WAGGLE_DATA_DIR: 'isolated-data',
      OLLAMA_HOST: 'http://127.0.0.1:51111',
    });

    assert.equal(environment.PATH, 'safe-path');
    assert.equal(environment.WAGGLE_DATA_DIR, 'isolated-data');
    assert.equal(environment.OLLAMA_HOST, 'http://127.0.0.1:51111');
    for (const name of [
      'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY',
      'XAI_API_KEY', 'DEEPSEEK_API_KEY', 'MISTRAL_API_KEY', 'DASHSCOPE_API_KEY',
      'MINIMAX_API_KEY', 'ZHIPU_API_KEY', 'MOONSHOT_API_KEY', 'PERPLEXITY_API_KEY',
      'OPENROUTER_API_KEY', 'VOYAGE_API_KEY', 'WAGGLE_VOYAGE_API_KEY',
      'LITELLM_API_KEY', 'LITELLM_MASTER_KEY', 'WAGGLE_LITELLM_URL', 'DOCKER_HOST',
      'http_proxy', 'https_proxy', 'docker_host', 'ollama_host', 'waggle_data_dir',
    ]) {
      assert.equal(environment[name], undefined, `${name} was not sanitized`);
    }
  });
});
