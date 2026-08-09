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
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const MAX_CAPTURE_BYTES = 2 * 1024 * 1024;
const MAX_REQUEST_BYTES = 2 * 1024 * 1024;
const TURN_TIMEOUT_MS = 180_000;
const PAID_ACK = 'I_ACKNOWLEDGE_1_CODEX_OFFICIAL_AUTH_CALL';
const DENIAL_REASON = 'Waggle official-auth canary denies every model tool call.';
const WAGGLE_HOOK_EVENTS = [
  'preCompact',
  'sessionStart',
  'stop',
  'userPromptSubmit',
];
const DISABLED_FEATURES = [
  'shell_tool',
  'unified_exec',
  'apps',
  'browser_use',
  'browser_use_external',
  'browser_use_full_cdp_access',
  'computer_use',
  'image_generation',
  'in_app_browser',
  'multi_agent',
  'multi_agent_v2',
  'goals',
  'skill_search',
  'tool_suggest',
  'workspace_dependencies',
  'skill_mcp_dependency_install',
  'plugins',
  'plugin_sharing',
  'remote_plugin',
  'mentions_v2',
];
const CONFIG_OVERRIDES = [
  'approval_policy="never"',
  'sandbox_mode="read-only"',
  'web_search="disabled"',
  'orchestrator.skills.enabled=false',
  'orchestrator.mcp.enabled=false',
  'tools.update_plan.enabled=false',
  'tools.experimental_request_user_input.enabled=false',
  'project_doc_max_bytes=0',
  'history.persistence="none"',
  'analytics.enabled=false',
];
const DENIAL_RESPONSE = {
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'deny',
    permissionDecisionReason: DENIAL_REASON,
  },
};
const ALLOWED_NOTIFICATION_METHODS = new Set([
  'account/rateLimits/updated',
  'hook/completed',
  'hook/started',
  'item/agentMessage/delta',
  'item/completed',
  'item/plan/delta',
  'item/reasoning/summaryPartAdded',
  'item/reasoning/summaryTextDelta',
  'item/reasoning/textDelta',
  'item/started',
  'item/updated',
  'serverRequest/resolved',
  'thread/started',
  'thread/status/changed',
  'thread/tokenUsage/updated',
  'turn/completed',
  'turn/diff/updated',
  'turn/plan/updated',
  'turn/started',
]);
const ALLOWED_ITEM_TYPES = new Set([
  'agentMessage',
  'reasoning',
  'userMessage',
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sha256File(path) {
  return sha256(readFileSync(path));
}

function canonicalPath(path) {
  return realpathSync.native(path).toLowerCase();
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

function parseArgs(argv) {
  const values = {};
  const booleanFlags = new Set(['--execute-paid', '--self-test']);
  const valueFlags = new Set([
    '--ack',
    '--codex-exe',
    '--expected-head',
    '--hive-mind-cli',
    '--marker',
    '--model',
    '--receipt-dir',
    '--windows-powershell',
    '--workspace',
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (booleanFlags.has(flag)) {
      assert(values[flag.slice(2)] === undefined, `duplicate argument: ${flag}`);
      values[flag.slice(2)] = true;
      continue;
    }
    assert(valueFlags.has(flag), `unsupported argument: ${flag}`);
    assert(values[flag.slice(2)] === undefined, `duplicate argument: ${flag}`);
    const value = argv[index + 1];
    assert(value && !value.startsWith('--'), `missing value for ${flag}`);
    values[flag.slice(2)] = value;
    index += 1;
  }
  if (values['self-test']) {
    assert(Object.keys(values).length === 1, '--self-test cannot be combined with other arguments');
    return values;
  }
  for (const name of [
    'codex-exe',
    'expected-head',
    'hive-mind-cli',
    'model',
    'receipt-dir',
    'windows-powershell',
    'workspace',
  ]) {
    assert(typeof values[name] === 'string', `--${name} is required`);
  }
  assert(/^[0-9a-f]{40}$/.test(values['expected-head']), '--expected-head must be a lowercase 40-character Git object id');
  assert(values.model.length <= 128 && !/[\x00-\x1f\x7f]/.test(values.model), '--model is invalid');
  if (values['execute-paid']) {
    assert(typeof values.marker === 'string', '--marker is required with --execute-paid');
    assert(values.ack === PAID_ACK, `--ack must be exactly ${PAID_ACK}`);
    assert(values.marker.length <= 256 && !/[\x00-\x1f\x7f]/.test(values.marker), '--marker is invalid');
  } else {
    assert(values.marker === undefined && values.ack === undefined, '--marker/--ack require --execute-paid');
  }
  return values;
}

function requireRegularFile(path, label) {
  assert(existsSync(path), `${label} is missing`);
  const posture = lstatSync(path);
  assert(posture.isFile() && !posture.isSymbolicLink(), `${label} must be a regular file`);
}

function requireDirectory(path, label) {
  assert(existsSync(path), `${label} is missing`);
  const posture = lstatSync(path);
  assert(posture.isDirectory() && !posture.isSymbolicLink(), `${label} must be a regular directory`);
}

function assertNoExistingReparsePoint(path) {
  let cursor = resolve(path);
  while (cursor) {
    if (existsSync(cursor)) {
      const posture = lstatSync(cursor);
      assert(!posture.isSymbolicLink(), 'receipt ancestor must not be a symbolic link');
    }
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
}

function runChecked(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    encoding: 'utf8',
    timeout: options.timeoutMs ?? 30_000,
    maxBuffer: MAX_CAPTURE_BYTES,
    windowsHide: true,
    shell: false,
  });
  if (result.status !== 0 || result.signal !== null || result.error) {
    const code = typeof result.error?.code === 'string' ? result.error.code : null;
    throw new Error(`${options.label ?? basename(command)} failed (status=${String(result.status)}, code=${String(code)})`);
  }
  return {
    stdout: String(result.stdout ?? ''),
    stderr: String(result.stderr ?? ''),
  };
}

function verifySourceSnapshot(expectedHead) {
  const repositoryRoot = resolve(dirname(SCRIPT_PATH), '..');
  const relativePath = relative(repositoryRoot, SCRIPT_PATH).replaceAll('\\', '/');
  assert(relativePath.length > 0 && !relativePath.startsWith('../') && !isAbsolute(relativePath), 'helper must be inside the repository');
  const git = (args, label) => runChecked('git.exe', ['-C', repositoryRoot, ...args], {
    label,
    timeoutMs: 30_000,
  }).stdout.trim();
  const observedHead = git(['rev-parse', 'HEAD'], 'repository HEAD');
  const tree = git(['rev-parse', 'HEAD^{tree}'], 'repository tree');
  const trackedStatus = git(['status', '--porcelain=v1', '--untracked-files=no'], 'tracked repository status');
  assert(observedHead === expectedHead, `expected HEAD ${expectedHead} but observed ${observedHead}`);
  assert(trackedStatus.length === 0, 'tracked repository state must be clean');
  const trackedPath = git(['ls-files', '--error-unmatch', '--', relativePath], 'helper tracked-file lookup');
  assert(trackedPath === relativePath, 'helper must be tracked at expected HEAD');
  const scriptBlob = git(['rev-parse', `${expectedHead}:${relativePath}`], 'helper expected blob');
  const workingBlob = git(['hash-object', `--path=${relativePath}`, SCRIPT_PATH], 'helper working blob');
  assert(/^[0-9a-f]{40}$/.test(tree), 'repository tree object id is invalid');
  assert(/^[0-9a-f]{40}$/.test(scriptBlob), 'helper expected blob object id is invalid');
  assert(workingBlob === scriptBlob, 'helper working content differs from expected HEAD');
  return {
    expectedHead,
    observedHead,
    tree,
    scriptBlob,
    trackedClean: true,
  };
}

function appendBounded(chunks, chunk) {
  const used = chunks.reduce((sum, item) => sum + item.length, 0);
  if (used >= MAX_CAPTURE_BYTES) return;
  chunks.push(Buffer.from(chunk).subarray(0, MAX_CAPTURE_BYTES - used));
}

function safeError(error, replacements = []) {
  let value = error instanceof Error ? error.message : String(error);
  for (const replacement of replacements) {
    if (replacement) value = value.replaceAll(replacement, '<REDACTED_PATH>');
  }
  return value
    .replace(/\b(?:sk|sess)-[A-Za-z0-9_-]{12,}\b/g, '<REDACTED_CREDENTIAL>')
    .slice(0, 500);
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

function tomlString(value) {
  return JSON.stringify(value);
}

function powershellLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function verifyWindowsPowerShell(powerShell) {
  requireRegularFile(powerShell, 'Windows PowerShell');
  const systemDirectory = runChecked(powerShell, [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    '[Console]::Out.Write([Environment]::SystemDirectory)',
  ], {
    label: 'Windows system-directory probe',
    timeoutMs: 20_000,
  }).stdout.trim();
  assert(isAbsolute(systemDirectory), 'Windows system-directory probe returned a non-absolute path');
  assert(basename(systemDirectory).toLowerCase() === 'system32', 'Windows system-directory probe did not return System32');
  const probed = join(systemDirectory, 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const packageCommandPath = join(
    dirname(systemDirectory),
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  );
  requireRegularFile(probed, 'OS Windows PowerShell');
  requireRegularFile(packageCommandPath, 'package-command Windows PowerShell');
  assert(canonicalPath(powerShell) === canonicalPath(probed), 'Windows PowerShell is not under the OS system directory');
  assert(canonicalPath(packageCommandPath) === canonicalPath(probed), 'package-command Windows PowerShell is not the probed OS binary');
  return {
    path: packageCommandPath,
    sha256: sha256File(packageCommandPath),
    systemDirectorySha256: sha256(canonicalPath(systemDirectory)),
  };
}

function buildExpectedWaggleHookCommand(powerShell, scriptPath, cliPath) {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    'try {',
    `  & ${[
      process.execPath,
      scriptPath,
      '--cli-path',
      cliPath,
    ].map(powershellLiteral).join(' ')}`,
    '  if ($null -eq $LASTEXITCODE) { exit 1 }',
    '  exit $LASTEXITCODE',
    '} catch {',
    '  [Console]::Error.WriteLine($_.Exception.Message)',
    '  exit 1',
    '}',
  ].join('\r\n');
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return `${powerShell} -NoLogo -NoProfile -NonInteractive -EncodedCommand ${encoded}`;
}

function buildExpectedWaggleHooks(powerShell, cliPath) {
  const repoRoot = resolve(dirname(SCRIPT_PATH), '..');
  const packageRoot = join(repoRoot, 'packages', 'hive-mind-hooks-codex', 'dist', 'hooks');
  const scripts = new Map([
    ['preCompact', join(packageRoot, 'pre-compact.js')],
    ['sessionStart', join(packageRoot, 'session-start.js')],
    ['stop', join(packageRoot, 'stop.js')],
    ['userPromptSubmit', join(packageRoot, 'user-prompt-submit.js')],
  ]);
  const commands = new Map();
  const artifacts = [];
  requireRegularFile(cliPath, 'hive-mind CLI');
  artifacts.push({ kind: 'hive-mind-cli', sha256: sha256File(cliPath) });
  for (const [eventName, scriptPath] of scripts) {
    requireRegularFile(scriptPath, `${eventName} packaged hook`);
    const command = buildExpectedWaggleHookCommand(powerShell, scriptPath, cliPath);
    commands.set(eventName, sha256(command));
    artifacts.push({ eventName, sha256: sha256File(scriptPath), commandSha256: sha256(command) });
  }
  return {
    commands,
    artifactsSha256: sha256(stableJson(artifacts)),
    cliSha256: sha256File(cliPath),
  };
}

function buildDenyHookConfig(powerShell) {
  const payload = JSON.stringify(DENIAL_RESPONSE);
  const encoded = Buffer.from(`[Console]::Out.Write('${payload.replaceAll("'", "''")}')`, 'utf16le')
    .toString('base64');
  const command = `${powerShell} -NoLogo -NoProfile -NonInteractive -EncodedCommand ${encoded}`;
  assert(!command.includes("'"), 'deny hook command cannot contain a TOML literal quote');
  return {
    command,
    config: `hooks.PreToolUse=[{matcher='*',hooks=[{type='command',command='false',command_windows='${command}',timeout=5}]}]`,
    commandSha256: sha256(command),
  };
}

function buildChildEnvironment(tempRoot) {
  const environment = { ...process.env };
  for (const name of [
    'ANTHROPIC_API_KEY',
    'CODEX_ACCESS_TOKEN',
    'OPENAI_ACCESS_TOKEN',
    'OPENAI_API_BASE',
    'OPENAI_API_KEY',
    'OPENAI_BASE_URL',
    'OPENROUTER_API_KEY',
  ]) {
    environment[name] = '';
  }
  environment.NO_COLOR = '1';
  environment.HIVE_MIND_DATA_DIR = join(tempRoot, 'mind');
  environment.HIVE_MIND_EMBEDDING_PROVIDER = 'mock';
  environment.HIVE_MIND_NO_SYNTH = '1';
  environment.HIVE_MIND_SCOPES = 'memory:read,memory:write';
  environment.HIVE_MIND_SHIM_LOG_LEVEL = 'error';
  environment.WAGGLE_SIGNAL_EMIT = '0';
  environment.WAGGLE_WORKSPACE_ID = `codex-denial-${randomBytes(12).toString('hex')}`;
  environment.TEMP = join(tempRoot, 'process-temp');
  environment.TMP = environment.TEMP;
  return environment;
}

function mutateModel(base, sealed) {
  const model = structuredClone(base);
  model.apply_patch_tool_type = null;
  model.input_modalities = sealed ? ['text'] : ['text', 'image'];
  model.supports_image_detail_original = !sealed;
  model.supports_search_tool = false;
  model.experimental_supported_tools = [];
  model.use_responses_lite = false;
  return model;
}

function readBundledModel(codexExecutable, model) {
  const raw = runChecked(codexExecutable, ['debug', 'models', '--bundled'], {
    label: 'Codex bundled-model catalog',
    timeoutMs: 30_000,
  }).stdout;
  let catalog;
  try {
    catalog = JSON.parse(raw);
  } catch {
    throw new Error('Codex bundled-model catalog was not valid JSON');
  }
  assert(Array.isArray(catalog?.models), 'Codex bundled-model catalog omitted models');
  const selected = catalog.models.find((entry) => entry?.slug === model);
  assert(selected && typeof selected === 'object', `Codex bundled catalog omitted model ${model}`);
  return { selected, bundledSha256: sha256(raw) };
}

function writeCatalog(path, model) {
  const value = `${JSON.stringify({ models: [model] })}\n`;
  return writeFile(path, value, 'utf8').then(() => sha256(value));
}

function buildMcpInventoryArguments() {
  const args = [];
  for (const feature of DISABLED_FEATURES) args.push('--disable', feature);
  return [...args, 'mcp', 'list', '--json'];
}

function readConfiguredMcpServerNames(codexExecutable, env) {
  const raw = runChecked(codexExecutable, buildMcpInventoryArguments(), {
    env,
    label: 'Codex MCP server inventory',
    timeoutMs: 30_000,
  }).stdout;
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('Codex MCP server inventory was not valid JSON');
  }
  assert(Array.isArray(value), 'Codex MCP server inventory was not an array');
  const names = value.map((entry) => entry?.name);
  assert(names.every((name) => typeof name === 'string' && name.length > 0), 'Codex MCP server inventory contained an invalid name');
  assert(names.every((name) => !/[\u0000\r\n']/.test(name)), 'Codex MCP server name contains an unsupported character');
  assert(new Set(names).size === names.length, 'Codex MCP server inventory contained duplicate names');
  return names.sort((left, right) => left.localeCompare(right));
}

function captureMcpBoundary(codexExecutable, env, configPath) {
  requireRegularFile(configPath, 'user Codex config.toml');
  const names = readConfiguredMcpServerNames(codexExecutable, env);
  const namesSha256 = sha256(stableJson(names));
  const configSha256 = sha256File(configPath);
  return {
    count: names.length,
    namesSha256,
    configSha256,
    boundarySha256: sha256(stableJson({ count: names.length, namesSha256, configSha256 })),
  };
}

function assertSameMcpBoundary(expected, actual, label) {
  assert(
    actual.count === expected.count
      && actual.namesSha256 === expected.namesSha256
      && actual.configSha256 === expected.configSha256
      && actual.boundarySha256 === expected.boundarySha256,
    `Codex MCP/config boundary changed ${label}`,
  );
}

function responseEvent(event) {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

function completedUsage() {
  return {
    input_tokens: 0,
    input_tokens_details: null,
    output_tokens: 0,
    output_tokens_details: null,
    total_tokens: 0,
  };
}

function messageResponse(text) {
  const responseId = `resp_${randomBytes(8).toString('hex')}`;
  const itemId = `msg_${randomBytes(8).toString('hex')}`;
  const item = {
    type: 'message',
    role: 'assistant',
    id: itemId,
    status: 'completed',
    content: [{ type: 'output_text', text }],
  };
  return [
    responseEvent({ type: 'response.created', response: { id: responseId, status: 'in_progress' } }),
    responseEvent({ type: 'response.output_item.done', output_index: 0, item }),
    responseEvent({
      type: 'response.completed',
      response: { id: responseId, status: 'completed', output: [item], usage: completedUsage() },
    }),
  ].join('');
}

function functionCallResponse(name, argumentsJson) {
  const responseId = `resp_${randomBytes(8).toString('hex')}`;
  const itemId = `fc_${randomBytes(8).toString('hex')}`;
  const callId = `call_${randomBytes(8).toString('hex')}`;
  const item = {
    type: 'function_call',
    id: itemId,
    call_id: callId,
    name,
    arguments: argumentsJson,
    status: 'completed',
  };
  return [
    responseEvent({ type: 'response.created', response: { id: responseId, status: 'in_progress' } }),
    responseEvent({ type: 'response.output_item.added', output_index: 0, item: { ...item, arguments: '', status: 'in_progress' } }),
    responseEvent({ type: 'response.function_call_arguments.done', item_id: itemId, output_index: 0, arguments: argumentsJson }),
    responseEvent({ type: 'response.output_item.done', output_index: 0, item }),
    responseEvent({
      type: 'response.completed',
      response: { id: responseId, status: 'completed', output: [item], usage: completedUsage() },
    }),
  ].join('');
}

function toolNamesFromRequest(body) {
  if (!Array.isArray(body?.tools)) return [];
  return body.tools.map((tool) => tool?.name ?? tool?.function?.name ?? null);
}

function additionalToolsFromRequest(body) {
  const values = [];
  const visit = (value, insideInput = false) => {
    if (Array.isArray(value)) {
      value.forEach((child) => visit(child, insideInput));
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (insideInput && key === 'additional_tools') {
        values.push(...(Array.isArray(child) ? child : [child]));
      }
      visit(child, insideInput || key === 'input');
    }
  };
  visit(body, false);
  return values;
}

function requestContainsImage(body) {
  let found = false;
  const visit = (value) => {
    if (found) return;
    if (typeof value === 'string') {
      if (value.includes('data:image')) found = true;
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== 'object') return;
    if (value.type === 'input_image') {
      found = true;
      return;
    }
    Object.values(value).forEach(visit);
  };
  visit(body);
  return found;
}

async function startLoopbackProvider(mode, expectedAcknowledgement, sentinelPath) {
  const records = [];
  const server = createServer((request, response) => {
    const chunks = [];
    let bytes = 0;
    request.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes <= MAX_REQUEST_BYTES) chunks.push(Buffer.from(chunk));
    });
    request.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      let body = null;
      try { body = JSON.parse(raw); } catch { /* rejected below */ }
      const record = {
        index: records.length,
        method: request.method ?? null,
        endpointOk: request.url === '/v1/responses',
        bytes,
        sha256: sha256(raw),
        topLevelToolsIsArray: Array.isArray(body?.tools),
        toolNames: body ? toolNamesFromRequest(body) : [],
        additionalToolCount: body ? additionalToolsFromRequest(body).length : -1,
        containsImage: body ? requestContainsImage(body) : false,
      };
      records.push(record);
      if (
        request.method !== 'POST'
        || !record.endpointOk
        || body === null
        || bytes > MAX_REQUEST_BYTES
      ) {
        response.writeHead(400, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: { message: 'Waggle loopback policy rejected request' } }));
        return;
      }
      let payload;
      if (mode === 'sealed') {
        payload = records.length === 1
          ? messageResponse(expectedAcknowledgement)
          : null;
      } else if (records.length === 1) {
        payload = functionCallResponse('view_image', JSON.stringify({ path: sentinelPath }));
      } else if (records.length === 2) {
        payload = messageResponse(expectedAcknowledgement);
      }
      if (payload === null || payload === undefined) {
        response.writeHead(400, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: { message: 'Waggle loopback request count exceeded policy' } }));
        return;
      }
      response.writeHead(200, {
        'cache-control': 'no-cache',
        'content-type': 'text/event-stream; charset=utf-8',
      });
      response.end(payload);
    });
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  assert(address && typeof address !== 'string', 'loopback provider did not expose an address');
  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    records,
    close: () => new Promise((resolveClose, rejectClose) => {
      server.close((error) => error ? rejectClose(error) : resolveClose());
    }),
  };
}

