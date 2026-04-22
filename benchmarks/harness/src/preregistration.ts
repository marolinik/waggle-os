/**
 * Sprint 12 Task 1 Blocker #3 — Pre-registration event emitter.
 *
 * Emits `bench.preregistration.manifest_hash` once per benchmark run, carrying
 * the SHA-256 of the frozen A3 LOCK manifest YAML, the canonical dataset
 * version (from Session 1 Blocker #1), the CLI-resolved cell + judge-tiebreak
 * choices, and the full judge-model roster with per-model pinning surface
 * annotations (B3 LOCK addendum § 4).
 *
 * H-AUDIT-2 integration: the emitted event IS the audit anchor that ties a
 * benchmark run to the v1 pre-registration doc. Any downstream replication
 * claim verifies that the emitted `manifest_hash` matches the YAML committed
 * to PM-Waggle-OS at the time of the run.
 *
 * Logger choice: uses `createCoreLogger` from `@waggle/core` (the established
 * Waggle structured-log surface; thin console.* wrapper tagged with scope).
 * Brief § 3.1 said "pino event signature" but no `pino` dep exists in the
 * waggle-os workspace; the existing Waggle logger matches the structural
 * contract (scope + message + payload). Surprise flagged in exit ping.
 *
 * YAML parsing: this module reads the manifest YAML file as bytes (SHA-256)
 * and regex-extracts `locked_date:` to populate `manifest_locked_at`. No
 * YAML parser dependency introduced per R4 verification (no `js-yaml` or
 * `yaml` package available).
 */

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createCoreLogger } from '@waggle/core';

// ── Scope / constants ─────────────────────────────────────────────────────

/** Canonical manifest path (PM-Waggle-OS-relative) emitted on the event
 *  payload. This is a reference string, not a runtime lookup path — the
 *  actual filesystem path used to compute the hash is resolved separately
 *  via `resolveManifestPath()`. */
export const CANONICAL_MANIFEST_PATH = 'decisions/2026-04-22-bench-spec-locked.manifest.yaml';

/** Event name emitted on the pre-registration pino-style event. */
export const PREREGISTRATION_EVENT_NAME = 'bench.preregistration.manifest_hash';

/** Fallback runner version when git is unavailable. */
export const RUNNER_VERSION_FALLBACK = 'unknown';

/** Scoped logger. One per module load; cheap to re-use. */
const log = createCoreLogger('bench.preregistration');

// ── Types ─────────────────────────────────────────────────────────────────

export type PinningSurface = 'anthropic_immutable' | 'floating_alias' | 'revision_hash_pinned';

export interface JudgeModelManifestEntry {
  model_id: string;
  provider: string;
  judge_role: 'primary' | 'secondary' | 'tertiary';
  pinning_surface: PinningSurface;
  pinning_surface_carve_out_reason: string | null;
}

export interface PreregistrationManifestPayload {
  // Bench-spec lock
  manifest_hash: string;
  manifest_path: string;
  manifest_locked_at: string;

  // Canonical dataset
  dataset_version: string;
  dataset_path: string;
  dataset_instance_count: number;

  // CLI choices
  per_cell: string[];
  judge_tiebreak: string;
  judge_models: JudgeModelManifestEntry[];

  // Provenance
  emitted_at: string;
  runner_version: string;
  runner_invocation: {
    argv: string[];
    cwd: string;
  };
}

/** Thrown when the manifest YAML can't be located and no explicit hash
 *  was provided via CLI. */
export class ManifestNotFoundError extends Error {
  constructor(public readonly attemptedPaths: string[]) {
    super(
      `Pre-registration manifest YAML not found. Tried:\n` +
      attemptedPaths.map(p => `  - ${p}`).join('\n') +
      `\nSet BENCH_SPEC_MANIFEST_PATH or pass --manifest-hash <sha> explicitly.`,
    );
    this.name = 'ManifestNotFoundError';
  }
}

// ── Path resolution ───────────────────────────────────────────────────────

/**
 * Default lookup order for the manifest YAML:
 *   1. `BENCH_SPEC_MANIFEST_PATH` env var (absolute or cwd-relative)
 *   2. Sibling-repo default `../PM-Waggle-OS/decisions/2026-04-22-bench-spec-locked.manifest.yaml`
 *   3. Throw `ManifestNotFoundError`
 *
 * Exposed for tests — pass `override` to force a specific path (tests use
 * tmp fixtures).
 */
