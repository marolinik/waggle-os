/**
 * Evolution Deploy Helpers — Phase 6.1 of the self-evolution loop.
 *
 * When the user accepts an EvolutionRun, the orchestrator calls the
 * caller-supplied `deploy` callback. This module provides the built-in
 * building blocks for that callback:
 *
 *   deployPersonaOverride         — writes a persona JSON file that
 *                                   shadows the built-in persona at
 *                                   runtime via loadCustomPersonas.
 *   deployBehavioralSpecOverride  — writes a JSON file in
 *                                   {dataDir}/behavioral-overrides/
 *                                   that can be merged into
 *                                   BEHAVIORAL_SPEC sections at load.
 *   loadBehavioralSpecOverrides   — reads those overrides from disk.
 *
 * Every writer:
 *   - Creates the target directory if missing.
 *   - Writes atomically (write to .tmp, rename) so a crash mid-write
 *     never corrupts the config.
 *   - Backs up the previous version to {file}.bak before overwriting.
 *   - Returns a structured DeployResult with paths + timestamps.
 *
 * These helpers are pure filesystem operations — they don't talk to
 * any runtime singletons, so the server wiring is trivial:
 *   orchestrator.accept(uuid) → onDeploy(run)
 *                             → deployPersonaOverride(dataDir, ...)
 *                             → reloadPersonas()
 */

import fs from 'node:fs';
import path from 'node:path';
import type { AgentPersona } from './personas.js';
import { getPersona } from './personas.js';

// ── Public result shape ────────────────────────────────────────

export interface DeployResult {
  /** Absolute path that was written */
  path: string;
  /** Path to the backup of the previous version (null if first write) */
  backupPath: string | null;
  /** When the deploy happened */
  deployedAt: string;
}

// ── Persona override ───────────────────────────────────────────

export interface DeployPersonaInput {
  /** Persona id — matches a built-in persona (the deploy SHADOWS it). */
  personaId: string;
  /** The evolved system prompt text */
  systemPrompt: string;
  /** Optional additional field overrides */
  overrides?: Partial<AgentPersona>;
}

/**
 * Write an evolved persona system prompt to disk so the custom-personas
 * loader picks it up on next `listPersonas()` call.
 *
 * When a built-in persona with this id exists, the override inherits
 * all its properties (name, tools, tagline, etc) except systemPrompt
 * (replaced with the evolved one). When no built-in exists, a minimal
 * persona shell is built from the input.
 */
export function deployPersonaOverride(
  dataDir: string,
  input: DeployPersonaInput,
): DeployResult {
  const personasDir = path.join(dataDir, 'personas');
  if (!fs.existsSync(personasDir)) {
    fs.mkdirSync(personasDir, { recursive: true });
  }

  const filePath = path.join(personasDir, `${input.personaId}.json`);
  const backupPath = fs.existsSync(filePath) ? `${filePath}.bak` : null;
  if (backupPath) {
    fs.copyFileSync(filePath, backupPath);
  }

  const builtin = getPersona(input.personaId);
  const persona: AgentPersona = builtin
    ? { ...builtin, ...input.overrides, systemPrompt: input.systemPrompt }
    : {
        id: input.personaId,
        name: input.personaId,
        description: input.overrides?.description ?? `${input.personaId} (evolved)`,
        icon: input.overrides?.icon ?? 'sparkles',
        systemPrompt: input.systemPrompt,
        modelPreference: input.overrides?.modelPreference ?? 'claude-sonnet-4-6',
        tools: input.overrides?.tools ?? [],
        workspaceAffinity: input.overrides?.workspaceAffinity ?? [],
        suggestedCommands: input.overrides?.suggestedCommands ?? [],
        defaultWorkflow: input.overrides?.defaultWorkflow ?? null,
        ...input.overrides,
      };

  writeAtomic(filePath, JSON.stringify(persona, null, 2));

  return {
    path: filePath,
    backupPath,
    deployedAt: new Date().toISOString(),
  };
}

/**
 * Roll back a previously-deployed persona override to the .bak version
 * (or remove the override entirely if there was no previous version).
 */
export function rollbackPersonaOverride(
  dataDir: string,
  personaId: string,
): boolean {
  const filePath = path.join(dataDir, 'personas', `${personaId}.json`);
  const backupPath = `${filePath}.bak`;
  if (fs.existsSync(backupPath)) {
    fs.renameSync(backupPath, filePath);
    return true;
  }
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}

// ── Behavioral-spec override ──────────────────────────────────

