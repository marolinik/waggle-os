/**
 * signing-config.ts — Pure utilities for managing code-signing fields in
 * Tauri's `tauri.build-override.conf.json`.
 *
 * Used by:
 *   - `apply-signing-config.mjs` (LAUNCH-06 pilot wiring)
 *   - `tauri:sign:pilot:win:apply` npm script
 *
 * No filesystem side effects — safe to import in tests. The thin CLI wrapper
 * does the file I/O.
 *
 * Reference: docs/code-signing-pilot-and-launch.md §1.1 (Windows self-sign)
 *            docs/code-signing-pilot-and-launch.md §1.2 (macOS ad-hoc)
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TauriBundleWindows {
  certificateThumbprint?: string;
  digestAlgorithm?: string;
  signCommand?: TauriSignCommand;
  timestampUrl?: string;
  tsp?: boolean;
  [key: string]: unknown;
}

export interface TauriSignCommand {
  cmd: string;
  args: string[];
}

export interface TauriBundleMacOS {
  signingIdentity?: string;
  [key: string]: unknown;
}

export interface TauriBundle {
  windows?: TauriBundleWindows;
  macOS?: TauriBundleMacOS;
  [key: string]: unknown;
}

export interface TauriOverrideConfig {
  build?: Record<string, unknown>;
  bundle?: TauriBundle;
  [key: string]: unknown;
}

export interface WindowsSigningOptions {
  digestAlgorithm?: string;
  timestampUrl?: string;
}

// ─── Defaults ───────────────────────────────────────────────────────────────

const DEFAULT_DIGEST_ALGORITHM = 'sha256';
const DEFAULT_TIMESTAMP_URL = 'http://timestamp.digicert.com';
const MACOS_ADHOC_IDENTITY = '-';
const THUMBPRINT_LENGTH = 40;
const HEX_PATTERN = /^[0-9A-F]+$/;
const WINDOWS_ABSOLUTE_PATH_PATTERN = /^[A-Za-z]:[\\/]/;
const WINDOWS_POWERSHELL_PATH =
  String.raw`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`;

function containsControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127;
  });
}

function assertCanonicalWindowsFilePath(value: string): void {
  if (containsControlCharacter(value)) {
    throw new Error('Artifact Signing wrapper path contains control characters.');
  }
  if (!WINDOWS_ABSOLUTE_PATH_PATTERN.test(value)) {
    throw new Error('Artifact Signing wrapper must use an absolute Windows path.');
  }
  const pathTail = value.slice(3);
  const segments = pathTail.split(/[\\/]/);
  if (
    pathTail.length === 0
    || value.slice(2).includes(':')
    || segments.some(
      (segment) => segment.length === 0
        || segment === '.'
        || segment === '..'
        || /[. ]$/.test(segment),
    )
  ) {
    throw new Error('Artifact Signing wrapper must use a canonical local Windows file path.');
  }
}

// ─── parseThumbprintString ──────────────────────────────────────────────────

/**
 * Normalise a raw thumbprint string into the canonical 40-char uppercase form.
 *
 * Accepts whitespace anywhere (tab, space, newline) since PowerShell's
 * `$cert.Thumbprint` plus clipboard round-tripping can introduce arbitrary
 * spacing. Throws when the result is not exactly 40 hex characters.
 */
export function parseThumbprintString(raw: string): string {
  if (!raw || raw.trim().length === 0) {
    throw new Error('Thumbprint is empty — cert generation may have failed.');
  }

  const compact = raw.replace(/\s+/g, '').toUpperCase();

  if (compact.length !== THUMBPRINT_LENGTH || !HEX_PATTERN.test(compact)) {
    throw new Error(
      `Thumbprint must be 40 hex characters; got ${compact.length} chars (sample: "${compact.slice(0, 16)}...").`,
    );
  }

  return compact;
}

// ─── addWindowsSigningToOverride ────────────────────────────────────────────

/**
 * Return a new override config with Windows code-signing fields applied.
 *
 * Preserves all existing top-level and bundle fields; replaces only the
 * signing-specific keys under `bundle.windows`. Idempotent — calling
 * twice with the same thumbprint yields an equal result.
 */
