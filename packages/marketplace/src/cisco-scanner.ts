/**
 * Waggle Marketplace — Cisco AI Defense Skill Scanner Adapter
 *
 * Wraps the Cisco `skill-scanner` CLI tool (Python) as an optional
 * deep-analysis engine for marketplace security scanning.
 *
 * The scanner is OPTIONAL — Waggle works without it. When not installed,
 * the SecurityGate falls back to its built-in JavaScript heuristics.
 *
 * Install the scanner:  pip install cisco-ai-skill-scanner
 * Reference:            https://github.com/cisco-ai-defense/skill-scanner
 */

import { execFile as execFileCb } from 'child_process';
import { writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import { promisify } from 'util';

const defaultExecFile = promisify(execFileCb);

/** Injectable executor for subprocess calls (overridable for tests) */
type ExecFileFn = (cmd: string, args: string[], opts: { timeout: number }) =>
  Promise<{ stdout: string; stderr: string }>;

let _execFile: ExecFileFn = defaultExecFile;

/**
 * Override the subprocess executor (for testing).
 * Pass `null` to restore the default.
 */
export function setExecFile(fn: ExecFileFn | null): void {
  _execFile = fn ?? defaultExecFile;
}

// ─── Types ──────────────────────────────────────────────────────────

export interface CiscoScanIssue {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  type: string;
  message: string;
  line?: number;
  rule_id?: string;
  description?: string;
  location?: string;
}

export interface CiscoScanResult {
  /** Whether the scan passed (no critical/high findings) */
  passed: boolean;
  /** Security score 0-100 (100 = clean) */
  score: number;
  /** Individual findings from the scanner */
  issues: CiscoScanIssue[];
  /** Version of the Cisco scanner used */
  scannerVersion: string;
  /** Time taken for the scan in milliseconds */
  scanDuration: number;
}

/** Sentinel result returned when the scanner is not installed */
const SCANNER_NOT_AVAILABLE: CiscoScanResult = {
  passed: true,
  score: -1,
  issues: [],
  scannerVersion: 'not_installed',
  scanDuration: 0,
};

// Scanner availability check timeout (5 seconds)
const VERSION_TIMEOUT_MS = 5_000;

// Scan execution timeout (30 seconds per file)
const SCAN_TIMEOUT_MS = 30_000;

// Cache the availability check for 60 seconds to avoid repeated subprocess calls
let _availabilityCache: { available: boolean; version: string; checkedAt: number } | null = null;
const AVAILABILITY_CACHE_TTL_MS = 60_000;

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Check if the Cisco skill-scanner CLI is installed and available.
 * Tries `skill-scanner --version` first, then `python -m skill_scanner --version`.
 * Results are cached for 60 seconds.
 */
export async function isCiscoScannerAvailable(): Promise<boolean> {
  // Return cached result if still fresh
  if (_availabilityCache && (Date.now() - _availabilityCache.checkedAt) < AVAILABILITY_CACHE_TTL_MS) {
    return _availabilityCache.available;
  }

  // Try the direct CLI command first
  try {
    const { stdout } = await _execFile('skill-scanner', ['--version'], {
      timeout: VERSION_TIMEOUT_MS,
    });
    const version = stdout.trim() || 'unknown';
    _availabilityCache = { available: true, version, checkedAt: Date.now() };
    return true;
  } catch {
    // Direct CLI not found — try Python module invocation
  }

  try {
    const { stdout } = await _execFile('python', ['-m', 'skill_scanner', '--version'], {
      timeout: VERSION_TIMEOUT_MS,
    });
    const version = stdout.trim() || 'unknown';
    _availabilityCache = { available: true, version, checkedAt: Date.now() };
    return true;
  } catch {
    // Also try python3 for Linux/macOS
  }

  try {
    const { stdout } = await _execFile('python3', ['-m', 'skill_scanner', '--version'], {
      timeout: VERSION_TIMEOUT_MS,
    });
    const version = stdout.trim() || 'unknown';
    _availabilityCache = { available: true, version, checkedAt: Date.now() };
    return true;
  } catch {
    // Scanner not available
  }

  _availabilityCache = { available: false, version: '', checkedAt: Date.now() };
  return false;
}

/**
 * Get the cached version string of the Cisco scanner, or 'not_installed'.
 */
export function getCiscoScannerVersion(): string {
  return _availabilityCache?.version || 'not_installed';
}

/**
 * Reset the availability cache (useful for tests).
 */
export function resetAvailabilityCache(): void {
  _availabilityCache = null;
}

/**
 * Scan skill content using the Cisco AI Defense skill-scanner.
 *
 * 1. Writes content to a temp file
 * 2. Runs: skill-scanner scan <tempfile> --format json
 * 3. Parses the JSON output into CiscoScanResult
 * 4. Cleans up the temp file
 *
 * If the scanner is not available, returns a sentinel result with
 * scannerVersion='not_installed' and score=-1.
 */
export async function ciscoScan(content: string, filename: string): Promise<CiscoScanResult> {
  const startTime = Date.now();

  // Check availability first
  const available = await isCiscoScannerAvailable();
  if (!available) {
    return { ...SCANNER_NOT_AVAILABLE };
  }

  // Write content to a temp file
  const tempDir = join(tmpdir(), 'waggle-cisco-scan');
  mkdirSync(tempDir, { recursive: true });
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const tempFile = join(tempDir, `${safeName}-${randomBytes(4).toString('hex')}.md`);

  try {
    writeFileSync(tempFile, content, 'utf-8');

    // Build the command and args
    const args = ['scan', tempFile, '--format', 'json'];

    // Try the direct CLI first, fall back to python module
    let stdout: string;
    let exitCode = 0;

    try {
      const result = await _execFile('skill-scanner', args, {
        timeout: SCAN_TIMEOUT_MS,
      });
      stdout = result.stdout;
    } catch (err: any) {
      // skill-scanner exits with code 1 when findings are found — that's not an error
      if (err.code === 'ENOENT' || err.killed) {
        // CLI not found or timed out — try python module
        try {
          const result = await _execFile('python', ['-m', 'skill_scanner', ...args], {
            timeout: SCAN_TIMEOUT_MS,
          });
          stdout = result.stdout;
        } catch (pyErr: any) {
          if (pyErr.stdout) {
            stdout = pyErr.stdout;
            exitCode = pyErr.code ?? 1;
          } else {
            // Try python3 as last resort
            try {
              const result = await _execFile('python3', ['-m', 'skill_scanner', ...args], {
                timeout: SCAN_TIMEOUT_MS,
              });
              stdout = result.stdout;
            } catch (py3Err: any) {
              if (py3Err.stdout) {
                stdout = py3Err.stdout;
                exitCode = py3Err.code ?? 1;
              } else {
                return {
                  passed: true,
                  score: -1,
                  issues: [],
                  scannerVersion: getCiscoScannerVersion(),
                  scanDuration: Date.now() - startTime,
                };
              }
            }
          }
        }
      } else if (err.stdout) {
        // Process exited with non-zero but produced output (findings found)
        stdout = err.stdout;
        exitCode = err.code ?? 1;
      } else {
        // Unexpected error
        console.warn(`[cisco-scanner] Scan failed: ${err.message || err}`);
        return {
          passed: true,
          score: -1,
          issues: [],
          scannerVersion: getCiscoScannerVersion(),
          scanDuration: Date.now() - startTime,
        };
      }
    }

    // Parse the JSON output
    const result = parseJsonOutput(stdout, exitCode);
    result.scanDuration = Date.now() - startTime;
    result.scannerVersion = getCiscoScannerVersion();

    return result;
  } finally {
    // Clean up temp file
    try {
      unlinkSync(tempFile);
    } catch { /* ignore cleanup failures */ }
  }
}

// ─── Internal Helpers ───────────────────────────────────────────────

/**
 * Parse the JSON output from skill-scanner into a CiscoScanResult.
 *
 * The scanner outputs a JSON object with:
 * - verdict: 'PASS' | 'FAIL'
 * - findings: Array of { rule_id, severity, category, title, description, line, location }
 * - summary: string
 * - score: number (if present)
 */
function parseJsonOutput(stdout: string, exitCode: number): CiscoScanResult {
  const issues: CiscoScanIssue[] = [];
  let passed = true;
  let score = 100;

  if (!stdout || !stdout.trim()) {
    return { passed: true, score: 100, issues: [], scannerVersion: '', scanDuration: 0 };
  }

  try {
    const data = JSON.parse(stdout.trim());

    // Extract verdict
    if (data.verdict) {
      const verdict = data.verdict.toUpperCase();
      passed = verdict === 'PASS' || verdict === 'CLEAN';
    } else {
      // No explicit verdict — infer from exit code
      passed = exitCode === 0;
    }

    // Extract score if provided
    if (typeof data.score === 'number') {
      score = data.score;
    } else if (typeof data.security_score === 'number') {
      score = data.security_score;
    }

    // Extract findings
    const rawFindings = data.findings || data.issues || data.results || [];
    if (Array.isArray(rawFindings)) {
      for (const f of rawFindings) {
        const severity = normalizeSeverity(f.severity || f.level);
        issues.push({
          severity,
          type: f.category || f.type || f.rule_id || 'unknown',
          message: f.title || f.message || f.description || '',
          line: typeof f.line === 'number' ? f.line : undefined,
          rule_id: f.rule_id || f.id,
          description: f.description || f.details,
          location: f.location,
        });

        // Adjust score based on severity if no explicit score
        if (typeof data.score !== 'number' && typeof data.security_score !== 'number') {
          switch (severity) {
            case 'critical': score = Math.min(score, 0); break;
            case 'high': score = Math.min(score, 25); break;
            case 'medium': score = Math.min(score, 60); break;
            case 'low': score = Math.min(score, 85); break;
          }
        }
      }
    }

    // If verdict is FAIL but no findings, add a generic finding
    if (!passed && issues.length === 0) {
      issues.push({
        severity: 'high',
        type: 'verdict_fail',
        message: data.summary || 'Cisco scanner returned FAIL verdict without specific findings.',
      });
      score = Math.min(score, 25);
    }
  } catch (parseErr) {
    // JSON parse failed — treat as unparseable output
    console.warn(`[cisco-scanner] Failed to parse JSON output: ${(parseErr as Error).message}`);
    return { passed: true, score: -1, issues: [], scannerVersion: '', scanDuration: 0 };
  }

  return { passed, score, issues, scannerVersion: '', scanDuration: 0 };
}

function normalizeSeverity(level: string | undefined): CiscoScanIssue['severity'] {
  const normalized = (level || '').toLowerCase().trim();
  if (normalized === 'critical' || normalized === 'error') return 'critical';
  if (normalized === 'high') return 'high';
  if (normalized === 'medium' || normalized === 'warning') return 'medium';
  if (normalized === 'low') return 'low';
  if (normalized === 'info' || normalized === 'none') return 'info';
  return 'medium';
}
