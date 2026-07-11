/**
 * AI-OS #5 — declarative loader for third-party tool adapters from
 * ~/.waggle/adapters/*.json. Data only: hand-validated + safe-string-refined,
 * PATH-detection only, never require()/eval. Never throws into detection.
 *
 * Validation is hand-rolled (not zod) to avoid adding a dependency to the agent
 * package for one small flat schema; the safe-string refinement is the boundary
 * defense against shell-metachar / path-traversal injection in adapter fields.
 */
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import type {
  ExternalToolAccess,
  ToolManifest,
  ToolTaskSpec,
} from '@waggle/shared';

// Allows `/ \ . _ -` for relative pointer paths; rejects everything else.
const PATH_SAFE = /^[A-Za-z0-9._/\\-]+$/;
// No path separators — for ids and binary names (PATH lookup).
const NAME_SAFE = /^[A-Za-z0-9._-]+$/;
const TASK_PLACEHOLDERS = new Set([
  'prompt', 'workspacePath', 'workspaceId', 'runId', 'sessionId',
  'promptFile', 'agentId', 'timeoutSeconds', 'accessArgs',
]);
const GENERIC_OUTPUT_DIALECTS = new Set(['text', 'json', 'jsonl']);
const ACCESS_MODES = new Set<ExternalToolAccess>(['read-only', 'workspace-write', 'native']);

function safeStr(v: unknown, max: number, re: RegExp): v is string {
  return typeof v === 'string' && v.length >= 1 && v.length <= max && re.test(v) && !v.includes('..');
}

function validTemplate(value: unknown): value is string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 40) return false;
  return value.every((part) => {
    if (typeof part !== 'string' || part.length > 512) return false;
    const placeholders = [...part.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]);
    return placeholders.every((name) => TASK_PLACEHOLDERS.has(name));
  });
}

function validateTask(value: unknown): ToolTaskSpec | null {
  if (!value || typeof value !== 'object') return null;
  const task = value as Record<string, unknown>;
  const allowedKeys = new Set([
    'argvTemplate', 'resumeArgvTemplate', 'accessArgs', 'promptTransport',
    'outputDialect', 'workspaceBinding', 'permissionModes', 'resumable',
  ]);
  if (Object.keys(task).some((key) => !allowedKeys.has(key))) return null;
  if (!validTemplate(task.argvTemplate)) return null;
  if (task.resumeArgvTemplate !== undefined && !validTemplate(task.resumeArgvTemplate)) return null;
  if (!['stdin', 'arg', 'temp-file'].includes(String(task.promptTransport))) return null;
  if (!GENERIC_OUTPUT_DIALECTS.has(String(task.outputDialect))) return null;
  if (!['cwd', 'flag'].includes(String(task.workspaceBinding))) return null;
  if (!Array.isArray(task.permissionModes) || task.permissionModes.length < 1 || task.permissionModes.length > 3) return null;
  const permissionModes = task.permissionModes as unknown[];
  if (!permissionModes.every((mode): mode is ExternalToolAccess => ACCESS_MODES.has(mode as ExternalToolAccess))) return null;
  if (new Set(permissionModes).size !== permissionModes.length) return null;
  if (typeof task.resumable !== 'boolean') return null;
  if (task.resumable && !task.resumeArgvTemplate) return null;
  if (!task.accessArgs || typeof task.accessArgs !== 'object' || Array.isArray(task.accessArgs)) return null;
  const rawAccess = task.accessArgs as Record<string, unknown>;
  if (Object.keys(rawAccess).some((mode) => !permissionModes.includes(mode as ExternalToolAccess))) return null;
  const accessArgs: Partial<Record<ExternalToolAccess, readonly string[]>> = {};
  for (const mode of permissionModes) {
    const args = rawAccess[mode];
    if (!Array.isArray(args) || args.length > 20) return null;
    if (!args.every((arg) => typeof arg === 'string' && arg.length <= 256 && !/[{}]/.test(arg))) return null;
    accessArgs[mode] = args as string[];
  }
  if (task.promptTransport === 'arg' && !task.argvTemplate.some((part) => part.includes('{prompt}'))) return null;
  if (task.promptTransport === 'temp-file' && !task.argvTemplate.some((part) => part.includes('{promptFile}'))) return null;

  return {
    argvTemplate: task.argvTemplate,
    ...(task.resumeArgvTemplate ? { resumeArgvTemplate: task.resumeArgvTemplate as string[] } : {}),
    accessArgs,
    promptTransport: task.promptTransport as ToolTaskSpec['promptTransport'],
    outputDialect: task.outputDialect as ToolTaskSpec['outputDialect'],
    workspaceBinding: task.workspaceBinding as ToolTaskSpec['workspaceBinding'],
    permissionModes,
    resumable: task.resumable,
  };
}

