/**
 * Waggle Marketplace — Security Gate
 * 
 * Multi-layered security verification for skills, plugins, and MCP servers
 * before they are installed into the user's Waggle instance.
 * 
 * Layers:
 *   1. Gen Trust Hub API    — Cloud URL-based pre-check (fast, free)
 *   2. Cisco Skill Scanner  — Local deep analysis (pattern + behavioral + LLM)
 *   3. MCP Guardian         — Inline pattern matching for MCP tool descriptions
 *   4. Built-in heuristics  — Custom rules for Waggle-specific threat patterns
 * 
 * Each layer produces findings with severity levels:
 *   CRITICAL → Block installation, flag in DB
 *   HIGH     → Block installation by default (override with --force-insecure)
 *   MEDIUM   → Warn user, allow installation
 *   LOW      → Informational, log only
 *   CLEAN    → No issues found
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import type { MarketplacePackage, InstallManifest, McpServerConfig } from './types';
import {
  isCiscoScannerAvailable,
  ciscoScan,
  getCiscoScannerVersion,
  type CiscoScanResult,
} from './cisco-scanner';

// ─── Types ──────────────────────────────────────────────────────────

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'CLEAN';

export interface SecurityFinding {
  rule_id: string;
  severity: Severity;
  category: SecurityCategory;
  title: string;
  description: string;
  location?: string;
  engine: SecurityEngine;
}

export type SecurityCategory =
  | 'prompt_injection'
  | 'data_exfiltration'
  | 'malicious_code'
  | 'privilege_escalation'
  | 'suspicious_network'
  | 'obfuscation'
  | 'sensitive_path_access'
  | 'tool_poisoning'
  | 'cross_origin_escalation'
  | 'rug_pull'
  | 'untrusted_source';

export type SecurityEngine =
  | 'gen_trust_hub'
  | 'cisco_skill_scanner'
  | 'mcp_guardian'
  | 'waggle_heuristics'
  | 'content_hash';

export interface ScanResult {
  package_name: string;
  package_type: string;
  scanned_at: string;
  overall_severity: Severity;
  security_score: number;          // 0-100 (100 = perfectly safe)
  findings: SecurityFinding[];
  engines_used: SecurityEngine[];
  content_hash: string;            // SHA-256 of scanned content
  blocked: boolean;
  scan_duration_ms: number;
  /** Detailed result from the Cisco skill-scanner, when available */
  ciscoScanResult?: CiscoScanResult;
}

export interface SecurityGateConfig {
  /** Enable Gen Trust Hub cloud API pre-check */
  enable_gen_trust_hub: boolean;
  /** Enable Cisco Skill Scanner (requires `cisco-ai-skill-scanner` pip package) */
  enable_cisco_scanner: boolean;
  /** Enable MCP Guardian pattern matching (requires `mcp-guardian` npm package) */
  enable_mcp_guardian: boolean;
  /** Enable built-in Waggle heuristic rules */
  enable_heuristics: boolean;

  /** Minimum severity to block installation */
  block_threshold: Severity;
  /** Allow --force-insecure to bypass blocks */
  allow_force_bypass: boolean;

  /** Gen Trust Hub API endpoint */
  gen_trust_hub_url: string;
  /** Gen Trust Hub API key (if required for high volume) */
  gen_trust_hub_api_key?: string;

  /** Cisco scanner extra arguments */
  cisco_scanner_args: string[];
  /** Path to custom Cisco scanner policy file */
  cisco_scanner_policy?: string;

  /** Directory to cache scan results */
  cache_dir: string;
  /** Cache TTL in hours (re-scan after this period) */
  cache_ttl_hours: number;
}

const DEFAULT_CONFIG: SecurityGateConfig = {
  enable_gen_trust_hub: true,
  enable_cisco_scanner: true,
  enable_mcp_guardian: true,
  enable_heuristics: true,
  block_threshold: 'HIGH',
  allow_force_bypass: false,
  gen_trust_hub_url: 'https://ai.gendigital.com/api/scan/lookup',
  cisco_scanner_args: ['--use-behavioral', '--format', 'json'],
  cache_dir: join(homedir(), '.waggle', 'security-cache'),
  cache_ttl_hours: 24,
};

// ─── Severity Utilities ─────────────────────────────────────────────

const SEVERITY_ORDER: Record<Severity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  CLEAN: 4,
};

function maxSeverity(a: Severity, b: Severity): Severity {
  return SEVERITY_ORDER[a] <= SEVERITY_ORDER[b] ? a : b;
}

