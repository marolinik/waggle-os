/**
 * Compliance Routes — AI Act compliance API endpoints.
 *
 * GET  /api/compliance/status — get compliance status
 * POST /api/compliance/export — generate audit report
 * GET  /api/compliance/interactions — list recent interactions
 * POST /api/compliance/interactions — record an interaction (internal use)
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  InteractionStore, ComplianceStatusChecker, ReportGenerator,
  HarvestSourceStore, ComplianceTemplateStore,
  type RecordInteractionInput, type AuditReportRequest,
  type CreateComplianceTemplateInput, type UpdateComplianceTemplateInput,
  type AIActRiskLevel,
} from '@waggle/core';
import { renderComplianceReportPdf, type PdfTemplateOverrides } from '@waggle/agent';

/**
 * M-03: the `/export` and `/export-pdf` routes accept three optional template-
 * sourced overrides on the request body. They do not change section selection
 * (which is already merged client-side into `include`) — they only affect how
 * the PDF renders org name, footer text, and the risk-classification label.
 */
interface TemplateOverrideFields {
  templateOrgName?: string | null;
  templateFooterText?: string | null;
  templateRiskClassification?: AIActRiskLevel | null;
}

function extractPdfOverrides(body: unknown): PdfTemplateOverrides | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const b = body as TemplateOverrideFields;
  if (b.templateOrgName == null && b.templateFooterText == null && b.templateRiskClassification == null) {
    return undefined;
  }
  return {
    orgName: b.templateOrgName ?? null,
    footerText: b.templateFooterText ?? null,
    riskClassification: b.templateRiskClassification ?? null,
  };
}

const sectionsSchema = z.object({
  interactions: z.boolean(),
  oversight: z.boolean(),
  models: z.boolean(),
  provenance: z.boolean(),
  riskAssessment: z.boolean(),
  fria: z.boolean(),
});

const riskSchema = z.enum(['minimal', 'limited', 'high-risk', 'unacceptable']);

const createTemplateSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  sections: sectionsSchema,
  riskClassification: riskSchema.nullable().optional(),
  orgName: z.string().nullable().optional(),
  footerText: z.string().nullable().optional(),
});

const updateTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  sections: sectionsSchema.optional(),
  riskClassification: riskSchema.nullable().optional(),
  orgName: z.string().nullable().optional(),
  footerText: z.string().nullable().optional(),
});

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
      const pdfBuffer = await renderComplianceReportPdf(report, extractPdfOverrides(body));
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

  // ── M-03: Compliance templates CRUD ──
  // Templates are stored on the personal mind (same DB as ai_interactions) so a
  // single "My templates" list is visible across all workspaces. Sections merge
  // with the runtime /export body's `include` flags (union semantics); the
  // merge happens in the UI layer before the POST, not here, so the /export
  // and /export-pdf routes stay template-agnostic.

  fastify.get('/api/compliance/templates', async (_request, reply) => {
    const personalDb = (fastify as any).multiMind?.personal;
    if (!personalDb) return reply.code(503).send({ error: 'Personal mind not available' });
    const store = new ComplianceTemplateStore(personalDb);
    return { templates: store.list() };
  });

  fastify.get<{ Params: { id: string } }>(
    '/api/compliance/templates/:id',
    async (request, reply) => {
      const personalDb = (fastify as any).multiMind?.personal;
      if (!personalDb) return reply.code(503).send({ error: 'Personal mind not available' });
      const id = Number(request.params.id);
      if (!Number.isFinite(id)) return reply.code(400).send({ error: 'Invalid id' });
      const store = new ComplianceTemplateStore(personalDb);
      const template = store.getById(id);
      if (!template) return reply.code(404).send({ error: 'Template not found' });
      return { template };
    },
  );

  fastify.post('/api/compliance/templates', async (request, reply) => {
    const personalDb = (fastify as any).multiMind?.personal;
    if (!personalDb) return reply.code(503).send({ error: 'Personal mind not available' });
    const parsed = createTemplateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid template body', detail: parsed.error.issues });
    }
    const store = new ComplianceTemplateStore(personalDb);
    try {
      const template = store.create(parsed.data as CreateComplianceTemplateInput);
      return reply.code(201).send({ template });
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Create failed' });
    }
  });

  fastify.patch<{ Params: { id: string } }>(
    '/api/compliance/templates/:id',
    async (request, reply) => {
      const personalDb = (fastify as any).multiMind?.personal;
      if (!personalDb) return reply.code(503).send({ error: 'Personal mind not available' });
      const id = Number(request.params.id);
      if (!Number.isFinite(id)) return reply.code(400).send({ error: 'Invalid id' });
      const parsed = updateTemplateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Invalid template patch', detail: parsed.error.issues });
      }
      const store = new ComplianceTemplateStore(personalDb);
      try {
        const template = store.update(id, parsed.data as UpdateComplianceTemplateInput);
        if (!template) return reply.code(404).send({ error: 'Template not found' });
        return { template };
      } catch (err) {
        return reply.code(400).send({ error: err instanceof Error ? err.message : 'Update failed' });
      }
    },
  );

  fastify.delete<{ Params: { id: string } }>(
    '/api/compliance/templates/:id',
    async (request, reply) => {
      const personalDb = (fastify as any).multiMind?.personal;
      if (!personalDb) return reply.code(503).send({ error: 'Personal mind not available' });
      const id = Number(request.params.id);
      if (!Number.isFinite(id)) return reply.code(400).send({ error: 'Invalid id' });
      const store = new ComplianceTemplateStore(personalDb);
      const deleted = store.delete(id);
      if (!deleted) return reply.code(404).send({ error: 'Template not found' });
      return { deleted: true };
    },
  );
}
