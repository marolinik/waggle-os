#!/usr/bin/env node
/**
 * apply-signing-config.mjs — write the captured Windows code-signing thumbprint
 * into app/src-tauri/tauri.build-override.conf.json.
 *
 * Read by `npm run tauri:sign:pilot:win:apply`. Idempotent: re-running with the
 * same thumbprint produces an identical file. Updating the cert (rotation) is
 * handled by re-running the upstream cert-gen script + this CLI.
 *
 * Pure logic lives in `signing-config.ts`; this is the thin file-I/O wrapper.
 *
 * Reference: docs/code-signing-pilot-and-launch.md §1.1
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// The pure helpers below mirror the certificate-store helpers in
// app/scripts/signing-config.ts so this pilot CLI has zero TS-loader dependency
// at runtime. Keep parseThumbprintString and addWindowsSigningToOverride in
// lockstep with the canonical TypeScript implementation.

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(SCRIPT_DIR, '..');
const REPO_ROOT = resolve(APP_DIR, '..');

const OVERRIDE_PATH = resolve(
  APP_DIR,
  'src-tauri',
  'tauri.build-override.conf.json',
);
const THUMBPRINT_PATH = resolve(APP_DIR, 'src-tauri', '.thumbprint.txt');
const DEFAULT_DIGEST_ALGORITHM = 'sha256';
const DEFAULT_TIMESTAMP_URL = 'http://timestamp.digicert.com';
const THUMBPRINT_LENGTH = 40;
const HEX_PATTERN = /^[0-9A-F]+$/;
const WINDOWS_SIGNING_MODE =
  process.env.WAGGLE_WINDOWS_SIGNING_MODE ?? 'certificate-store';

function parseThumbprintString(raw) {
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

function addWindowsSigningToOverride(config, thumbprint, options = {}) {
  const normalisedThumbprint = parseThumbprintString(thumbprint);
  const digestAlgorithm = options.digestAlgorithm ?? DEFAULT_DIGEST_ALGORITHM;
  const timestampUrl = options.timestampUrl ?? DEFAULT_TIMESTAMP_URL;

  const existingBundle = config.bundle ?? {};
  const existingWindows = existingBundle.windows ?? {};
  const nonCustomCommandWindows = { ...existingWindows };
  delete nonCustomCommandWindows.signCommand;

  return {
    ...config,
    bundle: {
      ...existingBundle,
      windows: {
        ...nonCustomCommandWindows,
        certificateThumbprint: normalisedThumbprint,
        digestAlgorithm,
        timestampUrl,
      },
    },
  };
}

// ─── Main ───────────────────────────────────────────────────────────────────

function main() {
  if (!['certificate-store', 'artifact-signing'].includes(WINDOWS_SIGNING_MODE)) {
    console.error(
      `[apply-signing-config] unsupported WAGGLE_WINDOWS_SIGNING_MODE: ${WINDOWS_SIGNING_MODE}`,
    );
    process.exit(1);
  }
  if (WINDOWS_SIGNING_MODE === 'artifact-signing') {
    console.error(
      '[apply-signing-config] Azure Artifact Signing is hosted-only. '
      + 'Run the protected GitHub-hosted release workflow; this local helper cannot issue '
      + 'the immutable build receipt, protected OIDC identity, session manifest, or callback ledger.',
    );
    process.exit(1);
  }
  if (!existsSync(THUMBPRINT_PATH)) {
    console.error(
      `[apply-signing-config] thumbprint file missing: ${THUMBPRINT_PATH}`,
    );
    console.error(
      '[apply-signing-config] Run `npm run tauri:sign:pilot:win:setup` (or app/scripts/sign-windows-pilot.ps1 -Mode Setup) first.',
    );
    process.exit(1);
  }
  if (!existsSync(OVERRIDE_PATH)) {
    console.error(
      `[apply-signing-config] override config missing: ${OVERRIDE_PATH}`,
    );
    process.exit(1);
  }

  const overrideRaw = readFileSync(OVERRIDE_PATH, 'utf8');

  let override;
  try {
    override = JSON.parse(overrideRaw);
  } catch (err) {
    console.error(
      `[apply-signing-config] failed to parse ${OVERRIDE_PATH}: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }

  let updated;
  try {
    const rawThumbprint = readFileSync(THUMBPRINT_PATH, 'utf8');
    updated = addWindowsSigningToOverride(override, rawThumbprint);
  } catch (err) {
    console.error(
      `[apply-signing-config] failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }

  // Format with 2-space indent + trailing newline (matches existing JSON files
  // in the repo). Idempotent: same input → same output bytes.
  const serialised = JSON.stringify(updated, null, 2) + '\n';
  writeFileSync(OVERRIDE_PATH, serialised, 'utf8');

  const relativePath = OVERRIDE_PATH.replace(REPO_ROOT, '').replace(/^\\/, '');
  const signingDescription =
    `thumbprint ${updated.bundle.windows.certificateThumbprint.slice(0, 8)}...`;
  console.log(`[apply-signing-config] wrote ${signingDescription} to ${relativePath}`);
}

main();
