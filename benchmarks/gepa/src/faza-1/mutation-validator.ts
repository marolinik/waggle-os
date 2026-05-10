/**
 * GEPA Faza 1 — mutation validator (cell-semantic preservation audit).
 *
 * Per launch decision §A.4 (binding) + manifest v7 §gepa.mutation_validator.
 *
 * Boundary anchor: MULTI_STEP_ACTION_CONTRACT constant in
 * packages/agent/src/prompt-shapes/types.ts.
 *   - whole-file SHA: 1a9fa329e4b66ed9f0abe8bc22cbbf0124e0c879e1e78ec806d557cab25bc94d
 *   - constant body bytes SHA: 70a1701dfa126f8dc1df9c116f0a8469da005821ecadc59d9b8f348568e755ba (252 bytes)
 *
 * Any GEPA candidate that produces non-zero diff against either anchor → INVALID.
 *
 * Allowed diff targets (per manifest v7 §gepa.mutation_validator.valid_diff_targets):
 *   - shape_file.systemPrompt method body (string-building only)
 *   - shape_file.soloUserPrompt method body
 *   - shape_file.multiStepKickoffUserPrompt method body
 *   - shape_file.retrievalInjectionUserPrompt method body
 *   - shape_file.metadata.evidence_link (MUST update to point to GEPA Gen 1 results)
 *
 * Invalid diff targets (LOCKED):
 *   - types.ts (entire file)
 *   - selector.ts (entire file)
 *   - index.ts (entire file)
 *   - shape_file.metadata.{description,modelClass,defaultThinking,defaultMaxTokens}
 *   - shape_file.imports
 *   - MULTI_STEP_ACTION_CONTRACT bytes
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';

/**
 * Cell-semantic boundary SHAs pinned at substrate anchor commit c9bda3d.
 * These are the byte-level invariants that any GEPA candidate must preserve.
 */
export const BOUNDARY_SHAS = {
  /** Whole types.ts file SHA (must equal this exactly post-mutation). */
  typesFile: '1a9fa329e4b66ed9f0abe8bc22cbbf0124e0c879e1e78ec806d557cab25bc94d',
  /** MULTI_STEP_ACTION_CONTRACT constant body bytes SHA (252 bytes). */
  multiStepActionContract: '70a1701dfa126f8dc1df9c116f0a8469da005821ecadc59d9b8f348568e755ba',
} as const;

/** Per-shape baseline SHAs pinned at substrate anchor commit c9bda3d. */
export const BASELINE_SHAPE_SHAS: Readonly<Record<string, string>> = {
  'claude.ts': 'cbaf0c37b067b025a1fe97f2feeec11fae4070a8b3fcfaad1da8775dda451cc0',
  'qwen-thinking.ts': '848a4e4917baa5c7bbcc3bb35fb8cb4b4ac8f0ab537243f14cbef3a99197aacb',
  'qwen-non-thinking.ts': '35be379be9a8caafc2c419e32da5f63f92fc83f6f6d70d9df76029c1e8584572',
  'gpt.ts': '5dc6d750d52a68feb9d37ad8384b2bcd59d70962066122ff086b0e5888413576',
  'generic-simple.ts': '81189817f560e26a69394248d8bd9089cae72c7d40825323e2b7407e36026172',
} as const;

/** Validator verdict for a single candidate. */
export interface ValidatorVerdict {
  valid: boolean;
  /** List of violations (empty if valid). Each violation is a structured reason. */
  violations: ValidationViolation[];
  /** SHA of the candidate shape file (computed by validator). */
  candidateShapeFileSha: string;
  /** SHA of the cell-semantic types.ts file at validation time. */
  typesFileSha: string;
  /** SHA of the MULTI_STEP_ACTION_CONTRACT bytes at validation time. */
  multiStepActionContractSha: string;
}

export interface ValidationViolation {
  category:
    | 'types_file_modified'
    | 'multi_step_action_contract_modified'
    | 'shape_file_unchanged_from_baseline'
    | 'shape_file_metadata_locked_field_modified'
    | 'shape_file_imports_modified';
  severity: 'invalid';
  detail: string;
}