function buildInvocationArguments(options) {
  const args = ['app-server', '--stdio', '--strict-config'];
  for (const feature of DISABLED_FEATURES) args.push('--disable', feature);
  assert(Array.isArray(options.mcpServerNames), 'MCP server inventory is missing');
  const mcpServerEntries = options.mcpServerNames.map((name) => {
    assert(!/[\u0000\r\n']/.test(name), 'MCP server name contains an unsupported character');
    return `'${name}'={enabled=false}`;
  });
  const hookStateEntries = [];
  const hookStateKeys = new Set();
  for (const key of options.hookDisables ?? []) {
    assert(!/[\u0000\r\n']/.test(key), 'disabled hook key contains an unsupported character');
    assert(!hookStateKeys.has(key), 'duplicate hook-state key');
    hookStateKeys.add(key);
    hookStateEntries.push(`'${key}'={enabled=false}`);
  }
  for (const { key, currentHash } of options.hookPins) {
    assert(!/[\u0000\r\n']/.test(key), 'hook key contains an unsupported character');
    assert(!hookStateKeys.has(key), 'duplicate hook-state key');
    assert(/^sha256:[0-9a-f]{64}$/.test(currentHash), 'hook currentHash is invalid');
    hookStateKeys.add(key);
    hookStateEntries.push(`'${key}'={enabled=true,trusted_hash='${currentHash}'}`);
  }
  const overrides = [
    ...CONFIG_OVERRIDES,
    `mcp_servers={${mcpServerEntries.join(',')}}`,
    `model_catalog_json=${tomlString(options.catalogPath)}`,
    ...(options.providerBaseUrl ? [
      'model_provider="waggle_loopback"',
      `model_providers.waggle_loopback.name="Waggle zero-cost loopback"`,
      `model_providers.waggle_loopback.base_url=${tomlString(options.providerBaseUrl)}`,
      'model_providers.waggle_loopback.wire_api="responses"',
      'model_providers.waggle_loopback.request_max_retries=0',
      'model_providers.waggle_loopback.stream_max_retries=0',
      'model_providers.waggle_loopback.requires_openai_auth=false',
      'model_providers.waggle_loopback.supports_websockets=false',
    ] : [
      'model_provider="waggle_chatgpt"',
      'model_providers.waggle_chatgpt.name="Waggle ChatGPT official auth"',
      'model_providers.waggle_chatgpt.base_url="https://chatgpt.com/backend-api/codex"',
      'model_providers.waggle_chatgpt.wire_api="responses"',
      'model_providers.waggle_chatgpt.request_max_retries=0',
      'model_providers.waggle_chatgpt.stream_max_retries=0',
      'model_providers.waggle_chatgpt.requires_openai_auth=true',
      'model_providers.waggle_chatgpt.supports_websockets=false',
    ]),
    ...(options.includeDeny ? [options.denyConfig] : []),
    ...(hookStateEntries.length > 0 ? [`hooks.state={${hookStateEntries.join(',')}}`] : []),
  ];
  for (const override of overrides) args.push('-c', override);
  return args;
}

function normalizedArguments(args, sensitiveValues) {
  return args.map((argument) => {
    if (argument.startsWith('hooks.state={')) {
      return `hooks.state=<sha256:${sha256(argument)}>`;
    }
    if (argument.startsWith('mcp_servers={')) {
      return `mcp_servers=<sha256:${sha256(argument)}>`;
    }
    let normalized = argument;
    for (const [value, label] of sensitiveValues) {
      if (value) normalized = normalized.replaceAll(value, label);
    }
    return normalized;
  });
}

class AppServerClient {
  constructor(executable, args, cwd, env, replacements) {
    this.responses = new Map();
    this.notifications = [];
    this.stdoutChunks = [];
    this.stderrChunks = [];
    this.buffer = '';
    this.sequence = 0;
    this.closed = false;
    this.error = null;
    this.replacements = replacements;
    this.child = spawn(executable, args, {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      shell: false,
    });
    this.child.stdout.on('data', (chunk) => {
      appendBounded(this.stdoutChunks, chunk);
      this.buffer += chunk.toString('utf8');
      while (this.buffer.includes('\n')) {
        const newline = this.buffer.indexOf('\n');
        const line = this.buffer.slice(0, newline).trim();
        this.buffer = this.buffer.slice(newline + 1);
        this.processLine(line);
      }
    });
    this.child.stderr.on('data', (chunk) => appendBounded(this.stderrChunks, chunk));
    this.child.on('error', (error) => {
      this.error = safeError(error, replacements);
    });
    this.child.on('close', () => {
      this.closed = true;
      this.processLine(this.buffer.trim());
      this.buffer = '';
    });
  }

  processLine(line) {
    if (!line) return;
    let message;
    try { message = JSON.parse(line); } catch {
      this.error = this.error ?? 'Codex app-server emitted malformed protocol output';
      return;
    }
    this.sequence += 1;
    if (message?.id !== undefined && typeof message?.method !== 'string') {
      this.responses.set(String(message.id), message);
    } else if (typeof message?.method === 'string') {
      this.notifications.push({ sequence: this.sequence, message });
    }
  }

  send(message) {
    assert(this.child.stdin.writable, 'Codex app-server stdin is closed');
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  response(id, timeoutMs = 20_000) {
    return waitForValue(
      () => this.responses.get(String(id)),
      timeoutMs,
      `Codex app-server response ${id}`,
    );
  }

  notification(method, timeoutMs = TURN_TIMEOUT_MS) {
    return waitForValue(
      () => this.notifications.find((entry) => entry.message?.method === method),
      timeoutMs,
      `Codex app-server notification ${method}`,
    );
  }

  async initialize(clientName) {
    this.send({
      method: 'initialize',
      id: 1,
      params: {
        clientInfo: { name: clientName, title: clientName, version: '1.0.0' },
        capabilities: { experimentalApi: true },
      },
    });
    const response = await this.response(1);
    assert(!response.error, 'Codex app-server initialize failed');
    this.send({ method: 'initialized', params: {} });
  }

  async close() {
    try { this.child.stdin.end(); } catch { /* already closed */ }
    try {
      await waitForValue(() => this.closed ? true : undefined, 5_000, 'Codex app-server close');
    } catch {
      if (this.child.pid) {
        spawnSync('taskkill.exe', ['/PID', String(this.child.pid), '/T', '/F'], {
          encoding: 'utf8',
          timeout: 10_000,
          windowsHide: true,
        });
      }
      try { this.child.kill('SIGKILL'); } catch { /* already closed */ }
      await waitForValue(() => this.closed ? true : undefined, 5_000, 'forced Codex app-server close');
    }
  }

  transcriptDigest() {
    return {
      stdoutBytes: Buffer.concat(this.stdoutChunks).length,
      stdoutSha256: sha256(Buffer.concat(this.stdoutChunks)),
      stderrBytes: Buffer.concat(this.stderrChunks).length,
      stderrSha256: sha256(Buffer.concat(this.stderrChunks)),
    };
  }
}

function hookGraphFromEntry(entry) {
  const hooks = Array.isArray(entry?.hooks) ? entry.hooks : [];
  return hooks.map((hook) => ({
    eventName: hook?.eventName ?? null,
    sourcePath: hook?.sourcePath ?? null,
    sourceCanonical: typeof hook?.sourcePath === 'string' && existsSync(hook.sourcePath)
      ? canonicalPath(hook.sourcePath)
      : String(hook?.sourcePath ?? '').toLowerCase(),
    key: hook?.key ?? null,
    currentHash: hook?.currentHash ?? null,
    commandSha256: typeof hook?.command === 'string' ? sha256(hook.command) : null,
    enabled: hook?.enabled === true,
    trustStatus: hook?.trustStatus ?? null,
  }));
}

function assertExactHookGraph(
  entry,
  codexHome,
  includeDeny,
  requireTrusted,
  expectedDenyCommandSha256,
  expectedWaggleCommands,
  allowActiveExtras,
) {
  const graph = hookGraphFromEntry(entry);
  const expectedCount = WAGGLE_HOOK_EVENTS.length + (includeDeny ? 1 : 0);
  const warnings = Array.isArray(entry?.warnings) ? entry.warnings.length : -1;
  const errors = Array.isArray(entry?.errors) ? entry.errors.length : -1;
  assert(warnings === 0, `hooks/list reported ${warnings} warnings`);
  assert(errors === 0, `hooks/list reported ${errors} errors`);
  const waggleSource = canonicalPath(join(codexHome, 'hooks.json'));
  assert(expectedWaggleCommands instanceof Map, 'expected Waggle hook commands are missing');
  const waggle = graph.filter((hook) => (
    hook.sourceCanonical === waggleSource
    && hook.commandSha256 === expectedWaggleCommands.get(hook.eventName)
  ));
  const deny = graph.filter((hook) => (
    hook.eventName === 'preToolUse'
    && hook.sourceCanonical === 'c:\\<session-flags>\\config.toml'
    && hook.commandSha256 === expectedDenyCommandSha256
  ));
  const waggleSourceMatches = graph.filter((hook) => hook.sourceCanonical === waggleSource).length;
  const waggleCommandMatches = graph.filter((hook) => (
    hook.commandSha256 === expectedWaggleCommands.get(hook.eventName)
  )).length;
  assert(
    waggle.length === 4,
    `hooks/list returned ${waggle.length} Waggle hooks, expected 4 (sourceMatches=${waggleSourceMatches}, commandMatches=${waggleCommandMatches})`,
  );
  assert(
    JSON.stringify(waggle.map((hook) => hook.eventName).sort())
      === JSON.stringify([...WAGGLE_HOOK_EVENTS].sort()),
    'hooks/list returned an unexpected Waggle event set',
  );
  assert(deny.length === (includeDeny ? 1 : 0), 'hooks/list returned an unexpected deny-hook count');
  const expected = [...waggle, ...deny];
  const expectedKeys = new Set(expected.map((hook) => hook.key));
  const extras = graph.filter((hook) => !expectedKeys.has(hook.key));
  assert(graph.every((hook) => (
    typeof hook.key === 'string'
    && /^sha256:[0-9a-f]{64}$/.test(hook.currentHash ?? '')
    && typeof hook.commandSha256 === 'string'
  )), 'hooks/list returned a malformed hook');
  assert(expected.every((hook) => hook.enabled), 'an expected hook is disabled');
  if (!allowActiveExtras) {
    assert(extras.every((hook) => !hook.enabled), 'an unapproved hook remains enabled');
  }
  if (requireTrusted) {
    assert(expected.every((hook) => hook.trustStatus === 'trusted'), 'an expected hook is not hash-trusted');
  }
  const sanitized = graph.map((hook) => ({
    eventName: hook.eventName,
    sourceKind: waggle.includes(hook)
      ? 'waggle-hooks-json'
      : deny.includes(hook) ? 'session-flags' : 'disabled-external',
    sourcePathSha256: sha256(hook.sourceCanonical),
    keySha256: sha256(hook.key),
    currentHash: hook.currentHash,
    commandSha256: hook.commandSha256,
    enabled: hook.enabled,
    trustStatus: requireTrusted ? hook.trustStatus : 'pre-pin',
  })).sort((left, right) => stableJson(left).localeCompare(stableJson(right)));
  const identity = sanitized.map(({ enabled: _enabled, trustStatus: _trustStatus, ...value }) => value);
  return {
    graph,
    expected,
    extras,
    sanitized,
    graphSha256: sha256(stableJson(sanitized)),
    identitySha256: sha256(stableJson(identity)),
    warnings,
    errors,
    activeCount: graph.filter((hook) => hook.enabled).length,
    extraCount: extras.filter((hook) => hook.enabled).length,
    disabledExtraCount: extras.filter((hook) => !hook.enabled).length,
    denyHookSha256: includeDeny ? deny[0].currentHash.slice('sha256:'.length) : null,
  };
}

async function listHooks(
  executable,
  args,
  cwd,
  env,
  codexHome,
  includeDeny,
  requireTrusted,
  expectedDenyCommandSha256,
  expectedWaggleCommands,
  allowActiveExtras,
  replacements,
) {
  const client = new AppServerClient(executable, args, cwd, env, replacements);
  try {
    await client.initialize('waggle_codex_tool_denial_discovery');
    client.send({ method: 'hooks/list', id: 2, params: { cwds: [cwd] } });
    const response = await client.response(2);
    assert(!response.error, 'Codex app-server hooks/list failed');
    const entry = response.result?.data?.[0];
    const result = assertExactHookGraph(
      entry,
      codexHome,
      includeDeny,
      requireTrusted,
      expectedDenyCommandSha256,
      expectedWaggleCommands,
      allowActiveExtras,
    );
    assert(client.error === null, client.error ?? 'Codex hook discovery failed');
    return { ...result, transcript: client.transcriptDigest() };
  } finally {
    await client.close();
  }
}

function itemType(notification) {
  return notification?.message?.params?.item?.type ?? null;
}

function treeContains(value, needle) {
  if (typeof value === 'string') return value.includes(needle);
  if (Array.isArray(value)) return value.some((child) => treeContains(child, needle));
  if (value && typeof value === 'object') return Object.values(value).some((child) => treeContains(child, needle));
  return false;
}

function eventAudit(notifications, expectedAcknowledgement, strictAllowlist) {
  const notificationMethods = notifications.map((entry) => entry.message?.method ?? null);
  const unknownNotifications = notifications.filter((entry) => (
    !ALLOWED_NOTIFICATION_METHODS.has(entry.message?.method)
  ));
  const itemNotifications = notifications.filter((entry) => (
    entry.message?.method === 'item/started'
    || entry.message?.method === 'item/updated'
    || entry.message?.method === 'item/completed'
  ));
  const unknownItems = itemNotifications.filter((entry) => !ALLOWED_ITEM_TYPES.has(itemType(entry)));
  const completedMessages = notifications.filter((entry) => (
    entry.message?.method === 'item/completed'
    && itemType(entry) === 'agentMessage'
  ));
  const exactMessages = completedMessages.filter((entry) => (
    entry.message?.params?.item?.text?.trim() === expectedAcknowledgement
  ));
  const imageItems = itemNotifications.filter((entry) => (
    String(itemType(entry)).toLowerCase().includes('image')
    || treeContains(entry.message?.params?.item, 'view_image')
  ));
  const denyHooks = notifications.filter((entry) => (
    entry.message?.method === 'hook/completed'
    && entry.message?.params?.run?.eventName === 'preToolUse'
    && treeContains(entry.message?.params?.run, DENIAL_REASON)
  ));
  const forbiddenToolItems = itemNotifications.filter((entry) => {
    const type = String(itemType(entry) ?? '').toLowerCase();
    return [
      'command',
      'computer',
      'dynamictool',
      'filechange',
      'imagegeneration',
      'mcptool',
      'websearch',
    ].some((family) => type.includes(family));
  });
  if (strictAllowlist) {
    assert(unknownNotifications.length === 0, 'paid lane emitted an unapproved notification');
    assert(unknownItems.length === 0, 'paid lane emitted an unapproved item type');
    assert(forbiddenToolItems.length === 0, 'paid lane emitted a tool item');
  }
  return {
    exactMessageCount: exactMessages.length,
    normalTextCompleted: completedMessages.length === 1 && exactMessages.length === 1,
    imageItemCount: imageItems.length,
    firstImageSequence: imageItems[0]?.sequence ?? null,
    denyHookCount: denyHooks.length,
    firstDenySequence: denyHooks[0]?.sequence ?? null,
    toolEventsObserved: forbiddenToolItems.length,
    unknownEventsObserved: unknownNotifications.length + unknownItems.length,
    notificationGraphSha256: sha256(stableJson(notificationMethods)),
  };
}

async function runTurn(options) {
  const client = new AppServerClient(
    options.executable,
    options.args,
    options.workspace,
    options.env,
    options.replacements,
  );
  let threadId = null;
  let turnId = null;
  try {
    await client.initialize(`waggle_codex_tool_denial_${options.lane}`);
    client.send({ method: 'hooks/list', id: 2, params: { cwds: [options.workspace] } });
    const hookResponse = await client.response(2);
    assert(!hookResponse.error, 'Codex app-server hooks/list failed');
    const hooks = assertExactHookGraph(
      hookResponse.result?.data?.[0],
      options.codexHome,
      options.includeDeny,
      true,
      options.expectedDenyCommandSha256,
      options.expectedWaggleCommands,
      false,
    );
    assert(hooks.graphSha256 === options.expectedHookGraphSha256, 'hook graph changed after hash pinning');
    if (options.beforeTurn) await options.beforeTurn();

    const threadParams = {
      model: options.model,
      cwd: options.workspace,
      approvalPolicy: 'never',
      sandbox: 'read-only',
      ephemeral: true,
      allowProviderModelFallback: false,
      ...(options.useDefaultEnvironmentForControl ? {} : { environments: [] }),
      selectedCapabilityRoots: [],
      dynamicTools: [],
    };
    client.send({ method: 'thread/start', id: 3, params: threadParams });
    const threadResponse = await client.response(3);
    assert(!threadResponse.error, 'Codex app-server thread/start failed');
    threadId = threadResponse.result?.thread?.id ?? null;
    assert(typeof threadId === 'string' && threadId.length > 0, 'Codex app-server omitted thread id');

    const turnParams = {
      threadId,
      input: [{ type: 'text', text: options.prompt, text_elements: [] }],
      model: options.model,
      approvalPolicy: 'never',
      sandboxPolicy: { type: 'readOnly', networkAccess: false },
      ...(options.useDefaultEnvironmentForControl ? {} : { environments: [] }),
    };
    client.send({ method: 'turn/start', id: 4, params: turnParams });
    const turnResponse = await client.response(4);
    assert(!turnResponse.error, 'Codex app-server turn/start failed');
    turnId = turnResponse.result?.turn?.id ?? null;
    assert(typeof turnId === 'string' && turnId.length > 0, 'Codex app-server omitted turn id');
    const completed = await client.notification('turn/completed');
    assert(completed.message?.params?.turn?.status === 'completed', 'Codex app-server turn did not complete');
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    assert(client.error === null, client.error ?? 'Codex app-server protocol failed');
    const events = eventAudit(
      client.notifications,
      options.expectedAcknowledgement,
      options.strictAllowlist,
    );
    assert(events.normalTextCompleted, 'Codex did not emit exactly one expected agent message');
    return {
      hooks,
      events,
      threadParamsSha256: sha256(stableJson({ ...threadParams, cwd: '<WORKSPACE>' })),
      turnParamsSha256: sha256(stableJson({ ...turnParams, threadId: '<THREAD>', input: '<PROMPT>' })),
      threadId,
      threadIdSha256: sha256(threadId),
      turnIdSha256: sha256(turnId),
      transcript: client.transcriptDigest(),
    };
  } finally {
    await client.close();
  }
}

async function createSentinelPng(path) {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );
  await writeFile(path, png);
  requireRegularFile(path, 'owned sentinel PNG');
  return sha256(png);
}

async function runValidationSelfTest() {
  const root = join(tmpdir(), `waggle-codex-denial-self-test-${randomBytes(12).toString('hex')}`);
  const codexHome = join(root, 'codex-home');
  const hooksPath = join(codexHome, 'hooks.json');
  let cases = 0;
  const expectThrow = (run, label) => {
    let threw = false;
    try { run(); } catch { threw = true; }
    assert(threw, `negative fixture was accepted: ${label}`);
    cases += 1;
  };
  try {
    const inventoryArguments = buildMcpInventoryArguments();
    assert(
      inventoryArguments.length === (DISABLED_FEATURES.length * 2) + 3
        && JSON.stringify(inventoryArguments.slice(-3)) === JSON.stringify(['mcp', 'list', '--json'])
        && DISABLED_FEATURES.every((feature, index) => (
          inventoryArguments[index * 2] === '--disable'
          && inventoryArguments[(index * 2) + 1] === feature
        )),
      'MCP inventory did not inherit the app-server feature-disable boundary',
    );
    cases += 1;
    assert(
      join('C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
        === 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      'package-command Windows PowerShell spelling fixture failed',
    );
    await mkdir(codexHome, { recursive: true });
    await writeFile(hooksPath, '{}\n', 'utf8');
    const expectedCommands = new Map();
    const hooks = WAGGLE_HOOK_EVENTS.map((eventName, index) => {
      const command = `fixture-waggle-command-${index}`;
      expectedCommands.set(eventName, sha256(command));
      return {
        eventName,
        sourcePath: hooksPath,
        key: `fixture-waggle-key-${index}`,
        currentHash: `sha256:${String(index + 1).padStart(64, '0')}`,
        command,
        enabled: true,
        trustStatus: 'trusted',
      };
    });
    const denyCommand = 'fixture-deny-command';
    hooks.push({
      eventName: 'preToolUse',
      sourcePath: 'C:\\<session-flags>\\config.toml',
      key: 'fixture-deny-key',
      currentHash: `sha256:${'f'.repeat(64)}`,
      command: denyCommand,
      enabled: true,
      trustStatus: 'trusted',
    });
    const validEntry = { hooks, warnings: [], errors: [] };
    const valid = assertExactHookGraph(
      validEntry,
      codexHome,
      true,
      true,
      sha256(denyCommand),
      expectedCommands,
      false,
    );
    assert(valid.graph.length === 5, 'valid hook fixture did not pass');
    cases += 1;

    const withExtra = structuredClone(validEntry);
    withExtra.hooks.push({ ...withExtra.hooks[0], key: 'extra-key' });
    expectThrow(() => assertExactHookGraph(
      withExtra, codexHome, true, true, sha256(denyCommand), expectedCommands, false,
    ), 'extra hook');

    const activeExternal = structuredClone(validEntry);
    activeExternal.hooks.push({
      ...activeExternal.hooks[0],
      sourcePath: 'C:\\external\\hooks.json',
      key: 'external-key',
      command: 'external-command',
    });
    expectThrow(() => assertExactHookGraph(
      activeExternal, codexHome, true, true, sha256(denyCommand), expectedCommands, false,
    ), 'active external hook');
    const disabledExternal = structuredClone(activeExternal);
    disabledExternal.hooks[5].enabled = false;
    const disabledResult = assertExactHookGraph(
      disabledExternal, codexHome, true, true, sha256(denyCommand), expectedCommands, false,
    );
    assert(disabledResult.extraCount === 0 && disabledResult.disabledExtraCount === 1,
      'disabled external hook fixture did not pass');
    cases += 1;

    const wrongDenySource = structuredClone(validEntry);
    wrongDenySource.hooks[4].sourcePath = 'C:\\temp\\config.toml';
    expectThrow(() => assertExactHookGraph(
      wrongDenySource, codexHome, true, true, sha256(denyCommand), expectedCommands, false,
    ), 'deny source');

    const wrongDenyCommand = structuredClone(validEntry);
    wrongDenyCommand.hooks[4].command = 'different-deny-command';
    expectThrow(() => assertExactHookGraph(
      wrongDenyCommand, codexHome, true, true, sha256(denyCommand), expectedCommands, false,
    ), 'deny command');

    const wrongWaggleCommand = structuredClone(validEntry);
    wrongWaggleCommand.hooks[0].command = 'different-waggle-command';
    expectThrow(() => assertExactHookGraph(
      wrongWaggleCommand, codexHome, true, true, sha256(denyCommand), expectedCommands, false,
    ), 'packaged Waggle command');

    const untrusted = structuredClone(validEntry);
    untrusted.hooks[0].trustStatus = 'untrusted';
    expectThrow(() => assertExactHookGraph(
      untrusted, codexHome, true, true, sha256(denyCommand), expectedCommands, false,
    ), 'untrusted hook');

    const acknowledgement = 'SELF_TEST_ACK';
    const safeNotification = {
      sequence: 1,
      message: {
        method: 'item/completed',
        params: { item: { type: 'agentMessage', text: acknowledgement } },
      },
    };
    assert(eventAudit([safeNotification], acknowledgement, true).normalTextCompleted, 'safe event fixture did not pass');
    cases += 1;
    for (const itemTypeValue of [
      'commandExecution',
      'computerUse',
      'dynamicToolCall',
      'fileChange',
      'imageGeneration',
      'imageView',
      'mcpToolCall',
      'toolSearch',
      'webSearch',
    ]) {
      const bad = {
        sequence: 2,
        message: { method: 'item/completed', params: { item: { type: itemTypeValue } } },
      };
      expectThrow(() => eventAudit([safeNotification, bad], acknowledgement, true), itemTypeValue);
    }
    const unknownNotification = { sequence: 2, message: { method: 'future/tool/event', params: {} } };
    expectThrow(
      () => eventAudit([safeNotification, unknownNotification], acknowledgement, true),
      'unknown notification',
    );
    const mcpBoundary = {
      count: 3,
      namesSha256: 'a'.repeat(64),
      configSha256: 'b'.repeat(64),
      boundarySha256: 'c'.repeat(64),
    };
    assertSameMcpBoundary(mcpBoundary, { ...mcpBoundary }, 'self-test');
    cases += 1;
    expectThrow(
      () => assertSameMcpBoundary(mcpBoundary, { ...mcpBoundary, configSha256: 'd'.repeat(64) }, 'self-test'),
      'MCP boundary drift',
    );
    return { pass: true, paidCalls: 0, cases };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const flags = parseArgs(process.argv.slice(2));
if (flags['self-test']) {
  process.stdout.write(`${JSON.stringify(await runValidationSelfTest())}\n`);
  process.exit(0);
}
const codexExecutable = resolve(flags['codex-exe']);
const hiveMindCli = resolve(flags['hive-mind-cli']);
const receiptDir = resolve(flags['receipt-dir']);
const windowsPowerShell = resolve(flags['windows-powershell']);
const workspace = resolve(flags.workspace);
const model = flags.model;
const expectedHead = flags['expected-head'];
const executePaid = flags['execute-paid'] === true;
const initialExecutableSha256 = existsSync(codexExecutable) ? sha256File(codexExecutable) : null;
const initialScriptSha256 = sha256File(SCRIPT_PATH);
const report = {
  schemaVersion: 1,
  kind: 'codex-tool-denial-and-official-auth',
  pass: false,
  paidCalls: 0,
  proof: { paidCalls: 0, pass: false },
  source: {
    expectedHead,
    observedHead: null,
    tree: null,
    scriptBlob: null,
    trackedClean: false,
    unchanged: false,
  },
  executable: {
    version: null,
    sha256: initialExecutableSha256,
    unchanged: false,
  },
  model: {
    idSha256: sha256(model),
    bundledCatalogSha256: null,
  },
  modelCatalog: {
    sealedSha256: null,
    controlSha256: null,
  },
  invocation: {
    argumentsSha256: null,
    configSha256: sha256(stableJson(CONFIG_OVERRIDES)),
    threadParamsSha256: null,
    turnParamsSha256: null,
    mcpServerCount: null,
    mcpServerNamesSha256: null,
  },
  hooks: {
    expectedCount: 5,
    extraCount: null,
    artifactsSha256: null,
    cliSha256: null,
    graphSha256: null,
    denyHookSha256: null,
    warnings: null,
    errors: null,
    allTrusted: false,
    unchangedAfterPin: false,
    artifactsUnchanged: false,
  },
  mcpBoundary: {
    count: null,
    namesSha256: null,
    initialSha256: null,
    prePaidSha256: null,
    postPaidSha256: null,
    initialConfigSha256: null,
    prePaidConfigSha256: null,
    postPaidConfigSha256: null,
    unchanged: false,
  },
  sealed: null,
  red: null,
  green: null,
  paidInvocation: {
    attempted: false,
    executed: false,
    arguments: [],
    argumentsSha256: null,
    modelCatalogSha256: null,
    hookGraphSha256: null,
    markerSha256: null,
    sessionIdSha256: null,
    threadParamsSha256: null,
    turnParamsSha256: null,
    normalTextCompleted: false,
    toolEventsObserved: 0,
    unknownEventsObserved: 0,
  },
  artifacts: {
    scriptSha256: initialScriptSha256,
    scriptUnchanged: false,
    windowsPowerShellSha256: null,
    windowsSystemDirectorySha256: null,
    workspaceSha256: sha256(canonicalPath(workspace)),
    reportPathHash: sha256(join(receiptDir, 'report.json').toLowerCase()),
    tempRemoved: false,
  },
  error: null,
};

let rawPaidSessionId = null;
let markerMatched = !executePaid;
let tempRoot = null;
let initialSourceSnapshot = null;
let initialMcpBoundary = null;
const providers = [];
let receiptCreated = false;

try {
  assert(process.platform === 'win32', 'this proof is Windows-only');
  assert(isAbsolute(flags['codex-exe']), '--codex-exe must be absolute');
  assert(isAbsolute(flags['hive-mind-cli']), '--hive-mind-cli must be absolute');
  assert(isAbsolute(flags['receipt-dir']), '--receipt-dir must be absolute');
  assert(isAbsolute(flags['windows-powershell']), '--windows-powershell must be absolute');
  assert(isAbsolute(flags.workspace), '--workspace must be absolute');
  requireRegularFile(codexExecutable, 'Codex executable');
  requireRegularFile(hiveMindCli, 'hive-mind CLI');
  requireDirectory(workspace, 'workspace');
  initialSourceSnapshot = verifySourceSnapshot(expectedHead);
  Object.assign(report.source, initialSourceSnapshot);
  assert(!existsSync(receiptDir), '--receipt-dir must be fresh');
  assertNoExistingReparsePoint(dirname(receiptDir));
  await mkdir(receiptDir, { recursive: false });
  receiptCreated = true;

  const codexHome = resolve(process.env.CODEX_HOME || join(homedir(), '.codex'));
  requireDirectory(codexHome, 'user Codex profile');
  requireRegularFile(join(codexHome, 'hooks.json'), 'user Codex hooks.json');
  const codexConfigPath = join(codexHome, 'config.toml');
  requireRegularFile(codexConfigPath, 'user Codex config.toml');
  const version = runChecked(codexExecutable, ['--version'], {
    label: 'Codex version',
    timeoutMs: 20_000,
  }).stdout.trim();
  assert(/^codex(?:-cli)?\s/.test(version), 'Codex returned an unexpected version');
  report.executable.version = version;

  tempRoot = join(tmpdir(), `waggle-codex-denial-${randomBytes(12).toString('hex')}`);
  await mkdir(tempRoot, { recursive: false });
  await mkdir(join(tempRoot, 'mind'), { recursive: true });
  await mkdir(join(tempRoot, 'process-temp'), { recursive: true });
  const env = buildChildEnvironment(tempRoot);
  initialMcpBoundary = captureMcpBoundary(codexExecutable, env, codexConfigPath);
  const mcpServerNames = readConfiguredMcpServerNames(codexExecutable, env);
  assert(
    initialMcpBoundary.namesSha256 === sha256(stableJson(mcpServerNames)),
    'initial MCP inventory changed while being captured',
  );
  report.invocation.mcpServerCount = mcpServerNames.length;
  report.invocation.mcpServerNamesSha256 = sha256(stableJson(mcpServerNames));
  report.mcpBoundary.count = initialMcpBoundary.count;
  report.mcpBoundary.namesSha256 = initialMcpBoundary.namesSha256;
  report.mcpBoundary.initialSha256 = initialMcpBoundary.boundarySha256;
  report.mcpBoundary.initialConfigSha256 = initialMcpBoundary.configSha256;
  const sentinelPath = join(tempRoot, 'owned-sentinel.png');
  const sentinelSha256 = await createSentinelPng(sentinelPath);
  const { selected, bundledSha256 } = readBundledModel(codexExecutable, model);
  report.model.bundledCatalogSha256 = bundledSha256;
  const sealedCatalogPath = join(tempRoot, 'sealed-models.json');
  const controlCatalogPath = join(tempRoot, 'control-models.json');
  report.modelCatalog.sealedSha256 = await writeCatalog(sealedCatalogPath, mutateModel(selected, true));
  const controlModel = `waggle-control-${sha256(model).slice(0, 16)}`;
  const controlCatalogModel = mutateModel(selected, false);
  controlCatalogModel.slug = controlModel;
  report.modelCatalog.controlSha256 = await writeCatalog(controlCatalogPath, controlCatalogModel);

  const trustedPowerShell = verifyWindowsPowerShell(windowsPowerShell);
  report.artifacts.windowsPowerShellSha256 = trustedPowerShell.sha256;
  report.artifacts.windowsSystemDirectorySha256 = trustedPowerShell.systemDirectorySha256;
  const expectedWaggleHooks = buildExpectedWaggleHooks(trustedPowerShell.path, hiveMindCli);
  const denial = buildDenyHookConfig(trustedPowerShell.path);
  const replacements = [
    codexExecutable,
    hiveMindCli,
    receiptDir,
    workspace,
    codexHome,
    tempRoot,
    sentinelPath,
    trustedPowerShell.path,
    flags.marker,
  ];
  const discoveryArgs = buildInvocationArguments({
    mcpServerNames,
    catalogPath: sealedCatalogPath,
    providerBaseUrl: 'http://127.0.0.1:9/v1',
    includeDeny: true,
    denyConfig: denial.config,
    hookPins: [],
  });
  const discovered = await listHooks(
    codexExecutable,
    discoveryArgs,
    workspace,
    env,
    codexHome,
    true,
    false,
    denial.commandSha256,
    expectedWaggleHooks.commands,
    true,
    replacements,
  );
  const allPins = discovered.expected.map(({ key, currentHash }) => ({ key, currentHash }));
  const wagglePins = discovered.expected
    .filter(({ eventName }) => eventName !== 'preToolUse')
    .map(({ key, currentHash }) => ({ key, currentHash }));
  const externalHookDisables = discovered.extras.map(({ key }) => key);

  const pinnedDiscoveryArgs = buildInvocationArguments({
    mcpServerNames,
    catalogPath: sealedCatalogPath,
    providerBaseUrl: 'http://127.0.0.1:9/v1',
    includeDeny: true,
    denyConfig: denial.config,
    hookDisables: externalHookDisables,
    hookPins: allPins,
  });
  const pinned = await listHooks(
    codexExecutable,
    pinnedDiscoveryArgs,
    workspace,
    env,
    codexHome,
    true,
    true,
    denial.commandSha256,
    expectedWaggleHooks.commands,
    false,
    replacements,
  );
  assert(discovered.identitySha256 === pinned.identitySha256, 'hook graph identity changed while hash-pinning');
  assert(pinned.denyHookSha256 !== null, 'deny hook hash is missing');
  report.hooks = {
    expectedCount: 5,
    extraCount: pinned.extraCount,
    disabledExtraCount: pinned.disabledExtraCount,
    artifactsSha256: expectedWaggleHooks.artifactsSha256,
    cliSha256: expectedWaggleHooks.cliSha256,
    graphSha256: pinned.graphSha256,
    denyHookSha256: pinned.denyHookSha256,
    warnings: pinned.warnings,
    errors: pinned.errors,
    allTrusted: pinned.expected.every((hook) => hook.trustStatus === 'trusted'),
    unchangedAfterPin: discovered.identitySha256 === pinned.identitySha256,
    artifactsUnchanged: false,
  };

  const sealedAck = `WAGGLE_SEALED_ACK_${randomBytes(24).toString('hex')}`;
  const sealedProvider = await startLoopbackProvider('sealed', sealedAck, sentinelPath);
  providers.push(sealedProvider);
  const sealedArgs = buildInvocationArguments({
    mcpServerNames,
    catalogPath: sealedCatalogPath,
    providerBaseUrl: sealedProvider.baseUrl,
    includeDeny: true,
    denyConfig: denial.config,
    hookDisables: externalHookDisables,
    hookPins: allPins,
  });
  const sealedRun = await runTurn({
    executable: codexExecutable,
    args: sealedArgs,
    workspace,
    env,
    replacements,
    codexHome,
    includeDeny: true,
    expectedDenyCommandSha256: denial.commandSha256,
    expectedWaggleCommands: expectedWaggleHooks.commands,
    expectedHookGraphSha256: pinned.graphSha256,
    lane: 'sealed',
    model,
    prompt: `Return exactly ${sealedAck} and nothing else. Do not call tools.`,
    expectedAcknowledgement: sealedAck,
    strictAllowlist: false,
  });
  await sealedProvider.close();
  providers.splice(providers.indexOf(sealedProvider), 1);
  assert(sealedProvider.records.length === 1, `sealed provider saw ${sealedProvider.records.length} requests`);
  const sealedRequest = sealedProvider.records[0];
  assert(sealedRequest.topLevelToolsIsArray, 'sealed provider request omitted the top-level tools array');
  assert(
    sealedRequest.toolNames.length === 0,
    `sealed provider request exposed top-level tools: ${JSON.stringify(sealedRequest.toolNames)}`,
  );
  assert(sealedRequest.additionalToolCount === 0, 'sealed provider request exposed input additional_tools');
  report.sealed = {
    topLevelToolCount: sealedRequest.toolNames.length,
    additionalToolCount: sealedRequest.additionalToolCount,
    emptySchema: true,
    normalTextCompleted: sealedRun.events.normalTextCompleted,
    providerRequestSha256: sealedRequest.sha256,
  };

  const controlAck = `WAGGLE_CONTROL_ACK_${randomBytes(24).toString('hex')}`;
  const redProvider = await startLoopbackProvider('red', controlAck, sentinelPath);
  providers.push(redProvider);
  const redArgs = buildInvocationArguments({
    mcpServerNames,
    catalogPath: controlCatalogPath,
    providerBaseUrl: redProvider.baseUrl,
    includeDeny: false,
    denyConfig: denial.config,
    hookDisables: externalHookDisables,
    hookPins: wagglePins,
  });
  const redDiscovery = await listHooks(
    codexExecutable,
    redArgs,
    workspace,
    env,
    codexHome,
    false,
    true,
    null,
    expectedWaggleHooks.commands,
    false,
    replacements,
  );
  const redRun = await runTurn({
    executable: codexExecutable,
    args: redArgs,
    workspace,
    env,
    replacements,
    codexHome,
    includeDeny: false,
    expectedDenyCommandSha256: null,
    expectedWaggleCommands: expectedWaggleHooks.commands,
    expectedHookGraphSha256: redDiscovery.graphSha256,
    useDefaultEnvironmentForControl: true,
    lane: 'red',
    model: controlModel,
    prompt: 'Follow the provider tool call, then return only the provider acknowledgement.',
    expectedAcknowledgement: controlAck,
    strictAllowlist: false,
  });
  await redProvider.close();
  providers.splice(providers.indexOf(redProvider), 1);
  assert(redProvider.records.length === 2, `RED provider saw ${redProvider.records.length} requests`);
  const redTools = redProvider.records[0].toolNames;
  assert(
    JSON.stringify(redTools) === JSON.stringify(['view_image']),
    `RED control catalog did not expose only view_image: ${JSON.stringify(redTools)}`,
  );
  const redReadObserved = redRun.events.imageItemCount > 0 && redProvider.records[1].containsImage;
  assert(redReadObserved, 'RED control did not prove owned sentinel image access');
  report.red = {
    toolNames: redTools,
    readObserved: redReadObserved,
    sensitiveDataObserved: redProvider.records[1].containsImage,
    normalTextCompleted: redRun.events.normalTextCompleted,
    sentinelSha256,
  };

  const greenProvider = await startLoopbackProvider('green', controlAck, sentinelPath);
  providers.push(greenProvider);
  const greenArgs = buildInvocationArguments({
    mcpServerNames,
    catalogPath: controlCatalogPath,
    providerBaseUrl: greenProvider.baseUrl,
    includeDeny: true,
    denyConfig: denial.config,
    hookDisables: externalHookDisables,
    hookPins: allPins,
  });
  const greenRun = await runTurn({
    executable: codexExecutable,
    args: greenArgs,
    workspace,
    env,
    replacements,
    codexHome,
    includeDeny: true,
    expectedDenyCommandSha256: denial.commandSha256,
    expectedWaggleCommands: expectedWaggleHooks.commands,
    expectedHookGraphSha256: pinned.graphSha256,
    useDefaultEnvironmentForControl: true,
    lane: 'green',
    model: controlModel,
    prompt: 'Follow the provider tool call, then return only the provider acknowledgement.',
    expectedAcknowledgement: controlAck,
    strictAllowlist: false,
  });
  await greenProvider.close();
  providers.splice(providers.indexOf(greenProvider), 1);
  assert(greenProvider.records.length === 2, `GREEN provider saw ${greenProvider.records.length} requests`);
  assert(
    JSON.stringify(greenProvider.records[0].toolNames) === JSON.stringify(['view_image']),
    `GREEN control catalog did not expose only view_image: ${JSON.stringify(greenProvider.records[0].toolNames)}`,
  );
  const greenImageObserved = greenProvider.records.slice(1).some((record) => record.containsImage);
  const deniedBeforeRead = greenRun.events.denyHookCount === 1
    && !greenImageObserved
    && (
      greenRun.events.firstImageSequence === null
      || greenRun.events.firstDenySequence < greenRun.events.firstImageSequence
    );
  assert(deniedBeforeRead, 'GREEN hook did not deny view_image before sentinel access');
  report.green = {
    deniedBeforeRead,
    sensitiveDataObserved: false,
    normalTextCompleted: greenRun.events.normalTextCompleted,
    denialReasonSha256: sha256(DENIAL_REASON),
    denyHookReceipts: greenRun.events.denyHookCount,
  };
  report.invocation.argumentsSha256 = sha256(stableJson(normalizedArguments(greenArgs, [
    [sealedCatalogPath, '<MODEL_CATALOG>'],
    [controlCatalogPath, '<MODEL_CATALOG>'],
    [greenProvider.baseUrl, '<LOOPBACK>'],
    [denial.command, '<DENY_COMMAND>'],
  ])));
  report.invocation.threadParamsSha256 = sealedRun.threadParamsSha256;
  report.invocation.turnParamsSha256 = sealedRun.turnParamsSha256;
  report.proof = { paidCalls: 0, pass: true };

  if (executePaid) {
    const captureMindRoot = process.env.HIVE_MIND_DATA_DIR;
    const captureWorkspaceId = process.env.WAGGLE_WORKSPACE_ID;
    assert(
      typeof captureMindRoot === 'string' && isAbsolute(captureMindRoot),
      'paid lane requires an absolute HIVE_MIND_DATA_DIR from the parent harness',
    );
    requireDirectory(captureMindRoot, 'paid capture mind root');
    assert(
      typeof captureWorkspaceId === 'string'
        && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(captureWorkspaceId),
      'paid lane requires a safe WAGGLE_WORKSPACE_ID from the parent harness',
    );
    const paidEnv = {
      ...env,
      HIVE_MIND_DATA_DIR: captureMindRoot,
      WAGGLE_WORKSPACE_ID: captureWorkspaceId,
    };
    const paidArgs = buildInvocationArguments({
      mcpServerNames,
      catalogPath: sealedCatalogPath,
      providerBaseUrl: null,
      includeDeny: true,
      denyConfig: denial.config,
      hookDisables: externalHookDisables,
      hookPins: allPins,
    });
    report.paidCalls = 1;
    report.paidInvocation.attempted = true;
    let prePaidMcpBoundary = null;
    const paidRun = await runTurn({
      executable: codexExecutable,
      args: paidArgs,
      workspace,
      env: paidEnv,
      replacements,
      codexHome,
      includeDeny: true,
      expectedDenyCommandSha256: denial.commandSha256,
      expectedWaggleCommands: expectedWaggleHooks.commands,
      expectedHookGraphSha256: pinned.graphSha256,
      beforeTurn: async () => {
        prePaidMcpBoundary = captureMcpBoundary(codexExecutable, paidEnv, codexConfigPath);
        assertSameMcpBoundary(initialMcpBoundary, prePaidMcpBoundary, 'before the paid turn');
        report.mcpBoundary.prePaidSha256 = prePaidMcpBoundary.boundarySha256;
        report.mcpBoundary.prePaidConfigSha256 = prePaidMcpBoundary.configSha256;
      },
      lane: 'paid',
      model,
      prompt: `Return exactly ${flags.marker} and nothing else. Do not call tools.`,
      expectedAcknowledgement: flags.marker,
      strictAllowlist: true,
    });
    assert(prePaidMcpBoundary !== null, 'paid MCP/config boundary was not captured');
    const postPaidMcpBoundary = captureMcpBoundary(codexExecutable, paidEnv, codexConfigPath);
    assertSameMcpBoundary(initialMcpBoundary, postPaidMcpBoundary, 'after the paid turn');
    report.mcpBoundary.postPaidSha256 = postPaidMcpBoundary.boundarySha256;
    report.mcpBoundary.postPaidConfigSha256 = postPaidMcpBoundary.configSha256;
    report.mcpBoundary.unchanged = true;
    rawPaidSessionId = paidRun.threadId;
    markerMatched = paidRun.events.normalTextCompleted;
    const paidNormalizedArguments = normalizedArguments(paidArgs, [
      [sealedCatalogPath, '<MODEL_CATALOG>'],
      [denial.command, '<DENY_COMMAND>'],
    ]);
    report.paidInvocation = {
      attempted: true,
      executed: true,
      arguments: paidNormalizedArguments,
      argumentsSha256: sha256(stableJson(paidNormalizedArguments)),
      modelCatalogSha256: report.modelCatalog.sealedSha256,
      hookGraphSha256: paidRun.hooks.graphSha256,
      markerSha256: sha256(flags.marker),
      sessionIdSha256: paidRun.threadIdSha256,
      threadParamsSha256: paidRun.threadParamsSha256,
      turnParamsSha256: paidRun.turnParamsSha256,
      normalTextCompleted: paidRun.events.normalTextCompleted,
      toolEventsObserved: paidRun.events.toolEventsObserved,
      unknownEventsObserved: paidRun.events.unknownEventsObserved,
    };
    assert(markerMatched, 'paid Codex lane did not return the exact marker');
    assert(report.paidInvocation.toolEventsObserved === 0, 'paid Codex lane emitted a tool event');
    assert(report.paidInvocation.unknownEventsObserved === 0, 'paid Codex lane emitted an unknown event');
    assert(
      report.paidInvocation.threadParamsSha256 === report.invocation.threadParamsSha256,
      'paid Codex thread parameters did not match the sealed proof',
    );
    assert(
      report.paidInvocation.turnParamsSha256 === report.invocation.turnParamsSha256,
      'paid Codex turn parameters did not match the sealed proof',
    );
  }

  assert(sha256File(codexExecutable) === initialExecutableSha256, 'Codex executable changed during proof');
  report.executable.unchanged = true;
  assert(sha256File(SCRIPT_PATH) === initialScriptSha256, 'Codex tool-denial helper changed during proof');
  report.artifacts.scriptUnchanged = true;
  const finalExpectedWaggleHooks = buildExpectedWaggleHooks(trustedPowerShell.path, hiveMindCli);
  assert(
    finalExpectedWaggleHooks.artifactsSha256 === expectedWaggleHooks.artifactsSha256
      && finalExpectedWaggleHooks.cliSha256 === expectedWaggleHooks.cliSha256,
    'packaged Codex hook or hive-mind CLI artifact changed during proof',
  );
  report.hooks.artifactsUnchanged = true;
  const finalSourceSnapshot = verifySourceSnapshot(expectedHead);
  assert(
    finalSourceSnapshot.observedHead === initialSourceSnapshot.observedHead
      && finalSourceSnapshot.tree === initialSourceSnapshot.tree
      && finalSourceSnapshot.scriptBlob === initialSourceSnapshot.scriptBlob,
    'repository source snapshot changed during proof',
  );
  report.source.unchanged = true;
  report.pass = report.proof.pass
    && report.source.unchanged
    && report.artifacts.scriptUnchanged
    && report.hooks.artifactsUnchanged
    && (!executePaid || (
      report.paidCalls === 1
      && report.mcpBoundary.unchanged
      && report.paidInvocation.normalTextCompleted
      && report.paidInvocation.toolEventsObserved === 0
      && report.paidInvocation.unknownEventsObserved === 0
    ));
} catch (error) {
  report.error = safeError(error, [
    codexExecutable,
    hiveMindCli,
    receiptDir,
    workspace,
    windowsPowerShell,
    tempRoot,
    flags.marker,
  ]);
}

for (const provider of providers.splice(0)) {
  try { await provider.close(); } catch { /* best-effort loopback cleanup */ }
}
if (tempRoot !== null) {
  try {
    await rm(tempRoot, { recursive: true, force: true });
    report.artifacts.tempRemoved = !existsSync(tempRoot);
  } catch (error) {
    report.error = report.error ?? safeError(error, [tempRoot]);
    report.pass = false;
  }
}
if (!report.executable.unchanged && existsSync(codexExecutable)) {
  report.executable.unchanged = sha256File(codexExecutable) === initialExecutableSha256;
}
if (!report.pass && report.error === null) report.error = 'proof did not satisfy all invariants';

let reportPath = null;
let reportSha256 = null;
if (receiptCreated) {
  reportPath = join(receiptDir, 'report.json');
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  const posture = await stat(reportPath);
  assert(posture.isFile(), 'report.json is not a regular file');
  reportSha256 = sha256File(reportPath);
}

const summary = {
  pass: report.pass,
  paidCalls: report.paidCalls,
  markerMatched,
  reportPath,
  reportSha256,
  sessionId: executePaid ? rawPaidSessionId : null,
};
process.stdout.write(`${JSON.stringify(summary)}\n`);
if (!report.pass) process.exitCode = 1;
