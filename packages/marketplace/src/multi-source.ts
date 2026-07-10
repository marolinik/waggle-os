/**
 * Multi-source skill resolver (steal #11 — SKILLS ONLY).
 *
 * Resolves a user-supplied source string to the raw bytes of a single SKILL.md,
 * using an ordered grammar (first match wins):
 *
 *   1. direct SKILL.md URL   — any http(s) `*.md` URL on a non-github host
 *   2. GitHub URL            — github.com/owner/repo[/blob|tree/<ref>/<path>]
 *   3. owner/repo[#subpath]  — shorthand → raw.githubusercontent.com (main→master)
 *   4. .zip URL              — fetch archive, extract the SKILL.md
 *
 * Everything else is rejected: local paths, `git@`/`ssh://`, `file:`, tar
 * archives, and arbitrary non-`.md` URLs. This resolver NEVER writes to disk and
 * NEVER installs plugins or MCP servers (those paths run npm/git and are out of
 * scope). The caller runs the security pipeline (SecurityGate → injection scan →
 * frontmatter) and lands the result as a held approval before anything persists.
 *
 * Every outbound fetch goes through the injected {@link FetchFn} — the server
 * injects an SSRF-guarded fetch so an attacker-influenced URL cannot reach an
 * internal / link-local host.
 */

import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { sep as pathSep, normalize as pathNormalize, join as pathJoin } from 'node:path';
import { tmpdir } from 'node:os';
import { type FetchFn, defaultFetch } from './fetcher';

export type SkillSourceType = 'skill-md-url' | 'github-url' | 'owner-repo' | 'zip-url';

export interface ResolvedSkillSource {
  /** Raw SKILL.md bytes decoded as UTF-8. */
  content: string;
  /** Which grammar branch matched. */
  sourceType: SkillSourceType;
  /** The concrete URL the content was fetched from. */
  resolvedUrl: string;
}

/** A single zip entry — the slice of adm-zip's API this resolver uses. */
export interface ZipEntry {
  entryName: string;
  isDirectory: boolean;
  getData(): Buffer;
}

/** Lists the entries of a zip archive. Injectable so tests need no adm-zip. */
export type ZipExtractor = (zip: Buffer) => ZipEntry[];

export interface ResolveOptions {
  /** SHA-256 (hex) enforced against the fetched artifact when provided. */
  sha256?: string;
  /** Injected fetch (SSRF-guarded in production; global fetch by default). */
  fetchImpl?: FetchFn;
  /** Injected zip entry-lister (tests); defaults to adm-zip via runtime require. */
  zipExtractor?: ZipExtractor;
}

/** Thrown for a rejected/invalid source or a failed resolution. */
export class SkillSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SkillSourceError';
  }
}

function truncate(s: string, max = 120): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

// ─── Grammar classification ─────────────────────────────────────────

/** owner/repo[#subpath] shorthand — exactly one slash, no local-path markers. */
function isOwnerRepoShorthand(s: string): boolean {
  if (s.includes('\\') || s.startsWith('/') || s.startsWith('.') || s.startsWith('~')) return false;
  const hashIdx = s.indexOf('#');
  const repoPart = hashIdx === -1 ? s : s.slice(0, hashIdx);
  const subpath = hashIdx === -1 ? '' : s.slice(hashIdx + 1);
  if (!/^[A-Za-z0-9][\w.-]*\/[A-Za-z0-9][\w.-]*$/.test(repoPart)) return false;
  if (subpath) {
    if (subpath.includes('..') || subpath.startsWith('/')) return false;
    if (!/^[\w./-]+$/.test(subpath)) return false;
  }
  return true;
}

/** Classify a source string, or null if it is not an accepted skill source. */
export function classifySource(source: string): SkillSourceType | null {
  const s = source.trim();
  if (!s) return null;
  if (s.startsWith('git@')) return null; // scp-style git remote — rejected

  let url: URL | null = null;
  try {
    url = new URL(s);
  } catch {
    url = null;
  }

  if (url) {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null; // ssh:, file:, git:, …
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();
    if (/\.(tar|tgz)$/.test(path) || /\.tar\.gz$/.test(path)) return null; // tar deferred (symlink pitfalls)
    const isGithub = host === 'github.com' || host === 'www.github.com';
    if (path.endsWith('.md') && !isGithub) return 'skill-md-url';
    if (isGithub) return 'github-url';
    if (path.endsWith('.zip')) return 'zip-url';
    return null; // arbitrary non-.md, non-github, non-zip URL — rejected
  }

  if (isOwnerRepoShorthand(s)) return 'owner-repo';
  return null;
}