function severityToScore(severity: Severity): number {
  switch (severity) {
    case 'CRITICAL': return 0;
    case 'HIGH': return 25;
    case 'MEDIUM': return 60;
    case 'LOW': return 85;
    case 'CLEAN': return 100;
  }
}

function shouldBlock(severity: Severity, threshold: Severity): boolean {
  return SEVERITY_ORDER[severity] <= SEVERITY_ORDER[threshold];
}

// ─── Security Gate ──────────────────────────────────────────────────

export class SecurityGate {
  private config: SecurityGateConfig;

  constructor(config: Partial<SecurityGateConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    mkdirSync(this.config.cache_dir, { recursive: true });
  }

  /**
   * Run the full security scan pipeline on a package.
   * Call this BEFORE writing any files to disk.
   */
  async scan(
    pkg: MarketplacePackage,
    content?: string,
  ): Promise<ScanResult> {
    const startTime = Date.now();
    const findings: SecurityFinding[] = [];
    const enginesUsed: SecurityEngine[] = [];
    const contentHash = content ? this.hash(content) : '';

    // Check cache first
    const cached = this.getCachedResult(pkg.name, contentHash);
    if (cached) return cached;

    // Layer 1: Gen Trust Hub (cloud, URL-based pre-check)
    if (this.config.enable_gen_trust_hub && (pkg.homepage_url || pkg.repository_url)) {
      enginesUsed.push('gen_trust_hub');
      const genFindings = await this.scanWithGenTrustHub(pkg);
      findings.push(...genFindings);
    }

    // Layer 2: Cisco Skill Scanner (local, deep analysis for skills)
    let ciscoResult: CiscoScanResult | undefined;
    if (this.config.enable_cisco_scanner && content && pkg.waggle_install_type === 'skill') {
      enginesUsed.push('cisco_skill_scanner');
      const { findings: ciscoFindings, ciscoScanResult: csResult } =
        await this.scanWithCiscoScannerAdapter(pkg, content);
      findings.push(...ciscoFindings);
      ciscoResult = csResult;
    }

    // Layer 3: MCP Guardian (pattern matching for MCP servers)
    if (this.config.enable_mcp_guardian && pkg.waggle_install_type === 'mcp') {
      enginesUsed.push('mcp_guardian');
      const mcpFindings = await this.scanWithMcpGuardian(pkg);
      findings.push(...mcpFindings);
    }

    // Layer 4: Built-in Waggle heuristics (always runs)
    if (this.config.enable_heuristics && content) {
      enginesUsed.push('waggle_heuristics');
      const heuristicFindings = this.scanWithHeuristics(pkg, content);
      findings.push(...heuristicFindings);
    }

    // Layer 5: Content hash for integrity tracking
    if (content) {
      enginesUsed.push('content_hash');
    }

    // Compute overall severity
    let overallSeverity: Severity = 'CLEAN';
    for (const f of findings) {
      overallSeverity = maxSeverity(overallSeverity, f.severity);
    }

    const result: ScanResult = {
      package_name: pkg.name,
      package_type: pkg.waggle_install_type,
      scanned_at: new Date().toISOString(),
      overall_severity: overallSeverity,
      security_score: severityToScore(overallSeverity),
      findings,
      engines_used: enginesUsed,
      content_hash: contentHash,
      blocked: shouldBlock(overallSeverity, this.config.block_threshold),
      scan_duration_ms: Date.now() - startTime,
      ciscoScanResult: ciscoResult,
    };

    // Cache the result
    this.cacheResult(pkg.name, contentHash, result);

    return result;
  }

  /**
   * Quick check: is this package safe to install?
   * Returns true if safe, false if blocked.
   */
  async isSafe(pkg: MarketplacePackage, content?: string): Promise<boolean> {
    const result = await this.scan(pkg, content);
    return !result.blocked;
  }

  /**
   * Verify content integrity against a known hash.
   * Use after download to ensure content hasn't been tampered with.
   */
  verifyIntegrity(content: string, expectedHash: string): boolean {
    return this.hash(content) === expectedHash;
  }

  // ─── Layer 1: Gen Trust Hub ─────────────────────────────────────

