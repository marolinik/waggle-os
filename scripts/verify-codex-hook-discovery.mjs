#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import {
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(SCRIPT_PATH), '..');
const DEFAULT_RECEIPT_ROOT = resolve('C:\\tmp\\waggle-readiness-evidence');
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const MAX_PROVIDER_REQUEST_BYTES = 256 * 1024;
const PROCESS_TIMEOUT_MS = 90_000;
const COLD_MARKER = 'CODEX_CAUSAL_COLD';
const WARM_MARKER = 'CODEX_CAUSAL_WARM';
const SEED_PATTERN = /CODEX_CAUSAL_SEED_[0-9a-f]{48}/g;
const TARGET_PATTERN = /CODEX_CAUSAL_TARGET_[0-9a-f]{48}/g;
const DECOY_PATTERN = /CODEX_CAUSAL_DECOY_[0-9a-f]{48}/g;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sha256File(path) {
  return sha256(readFileSync(path));
}

function deriveTargetToken(seed) {
  return `CODEX_CAUSAL_TARGET_${sha256(seed).slice(0, 48)}`;
}

function canonicalPath(path) {
  return realpathSync.native(path).toLowerCase();
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    assert(flag === '--expected-head' || flag === '--receipt-dir', `unsupported argument: ${flag}`);
    const value = argv[index + 1];
    assert(value && !value.startsWith('--'), `missing value for ${flag}`);
    values[flag.slice(2)] = value;
    index += 1;
  }
  assert(/^[0-9a-f]{40}$/.test(values['expected-head'] ?? ''), '--expected-head must be a full lowercase Git SHA');
  assert(typeof values['receipt-dir'] === 'string', '--receipt-dir is required');
  return values;
}

function runChecked(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? REPO_ROOT,
    env: options.env ?? process.env,
    encoding: 'utf8',
    timeout: options.timeoutMs ?? 30_000,
    maxBuffer: MAX_OUTPUT_BYTES,
    windowsHide: true,
    shell: false,
  });
  if (result.status !== 0 || result.signal !== null || result.error) {
    const errorCode = typeof result.error?.code === 'string' ? result.error.code : null;
    throw new Error(
      `${options.label ?? command} failed (status=${String(result.status)}, signal=${String(result.signal)}, error=${String(errorCode)}): `
      + `${String(result.stderr ?? '').slice(0, 400)}`,
    );
  }
  return {
    stdout: String(result.stdout ?? ''),
    stderr: String(result.stderr ?? ''),
  };
}

function appendBounded(chunks, chunk) {
  const used = chunks.reduce((total, item) => total + item.length, 0);
  if (used >= MAX_OUTPUT_BYTES) return;
  chunks.push(Buffer.from(chunk).subarray(0, MAX_OUTPUT_BYTES - used));
}

function safeChildEnvironment(overrides) {
  const safe = {};
  for (const key of [
    'SystemRoot',
    'SYSTEMROOT',
    'WINDIR',
    'ComSpec',
    'PATHEXT',
    'PATH',
    'Path',
    'NUMBER_OF_PROCESSORS',
    'PROCESSOR_ARCHITECTURE',
    'OS',
    'LANG',
    'LC_ALL',
  ]) {
    if (process.env[key] !== undefined) safe[key] = process.env[key];
  }
  return {
    ...safe,
    NO_COLOR: '1',
    HTTP_PROXY: '',
    HTTPS_PROXY: '',
    ALL_PROXY: '',
    NO_PROXY: '127.0.0.1,localhost',
    OPENAI_API_KEY: '',
    ANTHROPIC_API_KEY: '',
    OPENROUTER_API_KEY: '',
    ...overrides,
  };
}

function findCodexExecutable() {
  const appData = process.env.APPDATA;
  assert(appData, 'APPDATA is unavailable');
  const override = process.env.WAGGLE_CODEX_EXE?.trim();
  const candidates = [
    override,
    join(
      appData,
      'npm',
      'node_modules',
      '@openai',
      'codex',
      'node_modules',
      '@openai',
      'codex-win32-x64',
      'vendor',
      'x86_64-pc-windows-msvc',
      'bin',
      'codex.exe',
    ),
  ].filter(Boolean);
  const executable = candidates.find((candidate) => existsSync(candidate));
  assert(executable, `Codex executable not found in: ${candidates.join(', ')}`);
  const posture = lstatSync(executable);
  assert(posture.isFile() && !posture.isSymbolicLink(), 'Codex executable must be a non-symlink regular file');
  return executable;
}

function responseEvent(event) {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

function treeContains(value, needle) {
  if (typeof value === 'string') return value.includes(needle);
  if (Array.isArray(value)) return value.some((item) => treeContains(item, needle));
  if (value && typeof value === 'object') {
    return Object.values(value).some((item) => treeContains(item, needle));
  }
  return false;
}

function sanitizeDiagnostic(value, replacements = []) {
  let text = typeof value === 'string' ? value : JSON.stringify(value);
  for (const [secret, replacement] of replacements) {
    if (typeof secret === 'string' && secret.length > 0) {
      text = text.replaceAll(secret, replacement);
    }
  }
  return text
    .replace(/CODEX_CAUSAL_(?:SEED|TARGET|DECOY)_[0-9a-f]{48}/g, '<REDACTED_CAUSAL_TOKEN>')
    .replace(/\b(?:sk|sess)-[A-Za-z0-9_-]{16,}\b/g, '<REDACTED_CREDENTIAL>')
    .slice(0, 1_000);
}

function waitForValue(read, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolveWait, rejectWait) => {
    const poll = () => {
      const value = read();
      if (value !== undefined) {
        resolveWait(value);
        return;
      }
      if (Date.now() >= deadline) {
        rejectWait(new Error(`${label} timed out`));
        return;
      }
      setTimeout(poll, 20);
    };
    poll();
  });
}

