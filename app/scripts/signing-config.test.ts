import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseThumbprintString,
  addWindowsArtifactSigningToOverride,
  addWindowsSigningToOverride,
  addMacosAdhocToOverride,
  type TauriOverrideConfig,
} from './signing-config.js';

// ─── parseThumbprintString ──────────────────────────────────────────────────

describe('parseThumbprintString', () => {
  it('returns the uppercased thumbprint when given valid 40-hex input', () => {
    const raw = 'abcdef0123456789abcdef0123456789abcdef01';
    expect(parseThumbprintString(raw)).toBe(
      'ABCDEF0123456789ABCDEF0123456789ABCDEF01',
    );
  });

  it('strips surrounding whitespace and trailing newline (PowerShell output shape)', () => {
    const raw = '  ABCDEF0123456789ABCDEF0123456789ABCDEF01\r\n';
    expect(parseThumbprintString(raw)).toBe(
      'ABCDEF0123456789ABCDEF0123456789ABCDEF01',
    );
  });

  it('removes embedded whitespace inside the thumbprint (some clipboards introduce spaces)', () => {
    const raw = 'AB CD EF 01 23 45 67 89 AB CD EF 01 23 45 67 89 AB CD EF 01';
    expect(parseThumbprintString(raw)).toBe(
      'ABCDEF0123456789ABCDEF0123456789ABCDEF01',
    );
  });

  it('throws when the thumbprint is shorter than 40 chars', () => {
    expect(() => parseThumbprintString('ABCDEF')).toThrow(
      /must be 40 hex characters/i,
    );
  });

  it('throws when the thumbprint contains non-hex characters', () => {
    const raw = 'ZZCDEF0123456789ABCDEF0123456789ABCDEF01';
    expect(() => parseThumbprintString(raw)).toThrow(/must be 40 hex characters/i);
  });

  it('throws on empty input', () => {
    expect(() => parseThumbprintString('')).toThrow(/empty/i);
    expect(() => parseThumbprintString('   ')).toThrow(/empty/i);
  });
});

// ─── addWindowsSigningToOverride ────────────────────────────────────────────

describe('addWindowsSigningToOverride', () => {
  const VALID_THUMBPRINT = 'ABCDEF0123456789ABCDEF0123456789ABCDEF01';

  it('writes certificateThumbprint + sensible defaults when no options given', () => {
    const input: TauriOverrideConfig = { build: { beforeBuildCommand: '' } };
    const out = addWindowsSigningToOverride(input, VALID_THUMBPRINT);

    expect(out.bundle?.windows?.certificateThumbprint).toBe(VALID_THUMBPRINT);
    expect(out.bundle?.windows?.digestAlgorithm).toBe('sha256');
    expect(out.bundle?.windows?.timestampUrl).toBe(
      'http://timestamp.digicert.com',
    );
  });

  it('preserves existing top-level fields (build, app, etc.)', () => {
    const input: TauriOverrideConfig = {
      build: { beforeBuildCommand: 'echo hello' },
      app: { security: { csp: 'default-src self' } },
    };
    const out = addWindowsSigningToOverride(input, VALID_THUMBPRINT);

    expect(out.build).toEqual({ beforeBuildCommand: 'echo hello' });
    expect(out.app).toEqual({ security: { csp: 'default-src self' } });
  });

  it('preserves existing bundle.windows fields not related to signing', () => {
    const input: TauriOverrideConfig = {
      bundle: {
        windows: { nsis: { installMode: 'currentUser' } },
      },
    };
    const out = addWindowsSigningToOverride(input, VALID_THUMBPRINT);

    expect(out.bundle?.windows?.nsis).toEqual({ installMode: 'currentUser' });
    expect(out.bundle?.windows?.certificateThumbprint).toBe(VALID_THUMBPRINT);
  });

  it('removes an Azure signCommand when returning to certificate-store signing', () => {
    const azure: TauriOverrideConfig = addWindowsArtifactSigningToOverride(
      {
        bundle: {
          windows: { nsis: { installMode: 'currentUser' } },
        },
      },
      String.raw`D:\a\waggle-os\app\scripts\sign-windows-artifact.ps1`,
    );

    const out = addWindowsSigningToOverride(azure, VALID_THUMBPRINT);

    expect(out.bundle?.windows?.signCommand).toBeUndefined();
    expect(out.bundle?.windows?.certificateThumbprint).toBe(VALID_THUMBPRINT);
    expect(out.bundle?.windows?.nsis).toEqual({ installMode: 'currentUser' });
  });

  it('overrides custom digestAlgorithm and timestampUrl when options provided', () => {
    const out = addWindowsSigningToOverride({}, VALID_THUMBPRINT, {
      digestAlgorithm: 'sha384',
      timestampUrl: 'http://timestamp.sectigo.com',
    });

    expect(out.bundle?.windows?.digestAlgorithm).toBe('sha384');
    expect(out.bundle?.windows?.timestampUrl).toBe(
      'http://timestamp.sectigo.com',
    );
  });

  it('does not mutate the input config (immutability invariant)', () => {
    const input: TauriOverrideConfig = { build: { beforeBuildCommand: '' } };
    const inputSnapshot = JSON.parse(JSON.stringify(input));
    addWindowsSigningToOverride(input, VALID_THUMBPRINT);
    expect(input).toEqual(inputSnapshot);
  });

  it('is idempotent — applying twice with the same thumbprint yields equal output', () => {
    const input: TauriOverrideConfig = {};
    const once = addWindowsSigningToOverride(input, VALID_THUMBPRINT);
    const twice = addWindowsSigningToOverride(once, VALID_THUMBPRINT);
    expect(twice).toEqual(once);
  });

  it('replaces an old thumbprint when called with a new one (cert rotation)', () => {
    const input: TauriOverrideConfig = {};
    const v1 = addWindowsSigningToOverride(input, VALID_THUMBPRINT);
    const newThumb = '1234567890ABCDEF1234567890ABCDEF12345678';
    const v2 = addWindowsSigningToOverride(v1, newThumb);
    expect(v2.bundle?.windows?.certificateThumbprint).toBe(newThumb);
  });

  it('rejects an invalid thumbprint up front', () => {
    expect(() =>
      addWindowsSigningToOverride({}, 'too-short'),
    ).toThrow(/must be 40 hex characters/i);
  });
});

