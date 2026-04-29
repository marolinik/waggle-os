/**
 * Wire-format round-trip integration test.
 *
 * Exercises the cli-bridge against a REAL hive-mind-cli + real
 * hive-mind MCP server, in a freshly-init'd tmpdir-isolated mind so
 * the test never touches the user's actual ~/.hive-mind.
 *
 * Acts as a fitness function: if the upstream MCP surface drifts
 * (tool renames, schema field changes, importance enum changes, etc.)
 * this test fails before any shim ships. Mocked unit tests would
 * silently keep passing — that's exactly the gap that produced
 * Commit 1.4 in the first place.
 *
 * Skipped automatically when `hive-mind-cli` is not on PATH (CI
 * matrices without the upstream installed). Look for the
 * "integration: hive-mind-cli not on PATH" log line.
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createCliBridge } from '../../src/cli-bridge.js';
import { encodeFrame } from '../../src/frame-encoder.js';
import type { HookEvent } from '../../src/hook-event-types.js';

const PROBE_TIMEOUT_MS = 5000;
const INIT_TIMEOUT_MS = 15000;
const TEST_TIMEOUT_MS = 30000;

const CLI_BIN = 'hive-mind-cli';

/**
 * Path resolution priority:
 *   1. HIVE_MIND_CLI_JS env override (CI / offline testing)
 *   2. Sibling checkout at ../hive-mind/packages/cli/dist/index.js
 *   3. Fall back to 'hive-mind-cli' on PATH (relies on cli-bridge's
 *      Windows shell:true codepath; acceptable for unit/integration but
 *      forced JS path keeps things hermetic).
 */
function resolveCliJsPath(): string | undefined {
  const envOverride = process.env['HIVE_MIND_CLI_JS'];
  if (envOverride && existsSync(envOverride)) return envOverride;
  const sibling = resolve(process.cwd(), '..', 'hive-mind', 'packages', 'cli', 'dist', 'index.js');
  if (existsSync(sibling)) return sibling;
  return undefined;
}

const RESOLVED_CLI_JS = resolveCliJsPath();
const SPAWN_CMD = RESOLVED_CLI_JS ?? CLI_BIN;

function probeCli(): boolean {
  try {
    const probeArgs = RESOLVED_CLI_JS ? [RESOLVED_CLI_JS, '--help'] : ['--help'];
    const probeBin = RESOLVED_CLI_JS ? process.execPath : CLI_BIN;
    const probe = spawnSync(probeBin, probeArgs, {
      stdio: 'pipe',
      timeout: PROBE_TIMEOUT_MS,
      shell: !RESOLVED_CLI_JS,
    });
    return probe.status === 0;
  } catch {
    return false;
  }
}

const cliReachable = probeCli();

let tmpHome: string | undefined;
let priorDataDir: string | undefined;

beforeAll(async () => {
  if (!cliReachable) {
    // eslint-disable-next-line no-console
    console.log('[integration] hive-mind-cli not on PATH — round-trip suite will skip.');
    return;
  }
  tmpHome = await mkdtemp(join(tmpdir(), 'hmc-integration-'));
  priorDataDir = process.env['HIVE_MIND_DATA_DIR'];
  process.env['HIVE_MIND_DATA_DIR'] = tmpHome;
  // Initialize an isolated mind file under the tmpdir.
  const initBin = RESOLVED_CLI_JS ? process.execPath : CLI_BIN;
  const initArgs = RESOLVED_CLI_JS ? [RESOLVED_CLI_JS, 'init'] : ['init'];
  const init = spawnSync(initBin, initArgs, {
    stdio: 'pipe',
    timeout: INIT_TIMEOUT_MS,
    shell: !RESOLVED_CLI_JS,
    env: process.env,
  });
  if (init.status !== 0) {
    throw new Error(`hive-mind-cli init failed: ${init.stderr?.toString() ?? '(no stderr)'}`);
  }
}, INIT_TIMEOUT_MS);

afterAll(async () => {
  if (!cliReachable) return;
  if (priorDataDir === undefined) {
    delete process.env['HIVE_MIND_DATA_DIR'];
  } else {
    process.env['HIVE_MIND_DATA_DIR'] = priorDataDir;
  }
  if (tmpHome) {
    await rm(tmpHome, { recursive: true, force: true });
  }
});

describe.skipIf(!cliReachable)('integration: cli-bridge ↔ hive-mind-cli round-trip', () => {
  it('save_memory + recall_memory complete a wire-level round-trip with HookFrame inputs', async () => {
    const bridge = createCliBridge({ max_retries: 0, timeout_ms: 15000, cli_path: SPAWN_CMD });
    const marker = `roundtrip-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const event: HookEvent = {
      eventType: 'user-prompt-submit',
      source: 'claude-code',
      cwd: '/integration/test',
      timestamp_iso: new Date().toISOString(),
      payload: {
        content: `${marker} this is the integration save body`,
        session_id: `int-sess-${marker}`,
      },
    };

    const frame = encodeFrame(event, { importance: 'normal' });
    const saveResult = await bridge.saveMemory(frame);
    expect(saveResult.success).toBe(true);
    expect(saveResult.id).not.toBe('');
    expect(Number(saveResult.id)).toBeGreaterThan(0);

    // Recall by the unique marker — content prefix carries it through.
    const hits = await bridge.recallMemory(marker, { limit: 5 });
    expect(hits.length).toBeGreaterThanOrEqual(1);
    const hit = hits[0];
    expect(hit.content).toContain(marker);
    expect(hit.content).toContain('src:claude-code');
    expect(hit.importance).toBe('normal');
    expect(hit.from).toBe('personal');
  }, TEST_TIMEOUT_MS);

  it('cleanup_frames responds without error', async () => {
    const bridge = createCliBridge({ max_retries: 0, timeout_ms: 15000, cli_path: SPAWN_CMD });
    const out = await bridge.cleanupFrames();
    expect(typeof out.pruned).toBe('number');
    expect(out.pruned).toBeGreaterThanOrEqual(0);
  }, TEST_TIMEOUT_MS);

  // NOTE: an "empty recall" integration check would be too brittle —
  // upstream hybrid search returns very-low-score hits even for
  // unrelated queries (semantic vector recall has no zero-score floor).
  // The plain-text "No memories found" envelope is exercised by the
  // unit test in cli-bridge.test.ts with a mocked spawn instead.

  it('save_memory rejects an invalid source (regression: enum mismatch must surface, not be silently swallowed)', async () => {
    const bridge = createCliBridge({ max_retries: 0, timeout_ms: 15000, cli_path: SPAWN_CMD });
    // Bypass frameToSavePayload — use raw callMcpTool to send a bad source.
    await expect(bridge.callMcpTool('save_memory', {
      content: 'should fail',
      source: 'claude-code', // INVALID — must be one of the four provenance enum values
    })).rejects.toThrow(/Invalid enum value/);
  }, TEST_TIMEOUT_MS);
});