async function runAppServerProbe(codexExecutable, env, cwd, options) {
  const {
    lane,
    prompt,
    expectedAcknowledgement,
    targetToken,
    decoyToken,
  } = options;
  const responses = new Map();
  const hookRuns = [];
  const stdout = [];
  const stderr = [];
  let stdoutBuffer = '';
  let messageCount = 0;
  let malformedLines = 0;
  let acknowledgementObserved = false;
  let turnCompleted;
  let spawnError = null;
  let closed = false;
  const diagnosticReplacements = [
    [targetToken, '<TARGET_TOKEN>'],
    [decoyToken, '<DECOY_TOKEN>'],
    [env.HOME, '<ISOLATED_HOME>'],
    [env.HIVE_MIND_DATA_DIR, '<ISOLATED_MIND>'],
    [cwd, '<ISOLATED_WORKSPACE>'],
  ];

  const child = spawn(codexExecutable, [
    'app-server',
    '--stdio',
    '--strict-config',
  ], {
    cwd,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
    shell: false,
  });

  const processLine = (line) => {
    if (!line) return;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      malformedLines += 1;
      return;
    }
    messageCount += 1;
    const completedItem = message?.method === 'item/completed'
      ? message.params?.item
      : null;
    if (
      completedItem?.type === 'agentMessage'
      && completedItem?.text?.trim() === expectedAcknowledgement
    ) {
      acknowledgementObserved = true;
    }
    if (message?.id !== undefined && typeof message?.method !== 'string') {
      responses.set(String(message.id), message);
    }
    if (message?.method === 'hook/completed') {
      const run = message.params?.run;
      hookRuns.push({
        eventName: run?.eventName ?? null,
        status: run?.status ?? null,
        entryKinds: Array.isArray(run?.entries)
          ? run.entries.map((entry) => entry?.kind ?? null)
          : [],
        diagnostics: Array.isArray(run?.entries)
          ? run.entries
            .filter((entry) => entry?.kind === 'error')
            .map((entry) => sanitizeDiagnostic(entry?.text ?? '', diagnosticReplacements))
          : [],
        targetContextObserved: treeContains(run?.entries, targetToken),
        decoyContextObserved: treeContains(run?.entries, decoyToken),
      });
    }
    if (message?.method === 'turn/completed') turnCompleted = message;
  };

  child.stdout.on('data', (chunk) => {
    appendBounded(stdout, chunk);
    stdoutBuffer += chunk.toString('utf8');
    while (stdoutBuffer.includes('\n')) {
      const newline = stdoutBuffer.indexOf('\n');
      const line = stdoutBuffer.slice(0, newline).trim();
      stdoutBuffer = stdoutBuffer.slice(newline + 1);
      processLine(line);
    }
  });
  child.stderr.on('data', (chunk) => appendBounded(stderr, chunk));
  child.on('error', (error) => {
    spawnError = typeof error.code === 'string' ? error.code : error.message;
  });
  child.on('close', () => {
    closed = true;
    processLine(stdoutBuffer.trim());
    stdoutBuffer = '';
  });

  const send = (message) => {
    assert(child.stdin.writable, 'Codex app-server stdin closed unexpectedly');
    child.stdin.write(`${JSON.stringify(message)}\n`);
  };
  const response = (id, timeoutMs = 20_000) => waitForValue(
    () => responses.get(String(id)),
    timeoutMs,
    `Codex app-server response ${id}`,
  );

  let hooksSummary = null;
  let threadId = null;
  let turnId = null;
  let error = null;
  try {
    send({
      method: 'initialize',
      id: 1,
      params: {
        clientInfo: {
          name: `waggle_zero_cost_${lane}_probe`,
          title: `Waggle zero-cost ${lane} probe`,
          version: '2.0.0',
        },
        capabilities: { experimentalApi: true },
      },
    });
    const initialized = await response(1);
    assert(!initialized.error, 'Codex app-server initialize failed');
    send({ method: 'initialized', params: {} });

    send({ method: 'hooks/list', id: 2, params: { cwds: [cwd] } });
    const hooksResponse = await response(2);
    assert(!hooksResponse.error, 'Codex app-server hooks/list failed');
    const entry = hooksResponse.result?.data?.[0];
    const hooks = Array.isArray(entry?.hooks) ? entry.hooks : [];
    const sessionHooks = hooks.filter((hook) => hook?.eventName === 'sessionStart');
    const expectedSourcePath = canonicalPath(join(env.CODEX_HOME, 'hooks.json'));
    hooksSummary = {
      total: hooks.length,
      sessionStart: sessionHooks.length,
      enabled: sessionHooks.map((hook) => hook?.enabled === true),
      trustStatusBefore: sessionHooks.map((hook) => hook?.trustStatus ?? null),
      commandSha256: sessionHooks.map((hook) => (
        typeof hook?.command === 'string' ? sha256(hook.command) : null
      )),
      warnings: Array.isArray(entry?.warnings) ? entry.warnings.length : -1,
      errors: Array.isArray(entry?.errors) ? entry.errors.length : -1,
      trustStatusAfter: [],
    };
    assert(hooks.length === 4, `Codex discovered ${hooks.length} hooks, expected 4`);
    assert(sessionHooks.length === 1, `Codex discovered ${sessionHooks.length} SessionStart hooks`);
    assert(sessionHooks[0].enabled === true, 'Codex SessionStart hook is disabled');
    assert(hooksSummary.errors === 0, 'Codex hooks/list reported discovery errors');
    assert(hooksSummary.warnings === 0, 'Codex hooks/list reported discovery warnings');
    assert(hooks.every((hook) => (
      typeof hook?.sourcePath === 'string'
      && canonicalPath(hook.sourcePath) === expectedSourcePath
      && hook?.enabled === true
      && typeof hook?.key === 'string'
      && typeof hook?.currentHash === 'string'
      && hook.currentHash.startsWith('sha256:')
    )), 'Codex discovered an unexpected hook definition');

    send({
      method: 'config/batchWrite',
      id: 3,
      params: {
        edits: [{
          keyPath: 'hooks.state',
          value: Object.fromEntries(hooks.map((hook) => [
            hook.key,
            { trusted_hash: hook.currentHash },
          ])),
          mergeStrategy: 'upsert',
        }],
        reloadUserConfig: true,
      },
    });
    const trustResponse = await response(3);
    assert(!trustResponse.error, 'Codex app-server hook trust write failed');
    send({ method: 'hooks/list', id: 4, params: { cwds: [cwd] } });
    const trustedHooksResponse = await response(4);
    assert(!trustedHooksResponse.error, 'Codex app-server trusted hooks/list failed');
    const trustedEntry = trustedHooksResponse.result?.data?.[0];
    const trustedHooks = Array.isArray(trustedEntry?.hooks) ? trustedEntry.hooks : [];
    hooksSummary.trustStatusAfter = trustedHooks.map((hook) => hook?.trustStatus ?? null);
    assert(
      trustedHooks.length === 4
      && trustedHooks.every((hook) => hook?.enabled === true && hook?.trustStatus === 'trusted'),
      'Codex did not trust the isolated, hash-pinned Waggle hooks',
    );

    send({
      method: 'thread/start',
      id: 5,
      params: {
        model: 'waggle-zero-cost',
        cwd,
        approvalPolicy: 'never',
        sandbox: 'read-only',
        ephemeral: true,
      },
    });
    const threadResponse = await response(5);
    assert(!threadResponse.error, 'Codex app-server thread/start failed');
    threadId = threadResponse.result?.thread?.id ?? null;
    assert(typeof threadId === 'string' && threadId.length > 0, 'Codex app-server omitted thread id');

    send({
      method: 'turn/start',
      id: 6,
      params: {
        threadId,
        input: [{
          type: 'text',
          text: prompt,
          text_elements: [],
        }],
        model: 'waggle-zero-cost',
        approvalPolicy: 'never',
        sandboxPolicy: { type: 'readOnly', networkAccess: false },
      },
    });
    const turnResponse = await response(6);
    assert(!turnResponse.error, 'Codex app-server turn/start failed');
    turnId = turnResponse.result?.turn?.id ?? null;
    assert(typeof turnId === 'string' && turnId.length > 0, 'Codex app-server omitted turn id');
    await waitForValue(() => turnCompleted, PROCESS_TIMEOUT_MS, 'Codex app-server turn/completed');
    await waitForValue(
      () => hookRuns.some((run) => run.eventName === 'stop' && run.status === 'completed')
        ? true
        : undefined,
      20_000,
      'Codex app-server stop hook/completed',
    );
  } catch (caught) {
    error = sanitizeDiagnostic(
      caught instanceof Error ? caught.message : String(caught),
      diagnosticReplacements,
    );
  } finally {
    try {
      child.stdin.end();
    } catch {
      // Process may already be closed after a startup failure.
    }
    try {
      await waitForValue(() => closed ? true : undefined, 5_000, 'Codex app-server close');
    } catch {
      if (child.pid) {
        spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
          encoding: 'utf8',
          timeout: 10_000,
          windowsHide: true,
        });
      }
      try { child.kill('SIGKILL'); } catch { /* process already closed */ }
      try {
        await waitForValue(() => closed ? true : undefined, 5_000, 'Codex app-server forced close');
      } catch {
        if (error === null) error = 'Codex app-server process did not close';
      }
    }
  }

  const sessionStartRuns = hookRuns.filter((run) => run.eventName === 'sessionStart');
  return {
    error,
    spawnError,
    messageCount,
    malformedLines,
    hooks: hooksSummary,
    processId: child.pid ?? null,
    threadIdObserved: typeof threadId === 'string',
    threadIdSha256: typeof threadId === 'string' ? sha256(threadId) : null,
    turnIdObserved: typeof turnId === 'string',
    turnIdSha256: typeof turnId === 'string' ? sha256(turnId) : null,
    turnStatus: turnCompleted?.params?.turn?.status ?? null,
    hookRuns,
    sessionStartRuns: sessionStartRuns.length,
    targetContextObserved: sessionStartRuns.some((run) => run.targetContextObserved),
    decoyContextObserved: sessionStartRuns.some((run) => run.decoyContextObserved),
    acknowledgementObserved,
    stdoutBytes: Buffer.concat(stdout).length,
    stdoutSha256: sha256(Buffer.concat(stdout)),
    stderrBytes: Buffer.concat(stderr).length,
    stderrSha256: sha256(Buffer.concat(stderr)),
    closed,
  };
}

