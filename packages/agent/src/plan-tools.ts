import type { ToolDefinition } from './tools.js';
import { Plan } from './plan.js';

export function createPlanTools(): ToolDefinition[] {
  let currentPlan: Plan | null = null;

  return [
    {
      name: 'create_plan',
      description: 'Create a new execution plan',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Plan title' },
        },
        required: ['title'],
      },
      execute: async (args) => {
        currentPlan = new Plan();
        return `Plan created: ${args.title}`;
      },
    },
    {
      name: 'add_plan_step',
      description: 'Add a step to the current plan',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Step title' },
          command: { type: 'string', description: 'Command to execute (optional)' },
          description: { type: 'string', description: 'Step description (optional)' },
        },
        required: ['title'],
      },
      execute: async (args) => {
        if (!currentPlan) return 'Error: No plan created. Use create_plan first.';
        currentPlan.addStep({
          title: args.title as string,
          command: args.command as string | undefined,
          description: args.description as string | undefined,
        });
        return `Step added: ${args.title}`;
      },
    },
    {
      name: 'execute_step',
      description: 'Mark the current plan step as complete with a result',
      parameters: {
        type: 'object',
        properties: {
          result: { type: 'string', description: 'Result of executing the step' },
        },
        required: ['result'],
      },
      execute: async (args) => {
        if (!currentPlan) return 'Error: No plan created.';
        const step = currentPlan.getCurrentStep();
        if (!step) return 'All steps complete.';
        currentPlan.completeCurrentStep(args.result as string);
        return `Step completed: ${step.title}`;
      },
    },
    {
      name: 'show_plan',
      description: 'Show the current plan with step statuses',
      parameters: { type: 'object', properties: {} },
      execute: async () => {
        if (!currentPlan) return 'No plan created.';
        const steps = currentPlan.getSteps();
        if (steps.length === 0) return 'Plan has no steps.';
        const lines = steps.map((s, i) => {
          const icon = s.status === 'done' ? '✓' : s.status === 'failed' ? '✗' : '○';
          return `${icon} ${i + 1}. ${s.title} [${s.status}]`;
        });
        return lines.join('\n');
      },
    },
  ];
}
