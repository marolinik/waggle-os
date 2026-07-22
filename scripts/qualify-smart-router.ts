#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFile, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { createServer, type IncomingHttpHeaders, type Server as HttpServer } from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface SseEvent {
  event: string;
  data: Record<string, unknown>;
}

export interface QualifiedChatCase {
  content: string;
  events: SseEvent[];
  toolsUsed: string[];
}

export interface QualifiedToolContext {
  toolCatalogCount: number;
  toolEligibleCount: number;
  toolSelectedCount: number;
  toolOmittedCount: number;
  transmittedToolSchemaChars: number;
  estimatedToolSchemaTokens: number;
  selectorLatencyMs: number;
  selectedToolNames: string[];
}

export interface QualifiedToolContextCase extends QualifiedChatCase {
  toolContext: QualifiedToolContext;
}

export interface OwnedProcess {
  processId: number;
  name: string;
  executablePath: string | null;
  creationDate: string | null;
}

export interface DispatchEvidence {
  at: string;
  path: string;
  model: string;
  bodySha256: string;
  toolNames: string[];
}

export interface WindowsProcessCandidate extends OwnedProcess {
  commandLine: string;
}

export const PRIMARY_PROMPT = 'Why does this TypeScript Promise resolve twice? Reply in one concise sentence and do not use tools.';
export const BUDGET_PROMPT = 'What is 19 * 23?';
export const TOOL_CONTEXT_PROMPT = 'Inspect, test, validate, and verify this TypeScript workspace. Reply with a one-sentence plan and do not call any tools.';
const QUALIFICATION_DAILY_BUDGET_USD = 1;
const QUALIFICATION_DAILY_SPEND_USD = 0.8;
const QUALIFICATION_BUDGET_THRESHOLD = 0.8;

interface QualifierOptions {
  runtimeDataDir: string;
  baseModel: string;
  outputPath: string;
}

interface ModelAliases {
  primary: string;
  budget: string;
  fallback: string;
}

interface ChatReceipt extends QualifiedChatCase {
  name: 'primary' | 'budget' | 'fallback' | 'tool-context';
  promptSha256: string;
  expectedModel: string;
  dispatches: DispatchEvidence[];
  startedAt: string;
  completedAt: string;
  durationMs: number;
  toolContext?: QualifiedToolContext;
}

interface RuntimeStartEvidence {
  installedNow: boolean;
  startedNow: boolean;
  endpoint?: string;
  status: {
    source: string;
    running: boolean;
    [key: string]: unknown;
  };
}

export interface ProcessSnapshot {
  owned: OwnedProcess[];
  externalOllama: OwnedProcess[];
}

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const DEFAULT_RUNTIME_DATA_DIR = path.join(REPOSITORY_ROOT, 'output', 'managed-runtime-proof-real-20260716');
const PROVIDER_AND_RUNTIME_ENV = new Set([
  'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY',
  'XAI_API_KEY', 'DEEPSEEK_API_KEY', 'MISTRAL_API_KEY', 'DASHSCOPE_API_KEY',
  'MINIMAX_API_KEY', 'ZHIPU_API_KEY', 'MOONSHOT_API_KEY', 'PERPLEXITY_API_KEY',
  'OPENROUTER_API_KEY', 'VOYAGE_API_KEY', 'WAGGLE_VOYAGE_API_KEY',
  'LITELLM_API_KEY', 'LITELLM_MASTER_KEY', 'WAGGLE_LITELLM_URL',
  'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY',
  'GOOGLE_APPLICATION_CREDENTIALS', 'HF_TOKEN', 'HUGGING_FACE_HUB_TOKEN',
]);

export function parseSse(raw: string): SseEvent[] {
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const frames = normalized.split(/\n\n+/).filter((frame) => frame.trim().length > 0);
  return frames.map((frame, frameIndex) => {
    let event: string | null = null;
    const dataLines: string[] = [];
    for (const line of frame.split('\n')) {
      if (!line) continue;
      const separator = line.indexOf(':');
      const field = separator === -1 ? line : line.slice(0, separator);
      const value = separator === -1 ? '' : line.slice(separator + 1).replace(/^ /, '');
      if (field === 'event') {
        if (event !== null) throw new Error(`SSE frame ${frameIndex + 1} has a duplicate event field`);
        if (!value) throw new Error(`SSE frame ${frameIndex + 1} has an empty event field`);
        event = value;
      } else if (field === 'data') {
        dataLines.push(value);
      } else {
        throw new Error(`SSE frame ${frameIndex + 1} has unsupported SSE field "${field}"`);
      }
    }
    if (event === null) throw new Error(`SSE frame ${frameIndex + 1} is missing an event field`);
    if (dataLines.length === 0) throw new Error(`SSE frame ${frameIndex + 1} is missing a data field`);
    let data: unknown;
    try {
      data = JSON.parse(dataLines.join('\n'));
    } catch {
      throw new Error(`SSE frame ${frameIndex + 1} contains invalid JSON`);
    }
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      throw new Error(`SSE frame ${frameIndex + 1} data must be a JSON object`);
    }
    return { event, data: data as Record<string, unknown> };
  });
}