function decideLoopbackResponse(body) {
  const seeds = body.match(SEED_PATTERN) ?? [];
  const targets = body.match(TARGET_PATTERN) ?? [];
  const decoys = body.match(DECOY_PATTERN) ?? [];
  const phase = body.includes(WARM_MARKER)
    ? 'warm'
    : body.includes(COLD_MARKER)
      ? 'cold'
      : 'unknown';
  const base = {
    phase,
    seedCount: seeds.length,
    targetCount: targets.length,
    targetSha256: targets.map((target) => sha256(target)),
    decoyCount: decoys.length,
  };
  if (
    phase === 'cold'
    && seeds.length === 1
    && targets.length === 0
    && decoys.length === 0
  ) {
    return {
      ...base,
      accepted: true,
      decision: 'cold-derived-from-current-request',
      responseText: deriveTargetToken(seeds[0]),
    };
  }
  if (
    phase === 'warm'
    && targets.length === 1
    && decoys.length === 0
  ) {
    return {
      ...base,
      accepted: true,
      decision: 'warm-confirmed-current-request-target',
      responseText: 'CODEX_CAUSAL_WARM_ACK',
    };
  }
  return {
    ...base,
    accepted: false,
    decision: 'rejected',
    responseText: null,
  };
}

async function startLoopbackProvider() {
  const requests = [];
  const server = createServer((request, response) => {
    const chunks = [];
    let bytes = 0;
    request.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes <= MAX_PROVIDER_REQUEST_BYTES) chunks.push(Buffer.from(chunk));
    });
    request.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      const decision = decideLoopbackResponse(body);
      const record = {
        method: request.method ?? null,
        path: request.url ?? null,
        bytes,
        sha256: sha256(body),
        phase: decision.phase,
        seedCount: decision.seedCount,
        targetCount: decision.targetCount,
        targetSha256: decision.targetSha256,
        decoyCount: decision.decoyCount,
        accepted: decision.accepted,
        decision: decision.decision,
        responseSha256: decision.responseText ? sha256(decision.responseText) : null,
      };
      requests.push(record);
      if (
        requests.length !== 1
        || request.method !== 'POST'
        || request.url !== '/v1/responses'
        || bytes > MAX_PROVIDER_REQUEST_BYTES
        || !decision.accepted
      ) {
        response.writeHead(400, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: { message: 'zero-cost causal-memory policy rejected request' } }));
        return;
      }
      const id = `resp_${randomBytes(8).toString('hex')}`;
      const bodyOut = [
        responseEvent({ type: 'response.created', response: { id } }),
        responseEvent({
          type: 'response.output_item.done',
          item: {
            type: 'message',
            role: 'assistant',
            id,
            content: [{ type: 'output_text', text: decision.responseText }],
          },
        }),
        responseEvent({
          type: 'response.completed',
          response: {
            id,
            usage: {
              input_tokens: 0,
              input_tokens_details: null,
              output_tokens: 0,
              output_tokens_details: null,
              total_tokens: 0,
            },
          },
        }),
      ].join('');
      response.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
      });
      response.end(bodyOut);
    });
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  assert(address && typeof address !== 'string', 'loopback provider did not expose a TCP address');
  const handle = {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    requests,
    closed: false,
    close: () => new Promise((resolveClose, rejectClose) => {
      server.close((error) => {
        if (error) {
          rejectClose(error);
          return;
        }
        handle.closed = true;
        resolveClose();
      });
    }),
  };
  return handle;
}

function parseHookCall(result, label) {
  const envelope = JSON.parse(result.stdout.trim());
  assert(envelope?.ok === true && envelope?.isError === false, `${label} returned a failed envelope`);
  const text = envelope?.content?.[0]?.text;
  assert(typeof text === 'string', `${label} omitted text content`);
  if (text.startsWith('No memories found')) return [];
  const frames = JSON.parse(text);
  assert(Array.isArray(frames), `${label} did not return a frame array`);
  return frames;
}

