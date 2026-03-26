import type { WorkflowTemplate } from './subagent-orchestrator.js';

/**
 * Built-in workflow templates that can be triggered by the orchestrate_workflow tool.
 * Each template defines a multi-agent workflow with dependency ordering and context flow.
 */

export function createResearchTeamTemplate(task: string): WorkflowTemplate {
  return {
    name: 'research-team',
    description: 'Multi-agent research: researcher → synthesizer → reviewer',
    steps: [
      {
        name: 'Researcher',
        role: 'researcher',
        task: `Research the following topic thoroughly using all available sources (web, memory, files):\n\n${task}\n\nProvide raw findings organized by source with key data points, quotes, and references.`,
        maxTurns: 30,
      },
      {
        name: 'Synthesizer',
        role: 'synthesizer',
        task: `Synthesize the research findings into a coherent, well-structured report:\n\n${task}`,
        dependsOn: ['Researcher'],
        contextFrom: ['Researcher'],
        maxTurns: 20,
      },
      {
        name: 'Reviewer',
        role: 'reviewer',
        task: `Review this research report for accuracy, completeness, and quality. Identify gaps, validate claims, and suggest improvements:\n\n${task}`,
        dependsOn: ['Synthesizer'],
        contextFrom: ['Researcher', 'Synthesizer'],
        maxTurns: 15,
      },
    ],
    aggregation: 'last',
  };
}

export function createReviewPairTemplate(task: string): WorkflowTemplate {
  return {
    name: 'review-pair',
    description: 'Writer + reviewer with revision cycle: draft → critique → revise',
    steps: [
      {
        name: 'Writer',
        role: 'writer',
        task: `Write a comprehensive first draft for:\n\n${task}\n\nFocus on completeness and accuracy. This will go through a review cycle.`,
        maxTurns: 25,
      },
      {
        name: 'Reviewer',
        role: 'reviewer',
        task: `Review this draft critically. Identify issues with accuracy, clarity, completeness, and style. Provide specific, actionable feedback:\n\n${task}`,
        dependsOn: ['Writer'],
        contextFrom: ['Writer'],
        maxTurns: 15,
      },
      {
        name: 'Reviser',
        role: 'writer',
        task: `Revise the draft incorporating the reviewer's feedback. Produce a polished final version:\n\n${task}`,
        dependsOn: ['Reviewer'],
        contextFrom: ['Writer', 'Reviewer'],
        maxTurns: 20,
      },
    ],
    aggregation: 'last',
  };
}

export function createPlanExecuteTemplate(task: string): WorkflowTemplate {
  return {
    name: 'plan-execute',
    description: 'Planner decomposes, executor works, summarizer consolidates',
    steps: [
      {
        name: 'Planner',
        role: 'planner',
        task: `Analyze this task and create a structured plan with concrete, actionable sub-tasks:\n\n${task}\n\nOutput a numbered list of sub-tasks, each with clear acceptance criteria.`,
        maxTurns: 15,
      },
      {
        name: 'Executor',
        role: 'analyst',
        task: `Execute the plan step by step. For each sub-task, produce the deliverable:\n\n${task}`,
        dependsOn: ['Planner'],
        contextFrom: ['Planner'],
        maxTurns: 40,
      },
      {
        name: 'Summarizer',
        role: 'summarizer',
        task: `Consolidate all the executor's results into a final, cohesive deliverable:\n\n${task}`,
        dependsOn: ['Executor'],
        contextFrom: ['Planner', 'Executor'],
        maxTurns: 15,
      },
    ],
    aggregation: 'last',
  };
}

/** Registry of all built-in workflow template factories */
export const WORKFLOW_TEMPLATES: Record<string, (task: string) => WorkflowTemplate> = {
  'research-team': createResearchTeamTemplate,
  'review-pair': createReviewPairTemplate,
  'plan-execute': createPlanExecuteTemplate,
};

/** List available workflow template names */
export function listWorkflowTemplates(): string[] {
  return Object.keys(WORKFLOW_TEMPLATES);
}
