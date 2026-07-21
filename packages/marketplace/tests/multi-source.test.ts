/**
 * Multi-source skill resolver — unit tests (steal #11).
 *
 * Covers the ordered grammar (each accepted form + every rejected form),
 * GitHub main→master fallback, SHA-256 enforcement, SSRF propagation (the
 * injected guard's rejection must surface), and the zip-slip guard.
 *
 * No network + no adm-zip: the fetcher and the zip extractor are injected.
 */

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import {
  resolveSkillSource,
  classifySource,
  isSafeZipEntry,
  SkillSourceError,
  type FetchFn,
  type ZipEntry,
} from '../src/index';

// ── Fake responses ───────────────────────────────────────────────────

function textResponse(body: string, ok = true, status = ok ? 200 : 404): Response {
  const bytes = new TextEncoder().encode(body);
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Not Found',
    async arrayBuffer() { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); },
    async text() { return body; },
  } as unknown as Response;
}

function binResponse(buf: Buffer, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: 'OK',
    async arrayBuffer() { return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength); },
  } as unknown as Response;
}

/** A fetcher that maps exact URLs → responses; unknown URLs 404. */
function fetcherFor(map: Record<string, Response>): FetchFn {
  return async (url) => map[url] ?? textResponse('', false, 404);
}

const SKILL = `---
name: demo-skill
description: A demo skill for tests.
---

Do the thing.
`;
const runtimeRequire = createRequire(import.meta.url);

// ── Grammar classification ───────────────────────────────────────────

describe('classifySource', () => {
  it('accepts a direct SKILL.md URL on a non-github host', () => {
    expect(classifySource('https://example.com/path/SKILL.md')).toBe('skill-md-url');
    expect(classifySource('https://raw.githubusercontent.com/o/r/main/SKILL.md')).toBe('skill-md-url');
  });

  it('accepts GitHub URLs', () => {
    expect(classifySource('https://github.com/owner/repo')).toBe('github-url');
    expect(classifySource('https://github.com/owner/repo/blob/main/SKILL.md')).toBe('github-url');
    expect(classifySource('https://github.com/owner/repo/tree/main/skills/demo')).toBe('github-url');
  });

  it('accepts owner/repo[#subpath] shorthand', () => {
    expect(classifySource('owner/repo')).toBe('owner-repo');
    expect(classifySource('owner/repo#skills/demo')).toBe('owner-repo');
  });

  it('accepts a .zip URL', () => {
    expect(classifySource('https://example.com/pkg.zip')).toBe('zip-url');
  });

  it('rejects local paths, git-ssh, tar, and arbitrary URLs', () => {
    expect(classifySource('./local/SKILL.md')).toBeNull();
    expect(classifySource('/etc/passwd')).toBeNull();
    expect(classifySource('../up/SKILL.md')).toBeNull();
    expect(classifySource('~/skills/SKILL.md')).toBeNull();
    expect(classifySource('git@github.com:owner/repo.git')).toBeNull();
    expect(classifySource('ssh://git@github.com/owner/repo')).toBeNull();
    expect(classifySource('file:///etc/passwd')).toBeNull();
    expect(classifySource('https://example.com/pkg.tar.gz')).toBeNull();
    expect(classifySource('https://example.com/pkg.tgz')).toBeNull();
    expect(classifySource('https://example.com/arbitrary')).toBeNull();
    expect(classifySource('owner/repo/extra/segments')).toBeNull();
    expect(classifySource('owner/repo#../escape')).toBeNull();
    expect(classifySource('')).toBeNull();
  });
});

// ── Resolution: markdown-yielding sources ────────────────────────────