// ─── addWindowsArtifactSigningToOverride ───────────────────────────────────

describe('addWindowsArtifactSigningToOverride', () => {
  const WRAPPER_PATH = String.raw`D:\a\waggle-os\app\scripts\sign-windows-artifact.ps1`;
  const SYSTEM_POWERSHELL_PATH =
    String.raw`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`;

  it('configures an object-form Tauri signCommand with one artifact placeholder', () => {
    const out = addWindowsArtifactSigningToOverride(
      {},
      WRAPPER_PATH,
    );

    expect(out.bundle?.windows?.signCommand).toEqual({
      cmd: SYSTEM_POWERSHELL_PATH,
      args: [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        WRAPPER_PATH,
        '-ArtifactPath',
        '%1',
      ],
    });
  });

  it('removes mutually exclusive certificate-store signing fields', () => {
    const input: TauriOverrideConfig = {
      bundle: {
        windows: {
          certificateThumbprint: 'AB'.repeat(20),
          digestAlgorithm: 'sha256',
          timestampUrl: 'http://timestamp.digicert.com',
          tsp: true,
          nsis: { installMode: 'currentUser' },
        },
      },
    };

    const out = addWindowsArtifactSigningToOverride(
      input,
      WRAPPER_PATH,
    );
    expect(out.bundle?.windows?.certificateThumbprint).toBeUndefined();
    expect(out.bundle?.windows?.digestAlgorithm).toBeUndefined();
    expect(out.bundle?.windows?.timestampUrl).toBeUndefined();
    expect(out.bundle?.windows?.tsp).toBeUndefined();
    expect(out.bundle?.windows?.nsis).toEqual({ installMode: 'currentUser' });
  });

  it('is immutable and idempotent', () => {
    const input: TauriOverrideConfig = {
      build: {
        beforeBuildCommand: 'npm run build',
        beforeBundleCommand: 'node mutate-bundle.mjs',
      },
      bundle: {
        active: false,
        targets: ['msi'],
        windows: { nsis: { installMode: 'currentUser' } },
      },
    };
    const snapshot = JSON.parse(JSON.stringify(input));
    const once = addWindowsArtifactSigningToOverride(
      input,
      WRAPPER_PATH,
    );
    const twice = addWindowsArtifactSigningToOverride(
      once,
      WRAPPER_PATH,
    );

    expect(input).toEqual(snapshot);
    expect(twice).toEqual(once);
    expect(once.build).toEqual({
      beforeBuildCommand: '',
      beforeBundleCommand: '',
    });
    expect(once.bundle?.active).toBe(true);
    expect(once.bundle?.targets).toEqual(['nsis']);
    expect(once.bundle?.windows?.nsis).toEqual({ installMode: 'currentUser' });
  });

  it('rejects non-absolute, placeholder-bearing, or control-character wrapper paths', () => {
    expect(() =>
      addWindowsArtifactSigningToOverride(
        {},
        'scripts/sign.ps1',
      ),
    ).toThrow(/absolute Windows path/i);
    expect(() =>
      addWindowsArtifactSigningToOverride(
        {},
        String.raw`D:\a\%1\sign-windows-artifact.ps1`,
      ),
    ).toThrow(/placeholder/i);
    expect(() =>
      addWindowsArtifactSigningToOverride(
        {},
        'D:\\safe\nmalicious.ps1',
      ),
    ).toThrow(/control characters/i);
    expect(() =>
      addWindowsArtifactSigningToOverride(
        {},
        String.raw`D:\safe\..\malicious.ps1`,
      ),
    ).toThrow(/canonical local Windows/i);
    expect(() =>
      addWindowsArtifactSigningToOverride(
        {},
        String.raw`D:\safe\sign.ps1:payload`,
      ),
    ).toThrow(/canonical local Windows/i);
  });

  it('contains exactly one artifact placeholder across the complete command', () => {
    const out = addWindowsArtifactSigningToOverride({}, WRAPPER_PATH);
    const command = out.bundle?.windows?.signCommand;
    const placeholderCount = [command?.cmd, ...(command?.args ?? [])]
      .flatMap((part) => part?.match(/%1/g) ?? [])
      .length;
    expect(placeholderCount).toBe(1);
  });
});

