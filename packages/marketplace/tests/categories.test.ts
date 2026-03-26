/**
 * Package Categories — Tests
 *
 * Validates:
 * - PACKAGE_CATEGORIES has 20+ entries with required fields
 * - categorizePackage correctly classifies known packages
 * - recategorizeAll updates categories in a temp DB
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import Database from 'better-sqlite3';
import { PACKAGE_CATEGORIES, categorizePackage, recategorizeAll } from '../src/categories';
import { MarketplaceDB } from '../src/db';

// ── Helpers ──────────────────────────────────────────────────────────

function createEmptyTempDb(): { db: MarketplaceDB; tmpDir: string; dbPath: string } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-mkt-cat-'));
  const dbPath = path.join(tmpDir, 'marketplace.db');

  const raw = new Database(dbPath);
  raw.pragma('journal_mode = WAL');
  raw.pragma('foreign_keys = ON');

  raw.exec(`
    CREATE TABLE meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      url TEXT,
      source_type TEXT NOT NULL,
      platform TEXT NOT NULL,
      total_packages INTEGER DEFAULT 0,
      install_method TEXT,
      api_endpoint TEXT,
      description TEXT,
      last_synced_at TEXT,
      is_custom BOOLEAN DEFAULT 0
    );

    CREATE TABLE packages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER REFERENCES sources(id),
      name TEXT NOT NULL,
      display_name TEXT NOT NULL,
      description TEXT,
      author TEXT,
      package_type TEXT NOT NULL,
      waggle_install_type TEXT NOT NULL,
      waggle_install_path TEXT,
      version TEXT DEFAULT '1.0.0',
      license TEXT,
      repository_url TEXT,
      homepage_url TEXT,
      downloads INTEGER DEFAULT 0,
      stars INTEGER DEFAULT 0,
      rating REAL DEFAULT 0,
      rating_count INTEGER DEFAULT 0,
      category TEXT,
      subcategory TEXT,
      install_manifest JSON,
      platforms JSON DEFAULT '[]',
      min_waggle_version TEXT,
      dependencies JSON DEFAULT '[]',
      packs JSON DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      security_status TEXT DEFAULT 'unscanned',
      security_score INTEGER DEFAULT -1,
      last_scanned_at TEXT,
      content_hash TEXT,
      scan_engines JSON,
      scan_findings JSON,
      scan_blocked BOOLEAN DEFAULT 0,
      UNIQUE(source_id, name)
    );

    CREATE VIRTUAL TABLE packages_fts USING fts5(
      name, display_name, description, author, category,
      content='packages',
      content_rowid='id'
    );

    CREATE TABLE packs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      description TEXT,
      target_roles TEXT,
      icon TEXT,
      priority TEXT DEFAULT 'MEDIUM',
      connectors_needed JSON DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE pack_packages (
      pack_id INTEGER REFERENCES packs(id),
      package_id INTEGER REFERENCES packages(id),
      is_core BOOLEAN DEFAULT 0,
      PRIMARY KEY (pack_id, package_id)
    );

    CREATE TABLE installations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      package_id INTEGER REFERENCES packages(id),
      installed_version TEXT NOT NULL,
      installed_at TEXT DEFAULT (datetime('now')),
      install_path TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      config JSON DEFAULT '{}'
    );

    CREATE TABLE scan_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      package_id INTEGER REFERENCES packages(id),
      scanned_at TEXT DEFAULT (datetime('now')),
      overall_severity TEXT NOT NULL,
      security_score INTEGER NOT NULL,
      content_hash TEXT,
      engines_used JSON,
      findings JSON,
      blocked BOOLEAN DEFAULT 0,
      scan_duration_ms INTEGER,
      triggered_by TEXT DEFAULT 'manual'
    );

    CREATE TABLE security_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Seed a test source
  raw.prepare(`
    INSERT INTO sources (name, display_name, url, source_type, platform, total_packages)
    VALUES ('test-source', 'Test Source', 'https://example.com', 'marketplace', 'waggle', 0)
  `).run();

  raw.close();

  const db = new MarketplaceDB(dbPath);
  return { db, tmpDir, dbPath };
}

// ── PACKAGE_CATEGORIES structure ─────────────────────────────────────

describe('PACKAGE_CATEGORIES', () => {
  it('has at least 20 entries', () => {
    expect(PACKAGE_CATEGORIES.length).toBeGreaterThanOrEqual(20);
  });

  it('has exactly 22 entries', () => {
    expect(PACKAGE_CATEGORIES.length).toBe(22);
  });

  it('each category has id, name, icon, and description', () => {
    for (const cat of PACKAGE_CATEGORIES) {
      expect(cat.id).toBeTruthy();
      expect(typeof cat.id).toBe('string');
      expect(cat.name).toBeTruthy();
      expect(typeof cat.name).toBe('string');
      expect(cat.icon).toBeTruthy();
      expect(cat.description).toBeTruthy();
      expect(typeof cat.description).toBe('string');
    }
  });

  it('all category IDs are unique', () => {
    const ids = PACKAGE_CATEGORIES.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('includes expected categories', () => {
    const ids = PACKAGE_CATEGORIES.map(c => c.id);
    expect(ids).toContain('coding');
    expect(ids).toContain('marketing');
    expect(ids).toContain('security');
    expect(ids).toContain('general');
    expect(ids).toContain('data');
    expect(ids).toContain('communication');
    expect(ids).toContain('integration');
  });

  it('has "general" as the last category (catch-all)', () => {
    const last = PACKAGE_CATEGORIES[PACKAGE_CATEGORIES.length - 1];
    expect(last.id).toBe('general');
  });
});

// ── categorizePackage ────────────────────────────────────────────────

describe('categorizePackage', () => {
  it('classifies code-related packages as coding', () => {
    expect(categorizePackage('code-review', 'Automated code review for TypeScript')).toBe('coding');
    expect(categorizePackage('git-helper', 'Git repository management')).toBe('coding');
    expect(categorizePackage('python-debugger', 'Debug Python scripts')).toBe('coding');
  });

  it('classifies marketing packages', () => {
    expect(categorizePackage('seo-optimizer', 'Optimize your SEO rankings')).toBe('marketing');
    expect(categorizePackage('campaign-planner', 'Plan marketing campaigns')).toBe('marketing');
  });

  it('classifies research packages as knowledge', () => {
    expect(categorizePackage('deep-research', 'Academic research and literature review')).toBe('knowledge');
    expect(categorizePackage('paper-analyzer', 'Analyze research papers')).toBe('knowledge');
  });

  it('classifies security packages', () => {
    expect(categorizePackage('vuln-scanner', 'Scan for vulnerabilities')).toBe('security');
    expect(categorizePackage('pentest-helper', 'Penetration testing assistant')).toBe('security');
  });

  it('classifies data packages', () => {
    expect(categorizePackage('sql-query', 'Query SQL databases')).toBe('data');
    expect(categorizePackage('chart-builder', 'Data visualization and analytics')).toBe('data');
  });

  it('classifies communication packages', () => {
    expect(categorizePackage('slack-bot', 'Slack integration')).toBe('communication');
    expect(categorizePackage('email-sender', 'Send and manage email')).toBe('communication');
  });

  it('classifies finance packages', () => {
    expect(categorizePackage('invoice-gen', 'Generate invoices and financial reports')).toBe('finance');
    expect(categorizePackage('budget-tracker', 'Track budgets and expenses')).toBe('finance');
  });

  it('classifies legal packages', () => {
    expect(categorizePackage('contract-review', 'Review legal contracts')).toBe('legal');
    expect(categorizePackage('compliance-checker', 'Regulatory compliance checking')).toBe('legal');
  });

  it('classifies AI/ML packages', () => {
    expect(categorizePackage('llm-eval', 'Evaluate LLM outputs')).toBe('ai-ml');
    expect(categorizePackage('prompt-optimizer', 'Prompt engineering tool')).toBe('ai-ml');
  });

  it('classifies integration packages', () => {
    expect(categorizePackage('webhook-manager', 'Manage webhooks and integrations')).toBe('integration');
  });

  it('falls back to general for unrecognized packages', () => {
    expect(categorizePackage('my-custom-thing', 'does something unique')).toBe('general');
    expect(categorizePackage('xyz', '')).toBe('general');
  });

  it('is case-insensitive', () => {
    expect(categorizePackage('CODE-REVIEW', 'TYPESCRIPT debugging')).toBe('coding');
  });

  it('classifies education packages', () => {
    expect(categorizePackage('tutor-bot', 'Educational tutoring assistant')).toBe('education');
  });

  it('classifies devops packages', () => {
    expect(categorizePackage('docker-helper', 'Docker and Kubernetes management')).toBe('devops');
    expect(categorizePackage('ci-cd-pipeline', 'CI/CD pipeline automation')).toBe('devops');
  });

  it('classifies project management packages', () => {
    expect(categorizePackage('jira-sync', 'Sync tasks with Jira')).toBe('project-management');
    expect(categorizePackage('sprint-planner', 'Sprint planning and tracking')).toBe('project-management');
  });
});

// ── recategorizeAll ──────────────────────────────────────────────────

describe('recategorizeAll', () => {
  let db: MarketplaceDB;
  let tmpDir: string;

  beforeEach(() => {
    const ctx = createEmptyTempDb();
    db = ctx.db;
    tmpDir = ctx.tmpDir;
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns zero updated when DB is empty', () => {
    const result = recategorizeAll(db);
    expect(result.updated).toBe(0);
    expect(result.total).toBe(0);
  });

  it('recategorizes packages with wrong categories', () => {
    // Insert a package with a wrong category
    db.upsertPackage({
      name: 'code-review-skill',
      source_id: 1,
      display_name: 'Code Review Skill',
      description: 'Automated code review and debugging for TypeScript',
      author: 'tester',
      package_type: 'skill',
      waggle_install_type: 'skill',
      waggle_install_path: 'skills/code-review.md',
      category: 'general', // Wrong -- should be 'coding'
      platforms: [],
      dependencies: [],
      packs: [],
    });

    const result = recategorizeAll(db);
    expect(result.total).toBe(1);
    expect(result.updated).toBe(1);

    // Verify the category was updated
    const pkg = db.getPackageByName('code-review-skill');
    expect(pkg).not.toBeNull();
    expect(pkg!.category).toBe('coding');
  });

  it('does not update packages already correctly categorized', () => {
    db.upsertPackage({
      name: 'security-scanner',
      source_id: 1,
      display_name: 'Security Scanner',
      description: 'Vulnerability scanning tool',
      author: 'tester',
      package_type: 'skill',
      waggle_install_type: 'skill',
      waggle_install_path: 'skills/sec-scanner.md',
      category: 'security', // Already correct
      platforms: [],
      dependencies: [],
      packs: [],
    });

    const result = recategorizeAll(db);
    expect(result.total).toBe(1);
    expect(result.updated).toBe(0);
  });

  it('handles multiple packages', () => {
    // Insert packages with wrong categories
    db.upsertPackage({
      name: 'slack-connector',
      source_id: 1,
      display_name: 'Slack Connector',
      description: 'Send messages to Slack channels',
      author: 'tester',
      package_type: 'plugin',
      waggle_install_type: 'plugin',
      waggle_install_path: 'plugins/slack/',
      category: 'general',
      platforms: [],
      dependencies: [],
      packs: [],
    });

    db.upsertPackage({
      name: 'research-helper',
      source_id: 1,
      display_name: 'Research Helper',
      description: 'Academic research and literature review tool',
      author: 'tester',
      package_type: 'skill',
      waggle_install_type: 'skill',
      waggle_install_path: 'skills/research.md',
      category: 'general',
      platforms: [],
      dependencies: [],
      packs: [],
    });

    const result = recategorizeAll(db);
    expect(result.total).toBe(2);
    expect(result.updated).toBe(2);

    // Verify categories
    const slack = db.getPackageByName('slack-connector');
    expect(slack!.category).toBe('communication');

    const research = db.getPackageByName('research-helper');
    expect(research!.category).toBe('knowledge');
  });
});
