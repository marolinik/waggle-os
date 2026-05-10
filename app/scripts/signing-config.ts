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
  timestampUrl?: string;
  [key: string]: unknown;
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
 * three signing-specific keys under `bundle.windows`. Idempotent — calling
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

  const nextWindows: TauriBundleWindows = {
    ...existingWindows,
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