describe('resolveSkillSource — markdown sources', () => {
  it('resolves a direct SKILL.md URL', async () => {
    const url = 'https://example.com/SKILL.md';
    const res = await resolveSkillSource(url, { fetchImpl: fetcherFor({ [url]: textResponse(SKILL) }) });
    expect(res.sourceType).toBe('skill-md-url');
    expect(res.content).toContain('name: demo-skill');
    expect(res.resolvedUrl).toBe(url);
  });

  it('resolves a GitHub blob URL to raw.githubusercontent.com', async () => {
    const raw = 'https://raw.githubusercontent.com/owner/repo/main/SKILL.md';
    const res = await resolveSkillSource('https://github.com/owner/repo/blob/main/SKILL.md', {
      fetchImpl: fetcherFor({ [raw]: textResponse(SKILL) }),
    });
    expect(res.resolvedUrl).toBe(raw);
    expect(res.content).toContain('demo-skill');
  });

  it('resolves a GitHub tree URL by appending SKILL.md', async () => {
    const raw = 'https://raw.githubusercontent.com/owner/repo/main/skills/demo/SKILL.md';
    const res = await resolveSkillSource('https://github.com/owner/repo/tree/main/skills/demo', {
      fetchImpl: fetcherFor({ [raw]: textResponse(SKILL) }),
    });
    expect(res.resolvedUrl).toBe(raw);
  });

  it('resolves owner/repo#subpath shorthand', async () => {
    const raw = 'https://raw.githubusercontent.com/owner/repo/main/skills/demo/SKILL.md';
    const res = await resolveSkillSource('owner/repo#skills/demo', {
      fetchImpl: fetcherFor({ [raw]: textResponse(SKILL) }),
    });
    expect(res.sourceType).toBe('owner-repo');
    expect(res.resolvedUrl).toBe(raw);
  });

  it('falls back from main to master for a bare repo', async () => {
    const master = 'https://raw.githubusercontent.com/owner/repo/master/SKILL.md';
    // main 404s, master succeeds
    const res = await resolveSkillSource('owner/repo', {
      fetchImpl: fetcherFor({ [master]: textResponse(SKILL) }),
    });
    expect(res.resolvedUrl).toBe(master);
  });

  it('throws when no candidate returns content', async () => {
    await expect(
      resolveSkillSource('owner/repo', { fetchImpl: fetcherFor({}) }),
    ).rejects.toThrow(SkillSourceError);
  });

  it('rejects an unsupported source', async () => {
    await expect(resolveSkillSource('/etc/passwd')).rejects.toThrow(/Unsupported skill source/);
  });
});

// ── SHA-256 enforcement ──────────────────────────────────────────────

describe('resolveSkillSource — sha256', () => {
  const url = 'https://example.com/SKILL.md';

  it('accepts a matching sha256', async () => {
    const sha = createHash('sha256').update(SKILL, 'utf-8').digest('hex');
    const res = await resolveSkillSource(url, {
      sha256: sha,
      fetchImpl: fetcherFor({ [url]: textResponse(SKILL) }),
    });
    expect(res.content).toContain('demo-skill');
  });

  it('hard-fails on a sha256 mismatch', async () => {
    await expect(
      resolveSkillSource(url, {
        sha256: 'deadbeef'.repeat(8),
        fetchImpl: fetcherFor({ [url]: textResponse(SKILL) }),
      }),
    ).rejects.toThrow(/SHA-256 mismatch/);
  });
});

// ── SSRF propagation ─────────────────────────────────────────────────

describe('resolveSkillSource — SSRF', () => {
  it('propagates the injected guard rejection (private-IP URL blocked)', async () => {
    const guardBlocked: FetchFn = async () => {
      throw new Error('Blocked egress to private address 10.0.0.5');
    };
    await expect(
      resolveSkillSource('https://internal.example.com/SKILL.md', { fetchImpl: guardBlocked }),
    ).rejects.toThrow(/Blocked egress/);
  });
});

// ── Zip source + zip-slip guard ──────────────────────────────────────

function entry(name: string, data = SKILL, isDirectory = false): ZipEntry {
  return { entryName: name, isDirectory, getData: () => Buffer.from(data, 'utf-8') };
}

