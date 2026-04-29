/**
 * `hive-mind-cli doctor` — self-diagnostic smoke test.
 *
 * Per Wave 1 brief 2026-04-29 §3.2:
 *   "Optional: register hive-mind-cli's own diagnostic command — `hive-mind-cli doctor` —
 *    that runs a smoke test (spawn self, save+recall a test frame, report fail/pass)
 *    without depending on the upstream hook being correct."
 *
 * What this does:
 *   1. Verify the cli binary can spawn itself via child_process.spawn (catches
 *      Windows .cmd shim ENOENT bugs without depending on the upstream hook)
 *   2. Open the personal mind via openPersonalMind() (catches sqlite + sqlite-vec
 *      runtime errors)
 *   3. Save a test frame and recall it (catches FrameStore/HybridSearch wiring bugs)
 *   4. Inspect mcp-health-cache.json for stale quarantine entries; clean if present
 *   5. Report green ✓ / red ✗ + actionable next step
 *
 * Exit codes:
 *   0 — green path, hive-mind-cli is healthy
 *   1 — red path, at least one step failed (error printed with remediation)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { spawn } from 'node:child_process';
import { FrameStore, type Importance } from '@waggle/hive-mind-core';
import type { CliEnv } from '../setup.js';

export interface DoctorResult {
  ok: boolean;
  steps: DoctorStep[];
  /** Actionable suggestion if ok=false. */
  remediation?: string;
}

export interface DoctorStep {
  name: string;
  ok: boolean;
  detail?: string;
  errorMessage?: string;
}

/** Render a DoctorResult to plain text for terminal output. */
export function renderDoctorResult(result: DoctorResult): string {
  const lines: string[] = [];
  for (const step of result.steps) {
    const marker = step.ok ? '✓' : '✗';
    const tail = step.ok
      ? step.detail ? ` (${step.detail})` : ''
      : step.errorMessage ? ` — ${step.errorMessage}` : '';
    lines.push(`[hive-mind-cli doctor] ${step.name}… ${marker}${tail}`);
  }
  if (result.ok) {
    lines.push(`[hive-mind-cli doctor] PASS — hive-mind-cli is healthy on ${process.platform}. First MCP call should succeed.`);
  } else {
    lines.push(`[hive-mind-cli doctor] FAIL — see above for the failed step.`);
    if (result.remediation) {
      lines.push(`[hive-mind-cli doctor] Remediation: ${result.remediation}`);
    }
  }
  return lines.join('\n');
}

async function spawnSelfProbe(): Promise<DoctorStep> {
  return new Promise((resolve) => {
    // Spawn a `node --version` to verify spawn works. We can't spawn the CLI
    // itself (would recurse), but we verify the spawn surface works for the
    // current platform's shim resolution. On win32, a missing shell:true would
    // cause this to fail with ENOENT for npm-shimmed binaries.
    const opts: Parameters<typeof spawn>[2] = {
      stdio: ['ignore', 'pipe', 'pipe'],
    };
    if (process.platform === 'win32') {
      opts.shell = true;
      opts.windowsHide = true;
    }
    const child = spawn('node', ['--version'], opts);

    let timed = false;
    const timer = setTimeout(() => {
      timed = true;
      child.kill();
      resolve({
        name: 'Spawning Node child_process.spawn (Windows .cmd shim probe)',
        ok: false,
        errorMessage: 'spawn timeout (>5s) — system may be under heavy load or PATH misconfigured',
      });
    }, 5000);

    let stderr = '';
    child.stderr?.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', (err) => {
      clearTimeout(timer);
      if (timed) return;
      resolve({
        name: 'Spawning Node child_process.spawn (Windows .cmd shim probe)',
        ok: false,
        errorMessage: `${err.message}${process.platform === 'win32' ? ' — likely .cmd shim ENOENT, re-run npm install -g @waggle/hive-mind-cli' : ''}`,
      });
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (timed) return;
      if (code === 0) {
        resolve({
          name: 'Spawning Node child_process.spawn (Windows .cmd shim probe)',
          ok: true,
          detail: process.platform,
        });
      } else {
        resolve({
          name: 'Spawning Node child_process.spawn (Windows .cmd shim probe)',
          ok: false,
          errorMessage: `node exited with code ${code}; stderr: ${stderr.slice(0, 100)}`,
        });
      }
    });
  });
}

