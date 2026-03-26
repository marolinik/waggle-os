/**
 * Marketplace Production Routes
 *
 * Always-available API endpoints for the marketplace — search catalog,
 * list/install/uninstall packages, query packs, and run security scans.
 *
 * These replace the dev-only /_dev/marketplace/ routes with stable
 * /api/marketplace/ contracts.
 */

import type { FastifyInstance } from 'fastify';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { MarketplaceDB, MarketplaceInstaller, MarketplaceSync, SecurityGate, ENTERPRISE_PACKS, PACKAGE_CATEGORIES, recategorizeAll, isCiscoScannerAvailable } from '@waggle/marketplace';
import type { InstallationType, SearchSort, ScanResult, MarketplacePackage } from '@waggle/marketplace';
import { validateSkillMd } from '@waggle/sdk';
import { getKvarkConfig } from '../../kvark/kvark-config.js';
import { emitNotification } from './notifications.js';

type ScanStatus = 'passed' | 'failed' | 'not_scanned' | 'unavailable';

export async function marketplaceRoutes(fastify: FastifyInstance) {
  // ── Helpers ──────────────────────────────────────────────────────────

  function getDb(): MarketplaceDB | null {
    return (fastify as any).marketplace ?? null;
  }

  function requireDb(reply: any): MarketplaceDB | null {
    const db = getDb();
    if (!db) {
      reply.code(503).send({
        error: 'Marketplace not available',
        hint: 'marketplace.db was not found or failed to load',
      });
      return null;
    }
    return db;
  }

  // ── GET /api/marketplace/search ─────────────────────────────────────
  // Search the package catalog with FTS5 + faceted filters.

  fastify.get('/api/marketplace/search', async (request, reply) => {
    const db = requireDb(reply);
    if (!db) return;

    const { query, type, category, pack, source, sort, limit, offset } = request.query as {
      query?: string;
      type?: string;
      category?: string;
      pack?: string;
      source?: string;
      sort?: string;
      limit?: string;
      offset?: string;
    };

    const validSorts: SearchSort[] = ['relevance', 'popular', 'recent', 'name'];
    const sortParam = sort && validSorts.includes(sort as SearchSort)
      ? sort as SearchSort
      : undefined;

    const results = db.search({
      query: query || '',
      type: type as InstallationType | undefined,
      category,
      pack,
      source,
      sort: sortParam,
      limit: limit ? parseInt(limit, 10) : 20,
      offset: offset ? parseInt(offset, 10) : 0,
    });

    // Annotate each package with installation status and scan status
    const annotated = results.packages.map(pkg => {
      const rawPkg = pkg as any;
      const secStatus = rawPkg.security_status as string | undefined;
      const secScore = rawPkg.security_score as number | undefined;

      let scanStatus: ScanStatus = 'not_scanned';
      if (secStatus && secStatus !== 'unscanned') {
        if (secStatus === 'clean' || secStatus === 'low') {
          scanStatus = 'passed';
        } else if (secStatus === 'critical' || secStatus === 'high') {
          scanStatus = 'failed';
        } else if (secStatus === 'medium') {
          scanStatus = 'passed'; // medium = passed with warnings
        }
      }

      return {
        ...pkg,
        installed: db.isInstalled(pkg.id),
        scanStatus,
        scanScore: (secScore != null && secScore >= 0) ? secScore : undefined,
      };
    });

    return {
      ...results,
      packages: annotated,
      categories: PACKAGE_CATEGORIES,
    };
  });

  // ── GET /api/marketplace/packs ──────────────────────────────────────
  // List all capability packs.

  fastify.get('/api/marketplace/packs', async (request, reply) => {
    const db = requireDb(reply);
    if (!db) return;

    const packs = db.listPacks();
    return { packs, total: packs.length };
  });

  // ── GET /api/marketplace/packs/:slug ────────────────────────────────
  // Get pack detail with its packages.

  fastify.get('/api/marketplace/packs/:slug', async (request, reply) => {
    const db = requireDb(reply);
    if (!db) return;

    const { slug } = request.params as { slug: string };
    const result = db.getPacksBySlug(slug);

    if (!result) {
      return reply.code(404).send({ error: `Pack "${slug}" not found` });
    }

    return result;
  });

  // ── GET /api/marketplace/enterprise-packs ─────────────────────────────
  // Returns enterprise packs that require KVARK. Only populated when
  // KVARK credentials are configured in the vault.

  fastify.get('/api/marketplace/enterprise-packs', async (request, reply) => {
    const vault = fastify.vault;
    const kvarkConfigured = vault ? getKvarkConfig(vault) !== null : false;

    if (!kvarkConfigured) {
      return {
        packs: [],
        total: 0,
        kvarkRequired: true,
        hint: 'Enterprise packs require a KVARK connection. Configure KVARK credentials in the vault to unlock.',
      };
    }

    return {
      packs: ENTERPRISE_PACKS,
      total: ENTERPRISE_PACKS.length,
      kvarkRequired: false,
    };
  });

  // ── POST /api/marketplace/install ───────────────────────────────────
  // Install a package from the marketplace with SecurityGate pre-scan.
  // Severity-based gating:
  //   CRITICAL → 403 (always blocked)
  //   HIGH     → 403 unless force=true (override logged to audit)
  //   MEDIUM   → install proceeds, warnings in response
  //   LOW      → install proceeds, logged to audit trail
  //   CLEAN    → install proceeds immediately

  fastify.post('/api/marketplace/install', async (request, reply) => {
    const db = requireDb(reply);
    if (!db) return;

    const body = request.body as {
      packageId: number;
      installPath?: string;
      settings?: Record<string, string>;
      force?: boolean;
      forceInsecure?: boolean;
    };

    if (!body.packageId) {
      return reply.code(400).send({ error: 'packageId is required' });
    }

    // ── SecurityGate pre-scan (heuristics-only for now) ──────────────
    const pkg = db.getPackage(body.packageId);
    if (!pkg) {
      return reply.code(404).send({ error: `Package ID ${body.packageId} not found` });
    }

    const gate = new SecurityGate({
      enable_gen_trust_hub: false,
      enable_cisco_scanner: false,
      enable_mcp_guardian: false,
      enable_heuristics: true,
    });

    let scanResult: ScanResult | undefined;
    try {
      scanResult = await gate.scan(pkg);
    } catch {
      // Scan failure should not block installation — proceed with warning
    }

    if (scanResult) {
      const severity = scanResult.overall_severity;
      const score = scanResult.security_score;

      // CRITICAL (score 0): Always blocked — return 403
      if (severity === 'CRITICAL') {
        // Log to audit store if available
        try {
          (fastify as any).auditStore?.record({
            capabilityName: pkg.name,
            capabilityType: pkg.waggle_install_type,
            source: 'marketplace',
            riskLevel: 'critical',
            trustSource: 'security-gate',
            approvalClass: 'blocked',
            action: 'blocked',
            initiator: 'system',
            detail: `SecurityGate blocked: ${scanResult.findings.length} finding(s), severity=${severity}, score=${score}`,
          });
        } catch { /* audit failure is non-blocking */ }

        return reply.code(403).send({
          blocked: true,
          severity,
          score,
          findings: scanResult.findings,
          message: `Installation blocked: ${scanResult.findings.length} CRITICAL security finding(s) detected.`,
        });
      }

      // HIGH (score 25): Blocked unless force=true
      if (severity === 'HIGH' && !body.force) {
        try {
          (fastify as any).auditStore?.record({
            capabilityName: pkg.name,
            capabilityType: pkg.waggle_install_type,
            source: 'marketplace',
            riskLevel: 'high',
            trustSource: 'security-gate',
            approvalClass: 'blocked',
            action: 'blocked',
            initiator: 'system',
            detail: `SecurityGate blocked (HIGH): ${scanResult.findings.length} finding(s). Use force=true to override.`,
          });
        } catch { /* audit failure is non-blocking */ }

        return reply.code(403).send({
          blocked: true,
          severity,
          score,
          findings: scanResult.findings,
          message: `Installation blocked: ${scanResult.findings.length} HIGH severity finding(s). Send force=true to override.`,
        });
      }

      // HIGH with force=true: Log the override to audit trail
      if (severity === 'HIGH' && body.force) {
        try {
          (fastify as any).auditStore?.record({
            capabilityName: pkg.name,
            capabilityType: pkg.waggle_install_type,
            source: 'marketplace',
            riskLevel: 'high',
            trustSource: 'security-gate',
            approvalClass: 'force-override',
            action: 'approved',
            initiator: 'user',
            detail: `User forced install despite HIGH severity findings: ${scanResult.findings.map(f => f.title).join('; ')}`,
          });
        } catch { /* audit failure is non-blocking */ }
      }

      // MEDIUM: Log warning but proceed
      if (severity === 'MEDIUM') {
        try {
          (fastify as any).auditStore?.record({
            capabilityName: pkg.name,
            capabilityType: pkg.waggle_install_type,
            source: 'marketplace',
            riskLevel: 'medium',
            trustSource: 'security-gate',
            approvalClass: 'standard',
            action: 'approved',
            initiator: 'system',
            detail: `SecurityGate passed with warnings: ${scanResult.findings.length} MEDIUM finding(s)`,
          });
        } catch { /* audit failure is non-blocking */ }
      }

      // LOW: Log to audit trail only
      if (severity === 'LOW') {
        try {
          (fastify as any).auditStore?.record({
            capabilityName: pkg.name,
            capabilityType: pkg.waggle_install_type,
            source: 'marketplace',
            riskLevel: 'low',
            trustSource: 'security-gate',
            approvalClass: 'standard',
            action: 'approved',
            initiator: 'system',
            detail: `SecurityGate passed: ${scanResult.findings.length} LOW finding(s)`,
          });
        } catch { /* audit failure is non-blocking */ }
      }
    }

    // ── Proceed with installation ────────────────────────────────────
    const installer = new MarketplaceInstaller(db, {
      enable_gen_trust_hub: false,
      enable_cisco_scanner: false,
      enable_mcp_guardian: false,
      enable_heuristics: true,
    });
    const result = await installer.install({
      packageId: body.packageId,
      installPath: body.installPath,
      settings: body.settings,
      force: body.force,
      forceInsecure: body.forceInsecure,
    });

    // Update security status in DB after successful install
    if (result.success && scanResult) {
      try {
        const rawDb = (db as any).db;
        if (rawDb?.prepare) {
          rawDb.prepare(`
            UPDATE packages SET
              security_status = ?,
              security_score = ?
            WHERE id = ?
          `).run(
            scanResult.overall_severity.toLowerCase(),
            scanResult.security_score,
            body.packageId,
          );
        }
      } catch { /* non-blocking */ }
    }

    // Attach security scan info to the response
    const response: Record<string, unknown> = { ...result };
    if (scanResult) {
      response.security = {
        severity: scanResult.overall_severity,
        score: scanResult.security_score,
        findingsCount: scanResult.findings.length,
        findings: scanResult.findings,
        warnings: scanResult.overall_severity === 'MEDIUM'
          ? scanResult.findings.map(f => `[${f.severity}] ${f.title}`)
          : undefined,
      };
    }

    return reply.code(result.success ? 200 : 422).send(response);
  });

  // ── POST /api/marketplace/uninstall ─────────────────────────────────
  // Uninstall a previously installed package.

  fastify.post('/api/marketplace/uninstall', async (request, reply) => {
    const db = requireDb(reply);
    if (!db) return;

    const body = request.body as { packageId: number };

    if (!body.packageId) {
      return reply.code(400).send({ error: 'packageId is required' });
    }

    const installer = new MarketplaceInstaller(db);
    const result = await installer.uninstall(body.packageId);

    return reply.code(result.success ? 200 : 422).send(result);
  });

  // ── GET /api/marketplace/installed ──────────────────────────────────
  // List all currently installed packages.

  fastify.get('/api/marketplace/installed', async (request, reply) => {
    const db = requireDb(reply);
    if (!db) return;

    const installations = db.listInstallations();
    return { installations, total: installations.length };
  });

  // ── POST /api/marketplace/security-check ────────────────────────────
  // Run a security scan on a package (by ID) without installing it.

  fastify.post('/api/marketplace/security-check', async (request, reply) => {
    const db = requireDb(reply);
    if (!db) return;

    const body = request.body as { packageId: number };

    if (!body.packageId) {
      return reply.code(400).send({ error: 'packageId is required' });
    }

    const installer = new MarketplaceInstaller(db, {
      enable_gen_trust_hub: false,
      enable_cisco_scanner: false,
      enable_mcp_guardian: false,
      enable_heuristics: true,
    });

    const scanResult = await installer.scanOnly(body.packageId);

    if (!scanResult) {
      return reply.code(404).send({ error: `Package ID ${body.packageId} not found` });
    }

    return {
      packageId: body.packageId,
      severity: scanResult.overall_severity,
      score: scanResult.security_score,
      blocked: scanResult.blocked,
      enginesUsed: scanResult.engines_used,
      findingsCount: scanResult.findings.length,
      findings: scanResult.findings,
      durationMs: scanResult.scan_duration_ms,
      contentHash: scanResult.content_hash,
    };
  });

  // ── GET /api/marketplace/sources ────────────────────────────────────
  // List all marketplace sources with package counts.

  fastify.get('/api/marketplace/sources', async (request, reply) => {
    const db = requireDb(reply);
    if (!db) return;

    const sources = db.listSourcesWithCounts();
    return { sources, total: sources.length };
  });

  // ── POST /api/marketplace/sources ───────────────────────────────────
  // Add a user-defined source and trigger an immediate sync for it.

  fastify.post('/api/marketplace/sources', async (request, reply) => {
    const db = requireDb(reply);
    if (!db) return;

    const body = request.body as {
      name?: string;
      url?: string;
      displayName?: string;
    };

    if (!body.name || !body.url) {
      return reply.code(400).send({ error: 'name and url are required' });
    }

    // Validate URL format
    try {
      new URL(body.url);
    } catch {
      return reply.code(400).send({ error: 'Invalid URL format' });
    }

    // Check for duplicate name
    const existing = db.getSourceByName(body.name);
    if (existing) {
      return reply.code(409).send({ error: `Source "${body.name}" already exists` });
    }

    // Auto-detect source_type from URL
    const sourceType = body.url.includes('github.com') ? 'community_repo' : 'aggregator';

    // Ensure the is_custom column exists (safe migration)
    db.ensureIsCustomColumn();

    // Insert the source
    const sourceId = db.addSource({
      name: body.name,
      display_name: body.displayName || body.name.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      url: body.url,
      source_type: sourceType,
      platform: 'waggle',
      install_method: sourceType === 'community_repo' ? 'git_clone' : 'api_fetch',
    });

    const source = db.getSource(sourceId);

    // Trigger immediate sync for the new source
    const vaultLookup = fastify.vault ? (key: string) => fastify.vault!.get(key)?.value ?? null : undefined;
    const sync = new MarketplaceSync(db, vaultLookup);
    let syncResult = null;
    try {
      const results = await sync.syncAll({ sources: [body.name] });
      syncResult = results[0] ?? null;

      // Re-categorize any new packages
      if (syncResult && syncResult.added > 0) {
        recategorizeAll(db);
      }
    } catch (err) {
      syncResult = {
        source: body.name,
        added: 0,
        updated: 0,
        removed: 0,
        errors: [(err as Error).message],
      };
    }

    return reply.code(201).send({
      source,
      syncResult,
    });
  });

  // ── DELETE /api/marketplace/sources/:id ─────────────────────────────
  // Remove a user-added source (cannot delete built-in sources).

  fastify.delete('/api/marketplace/sources/:id', async (request, reply) => {
    const db = requireDb(reply);
    if (!db) return;

    const { id } = request.params as { id: string };
    const sourceId = parseInt(id, 10);

    if (isNaN(sourceId)) {
      return reply.code(400).send({ error: 'Invalid source ID' });
    }

    const source = db.getSource(sourceId);
    if (!source) {
      return reply.code(404).send({ error: `Source ID ${sourceId} not found` });
    }

    if (!source.is_custom) {
      return reply.code(403).send({
        error: 'Cannot delete built-in source',
        hint: 'Only user-added sources can be removed',
      });
    }

    const deleted = db.deleteSource(sourceId);
    if (!deleted) {
      return reply.code(500).send({ error: 'Failed to delete source' });
    }

    return { deleted: true, sourceId, name: source.name };
  });

  // ── GET /api/marketplace/categories ─────────────────────────────────
  // Return the category taxonomy for UI rendering.

  fastify.get('/api/marketplace/categories', async (_request, reply) => {
    return { categories: PACKAGE_CATEGORIES, total: PACKAGE_CATEGORIES.length };
  });

  // ── POST /api/marketplace/sync ──────────────────────────────────────
  // Trigger a manual sync from all configured marketplace sources.
  // In dev/local mode, external sources won't be reachable — errors are
  // captured per-source and returned gracefully.

  fastify.post('/api/marketplace/sync', async (request, reply) => {
    const db = requireDb(reply);
    if (!db) return;

    const body = (request.body ?? {}) as { sources?: string[] };

    const vaultLookup = fastify.vault ? (key: string) => fastify.vault!.get(key)?.value ?? null : undefined;
    const sync = new MarketplaceSync(db, vaultLookup);

    try {
      const results = await sync.syncAll(body.sources ? { sources: body.sources } : {});

      const sourcesChecked = results.length;
      const packagesAdded = results.reduce((sum, r) => sum + r.added, 0);
      const packagesUpdated = results.reduce((sum, r) => sum + r.updated, 0);
      const errors = results.flatMap(r => r.errors.map(e => `[${r.source}] ${e}`));

      // Re-categorize packages after sync
      if (packagesAdded > 0 || packagesUpdated > 0) {
        try { recategorizeAll(db); } catch { /* non-blocking */ }
      }

      // Emit notification if new packages were discovered
      if (packagesAdded > 0) {
        emitNotification(fastify, {
          title: 'Marketplace sync complete',
          body: `${packagesAdded} new capability${packagesAdded === 1 ? '' : 's'} discovered`,
          category: 'agent',
          actionUrl: '/capabilities',
        });
      }

      return {
        sourcesChecked,
        packagesAdded,
        packagesUpdated,
        errors,
        details: results,
      };
    } catch (err) {
      return reply.code(500).send({
        error: 'Sync failed',
        message: (err as Error).message,
        sourcesChecked: 0,
        packagesAdded: 0,
        packagesUpdated: 0,
        errors: [(err as Error).message],
      });
    }
  });

  // ── GET /api/marketplace/security-status ──────────────────────────
  // Returns overall security scanning status: Cisco scanner availability,
  // JS gate version, and aggregate scan counts across the catalog.
  // Used by the Capabilities view to show an install hint when the
  // Cisco scanner is not installed.

  fastify.get('/api/marketplace/security-status', async (request, reply) => {
    const db = getDb();

    let ciscoScannerAvailable = false;
    try {
      ciscoScannerAvailable = await isCiscoScannerAvailable();
    } catch {
      // Check failed — report as unavailable
    }

    let totalScanned = 0;
    let totalPassed = 0;
    let totalFailed = 0;

    if (db) {
      try {
        const rawDb = (db as any).db;
        if (rawDb?.prepare) {
          const row = rawDb.prepare(`
            SELECT
              COUNT(CASE WHEN security_status != 'unscanned' AND security_status IS NOT NULL THEN 1 END) as scanned,
              COUNT(CASE WHEN security_status IN ('clean', 'low', 'medium') THEN 1 END) as passed,
              COUNT(CASE WHEN security_status IN ('critical', 'high') THEN 1 END) as failed
            FROM packages
          `).get() as { scanned: number; passed: number; failed: number } | undefined;

          if (row) {
            totalScanned = row.scanned;
            totalPassed = row.passed;
            totalFailed = row.failed;
          }
        }
      } catch { /* non-blocking */ }
    }

    return {
      ciscoScannerAvailable,
      jsSecurityGateVersion: '1.0',
      totalScanned,
      totalPassed,
      totalFailed,
      hint: ciscoScannerAvailable
        ? undefined
        : 'For enhanced security scanning, install the Cisco skill-scanner: pip install cisco-ai-skill-scanner',
    };
  });

  // ── POST /api/marketplace/publish ─────────────────────────────────
  // Publish a local skill to the marketplace catalog.
  // Reads the skill from ~/.waggle/skills/, validates frontmatter,
  // runs SecurityGate scan, then upserts into the marketplace DB.

  fastify.post('/api/marketplace/publish', async (request, reply) => {
    const db = requireDb(reply);
    if (!db) return;

    const body = request.body as { skillName?: string };

    if (!body.skillName) {
      return reply.code(400).send({ error: 'skillName is required' });
    }

    const skillName = body.skillName;

    // Prevent path traversal
    if (skillName.includes('..') || skillName.includes('/') || skillName.includes('\\')) {
      return reply.code(400).send({ error: 'Invalid skill name' });
    }

    // Read the skill file from ~/.waggle/skills/
    const waggleHome = (fastify as any).localConfig?.dataDir || join(homedir(), '.waggle');
    const skillPath = join(waggleHome, 'skills', `${skillName}.md`);

    if (!existsSync(skillPath)) {
      return reply.code(404).send({
        error: `Skill "${skillName}" not found`,
        hint: `Expected file at ${skillPath}`,
      });
    }

    const content = readFileSync(skillPath, 'utf-8');

    // Validate YAML frontmatter
    const validation = validateSkillMd(content);
    if (!validation.valid) {
      return reply.code(422).send({
        error: 'Skill validation failed',
        details: validation.errors,
        hint: 'Skill file must have YAML frontmatter with name and description fields wrapped in --- delimiters',
      });
    }

    const metadata = validation.metadata!;

    // Run SecurityGate scan
    const gate = new SecurityGate({
      enable_gen_trust_hub: false,
      enable_cisco_scanner: false,
      enable_mcp_guardian: false,
      enable_heuristics: true,
    });

    const fakePkg = {
      id: 0,
      name: skillName,
      display_name: metadata.name,
      description: metadata.description,
      waggle_install_type: 'skill',
    } as MarketplacePackage;

    const scanResult = await gate.scan(fakePkg, content);

    if (scanResult.blocked) {
      return reply.code(403).send({
        error: 'Skill blocked by security scan',
        severity: scanResult.overall_severity,
        score: scanResult.security_score,
        findings: scanResult.findings,
      });
    }

    // Ensure a "user-published" source exists
    let source = db.getSourceByName('user-published');
    if (!source) {
      db.addSource({
        name: 'user-published',
        display_name: 'User Published',
        url: 'local://user-published',
        source_type: 'community_repo',
        platform: 'waggle',
        install_method: 'manual',
        description: 'Skills published by the local user',
      });
      source = db.getSourceByName('user-published')!;
    }

    // Upsert into marketplace DB
    const packageId = db.upsertPackage({
      name: skillName,
      source_id: source.id,
      display_name: metadata.name,
      description: metadata.description,
      author: metadata.author || 'local-user',
      package_type: 'skill',
      waggle_install_type: 'skill',
      waggle_install_path: skillPath,
      version: metadata.version || '1.0.0',
      category: 'custom',
      downloads: 0,
      stars: 0,
      rating: 0,
      rating_count: 0,
      platforms: JSON.stringify(['all']) as any,
      dependencies: JSON.stringify([]) as any,
      packs: JSON.stringify([]) as any,
      install_manifest: JSON.stringify({
        skill_content: content,
      }) as any,
    });

    return reply.code(201).send({
      success: true,
      packageId,
      skillName,
      metadata: {
        name: metadata.name,
        description: metadata.description,
        version: metadata.version,
        author: metadata.author,
      },
      security: {
        severity: scanResult.overall_severity,
        score: scanResult.security_score,
        findingsCount: scanResult.findings.length,
      },
    });
  });
}
