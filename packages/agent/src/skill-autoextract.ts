/**
 * Skills 2.0 gap A — auto-extract skills from session history.
 *
 * Closes the loop between detectWorkflowPattern (session analysis) and
 * generateSkillMarkdown (SKILL.md file generation). Previously these two
 * primitives existed but were never wired together — SKILL.md files only
 * got created via the explicit create_skill agent tool.
 *
 * This module provides a deterministic pipeline (no LLM required) that:
 *   1. Runs detectWorkflowPattern on a message history
 *   2. Generates a SKILL.md via generateSkillMarkdown
 *   3. Writes it to the personal scope directory (scope: personal frontmatter)
 *   4. Dedups against existing skill files by filename
 *   5. Optionally emits a workflow_pattern improvement signal
 *
 * A v2 enhancement can insert an LLM prose-improvement step between
 * detectWorkflowPattern and generateSkillMarkdown without changing this
 * module's public surface.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ImprovementSignalStore } from '@waggle/core';
import {
  detectWorkflowPattern,
  generateSkillMarkdown,
  type SkillTemplate,
} from './skill-creator.js';

export interface AutoExtractMessage {
  role: string;
  content: string;
  toolsUsed?: string[];
}

export interface AutoExtractDeps {
  /** Directory to write personal-scope SKILL.md files into */
  personalSkillsDir: string;
  /** Optional signal store — records workflow_pattern signals on each extraction */
  improvementSignals?: ImprovementSignalStore;
  /**
   * Optional LLM enrichment hook. When provided, the template is passed
   * through before serialization so the SKILL.md prose can be rewritten.
   * Must return a SkillTemplate (may be the same object). If the hook
   * throws, the deterministic template is used as a safe fallback.
   */
  enrichTemplate?: (template: SkillTemplate, messages: AutoExtractMessage[]) => Promise<SkillTemplate>;
}

export interface AutoExtractResult {
  /** Path to the SKILL.md written, or null when nothing was created */
  filePath: string | null;
  /** Why the extraction returned null (when applicable) */
  reason?: 'no_pattern' | 'already_exists';
  /** The template used (present when filePath is non-null) */
  template?: SkillTemplate;
}

/** Produce a kebab-case filename stem from a SkillTemplate name. */
export function skillFilename(template: SkillTemplate): string {
  return template.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Inject scope + auto-extracted provenance into the generated SKILL.md so
 * gap-E promotion gates recognize this as a personal-scope skill with a
 * clear origin marker. Operates on the frontmatter block only.
 */
function annotateWithScope(md: string): string {
  // Insert the scope line right after the description line in the
  // frontmatter block. detectWorkflowPattern + generateSkillMarkdown never
  // emit scope, so no existing line is overwritten.
  return md.replace(
    /(description: [^\n]+)\n/,
    '$1\nscope: personal\n',
  );
}

/**
 * Run the full pipeline end-to-end. Returns null.filePath when no pattern
 * was detected or a skill with the same filename already exists.
 */
export async function autoExtractAndCreateSkill(
  messages: AutoExtractMessage[],
  deps: AutoExtractDeps,
): Promise<AutoExtractResult> {
  const template = detectWorkflowPattern(messages);
  if (!template) {
    return { filePath: null, reason: 'no_pattern' };
  }

  const stem = skillFilename(template);
  if (!fs.existsSync(deps.personalSkillsDir)) {
    fs.mkdirSync(deps.personalSkillsDir, { recursive: true });
  }
  const filePath = path.join(deps.personalSkillsDir, `${stem}.md`);
  if (fs.existsSync(filePath)) {
    return { filePath: null, reason: 'already_exists', template };
  }

  // Optional LLM enrichment — isolated in try/catch so a flaky model
  // never fails the deterministic fallback path.
  let finalTemplate = template;
  if (deps.enrichTemplate) {
    try {
      finalTemplate = await deps.enrichTemplate(template, messages);
    } catch {
      finalTemplate = template;
    }
  }

  const md = annotateWithScope(generateSkillMarkdown(finalTemplate));
  fs.writeFileSync(filePath, md, 'utf-8');

  if (deps.improvementSignals) {
    try {
      deps.improvementSignals.record(
        'workflow_pattern',
        `auto-extract:${stem}`,
        `Auto-extracted skill "${finalTemplate.name}" from session pattern (${finalTemplate.tools.join(', ')})`,
        {
          skillName: finalTemplate.name,
          filename: stem,
          tools: finalTemplate.tools,
          category: finalTemplate.category,
          source: 'auto_extract',
        },
      );
    } catch { /* non-blocking */ }
  }

  return { filePath, template: finalTemplate };
}
