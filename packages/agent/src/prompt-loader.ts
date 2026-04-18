import * as fs from 'node:fs';
import * as path from 'node:path';

import { buildActiveBehavioralSpec } from './behavioral-spec.js';

/** The resolved behavioral-spec shape returned by `buildActiveBehavioralSpec`. */
export type BehavioralSpec = ReturnType<typeof buildActiveBehavioralSpec>;
import { loadBehavioralSpecOverrides } from './evolution-deploy.js';
import { loadCustomPersonas } from './custom-personas.js';
import type { AgentPersona } from './personas.js';

export interface LoadedSkill {
  name: string;
  content: string;
}

/**
 * Raw disk read of `{waggleDir}/system-prompt.md`. Returns null if missing
 * or empty.
 *
 * **Prefer `loadSystemPromptWithOverrides(waggleDir)` for runtime use.** This
 * bare reader exists for tools that legitimately need the unmerged file
 * content (editor views, migration scripts). Runtime agent code that loads
 * just this and nothing else will silently miss any deployed
 * behavioral-spec or persona evolution, since those are stored in separate
 * override files under the same `waggleDir`.
 *
 * H-09 G2 — see `loadSystemPromptWithOverrides` for the composed path.
 */
export function loadSystemPrompt(waggleDir: string): string | null {
  const filePath = path.join(waggleDir, 'system-prompt.md');
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf-8').trim();
  return content || null;
}

/** Bundle of every override-aware input the agent runtime needs. */
export interface ComposedSystemPrompt {
  /** User's literal system-prompt.md content, or null if absent. */
  userPromptMd: string | null;
  /** The active behavioral spec — base + any deployed section overrides. */
  behavioralSpec: BehavioralSpec;
  /** Custom personas discovered in `waggleDir/personas/*.json`. */
  customPersonas: AgentPersona[];
}

/**
 * Override-aware composition: reads `system-prompt.md`, merges deployed
 * behavioral-spec section overrides from
 * `{waggleDir}/evolution-deploy/behavioral-spec/*.md`, and surfaces any
 * custom personas the user has added. Use this at agent startup so
 * deployed evolutions take effect at the next run.
 *
 * Callers typically pass the bundle to their orchestrator:
 *
 *     const composed = loadSystemPromptWithOverrides(waggleDir);
 *     const orchestrator = new Orchestrator({
 *       systemPromptAddendum: composed.userPromptMd,
 *       behavioralSpec: composed.behavioralSpec,
 *       extraPersonas: composed.customPersonas,
 *     });
 *
 * Does not throw on missing files — any piece absent resolves to an empty
 * value so a fresh install just gets the compile-time baseline.
 */
export function loadSystemPromptWithOverrides(waggleDir: string): ComposedSystemPrompt {
  const userPromptMd = loadSystemPrompt(waggleDir);
  // loadBehavioralSpecOverrides is no-op on missing dir / malformed files.
  const overrides = loadBehavioralSpecOverrides(waggleDir);
  const behavioralSpec = buildActiveBehavioralSpec(overrides);
  const customPersonas = loadCustomPersonas(waggleDir);
  return { userPromptMd, behavioralSpec, customPersonas };
}

/**
 * Startup-time self-check. Call after composing the override-aware prompt
 * bundle to verify that deployed overrides on disk actually appear in the
 * active spec. Emits a structured console warning (never throws) if a
 * deployed section is present on disk but missing from the active spec —
 * that would indicate the caller is using the bare `loadSystemPrompt`
 * instead of the composed loader.
 */
export function assertOverridesReachActiveSpec(
  waggleDir: string,
  activeSpec: BehavioralSpec,
): void {
  const overrides = loadBehavioralSpecOverrides(waggleDir);
  const missing: string[] = [];
  for (const [section, overrideText] of Object.entries(overrides)) {
    const live = (activeSpec as unknown as Record<string, string | undefined>)[section];
    if (!live || !live.includes(overrideText.slice(0, 24))) {
      missing.push(section);
    }
  }
  if (missing.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `[prompt-loader] override-reach check failed — deployed sections on disk ` +
      `not present in active behavioral spec: ${missing.join(', ')}. ` +
      `This usually means the runtime is using loadSystemPrompt() instead of ` +
      `loadSystemPromptWithOverrides(). See prompt-loader.ts.`,
    );
  }
}

export function loadSkills(waggleDir: string): LoadedSkill[] {
  const skillsDir = path.join(waggleDir, 'skills');
  if (!fs.existsSync(skillsDir)) return [];

  const files = fs.readdirSync(skillsDir).filter(f => f.endsWith('.md'));
  return files.map(f => ({
    name: f.replace(/\.md$/, ''),
    content: fs.readFileSync(path.join(skillsDir, f), 'utf-8').trim(),
  }));
}
