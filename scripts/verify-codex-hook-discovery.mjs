#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import {
  existsSync,
  lstatSync,
  readFileSync,
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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sha256File(path) {
  return sha256(readFileSync(path));
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

async function runAppServerProbe(codexExecutable, env, cwd, targetToken, decoyToken) {
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
      && completedItem?.text?.trim() === 'HOOK_DISCOVERY_ACK'
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
          name: 'waggle_zero_cost_hook_probe',
          title: 'Waggle zero-cost hook probe',
          version: '1.0.0',
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
    const expectedSourcePath = join(env.CODEX_HOME, 'hooks.json').toLowerCase();
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
      hook?.sourcePath?.toLowerCase() === expectedSourcePath
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
          text: 'Reply exactly HOOK_DISCOVERY_ACK. Do not use tools.',
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
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
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
    threadIdObserved: typeof threadId === 'string',
    turnIdObserved: typeof turnId === 'string',
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

async function startLoopbackProvider(targetToken, decoyToken) {
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
      const record = {
        method: request.method ?? null,
        path: request.url ?? null,
        bytes,
        sha256: sha256(body),
        targetContextObserved: body.includes(targetToken),
        decoyContextObserved: body.includes(decoyToken),
      };
      requests.push(record);
      if (
        requests.length !== 1
        || request.method !== 'POST'
        || bytes > MAX_PROVIDER_REQUEST_BYTES
        || !record.targetContextObserved
        || record.decoyContextObserved
      ) {
        response.writeHead(400, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: { message: 'zero-cost hook discovery policy rejected request' } }));
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
            content: [{ type: 'output_text', text: 'HOOK_DISCOVERY_ACK' }],
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
  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    requests,
    close: () => new Promise((resolveClose, rejectClose) => {
      server.close((error) => error ? rejectClose(error) : resolveClose());
    }),
  };
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
  schemaVersion: 1,
  mode: 'zero-cost-codex-hook-discovery',
  startedAt: new Date().toISOString(),
  paidCalls: 0,
  source: {
    expectedHead,
    observedHead: null,
    tree: null,
    trackedClean: false,
    scriptSha256: sha256File(SCRIPT_PATH),
  },
  host: null,
  artifacts: null,
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
  afterTurn: null,
  install: null,
  provider: null,
  codex: null,
  cleanup: null,
  pass: false,
  error: null,
  completedAt: null,
};

let tempRoot;
let provider;
let uninstallFn;
let installCompleted = false;
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
  report.error = error instanceof Error ? error.message : String(error);
}