describe('isSafeZipEntry', () => {
  it('accepts normal nested paths', () => {
    expect(isSafeZipEntry('SKILL.md')).toBe(true);
    expect(isSafeZipEntry('skills/demo/SKILL.md')).toBe(true);
  });
  it('rejects traversal and absolute entries', () => {
    expect(isSafeZipEntry('../SKILL.md')).toBe(false);
    expect(isSafeZipEntry('a/../../etc/passwd')).toBe(false);
    expect(isSafeZipEntry('/etc/passwd')).toBe(false);
    expect(isSafeZipEntry('C:\\Windows\\system32')).toBe(false);
    expect(isSafeZipEntry('')).toBe(false);
  });
});

describe('resolveSkillSource — zip', () => {
  const url = 'https://example.com/pkg.zip';
  const zipBytes = Buffer.from('PK-fake-zip');

  it('uses the patched bundled zip parser for a real archive', async () => {
    const packageMeta = runtimeRequire('adm-zip/package.json') as { version: string };
    const [major, minor] = packageMeta.version.split('.').map(Number);
    expect(major > 0 || minor >= 6, `adm-zip ${packageMeta.version} includes CVE-2026-39244`).toBe(true);

    const AdmZip = runtimeRequire('adm-zip') as new () => {
      addFile(name: string, content: Buffer): void;
      toBuffer(): Buffer;
    };
    const archive = new AdmZip();
    archive.addFile('SKILL.md', Buffer.from(SKILL, 'utf-8'));
    const realZip = archive.toBuffer();
    const res = await resolveSkillSource(url, {
      fetchImpl: fetcherFor({ [url]: binResponse(realZip) }),
    });

    expect(res.content).toContain('name: demo-skill');
  });

  it('extracts the shallowest SKILL.md from a zip', async () => {
    const res = await resolveSkillSource(url, {
      fetchImpl: fetcherFor({ [url]: binResponse(zipBytes) }),
      zipExtractor: () => [
        entry('nested/deep/SKILL.md', 'wrong'),
        entry('SKILL.md', SKILL),
        entry('README.md', 'ignored'),
      ],
    });
    expect(res.sourceType).toBe('zip-url');
    expect(res.content).toContain('demo-skill');
  });

  it('rejects a zip with a traversal entry (zip-slip)', async () => {
    await expect(
      resolveSkillSource(url, {
        fetchImpl: fetcherFor({ [url]: binResponse(zipBytes) }),
        zipExtractor: () => [entry('../../evil.md'), entry('SKILL.md', SKILL)],
      }),
    ).rejects.toThrow(/path traversal/);
  });

  it('rejects a zip with an absolute entry', async () => {
    await expect(
      resolveSkillSource(url, {
        fetchImpl: fetcherFor({ [url]: binResponse(zipBytes) }),
        zipExtractor: () => [entry('/etc/passwd'), entry('SKILL.md', SKILL)],
      }),
    ).rejects.toThrow(/path traversal/);
  });

  it('skips junk entries and errors when no SKILL.md is present', async () => {
    await expect(
      resolveSkillSource(url, {
        fetchImpl: fetcherFor({ [url]: binResponse(zipBytes) }),
        zipExtractor: () => [entry('__MACOSX/SKILL.md'), entry('.DS_Store'), entry('README.md')],
      }),
    ).rejects.toThrow(/No SKILL.md/);
  });

  it('enforces sha256 over the zip bytes', async () => {
    const sha = createHash('sha256').update(zipBytes).digest('hex');
    const ok = await resolveSkillSource(url, {
      sha256: sha,
      fetchImpl: fetcherFor({ [url]: binResponse(zipBytes) }),
      zipExtractor: () => [entry('SKILL.md', SKILL)],
    });
    expect(ok.content).toContain('demo-skill');

    await expect(
      resolveSkillSource(url, {
        sha256: 'ab'.repeat(32),
        fetchImpl: fetcherFor({ [url]: binResponse(zipBytes) }),
        zipExtractor: () => [entry('SKILL.md', SKILL)],
      }),
    ).rejects.toThrow(/SHA-256 mismatch/);
  });
});