function hookCall(node, cli, env, tool, args) {
  return runChecked(node, [
    cli,
    'hook-call',
    tool,
    '--args',
    JSON.stringify(args),
    '--json',
  ], { env, timeoutMs: 20_000, label: `hive-mind ${tool}` });
}

function buildCodexConfig(baseUrl) {
  return [
    'model = "waggle-zero-cost"',
    'model_provider = "waggle_loopback"',
    'approval_policy = "never"',
    'sandbox_mode = "read-only"',
    'project_doc_max_bytes = 0',
    'mcp_servers = {}',
    '',
    '[history]',
    'persistence = "none"',
    '',
    '[analytics]',
    'enabled = false',
    '',
    '[model_providers.waggle_loopback]',
    'name = "Waggle zero-cost loopback"',
    `base_url = ${JSON.stringify(baseUrl)}`,
    'wire_api = "responses"',
    'request_max_retries = 0',
    'stream_max_retries = 0',
    'requires_openai_auth = false',
    'supports_websockets = false',
    '',
  ].join('\n');
}

function auditFrames(frames, targetToken, decoyToken) {
  const targetFrames = frames.filter((frame) => treeContains(frame, targetToken));
  const decoyFrames = frames.filter((frame) => treeContains(frame, decoyToken));
  return {
    total: frames.length,
    targetBearing: targetFrames.length,
    targetEvents: targetFrames.map((frame) => {
      const serialized = JSON.stringify(frame);
      if (serialized.includes('event:stop')) return 'stop';
      if (serialized.includes('event:user-prompt-submit')) return 'user-prompt-submit';
      return 'unknown';
    }),
    decoyBearing: decoyFrames.length,
  };
}

const flags = parseArgs(process.argv.slice(2));
const expectedHead = flags['expected-head'];
const receiptDir = resolve(flags['receipt-dir']);
const receiptRelative = relative(DEFAULT_RECEIPT_ROOT, receiptDir);
assert(
  receiptRelative !== ''
  && !receiptRelative.startsWith('..')
  && !isAbsolute(receiptRelative),
  `--receipt-dir must be a fresh child of ${DEFAULT_RECEIPT_ROOT}`,
);
assert(!existsSync(receiptDir), `receipt directory already exists: ${receiptDir}`);

const report = {
  schemaVersion: 2,
  mode: 'zero-cost-codex-hook-cold-warm',
  startedAt: new Date().toISOString(),
  paidCalls: 0,
  source: {
    expectedHead,
    observedHead: null,
    tree: null,
    trackedClean: false,
    scriptSha256: sha256File(SCRIPT_PATH),
    final: null,
    unchangedDuringRun: false,
  },
  host: null,
  artifacts: null,
  runtimeFinal: null,
  runtimeUnchangedDuringRun: false,
  isolation: {
    liveProfileTouched: false,
    tempRoot: null,
    tempRemoved: false,
  },
  trust: {
    automationBypassUsed: false,
    isolatedHashApprovalUsed: true,
    productionRequiresOneTimeHooksApproval: true,
  },
  baseline: null,
  afterCold: null,
  afterWarm: null,
  install: null,
  provider: null,
  codex: null,
  causal: null,
  cleanup: null,
  pass: false,
  error: null,
  completedAt: null,
};

let tempRoot;
const providerHandles = [];
const installations = [];
let uninstallFn;
let functionalPass = false;

try {
  assert(process.platform === 'win32', 'this canary is Windows-only');
  assert(resolve(process.cwd()).toLowerCase() === REPO_ROOT.toLowerCase(), 'launch from the repository root');
  const observedHead = runChecked('git.exe', ['rev-parse', 'HEAD'], { label: 'Git HEAD' }).stdout.trim();
  const tree = runChecked('git.exe', ['rev-parse', 'HEAD^{tree}'], { label: 'Git tree' }).stdout.trim();
  const trackedStatus = runChecked(
    'git.exe',
    ['status', '--porcelain=v1', '--untracked-files=no'],
    { label: 'tracked status' },
  ).stdout.trim();
  assert(observedHead === expectedHead, `HEAD is ${observedHead}; expected ${expectedHead}`);
  report.source.observedHead = observedHead;
  report.source.tree = tree;
  report.source.trackedClean = trackedStatus.length === 0;

  const codexExecutable = findCodexExecutable();
  const version = runChecked(codexExecutable, ['--version'], {
    timeoutMs: 20_000,
    label: 'Codex version',
  }).stdout.trim();
  assert(/^codex-cli 0\./.test(version), `unexpected Codex version: ${version}`);
  report.host = {
    path: codexExecutable,
    version,
    sha256: sha256File(codexExecutable),
  };

  const node = process.execPath;
  const cli = join(REPO_ROOT, 'packages', 'hive-mind-cli', 'dist', 'index.js');
  const hookPackage = join(REPO_ROOT, 'packages', 'hive-mind-hooks-codex', 'dist');
  const hooksDir = join(hookPackage, 'hooks');
  const sqliteVec = join(REPO_ROOT, 'node_modules', 'sqlite-vec-windows-x64', 'vec0.dll');
  for (const required of [
    cli,
    join(hookPackage, 'index.js'),
    join(hooksDir, 'session-start.js'),
    join(hooksDir, 'user-prompt-submit.js'),
    join(hooksDir, 'stop.js'),
    sqliteVec,
  ]) {
    assert(existsSync(required), `required current build artifact is missing: ${required}`);
    const posture = lstatSync(required);
    assert(posture.isFile() && !posture.isSymbolicLink(), `required artifact is not a regular file: ${required}`);
  }
  report.artifacts = {
    nodeVersion: process.version,
    nodeSha256: sha256File(node),
    cliSha256: sha256File(cli),
    sessionStartSha256: sha256File(join(hooksDir, 'session-start.js')),
    userPromptSubmitSha256: sha256File(join(hooksDir, 'user-prompt-submit.js')),
    stopSha256: sha256File(join(hooksDir, 'stop.js')),
    sqliteVecSha256: sha256File(sqliteVec),
  };

} catch (error) {
  report.error = sanitizeDiagnostic(error instanceof Error ? error.message : String(error));
}

