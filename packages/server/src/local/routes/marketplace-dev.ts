/**
 * Marketplace Dev Routes — internal/dev-only endpoints for proving
 * the marketplace integration seam.
 *
 * Gated behind WAGGLE_DEV_MARKETPLACE=1 environment variable.
 * Prefixed with /_dev/marketplace/ to make dev-only status explicit.
 *
 * These routes are NOT production API contracts. They exist to:
 * 1. Prove the catalog backend seam (search works)
 * 2. Prove the security/trust integration seam (SecurityGate runs)
 * 3. Prove the pack reconciliation seam (packs queryable)
 * 4. Prove the DB seed seam (marketplace.db loads)
 */

import type { FastifyInstance } from 'fastify';
import path from 'node:path';
import { createLogger } from '../logger.js';
const log = createLogger('marketplace-dev');
import fs from 'node:fs';
import { MarketplaceDB, SecurityGate } from '@waggle/marketplace';
import type { InstallationType, MarketplacePack, MarketplacePackage } from '@waggle/marketplace';

export async function marketplaceDevRoutes(fastify: FastifyInstance) {
  // Only register if dev flag is set
  if (process.env.WAGGLE_DEV_MARKETPLACE !== '1') return;

  const dataDir = fastify.localConfig?.dataDir ?? path.join(
    process.env.HOME ?? process.env.USERPROFILE ?? '.',
    '.waggle',
  );

  // Lazy-instantiate marketplace handles on first use.
  let db: MarketplaceDB | null = null;
  let securityGate: SecurityGate | null = null;

  function getDb(): MarketplaceDB | null {
    if (db) return db;
    try {
      const dbPath = path.join(dataDir, 'marketplace.db');
      if (!fs.existsSync(dbPath)) {
        return null;
      }
      db = new MarketplaceDB(dbPath);
      return db;
    } catch (err) {
      log.warn('[waggle] Marketplace DB not available:', (err as Error).message);
      return null;
    }
  }

  function getSecurityGate(): SecurityGate | null {
    if (securityGate) return securityGate;
    try {
      securityGate = new SecurityGate();
      return securityGate;
    } catch (err) {
      log.warn('[waggle] SecurityGate not available:', (err as Error).message);
      return null;
    }
  }

  // ── Seam 1: Catalog Backend ──────────────────────────────────────────

  fastify.get('/_dev/marketplace/search', async (request, reply) => {
    const marketplace = getDb();
    if (!marketplace) {
      return reply.code(503).send({
        error: 'Marketplace DB not available',
        hint: 'Run with WAGGLE_DEV_MARKETPLACE=1 and ensure marketplace.db is seeded',
      });
    }

    const { query, type, category, limit } = request.query as {
      query?: string;
      type?: string;
      category?: string;
      limit?: string;
    };

    const results = marketplace.search({
      query: query || '',
      type: type as InstallationType | undefined,
      category,
      limit: limit ? parseInt(limit, 10) : 20,
    });

    return {
      _dev: true,
      _note: 'This is a dev-only endpoint. Not a production API contract.',
      ...results,
    };
  });

  // ── Seam 2: Security/Trust Integration ───────────────────────────────

  fastify.get('/_dev/marketplace/security-check', async (request, reply) => {
    const gate = getSecurityGate();
    if (!gate) {
      return reply.code(503).send({
        error: 'SecurityGate not available',
        hint: 'Ensure @waggle/marketplace is installed',
      });
    }

    // Run a dry scan on a sample skill content to prove the seam works
    const sampleContent = `# Sample Skill\n\nThis is a test skill for security scanning.\n\n## Steps\n1. Read context\n2. Analyze\n3. Respond`;

    // Dev-only heuristic scan: the gate only reads name/package_type here, so a
    // minimal stub stands in for a full catalog package.
    const stubPkg = { name: 'test-skill', package_type: 'skill' } as Pick<MarketplacePackage, 'name' | 'package_type'> as MarketplacePackage;
    const result = await gate.scan(stubPkg, sampleContent);

    return {
      _dev: true,
      _note: 'Security gate integration test — heuristic scan only (no external tools)',
      scanResult: {
        severity: result.overall_severity,
        score: result.security_score,
        blocked: result.blocked,
        enginesUsed: result.engines_used,
        findingsCount: result.findings.length,
        durationMs: result.scan_duration_ms,
      },
    };
  });

  // ── Seam 3: Pack Reconciliation ──────────────────────────────────────

  fastify.get('/_dev/marketplace/packs', async (request, reply) => {
    const marketplace = getDb();
    if (!marketplace) {
      return reply.code(503).send({ error: 'Marketplace DB not available' });
    }

    const packs = marketplace.listPacks();

    return {
      _dev: true,
      _note: 'Pack catalog for reconciliation — not final pack model',
      packCount: packs.length,
      packs: packs.map((p: MarketplacePack) => ({
        slug: p.slug,
        displayName: p.display_name,
        description: p.description,
        targetRoles: p.target_roles,
        priority: p.priority,
      })),
    };
  });

  // ── Seam 4: DB Health / Seed Verification ────────────────────────────

  fastify.get('/_dev/marketplace/health', async (request, reply) => {
    const dbPath = path.join(dataDir, 'marketplace.db');
    const exists = fs.existsSync(dbPath);

    let packageCount = 0;
    let sourceCount = 0;
    let packCount = 0;

    if (exists) {
      const marketplace = getDb();
      if (marketplace) {
        try {
          const searchResult = marketplace.search({ limit: 1 });
          packageCount = searchResult.total;
          const packs = marketplace.listPacks();
          packCount = packs.length;
          const sources = marketplace.listSources();
          sourceCount = sources.length;
        } catch {
          // DB exists but may be unreadable
        }
      }
    }

    return {
      _dev: true,
      status: exists ? 'ok' : 'not_seeded',
      dbPath,
      dbExists: exists,
      dbSizeBytes: exists ? fs.statSync(dbPath).size : 0,
      packageCount,
      sourceCount,
      packCount,
    };
  });
}