export function assertQualifiedChatCase(input: {
  httpStatus: number;
  contentType: string;
  rawSse: string;
  expectedModel: string;
  expectedSwitch?: { model: string; primary: string; reason: string };
}): QualifiedChatCase {
  if (input.httpStatus !== 200) throw new Error(`Expected HTTP 200, received ${input.httpStatus}`);
  if (!input.contentType.toLowerCase().startsWith('text/event-stream')) {
    throw new Error(`Expected text/event-stream, received ${input.contentType || '<empty>'}`);
  }
  const events = parseSse(input.rawSse);
  if (events.filter(({ event }) => event === 'error').length !== 0) {
    throw new Error('Qualified chat must contain zero error events');
  }
  const doneEvents = events.filter(({ event }) => event === 'done');
  if (doneEvents.length !== 1) throw new Error(`Qualified chat requires exactly one done event, received ${doneEvents.length}`);
  if (events.at(-1)?.event !== 'done') throw new Error('Qualified chat requires done to be the final event');
  const done = doneEvents[0]!.data;
  if (done.model !== input.expectedModel) {
    throw new Error(`done.model must be ${input.expectedModel}, received ${String(done.model)}`);
  }
  if (typeof done.content !== 'string' || !done.content.trim()) {
    throw new Error('Qualified chat requires non-empty done.content');
  }
  const tokenContent = events
    .filter(({ event }) => event === 'token')
    .map(({ data }, index) => {
      if (typeof data.content !== 'string') throw new Error(`token event ${index + 1} content must be a string`);
      return data.content;
    })
    .join('');
  if (tokenContent !== done.content) {
    throw new Error('Qualified chat token content must exactly match done.content');
  }
  if (!Array.isArray(done.toolsUsed) || !done.toolsUsed.every((tool) => typeof tool === 'string')) {
    throw new Error('Qualified chat requires done.toolsUsed to be an array of strings');
  }
  const disallowedToolEvents = events.filter(({ event, data }) =>
    (event === 'tool' || event === 'tool_result') && data.name !== 'auto_recall',
  );
  if (done.toolsUsed.length !== 0 || disallowedToolEvents.length !== 0) {
    throw new Error('Qualified chat requires zero tools and zero tool events');
  }
  const switches = events.filter(({ event }) => event === 'model_switch');
  if (!input.expectedSwitch) {
    if (switches.length !== 0) throw new Error(`Qualified chat requires zero model_switch events, received ${switches.length}`);
  } else {
    if (switches.length !== 1) throw new Error(`Qualified fallback requires exactly one model_switch event, received ${switches.length}`);
    const actual = switches[0]!.data;
    for (const key of ['model', 'primary', 'reason'] as const) {
      if (actual[key] !== input.expectedSwitch[key]) {
        throw new Error(`model_switch.${key} must be ${input.expectedSwitch[key]}, received ${String(actual[key])}`);
      }
    }
  }
  return { content: done.content.trim(), events, toolsUsed: [...done.toolsUsed] as string[] };
}

export function assertQualifiedToolContextCase(input: {
  httpStatus: number;
  contentType: string;
  rawSse: string;
  expectedModel: string;
  selectedToolNames: string[];
  expectedSwitch?: { model: string; primary: string; reason: string };
}): QualifiedToolContextCase {
  const qualified = assertQualifiedChatCase(input);
  const done = qualified.events.find(({ event }) => event === 'done')!.data;
  const metrics = done.contextMetrics;
  if (typeof metrics !== 'object' || metrics === null || Array.isArray(metrics)) {
    throw new Error('Qualified tool context requires done.contextMetrics');
  }
  const raw = metrics as Record<string, unknown>;
  const readInteger = (name: string): number => {
    const value = raw[name];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      throw new Error(`Qualified tool context requires non-negative integer ${name}`);
    }
    return value;
  };
  const toolContext: QualifiedToolContext = {
    toolCatalogCount: readInteger('toolCatalogCount'),
    toolEligibleCount: readInteger('toolEligibleCount'),
    toolSelectedCount: readInteger('toolSelectedCount'),
    toolOmittedCount: readInteger('toolOmittedCount'),
    transmittedToolSchemaChars: readInteger('transmittedToolSchemaChars'),
    estimatedToolSchemaTokens: readInteger('estimatedToolSchemaTokens'),
    selectorLatencyMs: readInteger('selectorLatencyMs'),
    selectedToolNames: [...input.selectedToolNames],
  };
  if (toolContext.toolCatalogCount < toolContext.toolEligibleCount) {
    throw new Error('Qualified tool context requires catalog count to cover every eligible tool');
  }
  if (toolContext.toolEligibleCount < 29) {
    throw new Error(`Qualified tool context requires at least 29 eligible tools, received ${toolContext.toolEligibleCount}`);
  }
  if (toolContext.toolSelectedCount < 1 || toolContext.toolSelectedCount > 14) {
    throw new Error(`Qualified tool context requires at most 14 tools and at least one, received ${toolContext.toolSelectedCount}`);
  }
  if (toolContext.toolOmittedCount !== toolContext.toolEligibleCount - toolContext.toolSelectedCount) {
    throw new Error('Qualified tool context omitted count must equal eligible minus selected');
  }
  if (toolContext.transmittedToolSchemaChars < 1 || toolContext.transmittedToolSchemaChars > 8_000) {
    throw new Error(`Qualified tool context must transmit no more than 8,000 schema characters, received ${toolContext.transmittedToolSchemaChars}`);
  }
  if (toolContext.estimatedToolSchemaTokens !== Math.ceil(toolContext.transmittedToolSchemaChars / 4)) {
    throw new Error('Qualified tool context schema token estimate must match the transmitted schema size');
  }
  if (toolContext.selectorLatencyMs > 250) {
    throw new Error(`Qualified tool context selector latency must not exceed 250ms, received ${toolContext.selectorLatencyMs}ms`);
  }
  if (toolContext.selectedToolNames.length !== toolContext.toolSelectedCount) {
    throw new Error('Qualified tool context selected names must match the selected tool count');
  }
  if (new Set(toolContext.selectedToolNames).size !== toolContext.selectedToolNames.length) {
    throw new Error('Qualified tool context requires unique selected names');
  }
  const codeInspectionTools = new Set([
    'bash', 'read_file', 'search_files', 'search_content', 'git_status',
    'git_diff', 'git_log', 'execute_code', 'run_code',
  ]);
  if (toolContext.selectedToolNames.filter(name => codeInspectionTools.has(name)).length < 2) {
    throw new Error('Qualified tool context must demonstrate code-inspection relevance');
  }
  return { ...qualified, toolContext };
}

