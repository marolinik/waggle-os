import type { FastifyPluginAsync } from 'fastify';
import { saveCustomWorkflow, deleteCustomWorkflow, loadCustomWorkflows, WORKFLOW_TEMPLATES } from '@waggle/agent';
import type { WorkflowTemplate } from '@waggle/agent';

/**
 * Workflow routes — CRUD for custom workflow templates.
 * Built-in templates are read-only; custom ones are stored as JSON in ~/.waggle/workflows/.
 */
export const workflowRoutes: FastifyPluginAsync = async (fastify) => {
  const dataDir = fastify.localConfig.dataDir;

  /** Convert built-in template factories to summary objects (invoke with empty task for metadata) */
  function getBuiltInSummaries(): (WorkflowTemplate & { builtIn: true })[] {
    return Object.entries(WORKFLOW_TEMPLATES).map(([key, factory]) => {
      const tpl = factory('');
      return { name: tpl.name, description: tpl.description, steps: tpl.steps, aggregation: tpl.aggregation, builtIn: true as const };
    });
  }

  // GET /api/workflows — list all workflows (built-in + custom)
  fastify.get('/api/workflows', async () => {
    const builtIn = getBuiltInSummaries();
    const custom = loadCustomWorkflows(dataDir);
    return {
      workflows: [...builtIn, ...custom.map(c => ({ ...c, builtIn: false }))],
      builtInCount: builtIn.length,
      customCount: custom.length,
    };
  });

  // POST /api/workflows — create custom workflow
  fastify.post('/api/workflows', async (request, reply) => {
    const body = request.body as Partial<WorkflowTemplate>;
    if (!body.name || !body.steps || !Array.isArray(body.steps) || body.steps.length === 0) {
      return reply.code(400).send({ error: 'name and steps (non-empty array) are required' });
    }
    const workflow: WorkflowTemplate = {
      name: body.name,
      description: body.description ?? '',
      steps: body.steps,
      aggregation: body.aggregation ?? 'concatenate',
    };
    saveCustomWorkflow(dataDir, workflow);
    return reply.code(201).send(workflow);
  });

  // DELETE /api/workflows/:name — delete custom workflow
  fastify.delete('/api/workflows/:name', async (request, reply) => {
    const { name } = request.params as { name: string };
    const deleted = deleteCustomWorkflow(dataDir, name);
    if (!deleted) return reply.code(404).send({ error: 'Workflow not found' });
    return { deleted: true, name };
  });
};