// ─── Candidate URL construction (markdown sources) ──────────────────

function githubUrlCandidates(source: string): string[] {
  const u = new URL(source);
  const parts = u.pathname.split('/').filter(Boolean); // [owner, repo, ...]
  const owner = parts[0];
  const repoRaw = parts[1];
  if (!owner || !repoRaw) throw new SkillSourceError(`Invalid GitHub URL: ${truncate(source)}`);
  const repo = repoRaw.replace(/\.git$/, '');
  const rest = parts.slice(2);

  if (rest[0] === 'blob' && rest.length >= 3) {
    const ref = rest[1];
    const filePath = rest.slice(2).join('/');
    return [`https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${filePath}`];
  }
  if (rest[0] === 'tree' && rest.length >= 2) {
    const ref = rest[1];
    const subpath = rest.slice(2).join('/');
    const file = subpath ? `${subpath}/SKILL.md` : 'SKILL.md';
    return [`https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${file}`];
  }
  // Bare repo → try main then master.
  return [
    `https://raw.githubusercontent.com/${owner}/${repo}/main/SKILL.md`,
    `https://raw.githubusercontent.com/${owner}/${repo}/master/SKILL.md`,
  ];
}

function ownerRepoCandidates(source: string): string[] {
  const hashIdx = source.indexOf('#');
  const repoPart = hashIdx === -1 ? source : source.slice(0, hashIdx);
  const subpath = hashIdx === -1 ? '' : source.slice(hashIdx + 1).replace(/^\/+|\/+$/g, '');
  const [owner, repo] = repoPart.split('/');
  const file = subpath ? `${subpath}/SKILL.md` : 'SKILL.md';
  return [
    `https://raw.githubusercontent.com/${owner}/${repo}/main/${file}`,
    `https://raw.githubusercontent.com/${owner}/${repo}/master/${file}`,
  ];
}

// ─── SHA-256 enforcement ────────────────────────────────────────────

function enforceSha(bytes: Buffer, expected?: string): void {
  if (!expected) return;
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual.toLowerCase() !== expected.trim().toLowerCase()) {
    throw new SkillSourceError(`SHA-256 mismatch: expected ${expected.trim()}, got ${actual}.`);
  }
}

// ─── Zip extraction (zip-slip guarded) ──────────────────────────────

/** Boundary root for the resolved-path zip-slip check (never written to). */
const ZIP_DEST_ROOT = pathNormalize(pathJoin(tmpdir(), 'waggle-skill-zip-dest'));

/**
 * True when a zip entry is safe to trust: not absolute, no `..` segment, and its
 * resolved path stays within the sentinel dest boundary. Rejects zip-slip.
 */
export function isSafeZipEntry(entryName: string): boolean {
  const n = (entryName || '').replace(/\\/g, '/');
  if (!n) return false;
  if (n.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(entryName)) return false; // absolute (posix / windows)
  if (n.split('/').some((p) => p === '..')) return false;
  const resolved = pathNormalize(pathJoin(ZIP_DEST_ROOT, n));
  return resolved === ZIP_DEST_ROOT || resolved.startsWith(ZIP_DEST_ROOT + pathSep);
}

interface AdmZipRawEntry {
  entryName: string;
  isDirectory: boolean;
  getData(): Buffer;
}
interface AdmZipInstance {
  getEntries(): AdmZipRawEntry[];
}
type AdmZipConstructor = new (buffer: Buffer) => AdmZipInstance;

let cachedRequire: NodeRequire | null = null;

