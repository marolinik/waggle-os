#!/usr/bin/env tsx
/**
 * Pre-priced-run pre-flight gate (Plan 09).
 *
 * Runs the prereg checklist (§9: code frozen at a SHA) + every ruler-validation
 * (D6) and returns an overall PASS/FAIL. The priced run MUST NOT start unless
 * this is green. The pure `runPreflight` is wrapped by a thin CLI that maps the
 * verdict to a process exit code (0 = clear, 1 = blocked).
 *
 * The firewall (C8) runs INSIDE the priced run per-artifact (it needs the
 * artifacts the run builds), so it is not part of this static pre-flight — it
 * is exercised by the e2e smoke. Pre-flight is the static gate: ruler + freeze.
 */
import fs from 'node:fs';
import url from 'node:url';
import path from 'node:path';
import {
  runPreregChecklist, defaultGitProbe,
  type GitProbe, type PreregChecklistResult,
} from './prereg-checklist.js';
import { validateRuler, type RulerSpec, type RulerVerdict } from './ruler-validation.js';
import type { PreregistrationManifestPayload } from '../preregistration.js';

export interface PreflightRuler {
  spec: RulerSpec;
  /** Measured score from the native-distribution reproduction run. */
  measured: number;
}

export interface PreflightInput {
  manifest: PreregistrationManifestPayload;
  rulers: readonly PreflightRuler[];
  /** Manifest-event sink (default = real emitter via prereg checklist). */
  emit?: (payload: PreregistrationManifestPayload) => void;
  /** Git probe (default = real git). Injected for tests. */
  probeGit?: GitProbe;
}

export interface PreflightResult {
  pass: boolean;
  prereg: PreregChecklistResult;
  rulers: RulerVerdict[];
}

export function runPreflight(input: PreflightInput): PreflightResult {
  const prereg = runPreregChecklist({
    manifest: input.manifest, emit: input.emit, probeGit: input.probeGit,
  });
  const rulers = input.rulers.map(r => validateRuler(r.spec, r.measured));
  const pass = prereg.pass && rulers.every(r => r.pass);
  return { pass, prereg, rulers };
}

// ── Thin CLI ────────────────────────────────────────────────────────────────
// Usage: tsx src/gate/preflight.ts --manifest <path.json> --rulers <path.json>
// Both JSON files are operator-authored. --manifest = a PreregistrationManifest-
// Payload; --rulers = an array of { spec: RulerSpec, measured: number }.

function cli(argv: string[]): number {
  let manifestPath: string | undefined;
  let rulersPath: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--manifest') { manifestPath = argv[++i]; }
    else if (argv[i] === '--rulers') { rulersPath = argv[++i]; }
  }
  if (!manifestPath || !rulersPath) {
    console.error('[gate:preflight] usage: preflight --manifest <path.json> --rulers <path.json>');
    return 2;
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as PreregistrationManifestPayload;
  const rulers = JSON.parse(fs.readFileSync(rulersPath, 'utf-8')) as PreflightRuler[];
  const result = runPreflight({ manifest, rulers, probeGit: () => defaultGitProbe() });
  console.log(
    `[gate:preflight] pass=${result.pass} prereg=${result.prereg.pass} ` +
    `frozen_sha=${result.prereg.frozen_sha} ` +
    `rulers=${result.rulers.map(r => `${r.substrate}/${r.split}:${r.pass}`).join(',')}`,
  );
  if (!result.pass) {
    console.error('[gate:preflight] BLOCKED — do NOT start the priced run.');
    if (!result.prereg.pass) console.error(`  prereg: ${result.prereg.reason}`);
    for (const r of result.rulers) if (!r.pass) console.error(`  ruler: ${r.reason}`);
  }
  return result.pass ? 0 : 1;
}

// Canonical repo idiom (matches runner.ts): run the CLI iff this file is the
// process entrypoint.
const isMain =
  typeof process !== 'undefined' && Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  url.fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  try {
    process.exit(cli(process.argv.slice(2)));
  } catch (err) {
    console.error('[gate:preflight] error', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