/** Validate one parsed JSON object into a ToolManifest, or null if unsafe/malformed. */
function validate(raw: unknown): ToolManifest | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const allowedKeys = new Set([
    'id', 'displayName', 'launchable', 'hookCapable', 'hookPointer', 'detect',
    'promptArgTemplate', 'task',
  ]);
  if (Object.keys(o).some((key) => !allowedKeys.has(key))) return null;
  if (!safeStr(o.id, 64, NAME_SAFE)) return null;
  if (typeof o.displayName !== 'string' || o.displayName.length < 1 || o.displayName.length > 80) return null;
  if (typeof o.launchable !== 'boolean' || typeof o.hookCapable !== 'boolean') return null;
  if (!safeStr(o.hookPointer, 256, PATH_SAFE)) return null;
  const d = o.detect as Record<string, unknown> | undefined;
  // Third-party adapters may ONLY declare PATH detection (candidates = code-only).
  if (!d || d.kind !== 'path' || !safeStr(d.binaryName, 128, NAME_SAFE)) return null;

  let promptArgTemplate: string[] | undefined;
  if (o.promptArgTemplate !== undefined) {
    if (!Array.isArray(o.promptArgTemplate) || o.promptArgTemplate.length > 20) return null;
    if (!o.promptArgTemplate.every((x) => typeof x === 'string' && x.length <= 256)) return null;
    promptArgTemplate = o.promptArgTemplate as string[];
  }

  const task = o.task === undefined ? undefined : validateTask(o.task);
  if (o.task !== undefined && !task) return null;

  return {
    id: o.id as string,
    displayName: o.displayName,
    launchable: o.launchable,
    hookCapable: o.hookCapable,
    hookPointer: o.hookPointer as string,
    detect: { kind: 'path', binaryName: d.binaryName as string },
    ...(promptArgTemplate ? { promptArgTemplate } : {}),
    capabilities: {
      interactiveLaunch: o.launchable,
      headlessTask: Boolean(task),
      structuredProgress: task?.outputDialect === 'json' || task?.outputDialect === 'jsonl',
      resumable: task?.resumable ?? false,
      liveWaggleDance: false,
    },
    ...(task ? { task } : {}),
    builtin: false,
  };
}

export interface ManifestLoaderDeps {
  dir?: string;
  readDir?: (dir: string) => string[];
  readFile?: (p: string) => string;
}

export function loadThirdPartyManifests(deps: ManifestLoaderDeps = {}): ToolManifest[] {
  const dir = deps.dir ?? path.join(os.homedir(), '.waggle', 'adapters');
  const readDir = deps.readDir ?? ((d) => fs.readdirSync(d));
  const readFile = deps.readFile ?? ((p) => fs.readFileSync(p, 'utf8'));
  let names: string[];
  try {
    names = readDir(dir).filter((n) => n.endsWith('.json'));
  } catch {
    return []; // missing dir / unreadable → no third-party adapters
  }
  const out: ToolManifest[] = [];
  for (const name of names) {
    try {
      const m = validate(JSON.parse(readFile(path.join(dir, name))));
      if (m) out.push(m);
    } catch {
      /* skip malformed file */
    }
  }
  return out;
}