if (report.error === null) {
  try {
    const tempName = `waggle-codex-discovery-${randomBytes(8).toString('hex')}`;
    tempRoot = join(tmpdir(), tempName);
    await mkdir(tempRoot, { recursive: false });
    report.isolation.tempRoot = tempRoot;
    const home = join(tempRoot, 'home');
    const codexHome = join(home, '.codex');
    const workspace = join(tempRoot, 'workspace');
    const mind = join(tempRoot, 'mind');
    const processTemp = join(tempRoot, 'temp');
    for (const directory of [home, codexHome, workspace, mind, processTemp]) {
      await mkdir(directory, { recursive: true });
    }

    const targetWorkspace = `codex-target-${randomBytes(8).toString('hex')}`;
    const decoyWorkspace = `codex-decoy-${randomBytes(8).toString('hex')}`;
    for (const workspaceId of [targetWorkspace, decoyWorkspace]) {
      const workspaceDir = join(mind, 'workspaces', workspaceId);
      await mkdir(workspaceDir, { recursive: true });
      await writeFile(join(workspaceDir, 'workspace.json'), `${JSON.stringify({ id: workspaceId }, null, 2)}\n`);
    }
    const targetToken = `TARGET_${randomBytes(24).toString('hex')}`;
    const decoyToken = `DECOY_${randomBytes(24).toString('hex')}`;
    const baseEnv = safeChildEnvironment({
      HOME: home,
      USERPROFILE: home,
      APPDATA: join(home, 'AppData', 'Roaming'),
      LOCALAPPDATA: join(home, 'AppData', 'Local'),
      CODEX_HOME: codexHome,
      TEMP: processTemp,
      TMP: processTemp,
      HIVE_MIND_DATA_DIR: mind,
      HIVE_MIND_SCOPES: 'memory:read,memory:write',
      HIVE_MIND_EMBEDDING_PROVIDER: 'mock',
      HIVE_MIND_NO_SYNTH: '1',
      WAGGLE_WORKSPACE_ID: targetWorkspace,
      WAGGLE_SQLITE_VEC_PATH: join(REPO_ROOT, 'node_modules', 'sqlite-vec-windows-x64', 'vec0.dll'),
      WAGGLE_SIGNAL_EMIT: '0',
    });
    const cli = join(REPO_ROOT, 'packages', 'hive-mind-cli', 'dist', 'index.js');
    hookCall(process.execPath, cli, baseEnv, 'save_memory', {
      content: `CODEX_DISCOVERY_TARGET: ${targetToken}`,
      importance: 'important',
      source: 'tool_verified',
      workspace: targetWorkspace,
    });
    hookCall(process.execPath, cli, baseEnv, 'save_memory', {
      content: `CODEX_DISCOVERY_TARGET: ${decoyToken}`,
      importance: 'critical',
      source: 'tool_verified',
      workspace: decoyWorkspace,
    });
    const recall = (scope, workspaceId) => parseHookCall(
      hookCall(process.execPath, cli, baseEnv, 'recall_memory', {
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
    assert(baseline.target.length === 1, `target baseline count was ${baseline.target.length}, expected 1`);
    assert(baseline.decoy.length === 1, `decoy baseline count was ${baseline.decoy.length}, expected 1`);
    assert(baseline.personal.length === 0, `personal baseline count was ${baseline.personal.length}, expected 0`);
    assert(JSON.stringify(baseline.target).includes(targetToken), 'target baseline omitted target token');
    assert(!JSON.stringify(baseline.target).includes(decoyToken), 'target baseline leaked decoy token');
    report.baseline = { target: 1, decoy: 1, personal: 0 };

    const hookModule = await import(pathToFileURL(join(
      REPO_ROOT,
      'packages',
      'hive-mind-hooks-codex',
      'dist',
      'index.js',
    )).href);
    uninstallFn = hookModule.uninstall;
    const installed = await hookModule.install({
      home,
      hooksDir: join(REPO_ROOT, 'packages', 'hive-mind-hooks-codex', 'dist', 'hooks'),
      cliPath: cli,
      hookTimeoutSeconds: 5,
    });
    installCompleted = true;
    const verified = await hookModule.verify({
      home,
      hooksDir: installed.paths.hooksDir,
      cliPath: cli,
    });
    assert(verified.ok, 'current Codex hook package verify failed');
    report.install = {
      createdByUs: installed.createdByUs,
      hooksJsonSha256: sha256File(installed.paths.configPath),
      checks: verified.checks.map(({ name, ok }) => ({ name, ok })),
      directSessionStart: null,
    };

    const hooksJson = JSON.parse(await readFile(installed.paths.configPath, 'utf8'));
    const sessionStartCommand = hooksJson?.hooks?.SessionStart?.[0]?.hooks?.[0]?.command;
    assert(typeof sessionStartCommand === 'string', 'installed SessionStart command is missing');
    assert(typeof baseEnv.ComSpec === 'string', 'ComSpec is unavailable for the Windows hook probe');
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
    const directResult = spawnSync(baseEnv.ComSpec, ['/C', sessionStartCommand], {
      cwd: workspace,
      env: baseEnv,
      input: directPayload,
      encoding: 'utf8',
      timeout: 20_000,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
      shell: false,
    });
    const directStdout = String(directResult.stdout ?? '');
    const directStderr = String(directResult.stderr ?? '');
    report.install.directSessionStart = {
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
        [home, '<ISOLATED_HOME>'],
        [mind, '<ISOLATED_MIND>'],
        [workspace, '<ISOLATED_WORKSPACE>'],
      ]),
      targetContextObserved: directStdout.includes(targetToken),
      decoyContextObserved: directStdout.includes(decoyToken),
    };
    assert(directResult.status === 0 && directResult.signal === null, 'direct SessionStart command failed');
    assert(directStdout.includes(targetToken), 'direct SessionStart omitted target context');
    assert(!directStdout.includes(decoyToken), 'direct SessionStart leaked decoy context');

    provider = await startLoopbackProvider(targetToken, decoyToken);
    const config = [
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
      `base_url = ${JSON.stringify(provider.baseUrl)}`,
      'wire_api = "responses"',
      'request_max_retries = 0',
      'stream_max_retries = 0',
      'requires_openai_auth = false',
      'supports_websockets = false',
      '',
    ].join('\n');
    await writeFile(join(codexHome, 'config.toml'), config, 'utf8');

    const codexExecutable = report.host.path;
    report.codex = await runAppServerProbe(
      codexExecutable,
      baseEnv,
      workspace,
      targetToken,
      decoyToken,
    );
    report.provider = {
      requests: provider.requests.length,
      records: provider.requests,
    };

    const afterTurn = {
      target: recall('current', targetWorkspace),
      decoy: recall('current', decoyWorkspace),
      personal: recall('personal'),
    };
    report.afterTurn = {
      target: afterTurn.target.length,
      decoy: afterTurn.decoy.length,
      personal: afterTurn.personal.length,
    };
    assert(report.codex.error === null && report.codex.spawnError === null, 'Codex zero-cost turn failed');
    assert(report.codex.malformedLines === 0, 'Codex app-server emitted malformed protocol output');
    assert(report.codex.turnStatus === 'completed', `Codex turn status was ${String(report.codex.turnStatus)}`);
    assert(report.codex.sessionStartRuns === 1, `Codex ran ${report.codex.sessionStartRuns} SessionStart hooks`);
    assert(report.codex.targetContextObserved, 'SessionStart target context was absent from hook output');
    assert(!report.codex.decoyContextObserved, 'decoy context leaked from SessionStart hook output');
    assert(provider.requests.length === 1, `provider saw ${provider.requests.length} requests, expected 1`);
    assert(provider.requests[0].targetContextObserved, 'SessionStart target context was absent at provider boundary');
    assert(!provider.requests[0].decoyContextObserved, 'decoy context leaked at provider boundary');
    assert(report.codex.acknowledgementObserved, 'Codex did not complete the loopback turn');
    assert(afterTurn.target.length === 3, `target frame count was ${afterTurn.target.length}, expected 3`);
    assert(afterTurn.decoy.length === 1, `decoy frame count was ${afterTurn.decoy.length}, expected 1`);
    assert(afterTurn.personal.length === 0, `personal frame count was ${afterTurn.personal.length}, expected 0`);
    functionalPass = true;
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
  }
}

let uninstallPassed = !installCompleted;
let providerClosed = provider === undefined;
try {
  if (installCompleted && uninstallFn && report.isolation.tempRoot) {
    const home = join(report.isolation.tempRoot, 'home');
    const result = await uninstallFn({
      home,
      hooksDir: join(REPO_ROOT, 'packages', 'hive-mind-hooks-codex', 'dist', 'hooks'),
    });
    uninstallPassed = result.pointerRemoved && (result.createdRemoved || result.backupRemoved);
  }
} catch (error) {
  uninstallPassed = false;
  if (report.error === null) report.error = `uninstall failed: ${error instanceof Error ? error.message : String(error)}`;
}
try {
  if (provider) await provider.close();
  providerClosed = true;
} catch (error) {
  providerClosed = false;
  if (report.error === null) report.error = `provider close failed: ${error instanceof Error ? error.message : String(error)}`;
}
try {
  if (report.isolation.tempRoot) {
    await rm(report.isolation.tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    report.isolation.tempRemoved = !existsSync(report.isolation.tempRoot);
  }
} catch (error) {
  if (report.error === null) report.error = `temp cleanup failed: ${error instanceof Error ? error.message : String(error)}`;
}

report.cleanup = {
  uninstallPassed,
  providerClosed,
  tempRemoved: report.isolation.tempRemoved,
};
report.pass = (
  functionalPass
  && report.source.trackedClean
  && uninstallPassed
  && providerClosed
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