/** Compute SHA-256 of a string's UTF-8 bytes. */
export function sha256(bytes: string | Buffer): string {
  const buf = typeof bytes === 'string' ? Buffer.from(bytes, 'utf-8') : bytes;
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/** Compute SHA-256 of a file's bytes. */
export function sha256File(filepath: string): string {
  return sha256(fs.readFileSync(filepath));
}

/**
 * Extract the bytes of MULTI_STEP_ACTION_CONTRACT from a types.ts file content.
 * Returns null if the constant is not found (which itself indicates a violation).
 */
export function extractMultiStepActionContractBytes(typesFileContent: string): string | null {
  // Match the template literal body between backticks.
  const match = typesFileContent.match(/export const MULTI_STEP_ACTION_CONTRACT = `([^`]+)`/);
  return match ? match[1] : null;
}

/** Inputs for validating a GEPA candidate against cell-semantic boundaries. */
export interface ValidatorInputs {
  /** Path to the candidate shape file (e.g., gepa-evolved/qwen-thinking-gen1-v0.ts). */
  candidateShapeFilePath: string;
  /** Shape file basename for baseline lookup (e.g., 'qwen-thinking.ts'). */
  baselineShapeName: keyof typeof BASELINE_SHAPE_SHAS;
  /** Path to the types.ts file (cell-semantic boundary anchor). */
  typesFilePath: string;
  /** Whether to require shape file to differ from baseline (true for Gen 1 mutations). */
  expectShapeDiff: boolean;
}

/**
 * Validate a GEPA candidate against the cell-semantic preservation invariants.
 *
 * Returns INVALID with structured violations if any boundary anchor is breached,
 * or if a Gen 1 mutation produces zero diff vs baseline (violates the
 * "every mutation must change something" implicit contract — Gen 0 baselines
 * use expectShapeDiff=false).
 */
export function validateCandidate(inputs: ValidatorInputs): ValidatorVerdict {
  const violations: ValidationViolation[] = [];

  const typesFileSha = sha256File(inputs.typesFilePath);
  const typesContent = fs.readFileSync(inputs.typesFilePath, 'utf-8');
  const contractBytes = extractMultiStepActionContractBytes(typesContent);
  const multiStepActionContractSha = contractBytes ? sha256(contractBytes) : '';
  const candidateShapeFileSha = sha256File(inputs.candidateShapeFilePath);

  if (typesFileSha !== BOUNDARY_SHAS.typesFile) {
    violations.push({
      category: 'types_file_modified',
      severity: 'invalid',
      detail: `types.ts SHA ${typesFileSha} != pinned baseline ${BOUNDARY_SHAS.typesFile}`,
    });
  }

  if (multiStepActionContractSha !== BOUNDARY_SHAS.multiStepActionContract) {
    violations.push({
      category: 'multi_step_action_contract_modified',
      severity: 'invalid',
      detail:
        contractBytes === null
          ? 'MULTI_STEP_ACTION_CONTRACT constant not found in types.ts'
          : `MULTI_STEP_ACTION_CONTRACT bytes SHA ${multiStepActionContractSha} != pinned baseline ${BOUNDARY_SHAS.multiStepActionContract}`,
    });
  }

  const baselineSha = BASELINE_SHAPE_SHAS[inputs.baselineShapeName];
  if (inputs.expectShapeDiff && candidateShapeFileSha === baselineSha) {
    violations.push({
      category: 'shape_file_unchanged_from_baseline',
      severity: 'invalid',
      detail: `Gen 1 mutation expected to differ from baseline ${inputs.baselineShapeName} (SHA ${baselineSha}) but candidate produced identical bytes`,
    });
  }

  // Optional shallow check: locked metadata fields must remain in the shape file.
  // GEPA mutations are allowed to update evidence_link only.
  const candidateContent = fs.readFileSync(inputs.candidateShapeFilePath, 'utf-8');
  const lockedMetadataFields = [
    'description:',
    'modelClass:',
    'defaultThinking:',
    'defaultMaxTokens:',
  ];
  for (const field of lockedMetadataFields) {
    if (!candidateContent.includes(field)) {
      violations.push({
        category: 'shape_file_metadata_locked_field_modified',
        severity: 'invalid',
        detail: `Locked metadata field "${field}" missing from candidate shape file`,
      });
    }
  }

  // Check that imports block is still present (GEPA mutations cannot add/remove imports).
  // Accept either './types.js' (same-dir candidate) or '../types.js' (gepa-evolved/ subdir
  // candidate per manifest v7 §gepa.shape_scope.target_path) — the invariant is that
  // candidates must import from types.js, not the specific relative path.
  const importsTypes = candidateContent.includes("from './types.js'") ||
                       candidateContent.includes("from '../types.js'");
  if (!importsTypes) {
    violations.push({
      category: 'shape_file_imports_modified',
      severity: 'invalid',
      detail: `Required import from "types.js" (either "./" or "../" relative) missing from candidate shape file`,
    });
  }

  return {
    valid: violations.length === 0,
    violations,
    candidateShapeFileSha,
    typesFileSha,
    multiStepActionContractSha,
  };
}