/** Default zip extractor — loads adm-zip at runtime (optional dep). */
function admZipExtractor(zip: Buffer): ZipEntry[] {
  const req = (cachedRequire ??= createRequire(import.meta.url));
  let AdmZip: AdmZipConstructor;
  try {
    AdmZip = req('adm-zip') as AdmZipConstructor;
  } catch {
    throw new SkillSourceError(
      'Zip skill sources require the optional "adm-zip" package. Install it, or use a SKILL.md/GitHub source.',
    );
  }
  const instance = new AdmZip(zip);
  return instance.getEntries().map((e) => ({
    entryName: e.entryName,
    isDirectory: e.isDirectory,
    getData: () => e.getData(),
  }));
}

/** Depth (segment count) of a zip entry path — used to prefer the shallowest SKILL.md. */
function entryDepth(entryName: string): number {
  return entryName.replace(/\\/g, '/').split('/').filter(Boolean).length;
}

function extractSkillMd(entries: ZipEntry[]): string {
  let picked: ZipEntry | null = null;
  for (const e of entries) {
    // Validate EVERY entry first — a malicious archive is rejected whole, before
    // the junk filter can hide a traversal entry.
    if (!isSafeZipEntry(e.entryName)) {
      throw new SkillSourceError(`Unsafe zip entry "${truncate(e.entryName, 80)}" (path traversal).`);
    }
    if (e.isDirectory) continue;
    const base = e.entryName.replace(/\\/g, '/').split('/').pop() || '';
    if (base.startsWith('.') || e.entryName.startsWith('__MACOSX/')) continue; // junk
    if (base.toLowerCase() === 'skill.md') {
      if (!picked || entryDepth(e.entryName) < entryDepth(picked.entryName)) picked = e;
    }
  }
  if (!picked) throw new SkillSourceError('No SKILL.md found in the zip archive.');
  return picked.getData().toString('utf-8');
}

async function resolveZip(url: string, doFetch: FetchFn, options: ResolveOptions): Promise<ResolvedSkillSource> {
  const res = await doFetch(url);
  if (!res.ok) throw new SkillSourceError(`Failed to fetch zip ${truncate(url)}: ${res.status} ${res.statusText}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  enforceSha(bytes, options.sha256); // sha over the ZIP bytes (UI encourages it here)
  const extractor = options.zipExtractor ?? admZipExtractor;
  const content = extractSkillMd(extractor(bytes));
  return { content, sourceType: 'zip-url', resolvedUrl: url };
}

async function resolveMarkdown(
  kind: Exclude<SkillSourceType, 'zip-url'>,
  source: string,
  doFetch: FetchFn,
  options: ResolveOptions,
): Promise<ResolvedSkillSource> {
  const candidates =
    kind === 'skill-md-url' ? [source]
      : kind === 'github-url' ? githubUrlCandidates(source)
        : ownerRepoCandidates(source);

  let lastStatus = 0;
  for (const url of candidates) {
    // A thrown error (SSRF egress block, network failure) propagates — only an
    // HTTP non-ok (e.g. 404 on `main`) falls through to the next candidate.
    const res = await doFetch(url);
    if (res.ok) {
      const bytes = Buffer.from(await res.arrayBuffer());
      enforceSha(bytes, options.sha256);
      return { content: bytes.toString('utf-8'), sourceType: kind, resolvedUrl: url };
    }
    lastStatus = res.status;
  }
  throw new SkillSourceError(
    `Could not fetch SKILL.md from ${truncate(source)} (tried ${candidates.length} location(s); last HTTP ${lastStatus}).`,
  );
}

/**
 * Resolve a source string to raw SKILL.md bytes. Throws {@link SkillSourceError}
 * for a rejected source, a SHA mismatch, an unsafe zip, or a fetch failure.
 */
export async function resolveSkillSource(
  source: string,
  options: ResolveOptions = {},
): Promise<ResolvedSkillSource> {
  const doFetch = options.fetchImpl ?? defaultFetch;
  const trimmed = source.trim();
  const kind = classifySource(trimmed);
  if (!kind) {
    throw new SkillSourceError(
      `Unsupported skill source "${truncate(trimmed)}". Provide a SKILL.md URL, a GitHub URL, `
        + `an owner/repo[#subpath] shorthand, or a .zip URL.`,
    );
  }
  if (kind === 'zip-url') return resolveZip(trimmed, doFetch, options);
  return resolveMarkdown(kind, trimmed, doFetch, options);
}
