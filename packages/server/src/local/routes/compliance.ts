/**
 * Compliance Routes — AI Act compliance API endpoints.
 *
 * GET  /api/compliance/status — get compliance status
 * POST /api/compliance/export — generate audit report
 * GET  /api/compliance/interactions — list recent interactions
 * POST /api/compliance/interactions — record an interaction (internal use)
 */

import type { FastifyInstance } from 'fastify';
import {
  InteractionStore, ComplianceStatusChecker, ReportGenerator,
  HarvestSourceStore,
  type RecordInteractionInput, type AuditReportRequest,
} from '@waggle/core';
import { renderComplianceReportPdf } from '@waggle/agent';

export async function complianceRoutes(fastify: FastifyInstance) {
  // GET /api/compliance/status — evaluate current compliance
  fastify.get('/api/compliance/status', async (_request, reply) => {
    const personalDb = (fastify as any).multiMind?.personal;
    if (!personalDb) {
      return reply.code(503).send({ error: 'Personal mind not available' });
    }

    const store = new InteractionStore(personalDb);
    const checker = new ComplianceStatusChecker(store);
    const workspaceId = (_request.query as any)?.workspaceId;
    return checker.check(workspaceId || undefined);
  });

  // POST /api/compliance/export — generate audit report
  fastify.post('/api/compliance/export', async (request, reply) => {
    const personalDb = (fastify as any).multiMind?.personal;
    if (!personalDb) {
      return reply.code(503).send({ error: 'Personal mind not available' });
    }

    const body = request.body as AuditReportRequest;
    if (!body.from || !body.to) {
      return reply.code(400).send({ error: 'from and to dates are required' });
    }

    const interactionStore = new InteractionStore(personalDb);
    const harvestStore = new HarvestSourceStore(personalDb);
    const wsManager = (fastify as any).workspaceManager as
      | { get: (id: string) => { name?: string; riskLevel?: string; riskClassifiedAt?: string } | null }
      | undefined;
    const generator = new ReportGenerator({
      interactionStore,
      harvestStore,
      getWorkspaceName: (id) => wsManager?.get(id)?.name ?? id,
      getWorkspaceRisk: (id) => (wsManager?.get(id)?.riskLevel as any) ?? 'minimal',
      getWorkspaceRiskClassifiedAt: (id) => wsManager?.get(id)?.riskClassifiedAt ?? null,
    });

    const report = generator.generate({
      workspaceId: body.workspaceId,
      from: body.from,
      to: body.to,
      format: body.format ?? 'json',
      include: body.include ?? {
        interactions: true,
        oversight: true,
        models: true,
        provenance: true,
        riskAssessment: true,
        fria: false,
      },
    });

    return report;
  });

  // GET /api/compliance/interactions — list recent interactions
  fastify.get('/api/compliance/interactions', async (request, reply) => {
    const personalDb = (fastify as any).multiMind?.personal;
    if (!personalDb) {
      return reply.code(503).send({ error: 'Personal mind not available' });
    }

    const store = new InteractionStore(personalDb);
    const { limit, workspaceId } = request.query as { limit?: string; workspaceId?: string };
    const parsedLimit = Math.min(Number(limit) || 20, 100);

    if (workspaceId) {
      return { interactions: store.getByWorkspace(workspaceId) };
    }
    return { interactions: store.getRecent(parsedLimit) };
  });

  // POST /api/compliance/interactions — record an AI interaction
  fastify.post('/api/compliance/interactions', async (request, reply) => {
    const personalDb = (fastify as any).multiMind?.personal;
    if (!personalDb) {
      return reply.code(503).send({ error: 'Personal mind not available' });
    }

    const body = request.body as RecordInteractionInput;
    if (!body.model || !body.provider) {
      return reply.code(400).send({ error: 'model and provider are required' });
    }

    const store = new InteractionStore(personalDb);
    const entry = store.record(body);
    return entry;
  });

  // POST /api/compliance/export-pdf — M-02: renders the same AuditReport
  // shape as /export through the compliance-pdf module and returns a PDF
  // binary. Body accepts the full AuditReportRequest, identical to /export,
  // so the UI can reuse its existing "which sections should we include"
  // state. Returns application/pdf with a Content-Disposition hint so
  // browsers trigger a Save dialog.
  fastify.post('/api/compliance/export-pdf', async (request, reply) => {
    const personalDb = (fastify as any).multiMind?.personal;
    if (!personalDb) {
      return reply.code(503).send({ error: 'Personal mind not available' });
    }

    const body = request.body as AuditReportRequest;
    if (!body.from || !body.to) {
      return reply.code(400).send({ error: 'from and to dates are required' });
    }

    const interactionStore = new InteractionStore(personalDb);
    const harvestStore = new HarvestSourceStore(personalDb);
    const wsManager = (fastify as any).workspaceManager as
      | { get: (id: string) => { name?: string; riskLevel?: string; riskClassifiedAt?: string } | null }
      | undefined;
    const generator = new ReportGenerator({
      interactionStore,
      harvestStore,
      getWorkspaceName: (id) => wsManager?.get(id)?.name ?? id,
      getWorkspaceRisk: (id) => (wsManager?.get(id)?.riskLevel as any) ?? 'minimal',
      getWorkspaceRiskClassifiedAt: (id) => wsManager?.get(id)?.riskClassifiedAt ?? null,
    });

    const report = generator.generate({
      workspaceId: body.workspaceId,
      from: body.from,
      to: body.to,
      format: body.format ?? 'json',
      include: body.include ?? {
        interactions: true,
        oversight: true,
        models: true,
        provenance: true,
        riskAssessment: true,
        fria: false,
      },
    });

    try {
      const pdfBuffer = await renderComplianceReportPdf(report);
      const filename = `ai-act-compliance-${body.from.slice(0, 10)}-to-${body.to.slice(0, 10)}.pdf`;
      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(pdfBuffer);
    } catch (err) {
      return reply.code(500).send({
        error: err instanceof Error ? err.message : 'PDF generation failed',
      });
    }
  });

  // GET /api/compliance/models — get model inventory
  fastify.get('/api/compliance/models', async (request, reply) => {
    const personalDb = (fastify as any).multiMind?.personal;
    if (!personalDb) {
      return reply.code(503).send({ error: 'Personal mind not available' });
    }

    const store = new InteractionStore(personalDb);
    const { from, to, workspaceId } = request.query as { from?: string; to?: string; workspaceId?: string };
    return { models: store.getModelInventory(from, to, workspaceId) };
  });
}
