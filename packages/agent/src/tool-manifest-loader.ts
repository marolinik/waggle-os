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
import type { ToolManifest } from '@waggle/shared';

// Allows `/ \ . _ -` for relative pointer paths; rejects everything else.
const PATH_SAFE = /^[A-Za-z0-9._/\\-]+$/;
// No path separators — for ids and binary names (PATH lookup).
const NAME_SAFE = /^[A-Za-z0-9._-]+$/;

function safeStr(v: unknown, max: number, re: RegExp): v is string {
  return typeof v === 'string' && v.length >= 1 && v.length <= max && re.test(v) && !v.includes('..');
}

/** Validate one parsed JSON object into a ToolManifest, or null if unsafe/malformed. */
function validate(raw: unknown): ToolManifest | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
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

  return {
    id: o.id as string,
    displayName: o.displayName,
    launchable: o.launchable,
    hookCapable: o.hookCapable,
    hookPointer: o.hookPointer as string,
    detect: { kind: 'path', binaryName: d.binaryName as string },
    ...(promptArgTemplate ? { promptArgTemplate } : {}),
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