export function canonicalizeManifestDigest(digest: unknown): string {
  if (typeof digest !== 'string') throw new Error('Ollama manifest digest must be a string');
  const normalized = digest.toLowerCase();
  if (/^sha256:[0-9a-f]{64}$/.test(normalized)) return normalized;
  if (/^[0-9a-f]{64}$/.test(normalized)) return `sha256:${normalized}`;
  throw new Error('Ollama manifest digest must be an immutable SHA-256 identity');
}

export function assertSourceSnapshot(input: {
  expectedRevision: string;
  expectedScriptSha256: string;
  actualRevision: string;
  trackedStatus: string;
  actualScriptSha256: string;
}): void {
  if (input.actualRevision !== input.expectedRevision) {
    throw new Error(`Source revision changed during qualification: expected ${input.expectedRevision}, received ${input.actualRevision}`);
  }
  if (input.trackedStatus.trim()) {
    throw new Error(`Tracked source changed during qualification: ${input.trackedStatus.trim()}`);
  }
  if (input.actualScriptSha256 !== input.expectedScriptSha256) {
    throw new Error('Qualification script hash changed during qualification');
  }
}

export function assertRuntimeStartOwned(start: RuntimeStartEvidence, ownedProcesses: OwnedProcess[]): void {
  if (start.startedNow !== true) throw new Error('Managed Ollama must be newly started by the qualifier');
  if (start.status.source !== 'waggle-managed' || start.status.running !== true) {
    throw new Error('Managed Ollama start result must report a running waggle-managed runtime');
  }
  const uniquePids = new Set(ownedProcesses.map(({ processId }) => processId));
  if (uniquePids.size !== ownedProcesses.length || ownedProcesses.some(({ processId }) => !Number.isInteger(processId) || processId <= 0)) {
    throw new Error('Owned runtime processes must have unique positive process IDs');
  }
  if (!ownedProcesses.some(({ name }) => name.toLowerCase() === 'node.exe')) {
    throw new Error('Owned runtime process list is missing the Node watchdog');
  }
  if (!ownedProcesses.some(({ name }) => name.toLowerCase() === 'ollama.exe')) {
    throw new Error('Owned runtime process list is missing Ollama');
  }
}

export function aliasesForOwnedCleanup(ownershipConfirmed: boolean, createdAliases: Iterable<string>): string[] {
  return ownershipConfirmed ? [...createdAliases] : [];
}

export async function recordAliasBeforeCopy(
  attemptedAliases: Set<string>,
  alias: string,
  copy: () => Promise<void>,
): Promise<void> {
  attemptedAliases.add(alias);
  await copy();
}

export function assertCopiedModelIdentity(input: {
  baseModel: string;
  aliases: Record<string, string>;
  models: Array<{ name: string; digest: string }>;
}): { baseModelDigest: string; aliasDigests: Record<string, string> } {
  const base = input.models.find(({ name }) => name === input.baseModel)
    ?? input.models.find(({ name }) => name === `${input.baseModel}:latest`);
  if (!base) throw new Error(`Cached base model ${input.baseModel} is not installed in the Waggle-owned runtime data directory`);
  const baseModelDigest = canonicalizeManifestDigest(base.digest);
  const aliasDigests: Record<string, string> = {};
  for (const alias of Object.values(input.aliases)) {
    const copied = input.models.find(({ name }) => name === alias);
    if (!copied) throw new Error(`Ollama did not advertise copied alias ${alias}`);
    const digest = canonicalizeManifestDigest(copied.digest);
    if (digest !== baseModelDigest) throw new Error(`Copied alias ${alias} does not match the base model digest`);
    aliasDigests[alias] = digest;
  }
  return { baseModelDigest, aliasDigests };
}

export function assertObservedDispatch(
  dispatches: DispatchEvidence[],
  startIndex: number,
  expectedModel: string,
): DispatchEvidence[] {
  const observed = dispatches.slice(startIndex);
  if (observed.length === 0 || observed.some(({ model }) => model !== expectedModel)) {
    const models = observed.map(({ model }) => model).join(', ') || '<none>';
    throw new Error(`Expected observed Ollama dispatch to ${expectedModel}, received ${models}`);
  }
  return observed;
}

export function buildRouterSettings(aliases: ModelAliases): Record<string, unknown> {
  return {
    defaultModel: `ollama/${aliases.primary}`,
    budgetModel: `ollama/${aliases.budget}`,
    fallbackModel: `ollama/${aliases.fallback}`,
    dailyBudget: QUALIFICATION_DAILY_BUDGET_USD,
    budgetHardCap: false,
    budgetThreshold: QUALIFICATION_BUDGET_THRESHOLD,
    providers: {},
  };
}

export function buildSanitizedEnvironment(
  source: NodeJS.ProcessEnv,
  overrides: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const sanitized: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(source)) {
    const normalizedName = name.toUpperCase();
    const credentialLike = /(?:_API_KEY|_TOKEN|_SECRET|_PASSWORD|_CREDENTIALS?)$/i.test(name);
    const isolatedRuntime = normalizedName.startsWith('WAGGLE_') || normalizedName.startsWith('DOCKER_') || normalizedName === 'OLLAMA_HOST';
    if (PROVIDER_AND_RUNTIME_ENV.has(normalizedName) || credentialLike || isolatedRuntime) continue;
    if (value !== undefined) sanitized[name] = value;
  }
  for (const [name, value] of Object.entries(overrides)) {
    if (value !== undefined) sanitized[name] = value;
  }
  return sanitized;
}

function parseArguments(argv: string[]): QualifierOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || !value || value.startsWith('--')) {
      throw new Error(`Expected --name value arguments, received ${argv.join(' ')}`);
    }
    if (!['--runtime-data-dir', '--base-model', '--out'].includes(key)) throw new Error(`Unknown argument ${key}`);
    values.set(key, value);
  }
  const revision = git(['rev-parse', '--short=8', 'HEAD']);
  return {
    runtimeDataDir: path.resolve(values.get('--runtime-data-dir') ?? DEFAULT_RUNTIME_DATA_DIR),
    baseModel: values.get('--base-model') ?? 'qwen3:1.7b',
    outputPath: path.resolve(values.get('--out') ?? path.join(REPOSITORY_ROOT, 'output', `smart-router-runtime-qualification-${revision}.json`)),
  };
}