  private async scanWithGenTrustHub(pkg: MarketplacePackage): Promise<SecurityFinding[]> {
    const findings: SecurityFinding[] = [];
    const url = pkg.homepage_url || pkg.repository_url;
    if (!url) return findings;

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (this.config.gen_trust_hub_api_key) {
        headers['Authorization'] = `Bearer ${this.config.gen_trust_hub_api_key}`;
      }

      const response = await fetch(this.config.gen_trust_hub_url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ skillUrl: url }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!response.ok) {
        // API failure is not a security finding — just log and continue
        console.warn(`[security] Gen Trust Hub API returned ${response.status} for ${url}`);
        return findings;
      }

      const data = await response.json() as any;

      // Parse the response into findings
      if (data.severity === 'CRITICAL THREAT' || data.severity === 'CRITICAL') {
        findings.push({
          rule_id: 'GEN-001',
          severity: 'CRITICAL',
          category: 'malicious_code',
          title: 'Gen Trust Hub: Critical threat detected',
          description: data.details || data.message || `Package flagged as critical threat by Gen AI Defense.`,
          engine: 'gen_trust_hub',
        });
      } else if (data.severity === 'HIGH' || data.risk_level === 'high') {
        findings.push({
          rule_id: 'GEN-002',
          severity: 'HIGH',
          category: 'malicious_code',
          title: 'Gen Trust Hub: High risk detected',
          description: data.details || data.message || `Package flagged as high risk.`,
          engine: 'gen_trust_hub',
        });
      } else if (data.severity === 'MEDIUM' || data.risk_level === 'medium') {
        findings.push({
          rule_id: 'GEN-003',
          severity: 'MEDIUM',
          category: 'suspicious_network',
          title: 'Gen Trust Hub: Medium risk detected',
          description: data.details || data.message || `Package flagged as medium risk.`,
          engine: 'gen_trust_hub',
        });
      }

