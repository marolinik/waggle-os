import type { ToolDefinition } from './tools.js';
import { SubagentOrchestrator, type OrchestratorConfig, type WorkflowTemplate } from './subagent-orchestrator.js';
import { WORKFLOW_TEMPLATES, listWorkflowTemplates } from './workflow-templates.js';
import { detectTaskShape } from './task-shape.js';
import { composeWorkflow, validateTemplate, type ComposerContext } from './workflow-composer.js';
import {
  createHarnessRun, advancePhase, getCurrentPhaseInstruction,
  getRunSummary, type PhaseOutput, type HarnessRunState,
} from './workflow-harness.js';
import { BUILTIN_HARNESSES, getHarnessById } from './builtin-harnesses.js';
import type { HookRegistry } from './hooks.js';
import type { LoadedSkill } from './prompt-loader.js';

export interface WorkflowToolsConfig extends OrchestratorConfig {
  hooks?: HookRegistry;
  /** Currently loaded skills — passed to the composer for skill matching */
  skills?: LoadedSkill[];
  /** Whether sub-agent spawning is available in this environment */
  subAgentsAvailable?: boolean;
  /** Optional callback for worker status changes — used by server to relay events to UI via SSE */
  onWorkerStatus?: (event: { workerId: string; status: string; workerState: import('./subagent-orchestrator.js').WorkerState }) => void;
}

