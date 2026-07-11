/**
 * #15 skill requirement badges (v1, badge-only): check whether a skill's
 * declared prerequisites (`requires: { env, bins }` frontmatter) are present
 * on this machine. Presence booleans only — values are never read, logged,
 * or surfaced. No prompt gating: an unsatisfied skill stays active; the UI
 * shows an amber "setup needed" badge instead.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseSkillFrontmatter } from './skill-frontmatter.js';

const execFileAsync = promisify(execFile);

/** Normalized requirements — both lists always present (possibly empty). */
export interface SkillRequirements {
  env: string[];
  bins: string[];
}

/** Result of a presence check against the local environment. */
export interface SkillRequirementsStatus {
  satisfied: boolean;
  missingEnv: string[];
  missingBins: string[];
}

/** Injectable seams for tests. All optional — production defaults below. */
export interface SkillRequirementDeps {
  /** Is this env/vault key available? Default: `key in process.env`. */
  hasEnv?: (key: string) => boolean;
  /** Is this executable on PATH? Default: where.exe/which lookup. */
  hasBin?: (name: string) => Promise<boolean>;
  /** Clock for the bin-lookup TTL cache. Default: Date.now. */
  now?: () => number;
}

/**
 * Extract a skill's declared requirements from its raw markdown content.
 * Returns null when the skill declares none (no `requires:` block, or empty).
 */
export function extractSkillRequirements(content: string): SkillRequirements | null {
  const { frontmatter } = parseSkillFrontmatter(content);
  const env = frontmatter.requires?.env ?? [];
  const bins = frontmatter.requires?.bins ?? [];
  if (env.length === 0 && bins.length === 0) return null;
  return { env, bins };
}

// Default bin lookup — adapted from tool-detection.ts defaultPathFromEnv
// (module-private there; ~10 copied lines beat widening that file's export
// surface). execFile with shell:false — bin names are never shell-expanded.
async function defaultHasBin(name: string): Promise<boolean> {
  const cmd = process.platform === 'win32' ? 'where.exe' : 'which';
  try {
    const { stdout } = await execFileAsync(cmd, [name], {
      timeout: 3000,
      shell: false,
    });
    return stdout.split(/\r?\n/).some((l) => l.trim().length > 0);
  } catch {
    return false;
  }
}

// Bin lookups shell out (where.exe/which) — cache per name so a Skills Hub
// poll doesn't spawn a process per skill per fetch. Env checks stay fresh
// (they're an in-memory lookup).
const BIN_CACHE_TTL_MS = 5 * 60_000;
const binCache = new Map<string, { present: boolean; at: number }>();

/**
 * Drop all cached bin lookups. Called from POST /api/vault so a setup change
 * is reflected on the next GET /api/skills instead of after the TTL.
 */
export function clearSkillRequirementsCache(): void {
  binCache.clear();
}

async function cachedHasBin(
  name: string,
  hasBin: (n: string) => Promise<boolean>,
  now: () => number,
): Promise<boolean> {
  const hit = binCache.get(name);
  if (hit && now() - hit.at < BIN_CACHE_TTL_MS) return hit.present;
  const present = await hasBin(name);
  binCache.set(name, { present, at: now() });
  return present;
}

/**
 * Check declared requirements against the local environment.
 * Never throws — a failed bin lookup reads as "missing".
 */
export async function checkSkillRequirements(
  reqs: SkillRequirements,
  deps: SkillRequirementDeps = {},
): Promise<SkillRequirementsStatus> {
  const hasEnv = deps.hasEnv ?? ((k: string) => k in process.env);
  const hasBin = deps.hasBin ?? defaultHasBin;
  const now = deps.now ?? Date.now;

  const missingEnv = reqs.env.filter((k) => !hasEnv(k));
  const missingBins: string[] = [];
  for (const bin of reqs.bins) {
    if (!(await cachedHasBin(bin, hasBin, now))) missingBins.push(bin);
  }

  return {
    satisfied: missingEnv.length === 0 && missingBins.length === 0,
    missingEnv,
    missingBins,
  };
}
