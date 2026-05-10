/**
 * GEPA Faza 1 — mutation oracle fork tests.
 *
 * Coverage targets per manifest v7 §amendment_2_integration.scaffold_test_coverage_NEW_requirements
 * mandatory_routing_tests:
 *   - Qwen branch: qwen-thinking + qwen-non-thinking → "qwen" template
 *   - Non-Qwen branch: claude + gpt + generic-simple → "non-qwen" template
 *   - Template content actually exists at expected paths
 *   - Placeholder substitution works for both branches
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  classifyShape,
  templatePathForShape,
  loadTemplate,
  buildOraclePrompt,
} from '../../src/faza-1/mutation-oracle-fork.js';
import { type ShapeName } from '../../src/faza-1/types.js';

const ORACLE_DIR = path.resolve(__dirname, '../../oracle/faza-1');

// ───────────────────────────────────────────────────────────────────────────
// Shape classification — Amendment 2 §4 mandatory routing tests
// ───────────────────────────────────────────────────────────────────────────

describe('classifyShape — Amendment 2 §4 fork routing', () => {
  it('qwen-thinking → qwen branch', () => {
    expect(classifyShape('qwen-thinking')).toBe('qwen');
  });

  it('qwen-non-thinking → qwen branch', () => {
    expect(classifyShape('qwen-non-thinking')).toBe('qwen');
  });

  it('claude → non-qwen branch', () => {
    expect(classifyShape('claude')).toBe('non-qwen');
  });

  it('gpt → non-qwen branch', () => {
    expect(classifyShape('gpt')).toBe('non-qwen');
  });

  it('generic-simple → non-qwen branch', () => {
    expect(classifyShape('generic-simple')).toBe('non-qwen');
  });

  it('partition: every ShapeName routes to exactly one branch', () => {
    const all: ShapeName[] = ['claude', 'qwen-thinking', 'qwen-non-thinking', 'gpt', 'generic-simple'];
    const qwenCount = all.filter(s => classifyShape(s) === 'qwen').length;
    const nonQwenCount = all.filter(s => classifyShape(s) === 'non-qwen').length;
    expect(qwenCount).toBe(2);
    expect(nonQwenCount).toBe(3);
    expect(qwenCount + nonQwenCount).toBe(all.length);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Template paths
// ───────────────────────────────────────────────────────────────────────────

describe('templatePathForShape', () => {
  it('Qwen-targeted shapes resolve to mutation-prompt-template-qwen.md', () => {
    expect(path.basename(templatePathForShape('qwen-thinking'))).toBe('mutation-prompt-template-qwen.md');
    expect(path.basename(templatePathForShape('qwen-non-thinking'))).toBe('mutation-prompt-template-qwen.md');
  });

  it('Non-Qwen shapes resolve to mutation-prompt-template-non-qwen.md', () => {
    expect(path.basename(templatePathForShape('claude'))).toBe('mutation-prompt-template-non-qwen.md');
    expect(path.basename(templatePathForShape('gpt'))).toBe('mutation-prompt-template-non-qwen.md');
    expect(path.basename(templatePathForShape('generic-simple'))).toBe('mutation-prompt-template-non-qwen.md');
  });

  it('Both template files exist on disk in the oracle directory', () => {
    expect(fs.existsSync(path.join(ORACLE_DIR, 'mutation-prompt-template-qwen.md'))).toBe(true);
    expect(fs.existsSync(path.join(ORACLE_DIR, 'mutation-prompt-template-non-qwen.md'))).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// loadTemplate
// ───────────────────────────────────────────────────────────────────────────

describe('loadTemplate', () => {
  it('Qwen template contains anti-premature-finalization scaffolding', () => {
    const t = loadTemplate('qwen-thinking');
    // Case-insensitive: template prose uses lowercase, headings may capitalize.
    expect(t.toLowerCase()).toContain('anti-premature-finalization');
    // These instruction phrases are unique to the Qwen branch:
    expect(t).toContain('Continue retrieving until');
    expect(t).toContain('multi-turn retrieval');
  });

  it('Non-Qwen template lacks Qwen-specific scaffolding instructions', () => {
    const t = loadTemplate('claude');
    expect(t).toContain('Standard mutation directions');
    expect(t).toContain('reasoning scaffold');
    // The non-qwen template legitimately MENTIONS the absence of qwen
    // scaffolding ("no Qwen-specific anti-premature-finalization scaffolding
    // required"). The proper test is for absence of the actual prescriptive
    // INSTRUCTION phrases that appear only in the Qwen template.
    expect(t).not.toContain('Continue retrieving until');
    expect(t).not.toContain('multi-turn retrieval');
  });

  it('Both templates lock cell semantic boundaries', () => {
    const qwenT = loadTemplate('qwen-thinking');
    const nonQwenT = loadTemplate('claude');
    for (const t of [qwenT, nonQwenT]) {
      expect(t).toContain('DO NOT modify');
      expect(t).toContain('MULTI_STEP_ACTION_CONTRACT');
    }
  });

  it('Both templates expose all 4 placeholder tokens', () => {
    const placeholders = [
      '###BASELINE_SHAPE_CONTENT###',
      '###FAILURE_MODE_SUMMARY###',
      '###SHAPE_NAME###',
      '###TEMPLATE_CLASS###',
    ];
    for (const shape of ['qwen-thinking', 'claude'] as ShapeName[]) {
      const t = loadTemplate(shape);
      for (const ph of placeholders) {
        expect(t).toContain(ph);
      }
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// buildOraclePrompt — placeholder substitution
// ───────────────────────────────────────────────────────────────────────────

describe('buildOraclePrompt', () => {
  it('substitutes all 4 placeholders in Qwen template', () => {
    const prompt = buildOraclePrompt({
      shape: 'qwen-thinking',
      baselineShapeContent: 'export const baselineShape = {...};',
      failureModeSummary: '1. unsupported-specifics\n2. missed\n3. shallow',
    });
    expect(prompt).toContain('export const baselineShape');
    expect(prompt).toContain('unsupported-specifics');
    expect(prompt).toContain('qwen-thinking');
    expect(prompt).toContain('Template class:** qwen');
    expect(prompt).not.toContain('###BASELINE_SHAPE_CONTENT###');
    expect(prompt).not.toContain('###FAILURE_MODE_SUMMARY###');
    expect(prompt).not.toContain('###SHAPE_NAME###');
    expect(prompt).not.toContain('###TEMPLATE_CLASS###');
  });

  it('substitutes all 4 placeholders in non-Qwen template', () => {
    const prompt = buildOraclePrompt({
      shape: 'claude',
      baselineShapeContent: 'export const claudeShape = {...};',
      failureModeSummary: '1. conflation\n2. weak-synthesis\n3. fabrication',
    });
    expect(prompt).toContain('export const claudeShape');
    expect(prompt).toContain('conflation');
    expect(prompt).toContain('claude');
    expect(prompt).toContain('Template class:** non-qwen');
  });

  it('Qwen-targeted shapes get the same template (qwen-thinking + qwen-non-thinking interchangeable)', () => {
    const a = buildOraclePrompt({
      shape: 'qwen-thinking',
      baselineShapeContent: 'X',
      failureModeSummary: 'Y',
    });
    const b = buildOraclePrompt({
      shape: 'qwen-non-thinking',
      baselineShapeContent: 'X',
      failureModeSummary: 'Y',
    });
    // Same template body, but ###SHAPE_NAME### is substituted differently
    expect(a.replace(/qwen-thinking/g, 'X')).toBe(b.replace(/qwen-non-thinking/g, 'X'));
  });
});