function git(args: string[]): string {
  return execFileSync('git', ['-C', REPOSITORY_ROOT, ...args], { encoding: 'utf8', windowsHide: true }).trim();
}

async function sha256(file: string): Promise<string> {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

function sha256Text(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

async function getFreePort(excluded: Set<number>): Promise<number> {
  for (;;) {
    const port = await new Promise<number>((resolve, reject) => {
      const server = net.createServer();
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (!address || typeof address === 'string') {
          server.close();
          reject(new Error('Could not allocate a loopback port'));
          return;
        }
        server.close((error) => error ? reject(error) : resolve(address.port));
      });
    });
    if (port !== 11434 && !excluded.has(port)) {
      excluded.add(port);
      return port;
    }
  }
}

async function requestJson(url: string, init: RequestInit = {}, timeoutMs = 30_000): Promise<Record<string, unknown>> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  const text = await response.text();
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}: ${text.slice(0, 500)}`);
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error(`${url} returned non-object JSON`);
  return parsed as Record<string, unknown>;
}

export async function postJsonForStatus(
  url: string,
  body: Record<string, unknown>,
  fetchImpl: (input: string | URL, init?: RequestInit) => Promise<Response> = fetch,
  timeoutMs = 30_000,
): Promise<void> {
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}: ${text.slice(0, 500)}`);
}