if (report.error === null) {
  try {
    const tempName = `waggle-codex-causal-${randomBytes(8).toString('hex')}`;
    tempRoot = join(tmpdir(), tempName);
    await mkdir(tempRoot, { recursive: false });
    report.isolation.tempRoot = tempRoot;
    const workspace = join(tempRoot, 'workspace');
    const mind = join(tempRoot, 'mind');
    const profiles = ['cold', 'warm'].map((lane) => {
      const home = join(tempRoot, `${lane}-home`);
      return {
        lane,
        home,
        codexHome: join(home, '.codex'),
        appData: join(home, 'AppData', 'Roaming'),
        localAppData: join(home, 'AppData', 'Local'),
        processTemp: join(tempRoot, `${lane}-temp`),
      };
    });
    for (const directory of [
      workspace,
      mind,
      ...profiles.flatMap((profile) => [
        profile.home,
        profile.codexHome,
        profile.appData,
        profile.localAppData,
        profile.processTemp,
      ]),
    ]) {
      await mkdir(directory, { recursive: true });
    }

    const targetWorkspace = `codex-target-${randomBytes(8).toString('hex')}`;
    const decoyWorkspace = `codex-decoy-${randomBytes(8).toString('hex')}`;
    for (const workspaceId of [targetWorkspace, decoyWorkspace]) {
      const workspaceDir = join(mind, 'workspaces', workspaceId);
      await mkdir(workspaceDir, { recursive: true });
      await writeFile(join(workspaceDir, 'workspace.json'), `${JSON.stringify({ id: workspaceId }, null, 2)}\n`);
    }
    const coldSeed = `CODEX_CAUSAL_SEED_${randomBytes(24).toString('hex')}`;
    const targetToken = deriveTargetToken(coldSeed);
    const decoyToken = `CODEX_CAUSAL_DECOY_${randomBytes(24).toString('hex')}`;
    const profileEnv = (profile) => safeChildEnvironment({
      HOME: profile.home,
      USERPROFILE: profile.home,
      APPDATA: profile.appData,
      LOCALAPPDATA: profile.localAppData,
      CODEX_HOME: profile.codexHome,
      TEMP: profile.processTemp,
      TMP: profile.processTemp,
      HIVE_MIND_DATA_DIR: mind,
      HIVE_MIND_SCOPES: 'memory:read,memory:write',
      HIVE_MIND_EMBEDDING_PROVIDER: 'mock',
      HIVE_MIND_NO_SYNTH: '1',
      WAGGLE_WORKSPACE_ID: targetWorkspace,
      WAGGLE_SQLITE_VEC_PATH: join(REPO_ROOT, 'node_modules', 'sqlite-vec-windows-x64', 'vec0.dll'),
      WAGGLE_SIGNAL_EMIT: '0',
    });
    const coldEnv = profileEnv(profiles[0]);
    const warmEnv = profileEnv(profiles[1]);
    const cli = join(REPO_ROOT, 'packages', 'hive-mind-cli', 'dist', 'index.js');
    hookCall(process.execPath, cli, coldEnv, 'save_memory', {
      content: `CODEX_CAUSAL_DECOY: ${decoyToken}`,
      importance: 'critical',
      source: 'tool_verified',
      workspace: decoyWorkspace,
    });
    const recall = (scope, workspaceId) => parseHookCall(
      hookCall(process.execPath, cli, coldEnv, 'recall_memory', {
        query: '',
        limit: 100,
        scope,
        ...(workspaceId ? { workspace: workspaceId } : {}),
      }),
      `${scope} recall`,
    );
    const baseline = {
      target: recall('current', targetWorkspace),
      decoy: recall('current', decoyWorkspace),
      personal: recall('personal'),
    };
    assert(baseline.target.length === 0, `target baseline count was ${baseline.target.length}, expected 0`);
    assert(baseline.decoy.length === 1, `decoy baseline count was ${baseline.decoy.length}, expected 1`);
    assert(baseline.personal.length === 0, `personal baseline count was ${baseline.personal.length}, expected 0`);
    assert(!treeContains(baseline, targetToken), 'baseline already contained target token');
    assert(!treeContains(baseline, coldSeed), 'baseline already contained cold seed');
    assert(treeContains(baseline.decoy, decoyToken), 'decoy baseline omitted decoy token');
    assert(!treeContains(baseline.target, decoyToken), 'target baseline leaked decoy token');
    assert(!treeContains(baseline.personal, decoyToken), 'personal baseline leaked decoy token');
    report.baseline = {
      target: auditFrames(baseline.target, targetToken, decoyToken),
      decoy: auditFrames(baseline.decoy, targetToken, decoyToken),
      personal: auditFrames(baseline.personal, targetToken, decoyToken),
      targetAbsentEverywhere: true,
      seedAbsentEverywhere: true,
    };

    const hookModule = await import(pathToFileURL(join(
      REPO_ROOT,
      'packages',
      'hive-mind-hooks-codex',
      'dist',
      'index.js',
    )).href);
    uninstallFn = hookModule.uninstall;
    report.install = {
      profiles: [],
      directColdSessionStart: null,
      directWarmSessionStart: null,
    };
    for (const profile of profiles) {
      const installed = await hookModule.install({
        home: profile.home,
        hooksDir: join(REPO_ROOT, 'packages', 'hive-mind-hooks-codex', 'dist', 'hooks'),
        cliPath: cli,
        hookTimeoutSeconds: 5,
      });
      installations.push({ lane: profile.lane, home: profile.home, installed });
      const verified = await hookModule.verify({
        home: profile.home,
        hooksDir: installed.paths.hooksDir,
        cliPath: cli,
      });
      assert(verified.ok, `current Codex hook package verify failed for ${profile.lane}`);
      report.install.profiles.push({
        lane: profile.lane,
        createdByUs: installed.createdByUs,
        hooksJsonSha256: sha256File(installed.paths.configPath),
        checks: verified.checks.map(({ name, ok }) => ({ name, ok })),
      });
    }

    const coldInstallation = installations.find(({ lane }) => lane === 'cold');
    assert(coldInstallation, 'cold Codex hook installation is missing');
    const hooksJson = JSON.parse(await readFile(coldInstallation.installed.paths.configPath, 'utf8'));
    const sessionStartCommand = hooksJson?.hooks?.SessionStart?.[0]?.hooks?.[0]?.command;
    assert(typeof sessionStartCommand === 'string', 'installed SessionStart command is missing');
    assert(typeof coldEnv.ComSpec === 'string', 'ComSpec is unavailable for the Windows hook probe');
    const directPayload = JSON.stringify({
      session_id: `probe-${randomBytes(8).toString('hex')}`,
      transcript_path: null,
      cwd: workspace,
      hook_event_name: 'SessionStart',
      model: 'waggle-zero-cost',
      permission_mode: 'default',
      source: 'startup',
    });
    const directStartedAt = Date.now();
    const directResult = spawnSync(coldEnv.ComSpec, ['/C', sessionStartCommand], {
      cwd: workspace,
      env: coldEnv,
      input: directPayload,
      encoding: 'utf8',
      timeout: 20_000,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
      shell: false,
    });
    const directStdout = String(directResult.stdout ?? '');
    const directStderr = String(directResult.stderr ?? '');
    report.install.directColdSessionStart = {
      exitCode: directResult.status,
      signal: directResult.signal,
      errorCode: typeof directResult.error?.code === 'string' ? directResult.error.code : null,
      durationMs: Date.now() - directStartedAt,
      stdoutBytes: Buffer.byteLength(directStdout),
      stdoutSha256: sha256(directStdout),
      stderrBytes: Buffer.byteLength(directStderr),
      stderrSha256: sha256(directStderr),
      stderrDiagnostic: sanitizeDiagnostic(directStderr, [
        [targetToken, '<TARGET_TOKEN>'],
        [decoyToken, '<DECOY_TOKEN>'],
        [profiles[0].home, '<ISOLATED_HOME>'],
        [mind, '<ISOLATED_MIND>'],
        [workspace, '<ISOLATED_WORKSPACE>'],
      ]),
      targetContextObserved: directStdout.includes(targetToken),
      seedContextObserved: directStdout.includes(coldSeed),
      decoyContextObserved: directStdout.includes(decoyToken),
    };
    assert(directResult.status === 0 && directResult.signal === null, 'direct SessionStart command failed');
    assert(!directStdout.includes(targetToken), 'cold direct SessionStart already contained target context');
    assert(!directStdout.includes(coldSeed), 'cold direct SessionStart already contained cold seed');
    assert(!directStdout.includes(decoyToken), 'direct SessionStart leaked decoy context');

    const codexExecutable = report.host.path;
    const assertCompletedHooks = (probe, lane) => {
      const hookNames = probe.hookRuns.map((run) => run.eventName);
      assert(probe.hookRuns.length === 3, `${lane} emitted ${probe.hookRuns.length} hook receipts`);
      assert(
        JSON.stringify(hookNames) === JSON.stringify(['sessionStart', 'userPromptSubmit', 'stop']),
        `${lane} hook sequence was ${JSON.stringify(hookNames)}`,
      );
      assert(
        probe.hookRuns.every((run) => (
          run.status === 'completed'
          && run.diagnostics.length === 0
          && !run.entryKinds.includes('error')
        )),
        `${lane} emitted a failed, cancelled, or diagnostic-bearing hook receipt`,
      );
    };
    report.provider = {
      requestOnlyDecision: true,
      separateInstances: true,
      coldClosedBeforeWarm: false,
      cold: null,
      warm: null,
    };
    report.codex = {
      cold: null,
      warm: null,
      distinctProcesses: false,
      distinctThreads: false,
      distinctProfiles: canonicalPath(profiles[0].home) !== canonicalPath(profiles[1].home),
    };

    const coldProvider = await startLoopbackProvider();
    providerHandles.push(coldProvider);
    await writeFile(
      join(profiles[0].codexHome, 'config.toml'),
      buildCodexConfig(coldProvider.baseUrl),
      'utf8',
    );
    const coldPrompt = [
      COLD_MARKER,
      coldSeed,
      'Reply only with the loopback provider result. Do not use tools.',
    ].join('\n');
    assert(!coldPrompt.includes(targetToken), 'cold prompt contained target token');
    assert(!coldPrompt.includes(decoyToken), 'cold prompt contained decoy token');
    report.codex.cold = await runAppServerProbe(
      codexExecutable,
      coldEnv,
      workspace,
      {
        lane: 'cold',
        prompt: coldPrompt,
        expectedAcknowledgement: targetToken,
        targetToken,
        decoyToken,
      },
    );
    report.provider.cold = {
      requests: coldProvider.requests.length,
      records: coldProvider.requests,
    };
    const cold = report.codex.cold;
    assert(cold.error === null && cold.spawnError === null, 'Codex cold zero-cost turn failed');
    assert(cold.malformedLines === 0, 'Codex cold app-server emitted malformed protocol output');
    assert(cold.turnStatus === 'completed', `Codex cold turn status was ${String(cold.turnStatus)}`);
    assert(cold.sessionStartRuns === 1, `Codex cold ran ${cold.sessionStartRuns} SessionStart hooks`);
    assert(!cold.targetContextObserved, 'cold SessionStart already contained target context');
    assert(!cold.decoyContextObserved, 'cold SessionStart leaked decoy context');
    assert(cold.acknowledgementObserved, 'Codex cold turn did not emit the derived target');
    assert(cold.closed, 'Codex cold app-server did not close');
    assertCompletedHooks(cold, 'cold');
    assert(coldProvider.requests.length === 1, `cold provider saw ${coldProvider.requests.length} requests`);
    const coldRequest = coldProvider.requests[0];
    assert(coldRequest.phase === 'cold', `cold provider classified request as ${coldRequest.phase}`);
    assert(coldRequest.seedCount === 1, `cold provider saw ${coldRequest.seedCount} seeds`);
    assert(coldRequest.targetCount === 0, 'cold provider request already contained target token');
    assert(coldRequest.decoyCount === 0, 'cold provider request leaked decoy token');
    assert(coldRequest.accepted, 'cold provider rejected causal request');
    assert(
      coldRequest.responseSha256 === sha256(targetToken),
      'cold provider did not derive target solely from the current request seed',
    );

    const afterCold = {
      target: recall('current', targetWorkspace),
      decoy: recall('current', decoyWorkspace),
      personal: recall('personal'),
    };
    const afterColdTargetAudit = auditFrames(afterCold.target, targetToken, decoyToken);
    const afterColdSeedFrames = afterCold.target.filter((frame) => treeContains(frame, coldSeed));
    report.afterCold = {
      target: afterColdTargetAudit,
      decoy: auditFrames(afterCold.decoy, targetToken, decoyToken),
      personal: auditFrames(afterCold.personal, targetToken, decoyToken),
      seedBearing: afterColdSeedFrames.length,
    };
    assert(afterCold.target.length === 2, `after-cold target count was ${afterCold.target.length}, expected 2`);
    assert(afterColdTargetAudit.targetBearing === 1, 'cold Stop did not persist exactly one target-bearing frame');
    assert(
      JSON.stringify(afterColdTargetAudit.targetEvents) === JSON.stringify(['stop']),
      `cold target-bearing event was ${JSON.stringify(afterColdTargetAudit.targetEvents)}`,
    );
    assert(afterColdSeedFrames.length === 1, 'cold prompt was not persisted exactly once');
    assert(
      JSON.stringify(afterColdSeedFrames[0]).includes('event:user-prompt-submit'),
      'cold seed was not persisted by UserPromptSubmit',
    );
    assert(afterCold.decoy.length === 1, `after-cold decoy count was ${afterCold.decoy.length}, expected 1`);
    assert(afterCold.personal.length === 0, `after-cold personal count was ${afterCold.personal.length}, expected 0`);

    const warmInstallation = installations.find(({ lane }) => lane === 'warm');
    assert(warmInstallation, 'warm Codex hook installation is missing');
    const warmHooksJson = JSON.parse(await readFile(warmInstallation.installed.paths.configPath, 'utf8'));
    const warmSessionStartCommand = warmHooksJson?.hooks?.SessionStart?.[0]?.hooks?.[0]?.command;
    assert(typeof warmSessionStartCommand === 'string', 'warm SessionStart command is missing');
    assert(typeof warmEnv.ComSpec === 'string', 'ComSpec is unavailable for the warm Windows hook probe');
    const directWarmPayload = JSON.stringify({
      session_id: `probe-${randomBytes(8).toString('hex')}`,
      transcript_path: null,
      cwd: workspace,
      hook_event_name: 'SessionStart',
      model: 'waggle-zero-cost',
      permission_mode: 'default',
      source: 'startup',
    });
    const directWarmStartedAt = Date.now();
    const directWarmResult = spawnSync(warmEnv.ComSpec, ['/C', warmSessionStartCommand], {
      cwd: workspace,
      env: warmEnv,
      input: directWarmPayload,
      encoding: 'utf8',
      timeout: 20_000,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
      shell: false,
    });
    const directWarmStdout = String(directWarmResult.stdout ?? '');
    const directWarmStderr = String(directWarmResult.stderr ?? '');
    report.install.directWarmSessionStart = {
      exitCode: directWarmResult.status,
      signal: directWarmResult.signal,
      errorCode: typeof directWarmResult.error?.code === 'string' ? directWarmResult.error.code : null,
      durationMs: Date.now() - directWarmStartedAt,
      stdoutBytes: Buffer.byteLength(directWarmStdout),
      stdoutSha256: sha256(directWarmStdout),
      stderrBytes: Buffer.byteLength(directWarmStderr),
      stderrSha256: sha256(directWarmStderr),
      stderrDiagnostic: sanitizeDiagnostic(directWarmStderr, [
        [targetToken, '<TARGET_TOKEN>'],
        [decoyToken, '<DECOY_TOKEN>'],
        [profiles[1].home, '<ISOLATED_HOME>'],
        [mind, '<ISOLATED_MIND>'],
        [workspace, '<ISOLATED_WORKSPACE>'],
      ]),
      targetContextObserved: directWarmStdout.includes(targetToken),
      seedContextObserved: directWarmStdout.includes(coldSeed),
      decoyContextObserved: directWarmStdout.includes(decoyToken),
    };
    assert(
      directWarmResult.status === 0 && directWarmResult.signal === null,
      'warm direct SessionStart command failed',
    );
    assert(directWarmStdout.includes(targetToken), 'warm direct SessionStart omitted target context');
    assert(!directWarmStdout.includes(decoyToken), 'warm direct SessionStart leaked decoy context');

    await coldProvider.close();
    assert(coldProvider.closed, 'cold provider did not close before warm phase');
    report.provider.coldClosedBeforeWarm = true;

    const warmProvider = await startLoopbackProvider();
    providerHandles.push(warmProvider);
    await writeFile(
      join(profiles[1].codexHome, 'config.toml'),
      buildCodexConfig(warmProvider.baseUrl),
      'utf8',
    );
    const warmPrompt = [
      WARM_MARKER,
      'Recall the prior isolated-session result. Reply only with the loopback provider result. Do not use tools.',
    ].join('\n');
    assert(!warmPrompt.includes(coldSeed), 'warm prompt contained cold seed');
    assert(!warmPrompt.includes(targetToken), 'warm prompt contained target token');
    assert(!warmPrompt.includes(decoyToken), 'warm prompt contained decoy token');
    report.codex.warm = await runAppServerProbe(
      codexExecutable,
      warmEnv,
      workspace,
      {
        lane: 'warm',
        prompt: warmPrompt,
        expectedAcknowledgement: 'CODEX_CAUSAL_WARM_ACK',
        targetToken,
        decoyToken,
      },
    );
    report.provider.warm = {
      requests: warmProvider.requests.length,
      records: warmProvider.requests,
    };
    const warm = report.codex.warm;
    assert(warm.error === null && warm.spawnError === null, 'Codex warm zero-cost turn failed');
    assert(warm.malformedLines === 0, 'Codex warm app-server emitted malformed protocol output');
    assert(warm.turnStatus === 'completed', `Codex warm turn status was ${String(warm.turnStatus)}`);
    assert(warm.sessionStartRuns === 1, `Codex warm ran ${warm.sessionStartRuns} SessionStart hooks`);
    assert(warm.targetContextObserved, 'warm SessionStart omitted cold target context');
    assert(!warm.decoyContextObserved, 'warm SessionStart leaked decoy context');
    assert(warm.acknowledgementObserved, 'Codex warm turn did not emit causal acknowledgement');
    assert(warm.closed, 'Codex warm app-server did not close');
    assertCompletedHooks(warm, 'warm');
    assert(warmProvider.requests.length === 1, `warm provider saw ${warmProvider.requests.length} requests`);
    const warmRequest = warmProvider.requests[0];
    assert(warmRequest.phase === 'warm', `warm provider classified request as ${warmRequest.phase}`);
    assert(warmRequest.targetCount === 1, `warm provider saw ${warmRequest.targetCount} target tokens`);
    assert(warmRequest.targetSha256[0] === sha256(targetToken), 'warm provider saw the wrong target token');
    assert(warmRequest.decoyCount === 0, 'warm provider request leaked decoy token');
    assert(warmRequest.accepted, 'warm provider rejected causal recall request');
    assert(
      warmRequest.responseSha256 === sha256('CODEX_CAUSAL_WARM_ACK'),
      'warm provider returned an unexpected acknowledgement',
    );

    const afterWarm = {
      target: recall('current', targetWorkspace),
      decoy: recall('current', decoyWorkspace),
      personal: recall('personal'),
    };
    const afterWarmTargetAudit = auditFrames(afterWarm.target, targetToken, decoyToken);
    report.afterWarm = {
      target: afterWarmTargetAudit,
      decoy: auditFrames(afterWarm.decoy, targetToken, decoyToken),
      personal: auditFrames(afterWarm.personal, targetToken, decoyToken),
    };
    assert(afterWarm.target.length === 4, `after-warm target count was ${afterWarm.target.length}, expected 4`);
    assert(afterWarmTargetAudit.targetBearing === 1, 'warm phase altered the single causal target frame');
    assert(
      JSON.stringify(afterWarmTargetAudit.targetEvents) === JSON.stringify(['stop']),
      `warm target-bearing event was ${JSON.stringify(afterWarmTargetAudit.targetEvents)}`,
    );
    assert(afterWarm.decoy.length === 1, `after-warm decoy count was ${afterWarm.decoy.length}, expected 1`);
    assert(afterWarm.personal.length === 0, `after-warm personal count was ${afterWarm.personal.length}, expected 0`);

    await warmProvider.close();
    report.codex.distinctProcesses = cold.processId !== null && cold.processId !== warm.processId;
    report.codex.distinctThreads = (
      cold.threadIdSha256 !== null
      && warm.threadIdSha256 !== null
      && cold.threadIdSha256 !== warm.threadIdSha256
    );
    assert(report.codex.distinctProfiles, 'cold and warm Codex profiles were not distinct');
    assert(report.codex.distinctProcesses, 'cold and warm Codex process ids were not distinct');
    assert(report.codex.distinctThreads, 'cold and warm Codex thread ids were not distinct');
    report.causal = {
      baselineTargetAbsent: true,
      coldPromptTargetAbsent: true,
      coldProviderDerivedTargetFromCurrentRequest: true,
      coldStopPersistedTarget: true,
      coldHostClosedBeforeWarm: cold.closed && coldProvider.closed,
      warmPromptTargetAbsent: true,
      warmSessionStartRecalledTarget: true,
      warmProviderObservedTargetInCurrentRequest: true,
      decoyNeverLeaked: true,
      onlyMutableConversationStateSharedViaMindAndWorkspace: true,
    };
    functionalPass = true;
  } catch (error) {
    report.error = sanitizeDiagnostic(error instanceof Error ? error.message : String(error));
  }
}

