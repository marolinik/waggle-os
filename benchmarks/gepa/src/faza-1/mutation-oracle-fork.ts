/**
 * GEPA Faza 1 — mutation oracle fork (Qwen vs non-Qwen template routing).
 *
 * Per Amendment 2 §4 + manifest v7 §mutation_oracle_design.
 *
 * Phase 4.5 finding requires Qwen-specific scaffolding to address mechanistic
 * under-engagement; uniform mutation guidance would not target the empirical
 * gap. Forked oracle prompts ensure Qwen mutations explore the engagement-
 * bonus reward landscape while non-Qwen mutations explore the broader scaffold
 * space.
 *
 * This module is responsible only for:
 *   1. Selecting the right template path per shape class
 *   2. Loading template content from disk
 *   3. Substituting baseline shape body + failure mode summary into template
 *
 * The actual LLM oracle call lives in the run orchestrator (out of scaffold scope).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { type ShapeName, QWEN_TARGETED_SHAPES } from './types.js';

export type TemplateClass = 'qwen' | 'non-qwen';

/** Per-shape template class routing. */
export function classifyShape(shape: ShapeName): TemplateClass {
  return QWEN_TARGETED_SHAPES.has(shape) ? 'qwen' : 'non-qwen';
}

/** Resolve template path for a given shape class. */
export function templatePathForShape(
  shape: ShapeName,
  oracleDir: string = path.resolve(__dirname, '../../oracle/faza-1'),
): string {
  const cls = classifyShape(shape);
  const filename =
    cls === 'qwen'
      ? 'mutation-prompt-template-qwen.md'
      : 'mutation-prompt-template-non-qwen.md';
  return path.join(oracleDir, filename);
}

/** Load raw template content for a given shape. */
export function loadTemplate(
  shape: ShapeName,
  oracleDir?: string,
): string {
  const templatePath = templatePathForShape(shape, oracleDir);
  return fs.readFileSync(templatePath, 'utf-8');
}

/** Inputs for assembling the final oracle prompt. */
export interface OraclePromptInputs {
  shape: ShapeName;
  /** Baseline shape file content (the candidate to mutate). */
  baselineShapeContent: string;
  /**
   * Failure mode summary from Phase 4.3 verdict (top-3 T2 failures for this shape).
   * Per brief §3.3 mutation oracle prompt.
   */
  failureModeSummary: string;
  oracleDir?: string;
}

/**
 * Build the complete oracle prompt by template substitution.
 *
 * Templates use these placeholders (must appear verbatim in template files):
 *   ###BASELINE_SHAPE_CONTENT###
 *   ###FAILURE_MODE_SUMMARY###
 *   ###SHAPE_NAME###
 *   ###TEMPLATE_CLASS###
 */
export function buildOraclePrompt(inputs: OraclePromptInputs): string {
  const template = loadTemplate(inputs.shape, inputs.oracleDir);
  const cls = classifyShape(inputs.shape);

  return template
    .replace(/###BASELINE_SHAPE_CONTENT###/g, inputs.baselineShapeContent)
    .replace(/###FAILURE_MODE_SUMMARY###/g, inputs.failureModeSummary)
    .replace(/###SHAPE_NAME###/g, inputs.shape)
    .replace(/###TEMPLATE_CLASS###/g, cls);
}
