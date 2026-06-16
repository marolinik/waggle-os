/**
 * Pre-registration checklist (01-DESIGN-SPEC §9; 03-REDTEAM C8).
 *
 * The final gate before a priced run: confirm the code is FROZEN at a SHA
 * (clean working tree + captured short SHA) and emit the manifest-hash audit
 * anchor (via the existing preregistration emitter). A dirty tree blocks the
 * run — a priced run whose code changed mid-flight is not reproducible.
 *
 * The git probe is injected (no shell-out inside this pure unit) so it is
 * testable; the default probe used by the runner is `defaultGitProbe` below.
 */
import { execFileSync } from 'node:child_process';
import {
  emitPreregistrationManifest,
  type PreregistrationManifestPayload,
} from '../preregistration.js';

export interface GitState {
  /** True iff `git status --porcelain` is empty. */
  clean: boolean;
  /** Short HEAD SHA the run is frozen at. */
  sha: string;
}

/** Probe seam — overridable in tests. Default reads real git state. */
export type GitProbe = () => GitState;

export interface PreregChecklistInput {
  manifest: PreregistrationManifestPayload;
  /** Sink for the manifest-hash event. Default in the runner = the real
   *  preregistration emitter. Injected here so tests can spy. */
  emit?: (payload: PreregistrationManifestPayload) => void;
  /** Git-state probe. Injected so tests don't shell out. */
  probeGit?: GitProbe;
}

export interface PreregChecklistResult {
  pass: boolean;
  tree_clean: boolean;
  frozen_sha: string;
  manifest_hash: string;
  reason: string;
}

/** Real git probe: clean iff `git status --porcelain` is empty; sha from
 *  `git rev-parse --short HEAD`. No shell (execFileSync), hardcoded argv. */
export function defaultGitProbe(cwd: string = process.cwd()): GitState {
  const status = execFileSync('git', ['status', '--porcelain'], {
    cwd, stdio: ['ignore', 'pipe', 'ignore'], timeout: 4000,
  }).toString();
  const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd, stdio: ['ignore', 'pipe', 'ignore'], timeout: 4000,
  }).toString().trim();
  return { clean: status.trim().length === 0, sha };
}

export function runPreregChecklist(input: PreregChecklistInput): PreregChecklistResult {
  const { manifest } = input;
  if (!/^[0-9a-f]{64}$/.test(manifest.manifest_hash)) {
    throw new Error(`prereg checklist requires a 64-hex manifest_hash; got ${manifest.manifest_hash}`);
  }
  const probeGit = input.probeGit ?? (() => defaultGitProbe());
  const emit = input.emit ?? emitPreregistrationManifest;

  const git = probeGit();
  if (!git.clean) {
    return {
      pass: false,
      tree_clean: false,
      frozen_sha: git.sha,
      manifest_hash: manifest.manifest_hash,
      reason: `working tree is not clean — freeze the code (commit/stash) before the priced run; current SHA ${git.sha}`,
    };
  }

  emit(manifest);
  return {
    pass: true,
    tree_clean: true,
    frozen_sha: git.sha,
    manifest_hash: manifest.manifest_hash,
    reason: `code frozen at ${git.sha}; manifest ${manifest.manifest_hash} emitted`,
  };
}