describe('apply-signing-config Artifact Signing boundary', () => {
  it('fails closed toward the protected hosted release workflow, never local Build mode', () => {
    const scriptDir = dirname(fileURLToPath(import.meta.url));
    const result = spawnSync(
      process.execPath,
      [resolve(scriptDir, 'apply-signing-config.mjs')],
      {
        cwd: resolve(scriptDir, '..'),
        env: { ...process.env, WAGGLE_WINDOWS_SIGNING_MODE: 'artifact-signing' },
        encoding: 'utf8',
      },
    );
    const output = `${result.stdout}\n${result.stderr}`;
    expect(result.status).not.toBe(0);
    expect(output).toMatch(/protected GitHub-hosted release workflow/i);
    expect(output).not.toMatch(/-Mode Build/i);
  });
});

// ─── addMacosAdhocToOverride ────────────────────────────────────────────────

describe('addMacosAdhocToOverride', () => {
  it('sets bundle.macOS.signingIdentity to "-" (ad-hoc sign sentinel)', () => {
    const out = addMacosAdhocToOverride({});
    expect(out.bundle?.macOS?.signingIdentity).toBe('-');
  });

  it('preserves existing top-level and bundle fields', () => {
    const input: TauriOverrideConfig = {
      build: { beforeBuildCommand: 'echo' },
      bundle: {
        windows: { certificateThumbprint: 'AB'.repeat(20) },
      },
    };
    const out = addMacosAdhocToOverride(input);

    expect(out.build).toEqual({ beforeBuildCommand: 'echo' });
    expect(out.bundle?.windows?.certificateThumbprint).toBe('AB'.repeat(20));
    expect(out.bundle?.macOS?.signingIdentity).toBe('-');
  });

  it('does not mutate the input config', () => {
    const input: TauriOverrideConfig = { bundle: { macOS: {} } };
    const snapshot = JSON.parse(JSON.stringify(input));
    addMacosAdhocToOverride(input);
    expect(input).toEqual(snapshot);
  });

  it('is idempotent', () => {
    const once = addMacosAdhocToOverride({});
    const twice = addMacosAdhocToOverride(once);
    expect(twice).toEqual(once);
  });

  it('preserves additional macOS fields (entitlements, providerShortName)', () => {
    const input: TauriOverrideConfig = {
      bundle: {
        macOS: { entitlements: './ent.plist', providerShortName: 'TEAM' },
      },
    };
    const out = addMacosAdhocToOverride(input);

    expect(out.bundle?.macOS?.entitlements).toBe('./ent.plist');
    expect(out.bundle?.macOS?.providerShortName).toBe('TEAM');
    expect(out.bundle?.macOS?.signingIdentity).toBe('-');
  });
});