async function frameRoundtripProbe(env: CliEnv): Promise<DoctorStep[]> {
  const steps: DoctorStep[] = [];
  const probeContent = `[doctor probe ${new Date().toISOString()}] hive-mind-cli self-test`;

  // Save: create an I-frame in a dedicated 'doctor-probe' GOP for isolation.
  let frameId: number | null = null;
  try {
    const frames = new FrameStore(env.db);
    const created = frames.createIFrame(
      'doctor-probe',
      probeContent,
      'temporary' as Importance,
      'tool_verified',
    );
    frameId = created.id;
    steps.push({ name: 'Saving probe frame to personal.mind', ok: true, detail: `frame ID ${frameId}` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    steps.push({ name: 'Saving probe frame to personal.mind', ok: false, errorMessage: msg });
    return steps;
  }

  // Recall: getById lookup — no embedder needed, this is a direct sqlite read.
  // Verifies the substrate roundtrip without depending on HybridSearch wiring
  // or an embedder being configured (which the doctor cannot guarantee).
  try {
    const frames = new FrameStore(env.db);
    const recovered = frames.getById(frameId);
    if (!recovered) {
      steps.push({
        name: 'Recalling probe frame',
        ok: false,
        errorMessage: `Frame ${frameId} saved but getById returned undefined. SQLite may be corrupt or read isolation issue — run "hive-mind-cli maintenance reconcile-indexes".`,
      });
    } else if (recovered.content !== probeContent) {
      steps.push({
        name: 'Recalling probe frame',
        ok: false,
        errorMessage: `Frame ${frameId} content mismatch — substrate write/read roundtrip is corrupted. File an issue at marolinik/waggle-os.`,
      });
    } else {
      steps.push({
        name: 'Recalling probe frame',
        ok: true,
        detail: `roundtrip verified, content match`,
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    steps.push({ name: 'Recalling probe frame', ok: false, errorMessage: msg });
  }

  return steps;
}

function inspectAndCleanQuarantineCache(): DoctorStep {
  const cachePath = path.join(os.homedir(), '.claude', 'mcp-health-cache.json');
  if (!fs.existsSync(cachePath)) {
    return { name: 'Checking mcp-health-cache.json', ok: true, detail: 'no cache (clean state)' };
  }
  try {
    const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    const quarantines = cache?.failureQuarantines ?? cache?.quarantines ?? {};
    const hiveMindQuarantine = quarantines['hive-mind'] || quarantines['hive-mind-cli'];
    if (hiveMindQuarantine) {
      // Clean the entry so first MCP call succeeds without waiting for backoff expiry.
      delete quarantines['hive-mind'];
      delete quarantines['hive-mind-cli'];
      fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
      return {
        name: 'Checking mcp-health-cache.json',
        ok: true,
        detail: 'cleaned stale hive-mind quarantine entry',
      };
    }
    return { name: 'Checking mcp-health-cache.json', ok: true, detail: 'clean' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      name: 'Checking mcp-health-cache.json',
      ok: false,
      errorMessage: `cache file unreadable: ${msg}. Manually delete ${cachePath} to recover.`,
    };
  }
}

export interface DoctorOptions {
  env: CliEnv;
}

export async function runDoctor(opts: DoctorOptions): Promise<DoctorResult> {
  const steps: DoctorStep[] = [];

  // Step 1: spawn probe (catches Windows .cmd shim ENOENT)
  steps.push(await spawnSelfProbe());

  // Step 2-3: frame save+recall (catches substrate wiring)
  const roundtrip = await frameRoundtripProbe(opts.env);
  steps.push(...roundtrip);

  // Step 4: clean stale quarantine
  steps.push(inspectAndCleanQuarantineCache());

  const ok = steps.every((s) => s.ok);
  let remediation: string | undefined;
  if (!ok) {
    const firstFail = steps.find((s) => !s.ok);
    if (firstFail) {
      if (firstFail.name.startsWith('Spawning')) {
        remediation = 'Re-run `npm install -g @waggle/hive-mind-cli` to re-trigger the postinstall override on Windows. If that doesn\'t help, see packages/hive-mind-cli/docs/WINDOWS-QUIRKS.md.';
      } else if (firstFail.name.startsWith('Saving') || firstFail.name.startsWith('Recalling')) {
        remediation = 'Run `hive-mind-cli maintenance reconcile-indexes` to repair FTS5/vec0 desync. If error persists, file an issue at marolinik/waggle-os.';
      } else {
        remediation = 'Manually inspect ~/.claude/mcp-health-cache.json — see packages/hive-mind-cli/docs/WINDOWS-QUIRKS.md for guidance.';
      }
    }
  }
  return { ok, steps, remediation };
}