      // Check for specific threat types from the response
      if (data.threats && Array.isArray(data.threats)) {
        for (const threat of data.threats) {
          findings.push({
            rule_id: `GEN-T-${threat.type || 'unknown'}`,
            severity: (threat.severity || 'MEDIUM').toUpperCase() as Severity,
            category: this.mapGenCategory(threat.type),
            title: threat.title || threat.type || 'Gen Trust Hub threat',
            description: threat.description || threat.details || '',
            engine: 'gen_trust_hub',
          });
        }
      }
    } catch (err) {
      // Network errors are not security findings — fail open for this layer
      console.warn(`[security] Gen Trust Hub unreachable: ${(err as Error).message}`);
    }

    return findings;
  }

  private mapGenCategory(type: string): SecurityCategory {
    const map: Record<string, SecurityCategory> = {
      'data_exfiltration': 'data_exfiltration',
      'prompt_injection': 'prompt_injection',
      'malicious_code': 'malicious_code',
      'file_access': 'sensitive_path_access',
      'network': 'suspicious_network',
      'dynamic_code': 'malicious_code',
    };
    return map[type] || 'malicious_code';
  }

  // ─── Layer 2: Cisco Skill Scanner ──────────────────────────────

  private async scanWithCiscoScanner(
    pkg: MarketplacePackage,
    content: string,
  ): Promise<SecurityFinding[]> {
    const findings: SecurityFinding[] = [];

    // Check if cisco scanner is installed
    if (!this.isCiscoScannerInstalled()) {
      console.warn('[security] Cisco Skill Scanner not installed. Run: pip install cisco-ai-skill-scanner');
      return findings;
    }

    try {
      // Write content to a temp file for scanning
      const tempDir = join(this.config.cache_dir, 'tmp');
      mkdirSync(tempDir, { recursive: true });
      const tempFile = join(tempDir, `${pkg.name}.md`);
      writeFileSync(tempFile, content, 'utf-8');

      // Run the scanner
      const args = [
        'scan', tempFile,
        '--format', 'json',
        ...this.config.cisco_scanner_args,
      ];

      if (this.config.cisco_scanner_policy) {
        args.push('--policy', this.config.cisco_scanner_policy);
      }

      const output = execFileSync('skill-scanner', args, {
        timeout: 60_000,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Parse JSON output
      const result = JSON.parse(output);

      // Map Cisco findings to our format
      if (result.findings && Array.isArray(result.findings)) {
        for (const f of result.findings) {
          findings.push({
            rule_id: f.rule_id || f.id || `CISCO-${findings.length}`,
            severity: this.mapCiscoSeverity(f.severity || f.level),
            category: this.mapCiscoCategory(f.category || f.type),
            title: f.title || f.message || f.rule_id,
            description: f.description || f.details || '',
            location: f.location || f.line ? `line ${f.line}` : undefined,
            engine: 'cisco_skill_scanner',
          });
        }
      }

      // Also check the summary-level verdict
      if (result.verdict === 'FAIL' || result.verdict === 'fail') {
        if (findings.length === 0) {
          findings.push({
            rule_id: 'CISCO-VERDICT',
            severity: 'HIGH',
            category: 'malicious_code',
            title: 'Cisco Skill Scanner: Overall verdict FAIL',
            description: result.summary || 'Scanner returned FAIL verdict without specific findings.',
            engine: 'cisco_skill_scanner',
          });
        }
      }

      // Clean up temp file
      try { unlinkSync(tempFile); } catch { /* ignore */ }

    } catch (err) {
      const errMsg = (err as any).stderr || (err as Error).message;

      // Exit code 1 from skill-scanner means findings were found — try to parse stdout
      if ((err as any).status === 1 && (err as any).stdout) {
        try {
          const result = JSON.parse((err as any).stdout);
          if (result.findings) {
            for (const f of result.findings) {
              findings.push({
                rule_id: f.rule_id || `CISCO-${findings.length}`,
                severity: this.mapCiscoSeverity(f.severity || f.level),
                category: this.mapCiscoCategory(f.category || f.type),
                title: f.title || f.message,
                description: f.description || '',
                location: f.location,
                engine: 'cisco_skill_scanner',
              });
            }
          }
        } catch {
          console.warn(`[security] Failed to parse Cisco scanner output: ${errMsg}`);
        }
      } else {
        console.warn(`[security] Cisco scanner error: ${errMsg}`);
      }
    }

    return findings;
  }

  private isCiscoScannerInstalled(): boolean {
    try {
      execFileSync('skill-scanner', ['--version'], { stdio: 'pipe', timeout: 5_000 });
      return true;
    } catch {
      return false;
    }
  }

  private mapCiscoSeverity(level: string): Severity {
    const normalized = (level || '').toLowerCase();
    if (normalized === 'critical' || normalized === 'error') return 'CRITICAL';
    if (normalized === 'high') return 'HIGH';
    if (normalized === 'medium' || normalized === 'warning') return 'MEDIUM';
    if (normalized === 'low' || normalized === 'info') return 'LOW';
    return 'MEDIUM';
  }

  private mapCiscoCategory(type: string): SecurityCategory {
    const map: Record<string, SecurityCategory> = {
      'prompt_injection': 'prompt_injection',
      'data_exfiltration': 'data_exfiltration',
      'malicious_code': 'malicious_code',
      'privilege_escalation': 'privilege_escalation',
      'suspicious_network': 'suspicious_network',
      'obfuscation': 'obfuscation',
      'shell_injection': 'malicious_code',
      'file_access': 'sensitive_path_access',
    };
    return map[(type || '').toLowerCase()] || 'malicious_code';
  }

  // ─── Layer 2b: Cisco Scanner via Adapter ────────────────────────

  /**
   * Scan using the cisco-scanner.ts adapter module.
   * This is the preferred path — uses async execFile (safer than execSync),
   * proper temp file management in os.tmpdir(), and 30s timeout.
   *
   * Falls back gracefully if the scanner is not installed.
   */
  private async scanWithCiscoScannerAdapter(
    pkg: MarketplacePackage,
    content: string,
  ): Promise<{ findings: SecurityFinding[]; ciscoScanResult?: CiscoScanResult }> {
    const findings: SecurityFinding[] = [];

    // Check availability via the adapter (cached, fast)
    const available = await isCiscoScannerAvailable();
    if (!available) {
      console.warn('[security] Cisco Skill Scanner not installed. Run: pip install cisco-ai-skill-scanner');
      return { findings };
    }

    try {
      const ciscoResult = await ciscoScan(content, pkg.name);

      // Scanner returned but was unable to actually scan (score = -1)
      if (ciscoResult.score === -1) {
        return { findings, ciscoScanResult: ciscoResult };
      }

      // Map Cisco issues to SecurityFinding format
      for (const issue of ciscoResult.issues) {
        findings.push({
          rule_id: issue.rule_id || `CISCO-${findings.length}`,
          severity: this.mapCiscoSeverity(issue.severity),
          category: this.mapCiscoCategory(issue.type),
          title: issue.message || issue.type || 'Cisco scanner finding',
          description: issue.description || '',
          location: issue.location || (issue.line ? `line ${issue.line}` : undefined),
          engine: 'cisco_skill_scanner',
        });
      }

      // If the scan failed overall but no individual issues, add a summary finding
      if (!ciscoResult.passed && findings.length === 0) {
        findings.push({
          rule_id: 'CISCO-VERDICT',
          severity: 'HIGH',
          category: 'malicious_code',
          title: 'Cisco Skill Scanner: Overall verdict FAIL',
          description: 'Scanner returned FAIL verdict without specific findings.',
          engine: 'cisco_skill_scanner',
        });
      }

      return { findings, ciscoScanResult: ciscoResult };
    } catch (err) {
      console.warn(`[security] Cisco scanner adapter error: ${(err as Error).message}`);
      return { findings };
    }
  }

  // ─── Layer 3: MCP Guardian ────────────────────────────────────

  private async scanWithMcpGuardian(pkg: MarketplacePackage): Promise<SecurityFinding[]> {
    const findings: SecurityFinding[] = [];
    const manifest = pkg.install_manifest as InstallManifest | null;
    const mcpConfig = manifest?.mcp_config;

    if (!mcpConfig) return findings;

    // Try using the mcp-guardian npm library
    try {
      // Attempt to import dynamically (installed as optional peer dep)
      const guardian = await import('mcp-guardian').catch(() => null);

      if (guardian && guardian.scanToolDescription) {
        // Scan the MCP tool description / name
        const descToScan = [
          mcpConfig.name,
          pkg.description,
          ...(mcpConfig.args || []),
        ].join(' ');

        const result = guardian.scanToolDescription(mcpConfig.name, descToScan);

        if (result.status === 'critical') {
          for (const issue of (result.issues || []) as any[]) {
            findings.push({
              rule_id: `MCG-${issue.ruleId || 'CRIT'}`,
              severity: 'CRITICAL',
              category: this.mapGuardianCategory(issue.category),
              title: issue.message || 'MCP Guardian: Critical pattern detected',
              description: issue.description || issue.details || '',
              engine: 'mcp_guardian',
            });
          }
        } else if (result.status === 'warning') {
          for (const issue of (result.issues || []) as any[]) {
            findings.push({
              rule_id: `MCG-${issue.ruleId || 'WARN'}`,
              severity: 'MEDIUM',
              category: this.mapGuardianCategory(issue.category),
              title: issue.message || 'MCP Guardian: Warning pattern detected',
              description: issue.description || issue.details || '',
              engine: 'mcp_guardian',
            });
          }
        }

        // Tool pinning check
        if (guardian.verifyToolDefinitions) {
          const tools = [{ name: mcpConfig.name, description: pkg.description, schema: {} }];
          const pinResult = guardian.verifyToolDefinitions(tools);
          if (pinResult.status === 'changed') {
            findings.push({
              rule_id: 'MCG-RUGPULL',
              severity: 'HIGH',
              category: 'rug_pull',
              title: 'MCP tool definition changed since last approval',
              description: `Tool "${mcpConfig.name}" has been modified. Changed: ${pinResult.changedTools?.join(', ')}`,
              engine: 'mcp_guardian',
            });
          }
        }
      } else {
        // Fallback: run our own MCP pattern detection
        const fallbackFindings = this.mcpPatternScan(mcpConfig, pkg.description);
        findings.push(...fallbackFindings);
      }
    } catch {
      // mcp-guardian not installed — use built-in fallback
      const fallbackFindings = this.mcpPatternScan(mcpConfig, pkg.description);
      findings.push(...fallbackFindings);
    }

    return findings;
  }

  /**
   * Built-in fallback MCP pattern detection (subset of MCP Guardian's 51 rules).
   * Used when mcp-guardian npm package is not installed.
   */
  private mcpPatternScan(config: McpServerConfig, description: string): SecurityFinding[] {
    const findings: SecurityFinding[] = [];
    const allText = [config.name, description, ...(config.args || [])].join(' ').toLowerCase();

    // ── Critical: Cross-tool instructions ──
    const crossToolPatterns = [
      /before using this tool/i,
      /first call/i,
      /then execute/i,
      /always call .+ before/i,
      /after this tool.*call/i,
      /instead of .+ use this/i,
    ];
    for (const pat of crossToolPatterns) {
      if (pat.test(allText)) {
        findings.push({
          rule_id: 'MCG-F-CROSS',
          severity: 'CRITICAL',
          category: 'cross_origin_escalation',
          title: 'Cross-tool instruction detected in MCP description',
          description: `Pattern "${pat.source}" found — this may be a tool shadowing attack.`,
          engine: 'mcp_guardian',
        });
        break;
      }
    }

    // ── Critical: Privilege escalation ──
    const privEscPatterns = [
      /ignore previous instructions/i,
      /override system/i,
      /you are now/i,
      /disregard all prior/i,
      /forget everything/i,
      /new instructions:/i,
    ];
    for (const pat of privEscPatterns) {
      if (pat.test(allText)) {
        findings.push({
          rule_id: 'MCG-F-PRIV',
          severity: 'CRITICAL',
          category: 'privilege_escalation',
          title: 'Privilege escalation pattern in MCP description',
          description: `Pattern "${pat.source}" found — possible prompt injection.`,
          engine: 'mcp_guardian',
        });
        break;
      }
    }

    // ── Critical: Data exfiltration URLs ──
    const exfilPatterns = [
      /https?:\/\/[^\s]+/i,  // Any URL in tool description
      /send to/i,
      /post to/i,
      /forward to/i,
      /upload to/i,
      /exfiltrate/i,
    ];
    if (/https?:\/\/(?!github\.com|npmjs\.com|localhost)[^\s]+/.test(allText)) {
      findings.push({
        rule_id: 'MCG-F-EXFIL',
        severity: 'HIGH',
        category: 'data_exfiltration',
        title: 'External URL found in MCP tool description',
        description: 'Tool description contains a URL pointing to an external server, which could be used for data exfiltration.',
        engine: 'mcp_guardian',
      });
    }

    // ── Warning: Sensitive paths ──
    const sensitivePaths = [
      /~\/\.ssh/i, /~\/\.aws/i, /~\/\.gnupg/i, /\/etc\/passwd/i,
      /\/etc\/shadow/i, /\.env/i, /api_key/i, /secret_key/i, /private_key/i,
    ];
    for (const pat of sensitivePaths) {
      if (pat.test(allText)) {
        findings.push({
          rule_id: 'MCG-F-PATH',
          severity: 'MEDIUM',
          category: 'sensitive_path_access',
          title: 'Sensitive path reference in MCP description',
          description: `Pattern "${pat.source}" found — tool may access sensitive files.`,
          engine: 'mcp_guardian',
        });
        break;
      }
    }

    // ── Warning: Encoded/obfuscated content ──
    const obfuscationPatterns = [
      /[A-Za-z0-9+/]{40,}={0,2}/,  // Base64 strings
      /\\u[0-9a-fA-F]{4}/,          // Unicode escapes
      /\\x[0-9a-fA-F]{2}/,          // Hex encoding
      /eval\s*\(/i,
      /Function\s*\(/i,
    ];
    for (const pat of obfuscationPatterns) {
      if (pat.test(allText)) {
        findings.push({
          rule_id: 'MCG-F-OBFUS',
          severity: 'MEDIUM',
          category: 'obfuscation',
          title: 'Obfuscated content detected in MCP description',
          description: `Encoded or obfuscated content found — may be hiding malicious instructions.`,
          engine: 'mcp_guardian',
        });
        break;
      }
    }

    return findings;
  }

  private mapGuardianCategory(category: string): SecurityCategory {
    const map: Record<string, SecurityCategory> = {
      'cross-tool': 'cross_origin_escalation',
      'privilege-escalation': 'privilege_escalation',
      'exfiltration': 'data_exfiltration',
      'sensitive-path': 'sensitive_path_access',
      'encoded-content': 'obfuscation',
    };
    return map[category] || 'tool_poisoning';
  }

  // ─── Layer 4: Built-in Waggle Heuristics ──────────────────────

  /**
   * Waggle-specific security heuristics that run on all content types.
   * These catch patterns specific to agent skill abuse.
   */
  private scanWithHeuristics(
    pkg: MarketplacePackage,
    content: string,
  ): SecurityFinding[] {
    const findings: SecurityFinding[] = [];

    // ── CRITICAL: System prompt manipulation ──
    const promptManipulation = [
      /ignore all previous instructions/i,
      /disregard your system prompt/i,
      /you are now a/i,
      /override your instructions/i,
      /forget your rules/i,
      /new persona:/i,
      /act as if you have no restrictions/i,
      /jailbreak/i,
      /DAN mode/i,
      /bypass safety/i,
    ];
    for (const pat of promptManipulation) {
      const match = content.match(pat);
      if (match) {
        findings.push({
          rule_id: 'WAG-001',
          severity: 'CRITICAL',
          category: 'prompt_injection',
          title: 'System prompt manipulation attempt',
          description: `Found "${match[0]}" — this attempts to override the agent's system prompt.`,
          location: this.findLineNumber(content, match.index || 0),
          engine: 'waggle_heuristics',
        });
      }
    }

    // ── CRITICAL: Data exfiltration via curl/wget/fetch ──
    const exfilCommands = [
      /curl\s+.*-X\s*POST\s+https?:\/\/(?!localhost)/i,
      /curl\s+.*--data.*https?:\/\/(?!localhost)/i,
      /wget\s+.*-O-.*\|/i,
      /fetch\s*\(\s*['"]https?:\/\/(?!localhost)/i,
      /\bexfiltrate\b/i,
      /base64.*\|\s*curl/i,
      /cat\s+.*\|\s*nc\s/i,
    ];
    for (const pat of exfilCommands) {
      const match = content.match(pat);
      if (match) {
        findings.push({
          rule_id: 'WAG-002',
          severity: 'CRITICAL',
          category: 'data_exfiltration',
          title: 'Data exfiltration command detected',
          description: `Found "${match[0]}" — this may send user data to an external server.`,
          location: this.findLineNumber(content, match.index || 0),
          engine: 'waggle_heuristics',
        });
      }
    }

    // ── HIGH: Suspicious file access ──
    const fileAccess = [
      /~\/\.waggle\/.*\.mind/i,       // Agent memory files
      /~\/\.ssh\/id_/i,               // SSH private keys
      /~\/\.aws\/credentials/i,       // AWS credentials
      /~\/\.gnupg/i,                  // GPG keys
      /\/etc\/shadow/i,               // System passwords
      /\.env\b/i,                     // Environment files
      /WAGGLE_.*TOKEN/i,              // Waggle tokens
      /registry\.json/i,              // Plugin registry (write access)
    ];
    for (const pat of fileAccess) {
      const match = content.match(pat);
      if (match) {
        findings.push({
          rule_id: 'WAG-003',
          severity: 'HIGH',
          category: 'sensitive_path_access',
          title: 'Access to sensitive file path',
          description: `Found "${match[0]}" — this skill references sensitive files that should not be accessed.`,
          location: this.findLineNumber(content, match.index || 0),
          engine: 'waggle_heuristics',
        });
      }
    }

    // ── HIGH: Code execution patterns ──
    const codeExec = [
      /eval\s*\(/i,
      /exec\s*\(/i,
      /Function\s*\(\s*['"]return/i,
      /child_process/i,
      /require\s*\(\s*['"]child_process/i,
      /import.*child_process/i,
      /subprocess\.run/i,
      /os\.system\s*\(/i,
      /\bexecSync\b/i,
    ];
    for (const pat of codeExec) {
      const match = content.match(pat);
      if (match) {
        findings.push({
          rule_id: 'WAG-004',
          severity: 'HIGH',
          category: 'malicious_code',
          title: 'Arbitrary code execution pattern',
          description: `Found "${match[0]}" — skills should not contain executable code patterns.`,
          location: this.findLineNumber(content, match.index || 0),
          engine: 'waggle_heuristics',
        });
      }
    }

    // ── MEDIUM: Excessive permission requests ──
    const excessivePerms = [
      /full access to.*filesystem/i,
      /unrestricted.*bash/i,
      /sudo/i,
      /root access/i,
      /disable.*confirmation/i,
      /auto.?approve/i,
      /skip.*verification/i,
      /bypass.*security/i,
    ];
    for (const pat of excessivePerms) {
      const match = content.match(pat);
      if (match) {
        findings.push({
          rule_id: 'WAG-005',
          severity: 'MEDIUM',
          category: 'privilege_escalation',
          title: 'Excessive permission request',
          description: `Found "${match[0]}" — this skill requests elevated privileges that may not be necessary.`,
          location: this.findLineNumber(content, match.index || 0),
          engine: 'waggle_heuristics',
        });
      }
    }

    // ── MEDIUM: Hidden instructions (zero-width chars, HTML comments) ──
    const hiddenContent = [
      /[\u200B\u200C\u200D\u2060\uFEFF]{2,}/,  // Zero-width characters
      /<!--[\s\S]*?-->/,                          // HTML comments (hidden instructions)
      /\[hidden\]/i,
      /\[invisible\]/i,
      /display:\s*none/i,
      /opacity:\s*0/i,
      /color:\s*transparent/i,
    ];
    for (const pat of hiddenContent) {
      const match = content.match(pat);
      if (match) {
        findings.push({
          rule_id: 'WAG-006',
          severity: 'MEDIUM',
          category: 'obfuscation',
          title: 'Hidden content detected',
          description: `Found obfuscated or hidden content that may contain concealed instructions.`,
          location: this.findLineNumber(content, match.index || 0),
          engine: 'waggle_heuristics',
        });
      }
    }

    // ── LOW: Waggle internals referenced ──
    const internals = [
      /orchestrator/i,
      /PluginManager/i,
      /MindDB/i,
      /waggle-dance/i,
      /system-prompt\.md/i,
    ];
    let internalCount = 0;
    for (const pat of internals) {
      if (pat.test(content)) internalCount++;
    }
    if (internalCount >= 3) {
      findings.push({
        rule_id: 'WAG-007',
        severity: 'LOW',
        category: 'suspicious_network',
        title: 'Excessive Waggle internal references',
        description: `Skill references ${internalCount} Waggle internal components — may be probing platform internals.`,
        engine: 'waggle_heuristics',
      });
    }

    return findings;
  }

  // ─── Helpers ──────────────────────────────────────────────────

  private hash(content: string): string {
    return createHash('sha256').update(content, 'utf-8').digest('hex');
  }

  private findLineNumber(content: string, charIndex: number): string {
    const lines = content.substring(0, charIndex).split('\n');
    return `line ${lines.length}`;
  }

  private getCacheKey(name: string, hash: string): string {
    return join(this.config.cache_dir, `${name}-${hash.substring(0, 12)}.json`);
  }

  private getCachedResult(name: string, hash: string): ScanResult | null {
    if (!hash) return null;
    const cachePath = this.getCacheKey(name, hash);
    if (!existsSync(cachePath)) return null;

    try {
      const cached = JSON.parse(readFileSync(cachePath, 'utf-8')) as ScanResult & { _cached_at: number };
      const ageHours = (Date.now() - cached._cached_at) / (1000 * 60 * 60);
      if (ageHours > this.config.cache_ttl_hours) return null;
      return cached;
    } catch {
      return null;
    }
  }

  private cacheResult(name: string, hash: string, result: ScanResult): void {
    if (!hash) return;
    const cachePath = this.getCacheKey(name, hash);
    try {
      writeFileSync(cachePath, JSON.stringify({ ...result, _cached_at: Date.now() }, null, 2), 'utf-8');
    } catch { /* ignore cache write failures */ }
  }

  // ─── Reporting ────────────────────────────────────────────────

  /**
   * Format scan results as a human-readable report.
   */
  formatReport(result: ScanResult): string {
    const lines: string[] = [];
    const statusIcon = result.blocked ? '🚫' : result.overall_severity === 'CLEAN' ? '✅' : '⚠️';

    lines.push(`${statusIcon} Security Scan: ${result.package_name}`);
    lines.push(`${'─'.repeat(50)}`);
    lines.push(`Type:      ${result.package_type}`);
    lines.push(`Severity:  ${result.overall_severity}`);
    lines.push(`Score:     ${result.security_score}/100`);
    lines.push(`Blocked:   ${result.blocked ? 'YES' : 'no'}`);
    lines.push(`Engines:   ${result.engines_used.join(', ')}`);
    lines.push(`Duration:  ${result.scan_duration_ms}ms`);
    lines.push(`Hash:      ${result.content_hash.substring(0, 16)}...`);
    lines.push('');

    if (result.findings.length === 0) {
      lines.push('  No security issues found.');
    } else {
      lines.push(`  ${result.findings.length} finding(s):`);
      lines.push('');

      for (const f of result.findings) {
        const icon = f.severity === 'CRITICAL' ? '🔴' :
                     f.severity === 'HIGH' ? '🟠' :
                     f.severity === 'MEDIUM' ? '🟡' : '🔵';
        lines.push(`  ${icon} [${f.severity}] ${f.title}`);
        lines.push(`     Rule: ${f.rule_id} | Engine: ${f.engine} | Category: ${f.category}`);
        if (f.description) lines.push(`     ${f.description}`);
        if (f.location) lines.push(`     Location: ${f.location}`);
        lines.push('');
      }
    }

    return lines.join('\n');
  }
}