export function resolveManifestPath(override?: string): string {
  const tried: string[] = [];

  if (override) {
    const resolved = path.isAbsolute(override) ? override : path.resolve(process.cwd(), override);
    tried.push(resolved);
    if (fs.existsSync(resolved)) return resolved;
    throw new ManifestNotFoundError(tried);
  }

  const envPath = process.env.BENCH_SPEC_MANIFEST_PATH;
  if (envPath) {
    const resolved = path.isAbsolute(envPath) ? envPath : path.resolve(process.cwd(), envPath);
    tried.push(resolved);
    if (fs.existsSync(resolved)) return resolved;
  }

  const siblingDefault = path.resolve(
    process.cwd(),
    '..',
    'PM-Waggle-OS',
    'decisions',
    '2026-04-22-bench-spec-locked.manifest.yaml',
  );
  tried.push(siblingDefault);
  if (fs.existsSync(siblingDefault)) return siblingDefault;

  throw new ManifestNotFoundError(tried);
}

// ── Hash + metadata extraction ────────────────────────────────────────────

/**
 * SHA-256 hex of the bench-spec manifest YAML bytes. Pure byte hash — no
 * YAML parsing. The hash stability invariant mirrors the dataset archive
 * invariant from Session 1 Blocker #1.
 */
export function computeBenchSpecManifestHash(manifestPath?: string): string {
  const resolved = resolveManifestPath(manifestPath);
  const buf = fs.readFileSync(resolved);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/**
 * Regex-extract the `locked_date:` field from the manifest YAML and
 * normalize to ISO-8601. A3 LOCK YAML writes `locked_date: 2026-04-22`
 * (date-only); we pad to `2026-04-22T00:00:00Z` for payload conformance.
 *
 * No YAML parser dep — regex is safe for this stable single-line field
 * per A3 LOCK v1 format. If the format changes (YAML parser reshuffles
 * keys, block scalar, etc.), the regex falls back to 'unknown' rather
 * than throwing.
 */
export function readManifestLockedDate(manifestPath?: string): string {
  const resolved = resolveManifestPath(manifestPath);
  const content = fs.readFileSync(resolved, 'utf-8');
  const match = content.match(/^locked_date:\s*(\S+)/m);
  if (!match) return 'unknown';
  const dateStr = match[1].trim();
  // If already ISO-8601 (YYYY-MM-DDTHH:MM:SSZ), pass through.
  if (/^\d{4}-\d{2}-\d{2}T/.test(dateStr)) return dateStr;
  // YYYY-MM-DD → ISO-8601 midnight UTC.
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return `${dateStr}T00:00:00Z`;
  return dateStr;
}

// ── Runner version ────────────────────────────────────────────────────────

/**
 * Git short SHA of the runner's working tree, or the fallback when git
 * is unavailable. Uses `execFileSync` (no shell) — arguments are hardcoded,
 * no injection surface.
 */
export function getRunnerVersion(): string {
  try {
    const out = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2000,
    });
    return out.toString().trim() || RUNNER_VERSION_FALLBACK;
  } catch {
    return RUNNER_VERSION_FALLBACK;
  }
}

// ── Emitter ───────────────────────────────────────────────────────────────

/**
 * Emit the pre-registration manifest hash event once per benchmark run.
 * Expected call site: `runner.ts::runOne()`, before the first cell
 * iteration. Zero-side-effects beyond the structured log line.
 *
 * No throw path — logging failure is swallowed (logger is a console wrapper,
 * so the failure mode is effectively never hit). Payload construction is
 * the caller's responsibility; this function trusts its input.
 */
export function emitPreregistrationManifest(payload: PreregistrationManifestPayload): void {
  log.info(PREREGISTRATION_EVENT_NAME, { ...payload, event: PREREGISTRATION_EVENT_NAME });
}

// ── Argv sanitization (export-only for tests) ─────────────────────────────

/**
 * Return a copy of `process.argv` with any argument that looks like an
 * API key or bearer token replaced by '[REDACTED]'. The preregistration
 * payload carries the full argv for provenance — keys and tokens cannot
 * leak into the audit trail.
 *
 * Matches: values after `--api-key`, `--bearer`, `--token`, `--key`, or
 * containing substrings `sk-*`, `Bearer *`.
 */
export function sanitizeArgv(argv: readonly string[]): string[] {
  const REDACT_AFTER = new Set(['--api-key', '--bearer', '--token', '--key']);
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (REDACT_AFTER.has(arg) && i + 1 < argv.length) {
      out.push(arg, '[REDACTED]');
      i++;
      continue;
    }
    if (/^sk-[A-Za-z0-9_-]+/.test(arg) || /^Bearer\s+/i.test(arg)) {
      out.push('[REDACTED]');
      continue;
    }
    out.push(arg);
  }
  return out;
}
