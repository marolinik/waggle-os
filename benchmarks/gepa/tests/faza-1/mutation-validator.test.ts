/**
 * GEPA Faza 1 — mutation validator tests.
 *
 * Coverage targets:
 *   - SHA boundary checks (types.ts + MULTI_STEP_ACTION_CONTRACT bytes)
 *   - Pinned baseline shape SHAs (5 shapes)
 *   - Locked metadata field detection
 *   - Imports preservation check
 *   - Gen 1 mutation must differ from baseline
 *   - Gen 0 baseline (expectShapeDiff=false) accepts identity
 *
 * Validation against actual substrate-pinned files (the worktree at c9bda3d).
 */

import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import {
  BOUNDARY_SHAS,
  BASELINE_SHAPE_SHAS,
  sha256,
  sha256File,
  extractMultiStepActionContractBytes,
  validateCandidate,
} from '../../src/faza-1/mutation-validator.js';

const WORKTREE_ROOT = path.resolve(__dirname, '../../../../');
const PROMPT_SHAPES_DIR = path.join(WORKTREE_ROOT, 'packages/agent/src/prompt-shapes');
const TYPES_FILE = path.join(PROMPT_SHAPES_DIR, 'types.ts');

// ───────────────────────────────────────────────────────────────────────────
// SHA primitive tests
// ───────────────────────────────────────────────────────────────────────────