async function putJson(url: string, body: Record<string, unknown>, headers: Record<string, string>) {
  return requestJson(url, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

async function deleteAlias(endpoint: string, model: string): Promise<void> {
  const response = await fetch(`${endpoint}/api/delete`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Failed to delete Ollama alias ${model}: HTTP ${response.status} ${(await response.text()).slice(0, 300)}`);
  }
}

async function listModels(endpoint: string): Promise<Array<{ name: string; digest: string }>> {
  const tags = await requestJson(`${endpoint}/api/tags`);
  if (!Array.isArray(tags.models)) throw new Error('Ollama /api/tags did not return models');
  return tags.models.map((entry) => {
    if (typeof entry !== 'object' || entry === null) throw new Error('Ollama returned an invalid model entry');
    const value = entry as { name?: unknown; digest?: unknown };
    if (typeof value.name !== 'string') throw new Error('Ollama model entry has no name');
    return { name: value.name, digest: canonicalizeManifestDigest(value.digest) };
  });
}

function normalizedProcess(value: unknown): OwnedProcess {
  if (typeof value !== 'object' || value === null) throw new Error('Windows process query returned an invalid entry');
  const process = value as Record<string, unknown>;
  const processId = Number(process.processId);
  if (!Number.isInteger(processId) || processId <= 0 || typeof process.name !== 'string') {
    throw new Error('Windows process query returned an invalid process identity');
  }
  return {
    processId,
    name: process.name,
    executablePath: typeof process.executablePath === 'string' && process.executablePath ? process.executablePath : null,
    creationDate: typeof process.creationDate === 'string' && process.creationDate ? process.creationDate : null,
  };
}

function normalizedProcessCandidate(value: unknown): WindowsProcessCandidate {
  const process = normalizedProcess(value);
  const commandLine = (value as Record<string, unknown>).commandLine;
  return {
    ...process,
    commandLine: typeof commandLine === 'string' ? commandLine : '',
  };
}

function normalizedWindowsPath(value: string): string {
  return path.win32.resolve(value).replace(/\//g, '\\').toLowerCase();
}

function executableIsInside(runtimeRoot: string, executablePath: string | null): boolean {
  if (!executablePath) return false;
  const root = normalizedWindowsPath(runtimeRoot);
  const executable = normalizedWindowsPath(executablePath);
  const relative = path.win32.relative(root, executable);
  return relative === '' || (!relative.startsWith('..') && !path.win32.isAbsolute(relative));
}

export function partitionWindowsProcesses(
  candidates: WindowsProcessCandidate[],
  runtimeDataDir: string,
  excludedProcessIds: ReadonlySet<number> = new Set(),
): ProcessSnapshot {
  const root = normalizedWindowsPath(runtimeDataDir);
  const owned: OwnedProcess[] = [];
  const externalOllama: OwnedProcess[] = [];
  for (const candidate of candidates) {
    if (excludedProcessIds.has(candidate.processId)) continue;
    const name = candidate.name.toLowerCase();
    const commandLine = candidate.commandLine.replace(/\//g, '\\').toLowerCase();
    const ownedOllama = name === 'ollama.exe' && executableIsInside(root, candidate.executablePath);
    const ownedWatchdog = name === 'node.exe'
      && commandLine.includes(root)
      && commandLine.includes('ollama.exe')
      && commandLine.includes('stoptree');
    const process: OwnedProcess = {
      processId: candidate.processId,
      name: candidate.name,
      executablePath: candidate.executablePath,
      creationDate: candidate.creationDate,
    };
    if (ownedOllama || ownedWatchdog) owned.push(process);
    else if (name === 'ollama.exe') externalOllama.push(process);
  }
  return { owned, externalOllama };
}

function queryWindowsProcesses(runtimeDataDir: string): ProcessSnapshot {
  if (process.platform !== 'win32') throw new Error('Smart-router runtime qualification currently requires Windows process ownership evidence');
  const powershell = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const script = String.raw`
$ErrorActionPreference = 'Stop'
$candidates = @()
Get-CimInstance Win32_Process | ForEach-Object {
  $name = [string]$_.Name
  if (($name -ine 'node.exe') -and ($name -ine 'ollama.exe')) { return }
  $executable = if ($null -eq $_.ExecutablePath) { '' } else { [string]$_.ExecutablePath }
  $commandLine = if ($null -eq $_.CommandLine) { '' } else { [string]$_.CommandLine }
  $candidates += [pscustomobject]@{
    processId = [int]$_.ProcessId
    name = $name
    executablePath = if ($executable) { $executable } else { $null }
    creationDate = if ($null -eq $_.CreationDate) { $null } else { [string]$_.CreationDate }
    commandLine = $commandLine
  }
}
[pscustomobject]@{ candidates = @($candidates) } | ConvertTo-Json -Compress -Depth 4
`;
  const raw = execFileSync(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    windowsHide: true,
    env: {
      SystemRoot: process.env.SystemRoot ?? 'C:\\Windows',
      PATH: process.env.PATH,
    },
  }).trim();
  const parsed = JSON.parse(raw) as { candidates?: unknown };
  const candidates = (Array.isArray(parsed.candidates) ? parsed.candidates : []).map(normalizedProcessCandidate);
  return partitionWindowsProcesses(candidates, runtimeDataDir, new Set([process.pid]));
}

function processIdentity(process: OwnedProcess): string {
  return [process.processId, process.name.toLowerCase(), process.executablePath?.toLowerCase() ?? '', process.creationDate ?? ''].join('|');
}

function sameProcessSet(left: OwnedProcess[], right: OwnedProcess[]): boolean {
  const normalize = (values: OwnedProcess[]) => values.map(processIdentity).sort();
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

function copyForwardHeaders(headers: IncomingHttpHeaders): Headers {
  const forwarded = new Headers();
  for (const [name, value] of Object.entries(headers)) {
    if (['host', 'connection', 'content-length', 'transfer-encoding', 'accept-encoding'].includes(name.toLowerCase()) || value === undefined) continue;
    if (Array.isArray(value)) value.forEach((item) => forwarded.append(name, item));
    else forwarded.set(name, value);
  }
  forwarded.set('accept-encoding', 'identity');
  return forwarded;
}

async function readRequestBody(request: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    size += buffer.length;
    if (size > 16 * 1024 * 1024) throw new Error('Audit proxy request exceeded 16 MiB');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

export function buildOwnedProxyTarget(requestTarget: string, targetEndpoint: string): URL {
  if (!requestTarget.startsWith('/') || requestTarget.startsWith('//') || requestTarget.includes('\\')) {
    throw new Error('Audit proxy rejects absolute-form request targets');
  }
  const base = new URL(`${targetEndpoint.replace(/\/+$/, '')}/`);
  const target = new URL(requestTarget, base);
  if (target.origin !== base.origin) throw new Error('Audit proxy rejects absolute-form request targets');
  return target;
}

export function extractDispatchedToolNames(payload: unknown): string[] {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new Error('Ollama audit request payload must be a JSON object');
  }
  const tools = (payload as Record<string, unknown>).tools;
  if (tools === undefined) return [];
  if (!Array.isArray(tools)) throw new Error('Ollama audit request tools must be an array');
  return tools.map((tool, index) => {
    if (typeof tool !== 'object' || tool === null || Array.isArray(tool)) {
      throw new Error(`Ollama audit request tool ${index + 1} must be an object`);
    }
    const fn = (tool as Record<string, unknown>).function;
    if (typeof fn !== 'object' || fn === null || Array.isArray(fn)) {
      throw new Error(`Ollama audit request tool ${index + 1} is missing function metadata`);
    }
    const name = (fn as Record<string, unknown>).name;
    if (typeof name !== 'string' || !name) {
      throw new Error(`Ollama audit request tool ${index + 1} is missing a function name`);
    }
    return name;
  });
}

async function startAuditProxy(input: {
  port: number;
  targetEndpoint: string;
  dispatches: DispatchEvidence[];
}): Promise<HttpServer> {
  const server = createServer(async (request, response) => {
    try {
      const requestPath = request.url ?? '/';
      const target = buildOwnedProxyTarget(requestPath, input.targetEndpoint);
      const body = await readRequestBody(request);
      if (target.pathname === '/v1/chat/completions') {
        const payload = JSON.parse(body.toString('utf8')) as { model?: unknown };
        if (typeof payload.model !== 'string' || !payload.model) throw new Error('Ollama audit request is missing model');
        input.dispatches.push({
          at: new Date().toISOString(),
          path: target.pathname,
          model: payload.model,
          bodySha256: sha256Text(body),
          toolNames: extractDispatchedToolNames(payload),
        });
      }
      const method = request.method ?? 'GET';
      const upstream = await fetch(target, {
        method,
        headers: copyForwardHeaders(request.headers),
        ...(!['GET', 'HEAD'].includes(method) && body.length > 0 ? { body } : {}),
        signal: AbortSignal.timeout(10 * 60_000),
      });
      const upstreamBody = Buffer.from(await upstream.arrayBuffer());
      response.statusCode = upstream.status;
      response.statusMessage = upstream.statusText;
      upstream.headers.forEach((value, name) => {
        if (['connection', 'content-length', 'content-encoding', 'transfer-encoding'].includes(name.toLowerCase())) return;
        response.setHeader(name, value);
      });
      response.setHeader('content-length', String(upstreamBody.length));
      response.end(upstreamBody);
    } catch (error) {
      if (!response.headersSent) {
        response.statusCode = 502;
        response.setHeader('content-type', 'application/json');
      }
      response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(input.port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  return server;
}

async function closeHttpServer(server: HttpServer): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function runChatCase(input: {
  name: ChatReceipt['name'];
  baseUrl: string;
  headers: Record<string, string>;
  prompt: string;
  expectedModel: string;
  expectedDispatchModel: string;
  dispatches: DispatchEvidence[];
  workspace?: string;
  requireToolContext?: boolean;
  expectedSwitch?: { model: string; primary: string; reason: string };
}): Promise<ChatReceipt> {
  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  const dispatchStartIndex = input.dispatches.length;
  const response = await fetch(`${input.baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...input.headers },
    body: JSON.stringify({
      message: input.prompt,
      sessionId: randomUUID(),
      ...(input.workspace ? { workspace: input.workspace } : {}),
    }),
    signal: AbortSignal.timeout(10 * 60_000),
  });
  const rawSse = await response.text();
  const observedDispatches = assertObservedDispatch(input.dispatches, dispatchStartIndex, input.expectedDispatchModel);
  const qualificationInput = {
    httpStatus: response.status,
    contentType: response.headers.get('content-type') ?? '',
    rawSse,
    expectedModel: input.expectedModel,
    expectedSwitch: input.expectedSwitch,
  };
  const qualified = input.requireToolContext
    ? assertQualifiedToolContextCase({
        ...qualificationInput,
        selectedToolNames: observedDispatches.at(-1)?.toolNames ?? [],
      })
    : assertQualifiedChatCase(qualificationInput);
  const completed = Date.now();
  return {
    name: input.name,
    promptSha256: sha256Text(input.prompt),
    expectedModel: input.expectedModel,
    dispatches: observedDispatches,
    startedAt,
    completedAt: new Date(completed).toISOString(),
    durationMs: completed - started,
    ...qualified,
  };
}

async function endpointReachable(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1_500) });
    return response.ok;
  } catch {
    return false;
  }
}