export function createWorkflowTools(config: WorkflowToolsConfig): ToolDefinition[] {
  return [
    // ── compose_workflow ──────────────────────────────────────────────
    {
      name: 'compose_workflow',
      description:
        'Analyze a task and recommend the lightest sufficient execution approach. ' +
        'Returns a structured plan with steps, execution mode (direct, structured, skill-guided, or sub-agent), ' +
        'and an optional workflow template for sub-agent execution. ' +
        'Use this to decide HOW to handle a complex request before acting.',
      parameters: {
        type: 'object',
        properties: {
          task: {
            type: 'string',
            description: 'The user task to analyze and plan',
          },
        },
        required: ['task'],
      },
      execute: async (args) => {
        const task = args.task as string;

        const shape = detectTaskShape(task);

        const composerContext: ComposerContext = {
          skills: config.skills,
          subAgentsAvailable: config.subAgentsAvailable ?? true,
          messageLength: task.length,
        };

        const plan = composeWorkflow(shape, task, composerContext);

        // Build human-readable output
        let output = `## Workflow Plan\n\n`;
        output += `**Mode:** ${plan.executionMode}\n`;
        output += `**Reason:** ${plan.modeReason}\n\n`;
        output += `${plan.explanation}\n\n`;

        // Shape detection summary
        output += `### Task Analysis\n`;
        output += `- **Shape:** ${shape.type} (confidence: ${(shape.confidence * 100).toFixed(0)}%)\n`;
        output += `- **Complexity:** ${shape.complexity}\n`;
        if (shape.phases) {
          output += `- **Phases:** ${shape.phases.map(p => p.shape).join(' -> ')}\n`;
        }
        output += '\n';

        // Steps
        output += `### Steps\n`;
        for (const step of plan.steps) {
          output += `- **${step.name}**: ${step.action}`;
          if (step.skill) output += ` (skill: ${step.skill})`;
          output += '\n';
        }

        // Escalation hint
        output += `\n**Escalation trigger:** ${plan.escalationTrigger}\n`;

        // If sub-agent template was generated, note it's available
        if (plan.template) {
          output += `\n### Sub-agent Template Available\n`;
          output += `Template \`${plan.template.name}\` with ${plan.template.steps.length} steps `;
          output += `is ready for \`orchestrate_workflow\` (pass as inline_template).\n`;
        }

        return output;
      },
    },

    // ── orchestrate_workflow ──────────────────────────────────────────
    {
      name: 'orchestrate_workflow',
      description:
        `Run a multi-agent workflow. Available templates: ${listWorkflowTemplates().join(', ')}. ` +
        `Each template coordinates multiple specialist sub-agents working together on a task. ` +
        `You can also pass an inline_template (from compose_workflow) instead of a named template.`,
      parameters: {
        type: 'object',
        properties: {
          template: {
            type: 'string',
            description: `Workflow template name: ${listWorkflowTemplates().join(', ')}. Omit if using inline_template.`,
          },
          task: {
            type: 'string',
            description: 'The task description for the workflow to execute',
          },
          inline_template: {
            type: 'object',
            description: 'A WorkflowTemplate object (from compose_workflow). Use instead of a named template.',
          },
        },
        required: ['task'],
      },
      execute: async (args) => {
        const task = args.task as string;
        const templateName = args.template as string | undefined;
        const inlineTemplate = args.inline_template as WorkflowTemplate | undefined;

        // Resolve template: inline takes priority, then named lookup
        let template: WorkflowTemplate;
        let workflowName: string;

        if (inlineTemplate) {
          // Validate inline template before execution
          const errors = validateTemplate(inlineTemplate);
          if (errors.length > 0) {
            const errorList = errors.map(e => `- ${e.field}: ${e.message}`).join('\n');
            return `Invalid inline template:\n${errorList}`;
          }
          template = inlineTemplate;
          workflowName = template.name;
        } else if (templateName) {
          const factory = WORKFLOW_TEMPLATES[templateName];
          if (!factory) {
            return `Unknown workflow template "${templateName}". Available: ${listWorkflowTemplates().join(', ')}`;
          }
          template = factory(task);
          workflowName = templateName;
        } else {
          return 'Provide either a template name or an inline_template.';
        }

        const orchestrator = new SubagentOrchestrator(config);

        // Fire workflow:start hook
        if (config.hooks) {
          const hookResult = await config.hooks.fire('workflow:start', {
            toolName: 'orchestrate_workflow',
            workflowName,
            workflowTask: task,
          });
          if (hookResult.cancelled) {
            return `[BLOCKED] Workflow blocked: ${hookResult.reason ?? 'No reason given'}`;
          }
        }

        // Emit progress updates — relay to external callback if provided
        orchestrator.on('worker:status', (event) => {
          if (config.onWorkerStatus) {
            config.onWorkerStatus(event);
          }
        });

        const { results, aggregated } = await orchestrator.runWorkflow(template);

        // Fire workflow:end hook
        if (config.hooks) {
          await config.hooks.fire('workflow:end', {
            toolName: 'orchestrate_workflow',
            workflowName,
            workflowTask: task,
          });
        }

        // Build summary
        const workers = Array.from(results.values());
        const totalTokens = workers.reduce((sum, w) => sum + w.usage.inputTokens + w.usage.outputTokens, 0);
        const totalDuration = workers.reduce((sum, w) => {
          if (w.startedAt && w.completedAt) return sum + (w.completedAt - w.startedAt);
          return sum;
        }, 0);
        const failedCount = workers.filter(w => w.status === 'failed').length;

        let output = `## Workflow: ${template.name}\n`;
        output += `**Steps:** ${workers.length} | **Tokens:** ${totalTokens} | **Duration:** ${(totalDuration / 1000).toFixed(1)}s`;
        if (failedCount > 0) output += ` | **Failed:** ${failedCount}`;
        output += '\n\n';

        // Worker summary
        output += '### Workers\n';
        for (const w of workers) {
          const status = w.status === 'done' ? '\u2713' : w.status === 'failed' ? '\u2717' : '\u2026';
          const dur = w.startedAt && w.completedAt ? `${((w.completedAt - w.startedAt) / 1000).toFixed(1)}s` : '-';
          output += `- ${status} **${w.name}** (${w.role}) \u2014 ${dur}, ${w.usage.inputTokens + w.usage.outputTokens} tokens\n`;
          if (w.error) output += `  Error: ${w.error}\n`;
        }
        output += '\n---\n\n';
        output += aggregated;

        return output;
      },
    },

    // ── list_harnesses ──────────────────────────────────────────────
    {
      name: 'list_harnesses',
      description:
        'List available workflow harnesses — structured phase-gate workflows ' +
        'that enforce completion criteria between phases. Use this to see ' +
        'what deterministic harnesses are available.',
      parameters: { type: 'object', properties: {}, required: [] },
      execute: async () => {
        let output = '## Available Harnesses\n\n';
        for (const h of BUILTIN_HARNESSES) {
          output += `### ${h.name} (\`${h.id}\`)\n`;
          output += `Phases: ${h.phases.map(p => p.name).join(' → ')}\n`;
          output += `Aggregation: ${h.aggregation}\n\n`;
        }
        return output;
      },
    },

    // ── run_harness ─────────────────────────────────────────────────
    {
      name: 'run_harness',
      description:
        'Start or advance a workflow harness. First call with a harness_id ' +
        'creates a new run and returns the first phase instruction. ' +
        'Subsequent calls with phase_output advance through phases, ' +
        'validating gates at each step. Returns next instruction or summary.',
      parameters: {
        type: 'object',
        properties: {
          harness_id: { type: 'string', description: 'Harness ID (e.g., "research-verify", "code-review-fix", "document-draft")' },
          phase_output: {
            type: 'object',
            description: 'Output from the current phase (provide on subsequent calls to advance)',
            properties: {
              content: { type: 'string', description: 'The agent output text for this phase' },
              tool_calls: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    tool: { type: 'string' },
                    args: { type: 'object' },
                    result: { type: 'string' },
                  },
                },
                description: 'Tool calls made during this phase',
              },
              artifacts: { type: 'array', items: { type: 'string' }, description: 'Files created or modified' },
            },
          },
        },
        required: ['harness_id'],
      },
      execute: async (args: Record<string, unknown>) => {
        const harnessId = args.harness_id as string;
        const harness = getHarnessById(harnessId);
        if (!harness) {
          return `Harness "${harnessId}" not found. Available: ${BUILTIN_HARNESSES.map(h => h.id).join(', ')}`;
        }

        // Track active harness runs in closure
        if (!activeHarnessRuns.has(harnessId)) {
          // First call — create run
          const run = createHarnessRun(harness);
          activeHarnessRuns.set(harnessId, run);
          const instruction = getCurrentPhaseInstruction(run, harness);
          return `## Harness Started: ${harness.name}\n\n${instruction ?? 'No phases defined.'}`;
        }

        // Subsequent call — advance with output
        const phaseOutput = args.phase_output as { content?: string; tool_calls?: unknown[]; artifacts?: string[] } | undefined;
        if (!phaseOutput?.content) {
          const run = activeHarnessRuns.get(harnessId)!;
          const instruction = getCurrentPhaseInstruction(run, harness);
          if (!instruction) {
            const summary = getRunSummary(run, harness);
            activeHarnessRuns.delete(harnessId);
            return summary;
          }
          return instruction;
        }

        const currentRun = activeHarnessRuns.get(harnessId)!;
        const currentPhase = harness.phases[currentRun.currentPhase];

        const output: PhaseOutput = {
          phaseId: currentPhase?.id ?? 'unknown',
          content: phaseOutput.content,
          toolCalls: (phaseOutput.tool_calls as PhaseOutput['toolCalls']) ?? [],
          artifacts: phaseOutput.artifacts ?? [],
          durationMs: 0,
          tokens: { input: 0, output: 0 },
        };

        const newRun = await advancePhase(currentRun, harness, output);
        activeHarnessRuns.set(harnessId, newRun);

        if (newRun.completed || newRun.aborted) {
          const summary = getRunSummary(newRun, harness);
          activeHarnessRuns.delete(harnessId);
          return summary;
        }

        const nextInstruction = getCurrentPhaseInstruction(newRun, harness);
        return nextInstruction ?? getRunSummary(newRun, harness);
      },
    },
  ];
}

// Active harness runs — keyed by harness ID
const activeHarnessRuns = new Map<string, HarnessRunState>();