describe('sha256 primitive', () => {
  it('computes deterministic SHA-256 of utf-8 string', () => {
    expect(sha256('hello')).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
  });

  it('computes SHA-256 of buffer', () => {
    expect(sha256(Buffer.from('hello'))).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
  });

  it('returns different SHAs for different inputs', () => {
    expect(sha256('a')).not.toBe(sha256('b'));
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Boundary anchor SHAs match actual substrate at c9bda3d
// ───────────────────────────────────────────────────────────────────────────

describe('boundary anchor SHAs match substrate at c9bda3d', () => {
  it('types.ts whole-file SHA matches pinned baseline', () => {
    const actual = sha256File(TYPES_FILE);
    expect(actual).toBe(BOUNDARY_SHAS.typesFile);
  });

  it('MULTI_STEP_ACTION_CONTRACT bytes SHA matches pinned baseline', () => {
    const content = fs.readFileSync(TYPES_FILE, 'utf-8');
    const bytes = extractMultiStepActionContractBytes(content);
    expect(bytes).not.toBeNull();
    expect(sha256(bytes!)).toBe(BOUNDARY_SHAS.multiStepActionContract);
  });

  it('extractMultiStepActionContractBytes captures the 252-byte constant', () => {
    const content = fs.readFileSync(TYPES_FILE, 'utf-8');
    const bytes = extractMultiStepActionContractBytes(content);
    expect(bytes).not.toBeNull();
    expect(Buffer.from(bytes!, 'utf-8').length).toBe(252);
    expect(bytes!).toContain('Output exactly ONE JSON object on its own line');
  });

  it('extractMultiStepActionContractBytes returns null when constant absent', () => {
    expect(extractMultiStepActionContractBytes('export const SOMETHING_ELSE = 42;')).toBeNull();
  });
});

describe('all 5 baseline shape SHAs match substrate at c9bda3d', () => {
  for (const shapeName of Object.keys(BASELINE_SHAPE_SHAS) as Array<keyof typeof BASELINE_SHAPE_SHAS>) {
    it(`baseline ${shapeName} SHA matches pinned`, () => {
      const filepath = path.join(PROMPT_SHAPES_DIR, shapeName);
      const actual = sha256File(filepath);
      expect(actual).toBe(BASELINE_SHAPE_SHAS[shapeName]);
    });
  }
});

// ───────────────────────────────────────────────────────────────────────────
// validateCandidate end-to-end
// ───────────────────────────────────────────────────────────────────────────

describe('validateCandidate — Gen 0 (baseline) acceptance', () => {
  it('Gen 0 baseline shape passes validation with expectShapeDiff=false', () => {
    const verdict = validateCandidate({
      candidateShapeFilePath: path.join(PROMPT_SHAPES_DIR, 'qwen-thinking.ts'),
      baselineShapeName: 'qwen-thinking.ts',
      typesFilePath: TYPES_FILE,
      expectShapeDiff: false,
    });
    expect(verdict.valid).toBe(true);
    expect(verdict.violations).toHaveLength(0);
    expect(verdict.candidateShapeFileSha).toBe(BASELINE_SHAPE_SHAS['qwen-thinking.ts']);
  });

  it('Gen 0 baseline FAILS validation if expectShapeDiff=true (identity violation)', () => {
    const verdict = validateCandidate({
      candidateShapeFilePath: path.join(PROMPT_SHAPES_DIR, 'qwen-thinking.ts'),
      baselineShapeName: 'qwen-thinking.ts',
      typesFilePath: TYPES_FILE,
      expectShapeDiff: true,
    });
    expect(verdict.valid).toBe(false);
    expect(verdict.violations.some(v => v.category === 'shape_file_unchanged_from_baseline')).toBe(true);
  });
});

describe('validateCandidate — types.ts boundary violation detection', () => {
  it('FAILS if types.ts SHA differs from pinned baseline', () => {
    const tmpTypes = path.join(os.tmpdir(), `types-modified-${Date.now()}.ts`);
    const original = fs.readFileSync(TYPES_FILE, 'utf-8');
    fs.writeFileSync(tmpTypes, original + '\n// MODIFIED\n');
    try {
      const verdict = validateCandidate({
        candidateShapeFilePath: path.join(PROMPT_SHAPES_DIR, 'qwen-thinking.ts'),
        baselineShapeName: 'qwen-thinking.ts',
        typesFilePath: tmpTypes,
        expectShapeDiff: false,
      });
      expect(verdict.valid).toBe(false);
      expect(verdict.violations.some(v => v.category === 'types_file_modified')).toBe(true);
    } finally {
      fs.unlinkSync(tmpTypes);
    }
  });

  it('FAILS if MULTI_STEP_ACTION_CONTRACT bytes are modified', () => {
    const tmpTypes = path.join(os.tmpdir(), `types-contract-modified-${Date.now()}.ts`);
    const original = fs.readFileSync(TYPES_FILE, 'utf-8');
    const modified = original.replace(
      'Output exactly ONE JSON object',
      'Output exactly TWO JSON objects',  // single-byte tweak in the contract
    );
    fs.writeFileSync(tmpTypes, modified);
    try {
      const verdict = validateCandidate({
        candidateShapeFilePath: path.join(PROMPT_SHAPES_DIR, 'qwen-thinking.ts'),
        baselineShapeName: 'qwen-thinking.ts',
        typesFilePath: tmpTypes,
        expectShapeDiff: false,
      });
      expect(verdict.valid).toBe(false);
      expect(verdict.violations.some(v => v.category === 'multi_step_action_contract_modified')).toBe(true);
    } finally {
      fs.unlinkSync(tmpTypes);
    }
  });
});

describe('validateCandidate — shape file metadata + imports validation', () => {
  it('FAILS if locked metadata field is missing from candidate', () => {
    const tmpShape = path.join(os.tmpdir(), `qwen-thinking-bad-${Date.now()}.ts`);
    const original = fs.readFileSync(path.join(PROMPT_SHAPES_DIR, 'qwen-thinking.ts'), 'utf-8');
    // Strip out modelClass: line entirely. Use \r?\n to handle both LF and CRLF
    // line endings — git on Windows may check out files with CRLF.
    const stripped = original.replace(/modelClass:.*\r?\n/, '');
    expect(stripped).not.toContain('modelClass:');  // sanity: stripping actually worked
    fs.writeFileSync(tmpShape, stripped);
    try {
      const verdict = validateCandidate({
        candidateShapeFilePath: tmpShape,
        baselineShapeName: 'qwen-thinking.ts',
        typesFilePath: TYPES_FILE,
        expectShapeDiff: true,
      });
      expect(verdict.valid).toBe(false);
      expect(verdict.violations.some(v => v.category === 'shape_file_metadata_locked_field_modified')).toBe(true);
    } finally {
      fs.unlinkSync(tmpShape);
    }
  });

  it('FAILS if imports block is removed', () => {
    const tmpShape = path.join(os.tmpdir(), `qwen-thinking-noimport-${Date.now()}.ts`);
    const original = fs.readFileSync(path.join(PROMPT_SHAPES_DIR, 'qwen-thinking.ts'), 'utf-8');
    const stripped = original.replace(/from '\.\/types\.js'/, "from './SOMETHING_ELSE.js'");
    fs.writeFileSync(tmpShape, stripped);
    try {
      const verdict = validateCandidate({
        candidateShapeFilePath: tmpShape,
        baselineShapeName: 'qwen-thinking.ts',
        typesFilePath: TYPES_FILE,
        expectShapeDiff: true,
      });
      expect(verdict.valid).toBe(false);
      expect(verdict.violations.some(v => v.category === 'shape_file_imports_modified')).toBe(true);
    } finally {
      fs.unlinkSync(tmpShape);
    }
  });
});

describe('validateCandidate — accepts valid Gen 1 mutation', () => {
  it('Gen 1 candidate with body-only mutation passes validation', () => {
    const tmpShape = path.join(os.tmpdir(), `qwen-thinking-mutation-${Date.now()}.ts`);
    const original = fs.readFileSync(path.join(PROMPT_SHAPES_DIR, 'qwen-thinking.ts'), 'utf-8');
    // Realistic-shape mutation: change a string in the body, keep imports + metadata + structure
    const mutated = original.replace(
      'Answer the question precisely and substantively',
      'Answer the question precisely, substantively, and with explicit retrieval',
    );
    expect(mutated).not.toBe(original);  // sanity: mutation actually changed bytes
    fs.writeFileSync(tmpShape, mutated);
    try {
      const verdict = validateCandidate({
        candidateShapeFilePath: tmpShape,
        baselineShapeName: 'qwen-thinking.ts',
        typesFilePath: TYPES_FILE,
        expectShapeDiff: true,
      });
      expect(verdict.valid).toBe(true);
      expect(verdict.candidateShapeFileSha).not.toBe(BASELINE_SHAPE_SHAS['qwen-thinking.ts']);
    } finally {
      fs.unlinkSync(tmpShape);
    }
  });
});
