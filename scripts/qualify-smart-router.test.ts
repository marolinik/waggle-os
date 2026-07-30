import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { describe, it } from 'node:test';
import {
  assertQualifiedChatCase,
  assertQualifiedToolContextCase,
  assertCopiedModelIdentity,
  assertObservedDispatch,
  assertObservedProviderUsage,
  assertRuntimeStartOwned,
  assertSourceSnapshot,
  aliasesForOwnedCleanup,
  BUDGET_PROMPT,
  buildOwnedProxyTarget,
  buildRouterSettings,
  buildSanitizedEnvironment,
  canonicalizeManifestDigest,
  extractDispatchedToolNames,
  extractProviderUsage,
  parseSse,
  partitionWindowsProcesses,
  postJsonForStatus,
  recordAliasBeforeCopy,
  startAuditProxy,
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
    const runtimeMetrics = {
      estimatedSystemPromptTokens: 7_437,
      providerInputTokens: 8_005,
      providerOutputTokens: 244,
      timeToFirstTokenMs: 5_497,
      agentLatencyMs: 6_102,
      totalServerLatencyMs: 6_198,
    };
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
      `data: ${JSON.stringify({
        content: 'fallback answer',
        model: 'ollama/fallback',
        toolsUsed: [],
        usage: { inputTokens: 8_005, outputTokens: 244 },
        contextMetrics: runtimeMetrics,
      })}`,
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

  it('qualifies a bounded, relevant production chat tool context from at least 29 eligible tools', () => {
    const selectedToolNames = [
      'read_file', 'search_files', 'search_content', 'git_status',
      ...Array.from({ length: 10 }, (_, index) => `code_tool_${index}`),
    ];
    const rawSse = (
      contextMetrics: Record<string, unknown>,
      usage: Record<string, unknown> = {
        inputTokens: contextMetrics.providerInputTokens,
        outputTokens: contextMetrics.providerOutputTokens,
      },
    ) => [
      'event: token',
      'data: {"content":"tool context qualified"}',
      '',
      'event: done',
      `data: ${JSON.stringify({
        content: 'tool context qualified',
        model: 'ollama/primary',
        toolsUsed: [],
        usage,
        contextMetrics,
      })}`,
      '',
    ].join('\n');
    const validMetrics = {
      toolCatalogCount: 78,
      toolEligibleCount: 52,
      toolSelectedCount: 14,
      toolOmittedCount: 38,
      transmittedToolSchemaChars: 6_120,
      estimatedToolSchemaTokens: 1_530,
      selectorLatencyMs: 6,
      estimatedSystemPromptTokens: 7_437,
      providerInputTokens: 8_005,
      providerOutputTokens: 244,
      timeToFirstTokenMs: 5_497,
      agentLatencyMs: 6_102,
      totalServerLatencyMs: 6_198,
    };
    const qualify = (
      overrides: Record<string, unknown> = {},
      dispatchedToolNames: string[] = selectedToolNames,
      usage?: Record<string, unknown>,
    ) => assertQualifiedToolContextCase({
      httpStatus: 200,
      contentType: 'text/event-stream; charset=utf-8',
      rawSse: rawSse({ ...validMetrics, ...overrides }, usage),
      expectedModel: 'ollama/primary',
      selectedToolNames: dispatchedToolNames,
    });

    const qualified = qualify();
    assert.deepEqual(qualified.toolContext.selectedToolNames, selectedToolNames);
    assert.equal(qualified.toolContext.toolEligibleCount, 52);
    assert.equal(qualified.toolContext.toolSelectedCount, 14);

    assert.throws(() => qualify({ toolEligibleCount: 28, toolOmittedCount: 14 }), /at least 29 eligible/i);
    assert.throws(() => qualify({ toolSelectedCount: 15, toolOmittedCount: 37 }), /at most 14 tools/i);
    assert.throws(() => qualify({ transmittedToolSchemaChars: 8_001, estimatedToolSchemaTokens: 2_001 }), /8,000 schema characters/i);
    assert.throws(() => qualify({ toolOmittedCount: 37 }), /eligible minus selected/i);
    assert.throws(() => qualify({}, selectedToolNames.slice(0, -1)), /selected names/i);
    assert.throws(() => qualify({}, Array(14).fill('calendar_tool')), /unique selected names/i);
    assert.throws(() => qualify({}, Array.from({ length: 14 }, (_, index) => `calendar_tool_${index}`)), /code-inspection relevance/i);
    assert.throws(() => qualify({ selectorLatencyMs: 251 }), /250ms/i);
    assert.throws(() => qualify({ providerInputTokens: 2_050 }), /provider input.*7,500/i);
    assert.throws(() => qualify({ providerInputTokens: 6_000 }), /provider input.*7,500/i);
    assert.throws(() => qualify({ providerInputTokens: 7_499 }), /provider input.*7,500/i);
    assert.throws(() => qualify({ providerInputTokens: undefined }), /positive integer providerInputTokens/i);
    assert.throws(() => qualify({ providerOutputTokens: 0 }), /positive integer providerOutputTokens/i);
    assert.throws(
      () => qualify(
        { providerOutputTokens: 245 },
        selectedToolNames,
        { inputTokens: 8_005, outputTokens: 244 },
      ),
      /token counts.*done\.usage/i,
    );
    assert.throws(() => qualify({ timeToFirstTokenMs: undefined }), /finite timeToFirstTokenMs/i);
    assert.throws(() => qualify({ agentLatencyMs: -1 }), /finite agentLatencyMs/i);
    assert.throws(() => qualify({ totalServerLatencyMs: Number.POSITIVE_INFINITY }), /finite totalServerLatencyMs/i);
    assert.throws(() => qualify({ timeToFirstTokenMs: 6_199 }), /timeToFirstTokenMs.*totalServerLatencyMs/i);
    assert.throws(() => qualify({ agentLatencyMs: 6_199 }), /agentLatencyMs.*totalServerLatencyMs/i);
    assert.throws(
      () => qualify({ timeToFirstTokenMs: 15_001, totalServerLatencyMs: 15_002 }),
      /timeToFirstTokenMs.*15,000/i,
    );
    assert.throws(
      () => qualify({ agentLatencyMs: 60_001, totalServerLatencyMs: 60_002 }),
      /agentLatencyMs.*60,000/i,
    );
    assert.throws(
      () => qualify({ totalServerLatencyMs: 60_001 }),
      /totalServerLatencyMs.*60,000/i,
    );
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
      {
        at: 'now',
        path: '/v1/chat/completions',
        model: 'router-primary:latest',
        bodySha256: 'a'.repeat(64),
        toolNames: [],
        providerUsage: { inputTokens: 8_005, outputTokens: 244 },
      },
    ];
    assert.deepEqual(assertObservedDispatch(dispatches, 0, 'router-primary:latest'), dispatches);
    assert.throws(() => assertObservedDispatch(dispatches, 0, 'router-budget:latest'), /observed Ollama dispatch/i);
    assert.deepEqual(
      assertObservedProviderUsage(dispatches, { inputTokens: 8_005, outputTokens: 244 }),
      { inputTokens: 8_005, outputTokens: 244 },
    );
    assert.throws(
      () => assertObservedProviderUsage(
        [{ ...dispatches[0], providerUsage: null }],
        { inputTokens: 8_005, outputTokens: 244 },
      ),
      /provider-observed usage/i,
    );
    assert.throws(
      () => assertObservedProviderUsage(dispatches, { inputTokens: 8_004, outputTokens: 244 }),
      /does not match.*done usage/i,
    );
    assert.throws(
      () => assertObservedProviderUsage([
        { ...dispatches[0], providerUsage: { inputTokens: 7_000, outputTokens: 122 } },
        { ...dispatches[0], providerUsage: { inputTokens: 7_000, outputTokens: 122 } },
      ], { inputTokens: 14_000, outputTokens: 244 }),
      /exactly one provider dispatch/i,
    );
  });

  it('extracts provider-observed token usage from the upstream Ollama stream', () => {
    const raw = [
      'data: {"choices":[{"delta":{"content":"ok"}}]}',
      '',
      'data: {"choices":[],"usage":{"prompt_tokens":14011,"completion_tokens":244}}',
      '',
      'data: [DONE]',
      '',
    ].join('\n');
    assert.deepEqual(extractProviderUsage(raw), { inputTokens: 14_011, outputTokens: 244 });
    assert.equal(extractProviderUsage('data: {"choices":[]}\n\ndata: [DONE]\n\n'), null);
    assert.equal(extractProviderUsage('data: {"usage":{"prompt_tokens":0,"completion_tokens":2}}\n\n'), null);
  });

  it('streams audited provider bytes and records usage before delayed HTTP EOF', async () => {
    let releaseEof = (): void => {};
    const eofGate = new Promise<void>((resolve) => { releaseEof = resolve; });
    const upstream = createServer(async (request, response) => {
      for await (const _chunk of request) {
        // Drain the request before starting the controlled response.
      }
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.write('data: {"choices":[{"delta":{"content":"ok"}}]}\n\n');
      response.write('data: {"choices":[],"usage":{"prompt_tokens":14011,"completion_tokens":244}}\n\n');
      response.write('data: [DONE]\n\n');
      await eofGate;
      response.end();
    });
    await new Promise<void>((resolve, reject) => {
      upstream.once('error', reject);
      upstream.listen(0, '127.0.0.1', () => resolve());
    });
    const address = upstream.address();
    assert.ok(address && typeof address !== 'string');
    const dispatches: Parameters<typeof startAuditProxy>[0]['dispatches'] = [];
    const proxy = await startAuditProxy({
      port: 0,
      targetEndpoint: `http://127.0.0.1:${address.port}`,
      dispatches,
    });
    const proxyAddress = proxy.address();
    assert.ok(proxyAddress && typeof proxyAddress !== 'string');
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const response = await fetch(`http://127.0.0.1:${proxyAddress.port}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'router-primary:latest', stream: true }),
        signal: AbortSignal.timeout(2_000),
      });
      assert.equal(response.status, 200);
      assert.ok(response.body);
      reader = response.body.getReader();
      const readWithin = async () => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          return await Promise.race([
            reader!.read(),
            new Promise<never>((_resolve, reject) => {
              timer = setTimeout(() => reject(new Error('Timed out before streamed [DONE]')), 1_000);
            }),
          ]);
        } finally {
          if (timer) clearTimeout(timer);
        }
      };
      let wire = '';
      while (!wire.includes('data: [DONE]')) {
        const next = await readWithin();
        assert.equal(next.done, false);
        wire += Buffer.from(next.value).toString('utf8');
      }
      assert.match(wire, /"content":"ok"/);
      assert.deepEqual(dispatches[0]?.providerUsage, { inputTokens: 14_011, outputTokens: 244 });
      releaseEof();
      while (!(await reader.read()).done) {
        // Drain the clean EOF.
      }
    } finally {
      releaseEof();
      await reader?.cancel().catch(() => undefined);
      proxy.closeAllConnections();
      upstream.closeAllConnections();
      await Promise.all([
        new Promise<void>((resolve) => proxy.close(() => resolve())),
        new Promise<void>((resolve) => upstream.close(() => resolve())),
      ]);
    }
  });

  it('extracts transmitted OpenAI tool names from the audited provider payload', () => {
    assert.deepEqual(extractDispatchedToolNames({
      tools: [
        { type: 'function', function: { name: 'read_file', parameters: { type: 'object' } } },
        { type: 'function', function: { name: 'search_files', parameters: { type: 'object' } } },
      ],
    }), ['read_file', 'search_files']);
    assert.deepEqual(extractDispatchedToolNames({ model: 'router-primary:latest' }), []);
    assert.throws(() => extractDispatchedToolNames({ tools: [{}] }), /function metadata/i);
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