export function addWindowsSigningToOverride<T extends TauriOverrideConfig>(
  config: Readonly<T>,
  thumbprint: string,
  options?: WindowsSigningOptions,
): T {
  const normalisedThumbprint = parseThumbprintString(thumbprint);
  const digestAlgorithm = options?.digestAlgorithm ?? DEFAULT_DIGEST_ALGORITHM;
  const timestampUrl = options?.timestampUrl ?? DEFAULT_TIMESTAMP_URL;

  const existingBundle: TauriBundle = config.bundle ?? {};
  const existingWindows: TauriBundleWindows = existingBundle.windows ?? {};
  const nonCustomCommandWindows: TauriBundleWindows = { ...existingWindows };
  delete nonCustomCommandWindows.signCommand;

  const nextWindows: TauriBundleWindows = {
    ...nonCustomCommandWindows,
    certificateThumbprint: normalisedThumbprint,
    digestAlgorithm,
    timestampUrl,
  };

  const nextBundle: TauriBundle = {
    ...existingBundle,
    windows: nextWindows,
  };

  return {
    ...config,
    bundle: nextBundle,
  };
}

// ─── addWindowsArtifactSigningToOverride ───────────────────────────────────

/**
 * Return a new override config that delegates every Tauri Windows signing
 * target to the fail-closed Azure Artifact Signing wrapper.
 *
 * Tauri replaces `%1` with each binary path. Object form keeps the absolute
 * wrapper path intact when the checkout contains spaces. Certificate-store
 * fields are removed because Tauri must not combine them with `signCommand`.
 */
export function addWindowsArtifactSigningToOverride<
  T extends TauriOverrideConfig,
>(config: Readonly<T>, wrapperPath: string): T {
  assertCanonicalWindowsFilePath(wrapperPath);
  if (wrapperPath.includes('%1')) {
    throw new Error('Artifact Signing wrapper path cannot contain the %1 placeholder.');
  }
  const existingBuild = config.build ?? {};
  const existingBundle: TauriBundle = config.bundle ?? {};
  const existingWindows: TauriBundleWindows = existingBundle.windows ?? {};
  const nonSigningWindows: TauriBundleWindows = { ...existingWindows };
  delete nonSigningWindows.certificateThumbprint;
  delete nonSigningWindows.digestAlgorithm;
  delete nonSigningWindows.timestampUrl;
  delete nonSigningWindows.tsp;

  const nextWindows: TauriBundleWindows = {
    ...nonSigningWindows,
    signCommand: {
      cmd: WINDOWS_POWERSHELL_PATH,
      args: [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        wrapperPath,
        '-ArtifactPath',
        '%1',
      ],
    },
  };
  const placeholderCount = [
    nextWindows.signCommand?.cmd,
    ...(nextWindows.signCommand?.args ?? []),
  ].flatMap((part) => part?.match(/%1/g) ?? []).length;
  if (placeholderCount !== 1) {
    throw new Error('Artifact Signing command must contain exactly one %1 placeholder.');
  }

  return {
    ...config,
    build: {
      ...existingBuild,
      beforeBuildCommand: '',
      beforeBundleCommand: '',
    },
    bundle: {
      ...existingBundle,
      active: true,
      targets: ['nsis'],
      windows: nextWindows,
    },
  };
}

// ─── addMacosAdhocToOverride ────────────────────────────────────────────────

/**
 * Return a new override config with macOS ad-hoc signing applied.
 *
 * Sets `bundle.macOS.signingIdentity` to "-" (Tauri / codesign sentinel for
 * ad-hoc sign). Preserves all other fields. Used during pilot before a real
 * Apple Developer ID cert is procured.
 */
export function addMacosAdhocToOverride<T extends TauriOverrideConfig>(
  config: Readonly<T>,
): T {
  const existingBundle: TauriBundle = config.bundle ?? {};
  const existingMacOS: TauriBundleMacOS = existingBundle.macOS ?? {};

  const nextMacOS: TauriBundleMacOS = {
    ...existingMacOS,
    signingIdentity: MACOS_ADHOC_IDENTITY,
  };

  const nextBundle: TauriBundle = {
    ...existingBundle,
    macOS: nextMacOS,
  };

  return {
    ...config,
    bundle: nextBundle,
  };
}