/**
 * BEHAVIORAL_SPEC is compiled into the bundle, so we cannot mutate it
 * on disk without rebuilding. Instead, overrides live as JSON files in
 * {dataDir}/behavioral-overrides/ and the runtime merges them at load.
 *
 * One file per section, filename = section name (coreLoop, qualityRules,
 * behavioralRules, workPatterns, intelligenceDefaults).
 */

export type BehavioralSpecSection =
  | 'coreLoop'
  | 'qualityRules'
  | 'behavioralRules'
  | 'workPatterns'
  | 'intelligenceDefaults';

export const BEHAVIORAL_SPEC_SECTIONS: BehavioralSpecSection[] = [
  'coreLoop',
  'qualityRules',
  'behavioralRules',
  'workPatterns',
  'intelligenceDefaults',
];

export interface DeployBehavioralSpecInput {
  /** Which section to override */
  section: BehavioralSpecSection;
  /** The evolved text for that section */
  text: string;
  /** Optional evolution-run uuid for audit */
  runUuid?: string;
}

export interface BehavioralSpecOverride {
  section: BehavioralSpecSection;
  text: string;
  runUuid?: string;
  deployedAt: string;
}

/**
 * Write a behavioral-spec section override to disk. The runtime loader
 * (loadBehavioralSpecOverrides) reads these on startup and merges them
 * into the compiled BEHAVIORAL_SPEC at runtime.
 */
export function deployBehavioralSpecOverride(
  dataDir: string,
  input: DeployBehavioralSpecInput,
): DeployResult {
  if (!BEHAVIORAL_SPEC_SECTIONS.includes(input.section)) {
    throw new Error(`Unknown behavioral-spec section: ${input.section}`);
  }

  const dir = path.join(dataDir, 'behavioral-overrides');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const filePath = path.join(dir, `${input.section}.json`);
  const backupPath = fs.existsSync(filePath) ? `${filePath}.bak` : null;
  if (backupPath) {
    fs.copyFileSync(filePath, backupPath);
  }

  const payload: BehavioralSpecOverride = {
    section: input.section,
    text: input.text,
    runUuid: input.runUuid,
    deployedAt: new Date().toISOString(),
  };

  writeAtomic(filePath, JSON.stringify(payload, null, 2));

  return {
    path: filePath,
    backupPath,
    deployedAt: payload.deployedAt,
  };
}

/** Roll back one section (restores .bak, or removes if no previous override). */
export function rollbackBehavioralSpecOverride(
  dataDir: string,
  section: BehavioralSpecSection,
): boolean {
  const filePath = path.join(dataDir, 'behavioral-overrides', `${section}.json`);
  const backupPath = `${filePath}.bak`;
  if (fs.existsSync(backupPath)) {
    fs.renameSync(backupPath, filePath);
    return true;
  }
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}

/** Read all behavioral-spec overrides from disk as a map section → text. */
export function loadBehavioralSpecOverrides(
  dataDir: string,
): Partial<Record<BehavioralSpecSection, string>> {
  const dir = path.join(dataDir, 'behavioral-overrides');
  if (!fs.existsSync(dir)) return {};

  const out: Partial<Record<BehavioralSpecSection, string>> = {};
  try {
    for (const section of BEHAVIORAL_SPEC_SECTIONS) {
      const filePath = path.join(dir, `${section}.json`);
      if (!fs.existsSync(filePath)) continue;
      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(raw) as Partial<BehavioralSpecOverride>;
        if (parsed && typeof parsed.text === 'string' && parsed.text.length > 0) {
          out[section] = parsed.text;
        }
      } catch { /* skip malformed */ }
    }
  } catch { /* dir unreadable */ }
  return out;
}

/** Merge overrides into a baseline spec object, preferring the override text. */
export function applyBehavioralSpecOverrides(
  baseline: Record<BehavioralSpecSection, string>,
  overrides: Partial<Record<BehavioralSpecSection, string>>,
): Record<BehavioralSpecSection, string> {
  return {
    ...baseline,
    ...Object.fromEntries(
      (Object.entries(overrides) as Array<[BehavioralSpecSection, string]>)
        .filter(([, v]) => typeof v === 'string' && v.length > 0),
    ),
  } as Record<BehavioralSpecSection, string>;
}

// ── Internal ───────────────────────────────────────────────────

/** Atomic write — write to .tmp then rename into place. */
function writeAtomic(filePath: string, contents: string): void {
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, contents, 'utf-8');
  fs.renameSync(tmpPath, filePath);
}
