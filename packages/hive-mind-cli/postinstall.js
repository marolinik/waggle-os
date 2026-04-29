#!/usr/bin/env node
/**
 * @waggle/hive-mind-cli postinstall — Wave 1 cleanup workaround.
 *
 * Per Wave 1 brief 2026-04-29 (LOCKED 2026-04-30) + feedback_memory_install_dead_simple binding:
 * Solo $19/mo Waggle users must NOT face shell debug or .cmd shim awareness on first install.
 *
 * What this does:
 *   - On non-win32 (Linux + macOS): exits 0 immediately. No-op. Hook resolution works
 *     natively because POSIX resolves shebangs without `shell: true`.
 *   - On win32: detects whether the everything-claude-code marketplace plugin's
 *     mcp-health-check.js hook has the Wave 1 fix (presence of `spawnOptions.shell = true`
 *     in the win32 branch of probeCommandServer). If the fix is missing or the override
 *     at ~/.claude/scripts/hooks/mcp-health-check.js is missing/stale, drop a corrected
 *     copy at ~/.claude/scripts/hooks/mcp-health-check.js (user-override path takes
 *     precedence over plugin path in Claude Code's hook resolution order).
 *
 * Why: without this fix, child_process.spawn("hive-mind-cli", …) returns ENOENT on
 * Windows because Windows requires cmd.exe to resolve npm-installed `.cmd` shims.
 * The hook would mark hive-mind-cli "unhealthy" and quarantine it for the entire
 * backoff window, blocking every MCP tool call until the quarantine expired —
 * a zero-engagement failure mode that's unacceptable for a paid tier.
 *
 * Once upstream everything-claude-code merges the fix (PR materials in
 * packages/hive-mind-hooks-claude-code/upstream-pr/), this override is no longer
 * needed and can be cleaned up by deleting ~/.claude/scripts/hooks/mcp-health-check.js.
 *
 * License: Apache-2.0 (this script). The bundled mcp-health-check-fixed.js asset
 * is MIT (originally by Affaan Mustafa, modified by Marko Markovic for the Wave 1
 * win32 fix per commit cf6e6c5d on the everything-claude-code marketplace clone).
 * MIT notice preserved in the asset's header.
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

if (process.platform !== 'win32') {
  // POSIX: zero-touch. Hook resolution works natively.
  process.exit(0);
}

const HOME = os.homedir();
const CLAUDE_DIR = path.join(HOME, '.claude');
const MARKETPLACE_HOOK_PATH = path.join(
  CLAUDE_DIR,
  'plugins',
  'marketplaces',
  'everything-claude-code',
  'scripts',
  'hooks',
  'mcp-health-check.js'
);
const USER_OVERRIDE_DIR = path.join(CLAUDE_DIR, 'scripts', 'hooks');
const USER_OVERRIDE_PATH = path.join(USER_OVERRIDE_DIR, 'mcp-health-check.js');
const BUNDLED_FIX_PATH = path.join(__dirname, 'assets', 'mcp-health-check-fixed.js');

function log(msg) {
  console.log(`[hive-mind-cli postinstall] ${msg}`);
}

function fileContains(filePath, needle) {
  try {
    return fs.readFileSync(filePath, 'utf8').includes(needle);
  } catch {
    return false;
  }
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function dropOverride(reason) {
  if (!fs.existsSync(BUNDLED_FIX_PATH)) {
    log(`Bundled fix not found at ${BUNDLED_FIX_PATH}; skipping. Re-install hive-mind-cli to recover.`);
    return;
  }
  ensureDir(USER_OVERRIDE_DIR);

  // If a user override already exists with the fix, do nothing (idempotent).
  if (fs.existsSync(USER_OVERRIDE_PATH) && fileContains(USER_OVERRIDE_PATH, 'spawnOptions.shell = true')) {
    log('User override at ~/.claude/scripts/hooks/mcp-health-check.js already has the win32 .cmd fix. No changes needed.');
    return;
  }

  // If a user override exists WITHOUT the fix, back it up so we don't blow it away.
  if (fs.existsSync(USER_OVERRIDE_PATH)) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${USER_OVERRIDE_PATH}.backup-${ts}`;
    fs.copyFileSync(USER_OVERRIDE_PATH, backupPath);
    log(`Existing user override backed up to ${backupPath}`);
  }

  fs.copyFileSync(BUNDLED_FIX_PATH, USER_OVERRIDE_PATH);
  log(`Wrote win32 .cmd-shim fix to ${USER_OVERRIDE_PATH} (${reason}).`);
  log('This override takes precedence over the everything-claude-code plugin hook.');
  log('Once upstream merges the fix (PR pending), you can delete this override.');
}

function detectAndPatch() {
  // Case A: marketplace plugin hook present + already patched → no-op.
  if (
    fs.existsSync(MARKETPLACE_HOOK_PATH) &&
    fileContains(MARKETPLACE_HOOK_PATH, 'spawnOptions.shell = true')
  ) {
    log('everything-claude-code mcp-health-check.js already has the win32 .cmd fix. No override needed.');
    return;
  }

  // Case B: marketplace plugin hook present but NOT patched → drop user override.
  if (fs.existsSync(MARKETPLACE_HOOK_PATH)) {
    dropOverride('detected unpatched everything-claude-code marketplace hook');
    return;
  }

  // Case C: marketplace plugin not detected — drop override anyway as a safety net.
  // The override only activates if Claude Code uses the user-hooks path; harmless
  // if Claude Code is not installed or uses a different plugin layout.
  dropOverride('preventive — no everything-claude-code marketplace detected, override dropped as safety net');
}

try {
  detectAndPatch();
} catch (err) {
  // Postinstall MUST NOT fail the npm install. Log + continue.
  log(`Failed to apply win32 hook fix: ${err && err.message ? err.message : err}`);
  log('hive-mind-cli is installed but you may see "spawn ENOENT" errors on first MCP call.');
  log('Workaround: copy node_modules/@waggle/hive-mind-cli/assets/mcp-health-check-fixed.js to ~/.claude/scripts/hooks/mcp-health-check.js manually.');
  log('Or run: hive-mind-cli doctor — to diagnose and self-recover.');
}