let uninstallPassed = installations.length === 0;
const uninstallResults = [];
try {
  if (installations.length > 0) {
    assert(uninstallFn, 'Codex hook uninstall function is unavailable');
    for (const installation of [...installations].reverse()) {
      const result = await uninstallFn({
        home: installation.home,
        hooksDir: join(REPO_ROOT, 'packages', 'hive-mind-hooks-codex', 'dist', 'hooks'),
      });
      const ok = result.pointerRemoved && (result.createdRemoved || result.backupRemoved);
      uninstallResults.push({ lane: installation.lane, ok });
    }
    uninstallPassed = uninstallResults.length === installations.length
      && uninstallResults.every(({ ok }) => ok);
  }
} catch (error) {
  uninstallPassed = false;
  if (report.error === null) {
    report.error = sanitizeDiagnostic(`uninstall failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
let providersClosed = true;
try {
  for (const providerHandle of providerHandles) {
    if (!providerHandle.closed) await providerHandle.close();
  }
  providersClosed = providerHandles.every(({ closed }) => closed);
} catch (error) {
  providersClosed = false;
  if (report.error === null) {
    report.error = sanitizeDiagnostic(`provider close failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
try {
  if (report.isolation.tempRoot) {
    await rm(report.isolation.tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    report.isolation.tempRemoved = !existsSync(report.isolation.tempRoot);
  }
} catch (error) {
  if (report.error === null) {
    report.error = sanitizeDiagnostic(`temp cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

try {
  const finalHead = runChecked('git.exe', ['rev-parse', 'HEAD'], { label: 'final Git HEAD' }).stdout.trim();
  const finalTree = runChecked('git.exe', ['rev-parse', 'HEAD^{tree}'], { label: 'final Git tree' }).stdout.trim();
  const finalTrackedStatus = runChecked(
    'git.exe',
    ['status', '--porcelain=v1', '--untracked-files=no'],
    { label: 'final tracked status' },
  ).stdout.trim();
  const finalScriptSha256 = sha256File(SCRIPT_PATH);
  report.source.final = {
    head: finalHead,
    tree: finalTree,
    trackedClean: finalTrackedStatus.length === 0,
    scriptSha256: finalScriptSha256,
  };
  report.source.unchangedDuringRun = (
    finalHead === report.source.observedHead
    && finalTree === report.source.tree
    && finalScriptSha256 === report.source.scriptSha256
  );
} catch (error) {
  if (report.error === null) {
    report.error = sanitizeDiagnostic(
      `final source verification failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

try {
  if (report.host && report.artifacts) {
    const hookPackage = join(REPO_ROOT, 'packages', 'hive-mind-hooks-codex', 'dist');
    const hooksDir = join(hookPackage, 'hooks');
    const finalHostVersion = runChecked(report.host.path, ['--version'], {
      timeoutMs: 20_000,
      label: 'final Codex version',
    }).stdout.trim();
    const finalArtifacts = {
      nodeVersion: process.version,
      nodeSha256: sha256File(process.execPath),
      cliSha256: sha256File(join(REPO_ROOT, 'packages', 'hive-mind-cli', 'dist', 'index.js')),
      sessionStartSha256: sha256File(join(hooksDir, 'session-start.js')),
      userPromptSubmitSha256: sha256File(join(hooksDir, 'user-prompt-submit.js')),
      stopSha256: sha256File(join(hooksDir, 'stop.js')),
      sqliteVecSha256: sha256File(join(REPO_ROOT, 'node_modules', 'sqlite-vec-windows-x64', 'vec0.dll')),
    };
    report.runtimeFinal = {
      hostVersion: finalHostVersion,
      hostSha256: sha256File(report.host.path),
      artifacts: finalArtifacts,
    };
    report.runtimeUnchangedDuringRun = (
      finalHostVersion === report.host.version
      && report.runtimeFinal.hostSha256 === report.host.sha256
      && JSON.stringify(finalArtifacts) === JSON.stringify(report.artifacts)
    );
  }
} catch (error) {
  if (report.error === null) {
    report.error = sanitizeDiagnostic(
      `final runtime verification failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

report.cleanup = {
  uninstallPassed,
  uninstallResults,
  providerInstances: providerHandles.length,
  providersClosed,
  tempRemoved: report.isolation.tempRemoved,
};
report.pass = (
  functionalPass
  && report.source.trackedClean
  && report.source.final?.trackedClean === true
  && report.source.unchangedDuringRun
  && report.runtimeUnchangedDuringRun
  && uninstallPassed
  && providersClosed
  && report.isolation.tempRemoved
  && report.error === null
);
report.completedAt = new Date().toISOString();
await mkdir(receiptDir, { recursive: false });
const reportPath = join(receiptDir, 'report.json');
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
const reportStat = await stat(reportPath);
assert(reportStat.isFile(), 'report.json is not a regular file');
process.stdout.write(`${JSON.stringify({
  pass: report.pass,
  functionalPass,
  trackedClean: report.source.trackedClean,
  paidCalls: 0,
  report: reportPath,
  error: report.error,
})}\n`);
process.exit(report.pass ? 0 : 1);