async function portIsFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer()
      .once('error', () => resolve(false))
      .once('listening', () => server.close(() => resolve(true)))
      .listen(port, '127.0.0.1');
  });
}

function replaceProcessEnvironment(next: NodeJS.ProcessEnv): void {
  for (const name of Object.keys(process.env)) delete process.env[name];
  Object.assign(process.env, next);
}

async function writeReceipt(outputPath: string, receipt: Record<string, unknown>): Promise<void> {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const temporary = `${outputPath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  await rename(temporary, outputPath);
}

async function qualify(options: QualifierOptions): Promise<void> {
  const startedAt = new Date().toISOString();
  const revision = git(['rev-parse', 'HEAD']);
  const scriptSha256 = await sha256(SCRIPT_PATH);
  assertSourceSnapshot({
    expectedRevision: revision,
    expectedScriptSha256: scriptSha256,
    actualRevision: revision,
    trackedStatus: git(['status', '--porcelain', '--untracked-files=no']),
    actualScriptSha256: scriptSha256,
  });
  git(['ls-files', '--error-unmatch', 'scripts/qualify-smart-router.ts']);
  git(['cat-file', '-e', `${revision}:scripts/qualify-smart-router.ts`]);
  const ports = new Set<number>();
  const ollamaPort = await getFreePort(ports);
  const auditProxyPort = await getFreePort(ports);
  const servicePort = await getFreePort(ports);
  const litellmPort = await getFreePort(ports);
  const ollamaEndpoint = `http://127.0.0.1:${ollamaPort}`;
  const auditProxyEndpoint = `http://127.0.0.1:${auditProxyPort}`;
  const serviceBaseUrl = `http://127.0.0.1:${servicePort}`;
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'waggle-smart-router-'));
  const serviceDataDir = path.join(tempRoot, 'service-data');
  const runId = `${revision.slice(0, 8)}-${randomBytes(4).toString('hex')}`;
  const aliases: ModelAliases = {
    primary: `waggle-router-primary-${runId}:latest`,
    budget: `waggle-router-budget-${runId}:latest`,
    fallback: `waggle-router-fallback-${runId}:latest`,
  };
  const originalEnvironment = { ...process.env };
  const receipt: Record<string, unknown> = {
    schemaVersion: 'waggle-smart-router-runtime/v1',
    status: 'running',
    startedAt,
    source: {
      gitRevision: revision,
      trackedClean: true,
      scriptPath: 'scripts/qualify-smart-router.ts',
      scriptSha256,
    },
    dockerRequired: false,
    dockerInvoked: null,
    runtimeDataDir: options.runtimeDataDir,
    serviceDataDir,
    endpoints: { ollamaRuntime: ollamaEndpoint, ollamaAuditProxy: auditProxyEndpoint, sidecar: serviceBaseUrl },
    baseModel: options.baseModel,
    aliases,
    routerCases: [],
  };
  let runtime: { startInstalled(): Promise<RuntimeStartEvidence>; stop(): Promise<void> } | null = null;
  let server: { close(): Promise<void> } | null = null;
  let auditProxy: HttpServer | null = null;
  const dispatches: DispatchEvidence[] = [];
  let externalOllamaBaseline: OwnedProcess[] = [];
  let runtimeOwnershipConfirmed = false;
  const attemptedAliases = new Set<string>();
  const cleanupErrors: string[] = [];
  try {
    const initialProcesses = queryWindowsProcesses(options.runtimeDataDir);
    if (initialProcesses.owned.length !== 0) {
      throw new Error(`Waggle runtime data directory already owns ${initialProcesses.owned.length} live process(es)`);
    }
    externalOllamaBaseline = initialProcesses.externalOllama;
    receipt.processesBefore = initialProcesses;
    replaceProcessEnvironment(buildSanitizedEnvironment(originalEnvironment, {
      WAGGLE_DATA_DIR: serviceDataDir,
      WAGGLE_PORT: String(servicePort),
      WAGGLE_SKIP_LITELLM: '1',
      OLLAMA_HOST: auditProxyEndpoint,
    }));
    const [{ ManagedOllamaRuntime }, { startService }] = await Promise.all([
      import('../packages/server/src/local/managed-ollama-runtime.js'),
      import('../packages/server/src/local/service.js'),
    ]);
    runtime = new ManagedOllamaRuntime(options.runtimeDataDir, ollamaEndpoint);
    const runtimeStart = await runtime.startInstalled();
    const startedProcesses = queryWindowsProcesses(options.runtimeDataDir);
    assertRuntimeStartOwned(runtimeStart, startedProcesses.owned);
    runtimeOwnershipConfirmed = true;
    if (!sameProcessSet(externalOllamaBaseline, startedProcesses.externalOllama)) {
      throw new Error('External Ollama process set changed while starting the Waggle-managed runtime');
    }
    receipt.runtimeStart = runtimeStart;
    receipt.ownedRuntimeProcesses = startedProcesses.owned;
    receipt.ollamaVersion = await requestJson(`${ollamaEndpoint}/api/version`);
    const initialModels = await listModels(ollamaEndpoint);
    const aliasCollisions = initialModels.filter(({ name }) => Object.values(aliases).includes(name));
    if (aliasCollisions.length > 0) {
      throw new Error(`Random qualification aliases already exist: ${aliasCollisions.map(({ name }) => name).join(', ')}`);
    }
    for (const destination of Object.values(aliases)) {
      await recordAliasBeforeCopy(
        attemptedAliases,
        destination,
        () => postJsonForStatus(`${ollamaEndpoint}/api/copy`, { source: options.baseModel, destination }),
      );
    }
    const copiedModels = await listModels(ollamaEndpoint);
    receipt.modelIdentityAfterCopy = assertCopiedModelIdentity({ baseModel: options.baseModel, aliases, models: copiedModels });

    auditProxy = await startAuditProxy({ port: auditProxyPort, targetEndpoint: ollamaEndpoint, dispatches });

    const service = await startService({ dataDir: serviceDataDir, port: servicePort, litellmPort, skipLiteLLM: true });
    server = service.server;
    const tokenResponse = await requestJson(`${serviceBaseUrl}/api/auth/session-token`);
    if (typeof tokenResponse.token !== 'string' || !tokenResponse.token) throw new Error('Sidecar did not issue a loopback session token');
    const headers = { authorization: `Bearer ${tokenResponse.token}` };
    const settings = buildRouterSettings(aliases);
    await putJson(`${serviceBaseUrl}/api/settings`, settings, headers);
    const persisted = await requestJson(`${serviceBaseUrl}/api/settings`, { headers });
    for (const field of ['defaultModel', 'budgetModel', 'fallbackModel', 'dailyBudget', 'budgetHardCap', 'budgetThreshold'] as const) {
      if (persisted[field] !== settings[field]) throw new Error(`Persisted router setting ${field} did not match the qualification payload`);
    }
    receipt.persistedSettings = {
      defaultModel: persisted.defaultModel,
      budgetModel: persisted.budgetModel,
      fallbackModel: persisted.fallbackModel,
      dailyBudget: persisted.dailyBudget,
      budgetHardCap: persisted.budgetHardCap,
      budgetThreshold: persisted.budgetThreshold,
    };
    const qualificationDay = new Date().toISOString().slice(0, 10);
    service.server.agentState.costTracker.initializeDailyCarryover(
      qualificationDay,
      QUALIFICATION_DAILY_SPEND_USD,
    );
    const seededDailySpend = service.server.agentState.costTracker.getDailyTotal();
    if (seededDailySpend !== QUALIFICATION_DAILY_SPEND_USD) {
      throw new Error(`Qualification daily spend seed must be $${QUALIFICATION_DAILY_SPEND_USD.toFixed(2)}, received $${seededDailySpend.toFixed(2)}`);
    }
    receipt.qualificationDailySpend = {
      day: qualificationDay,
      amountUsd: seededDailySpend,
      source: 'cost-tracker daily carryover seed',
    };

    const routerCases: ChatReceipt[] = [];
    routerCases.push(await runChatCase({
      name: 'primary',
      baseUrl: serviceBaseUrl,
      headers,
      prompt: PRIMARY_PROMPT,
      expectedModel: `ollama/${aliases.primary}`,
      expectedDispatchModel: aliases.primary,
      dispatches,
    }));
    const toolContextWorkspace = service.server.workspaceManager.create({
      name: 'Smart router tool context',
      group: 'Qualification',
    });
    routerCases.push(await runChatCase({
      name: 'tool-context',
      baseUrl: serviceBaseUrl,
      headers,
      prompt: TOOL_CONTEXT_PROMPT,
      workspace: toolContextWorkspace.id,
      requireToolContext: true,
      expectedModel: `ollama/${aliases.primary}`,
      expectedDispatchModel: aliases.primary,
      dispatches,
    }));
    const expectedBudgetSwitch = {
      model: `ollama/${aliases.budget}`,
      primary: `ollama/${aliases.primary}`,
      reason: 'Budget 80% reached ($0.80/$1.00)',
    };
    routerCases.push(await runChatCase({
      name: 'budget',
      baseUrl: serviceBaseUrl,
      headers,
      prompt: BUDGET_PROMPT,
      expectedModel: `ollama/${aliases.budget}`,
      expectedDispatchModel: aliases.budget,
      dispatches,
      expectedSwitch: expectedBudgetSwitch,
    }));
    receipt.modelIdentityAfterPrimaryAndBudget = assertCopiedModelIdentity({
      baseModel: options.baseModel,
      aliases,
      models: await listModels(ollamaEndpoint),
    });
    await deleteAlias(ollamaEndpoint, aliases.primary);
    await putJson(`${serviceBaseUrl}/api/settings`, { budgetModel: null }, headers);
    const expectedFallbackSwitch = {
      model: `ollama/${aliases.fallback}`,
      primary: `ollama/${aliases.primary}`,
      reason: `ollama/${aliases.primary} unavailable; configured fallback selected`,
    };
    routerCases.push(await runChatCase({
      name: 'fallback',
      baseUrl: serviceBaseUrl,
      headers,
      prompt: PRIMARY_PROMPT,
      expectedModel: `ollama/${aliases.fallback}`,
      expectedDispatchModel: aliases.fallback,
      dispatches,
      expectedSwitch: expectedFallbackSwitch,
    }));
    const fallbackModels = await listModels(ollamaEndpoint);
    if (fallbackModels.some(({ name }) => name === aliases.primary)) {
      throw new Error('Deleted primary alias was unexpectedly restored before fallback verification');
    }
    receipt.modelIdentityAfterFallback = assertCopiedModelIdentity({
      baseModel: options.baseModel,
      aliases: { budget: aliases.budget, fallback: aliases.fallback },
      models: fallbackModels,
    });
    receipt.routerCases = routerCases;
    const dockerInvoked = routerCases.some(({ toolsUsed, events }) =>
      toolsUsed.some((tool) => tool.toLowerCase().includes('docker'))
      || events.some(({ event, data }) => event.toLowerCase().includes('tool') && JSON.stringify(data).toLowerCase().includes('docker')),
    );
    receipt.dockerInvoked = dockerInvoked;
    if (dockerInvoked) throw new Error('Docker invocation was observed during the Docker-independent router qualification');
    receipt.status = 'passed';
  } catch (error) {
    receipt.status = 'failed';
    receipt.error = error instanceof Error ? { message: error.message, stack: error.stack } : String(error);
  } finally {
    if (server) await server.close().catch((error) => cleanupErrors.push(`sidecar close: ${String(error)}`));
    if (auditProxy) await closeHttpServer(auditProxy).catch((error) => cleanupErrors.push(`audit proxy close: ${String(error)}`));
    if (runtime) {
      const aliasesToClean = aliasesForOwnedCleanup(runtimeOwnershipConfirmed, attemptedAliases);
      for (const alias of aliasesToClean) {
        await deleteAlias(ollamaEndpoint, alias).catch((error) => cleanupErrors.push(`delete ${alias}: ${String(error)}`));
      }
      if (aliasesToClean.length > 0) {
        try {
          const remaining = await listModels(ollamaEndpoint);
          const leaked = remaining.filter(({ name }) => aliasesToClean.includes(name));
          if (leaked.length > 0) cleanupErrors.push(`aliases remain: ${leaked.map(({ name }) => name).join(', ')}`);
        } catch (error) {
          cleanupErrors.push(`alias verification: ${String(error)}`);
        }
      }
      await runtime.stop().catch((error) => cleanupErrors.push(`runtime stop: ${String(error)}`));
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
    const sidecarPortFree = await portIsFree(servicePort);
    const runtimePortFree = await portIsFree(ollamaPort);
    const auditProxyPortFree = await portIsFree(auditProxyPort);
    const runtimeUnreachable = !(await endpointReachable(`${ollamaEndpoint}/api/version`));
    if (!sidecarPortFree) cleanupErrors.push(`sidecar port ${servicePort} remains occupied`);
    if (!auditProxyPortFree) cleanupErrors.push(`audit proxy port ${auditProxyPort} remains occupied`);
    if (!runtimePortFree || !runtimeUnreachable) cleanupErrors.push(`runtime endpoint ${ollamaEndpoint} remains reachable`);
    let processesAfter: ProcessSnapshot | null = null;
    try {
      processesAfter = queryWindowsProcesses(options.runtimeDataDir);
      if (processesAfter.owned.length !== 0) cleanupErrors.push(`owned runtime processes remain: ${processesAfter.owned.map(({ processId }) => processId).join(', ')}`);
      if (!sameProcessSet(externalOllamaBaseline, processesAfter.externalOllama)) cleanupErrors.push('external Ollama process set changed during qualification');
    } catch (error) {
      cleanupErrors.push(`process cleanup verification: ${String(error)}`);
    }
    const safeTempRoot = path.dirname(tempRoot) === path.resolve(os.tmpdir()) && path.basename(tempRoot).startsWith('waggle-smart-router-');
    if (!safeTempRoot) cleanupErrors.push(`refused to remove unexpected temp root ${tempRoot}`);
    else await rm(tempRoot, { recursive: true, force: true }).catch((error) => cleanupErrors.push(`temp cleanup: ${String(error)}`));
    replaceProcessEnvironment(originalEnvironment);
    receipt.cleanup = {
      aliasesRemoved: !cleanupErrors.some((error) => error.startsWith('delete ') || error.startsWith('aliases ') || error.startsWith('alias verification')),
      sidecarPortFree,
      auditProxyPortFree,
      runtimePortFree,
      runtimeUnreachable,
      ownedRuntimeProcessesRemaining: processesAfter?.owned ?? null,
      externalOllamaPreserved: processesAfter !== null && sameProcessSet(externalOllamaBaseline, processesAfter.externalOllama),
      serviceDataRemoved: safeTempRoot && !cleanupErrors.some((error) => error.startsWith('temp cleanup')),
      errors: cleanupErrors,
    };
    if (cleanupErrors.length > 0) {
      receipt.status = 'failed';
      if (!receipt.error) receipt.error = { message: `Cleanup failed: ${cleanupErrors.join('; ')}` };
    }
    try {
      const finalSource = {
        gitRevision: git(['rev-parse', 'HEAD']),
        trackedStatus: git(['status', '--porcelain', '--untracked-files=no']),
        scriptSha256: await sha256(SCRIPT_PATH),
      };
      receipt.finalSource = finalSource;
      assertSourceSnapshot({
        expectedRevision: revision,
        expectedScriptSha256: scriptSha256,
        actualRevision: finalSource.gitRevision,
        trackedStatus: finalSource.trackedStatus,
        actualScriptSha256: finalSource.scriptSha256,
      });
    } catch (error) {
      receipt.status = 'failed';
      if (!receipt.error) receipt.error = { message: error instanceof Error ? error.message : String(error) };
    }
    receipt.completedAt = new Date().toISOString();
    await writeReceipt(options.outputPath, receipt);
  }
  if (receipt.status !== 'passed') {
    const message = (receipt.error as { message?: string } | undefined)?.message ?? 'Smart-router qualification failed';
    throw new Error(`${message}; receipt: ${options.outputPath}`);
  }
  await new Promise<void>((resolve, reject) => {
    process.stdout.write(
      `${JSON.stringify({ status: 'passed', receiptPath: options.outputPath, revision })}\n`,
      (error) => error ? reject(error) : resolve(),
    );
  });
}

const isMain = process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(SCRIPT_PATH);
if (isMain) {
  qualify(parseArguments(process.argv.slice(2))).then(
    () => process.exit(0),
    (error) => {
      process.stderr.write(
        `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
        () => process.exit(1),
      );
    },
  );
}
