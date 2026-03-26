/**
 * Workflow Composer — transforms a detected task shape into a WorkflowPlan
 * with execution-mode selection, user-facing explanation, and optional
 * WorkflowTemplate for sub-agent execution.
 *
 * Core principle: choose the lightest sufficient execution mode.
 * Most tasks should resolve as direct or structured_single_agent.
 * Sub-agent workflows are the heavy option, not the default.
 */

import type { TaskShape, TaskShapeType, ComponentPhase } from './task-shape.js';
import type { WorkflowTemplate, WorkflowStep } from './subagent-orchestrator.js';
import type { LoadedSkill } from './prompt-loader.js';

// ── Types ────────────────────────────────────────────────────────────

export type ExecutionMode =
  | 'direct'                  // Agent handles directly, no special structure
  | 'structured_single_agent' // Agent follows a structured plan, no sub-agents
  | 'skill_guided'            // Agent uses a loaded skill's workflow
  | 'subagent_workflow';      // Multi-agent orchestration via SubagentOrchestrator

export interface WorkflowPlan {
  /** Recommended execution mode */
  executionMode: ExecutionMode;
  /** Why this mode was chosen (internal reasoning) */
  modeReason: string;
  /** What would trigger escalation to a heavier mode */
  escalationTrigger: string;
  /** User-facing explanation — concise, work-oriented */
  explanation: string;
  /** Structured steps for the agent to follow (all modes) */
  steps: PlanStep[];
  /** Full WorkflowTemplate — only present when executionMode is subagent_workflow */
  template?: WorkflowTemplate;
  /** Detected task shape that informed this plan */
  shape: TaskShape;
}

export interface PlanStep {
  /** Step name (human-readable) */
  name: string;
  /** What this step does */
  action: string;
  /** Which skill to use, if applicable */
  skill?: string;
}

export interface ComposerContext {
  /** Currently loaded skills */
  skills?: LoadedSkill[];
  /** Whether sub-agent spawning is available */
  subAgentsAvailable?: boolean;
  /** Message length as complexity signal */
  messageLength?: number;
}

// ── Composer ─────────────────────────────────────────────────────────

export function composeWorkflow(
  shape: TaskShape,
  task: string,
  context?: ComposerContext,
): WorkflowPlan {
  const mode = selectExecutionMode(shape, context);
  const steps = buildPlanSteps(shape, task, context);
  const explanation = buildExplanation(shape, steps, mode);
  const template = mode === 'subagent_workflow'
    ? buildTemplate(shape, task, steps)
    : undefined;

  return {
    executionMode: mode,
    modeReason: explainModeChoice(mode, shape, context),
    escalationTrigger: getEscalationTrigger(mode),
    explanation,
    steps,
    template,
    shape,
  };
}

// ── Execution mode selection ─────────────────────────────────────────

function selectExecutionMode(shape: TaskShape, context?: ComposerContext): ExecutionMode {
  // Check for matching skill first
  if (context?.skills && context.skills.length > 0) {
    const matchingSkill = findMatchingSkill(shape, context.skills);
    if (matchingSkill) return 'skill_guided';
  }

  // Simple/low-confidence → direct
  if (shape.complexity === 'simple' || shape.confidence < 0.3) {
    return 'direct';
  }

  // Moderate complexity, single shape → structured single agent
  if (shape.complexity === 'moderate' && shape.type !== 'mixed') {
    return 'structured_single_agent';
  }

  // Mixed with 2 phases → structured single agent (still manageable)
  if (shape.type === 'mixed' && shape.phases && shape.phases.length <= 2) {
    return 'structured_single_agent';
  }

  // Complex mixed (3+ phases) or complex single shape → sub-agent if available
  if (shape.complexity === 'complex' && context?.subAgentsAvailable !== false) {
    return 'subagent_workflow';
  }

  // Complex but no sub-agents → structured single agent (best effort)
  if (shape.complexity === 'complex') {
    return 'structured_single_agent';
  }

  // Default: structured single agent for anything moderate+
  return 'structured_single_agent';
}

function findMatchingSkill(shape: TaskShape, skills: LoadedSkill[]): LoadedSkill | undefined {
  const shapeKeywords: Record<string, string[]> = {
    research: ['research', 'synthesis', 'investigate'],
    compare: ['compare', 'decision-matrix', 'tradeoff'],
    draft: ['draft', 'memo', 'write'],
    review: ['review', 'code-review', 'critique'],
    decide: ['decision', 'decide', 'risk-assessment'],
    'plan-execute': ['plan', 'task-breakdown', 'daily-plan'],
  };

  const keywords = shapeKeywords[shape.type] ?? [];
  return skills.find(s =>
    keywords.some(k => s.name.includes(k) || s.content.toLowerCase().includes(k))
  );
}

function explainModeChoice(mode: ExecutionMode, shape: TaskShape, context?: ComposerContext): string {
  switch (mode) {
    case 'direct':
      return `Task is ${shape.complexity} with ${shape.confidence < 0.3 ? 'low' : 'clear'} structure — direct execution is sufficient.`;
    case 'skill_guided':
      return `A loaded skill matches this ${shape.type} task — using skill-guided execution.`;
    case 'structured_single_agent':
      return `Task has ${shape.type === 'mixed' ? 'multiple phases' : 'clear structure'} but can be handled in sequence without sub-agents.`;
    case 'subagent_workflow':
      return `Task is complex${shape.type === 'mixed' ? ` with ${shape.phases?.length ?? 3}+ phases` : ''} — parallel sub-agents will be more effective.`;
  }
}

function getEscalationTrigger(mode: ExecutionMode): string {
  switch (mode) {
    case 'direct':
      return 'Escalate to structured plan if task turns out to have multiple distinct phases.';
    case 'skill_guided':
      return 'Escalate to structured plan if the skill does not cover all aspects of the task.';
    case 'structured_single_agent':
      return 'Escalate to sub-agent workflow if individual phases are each substantial enough to warrant parallel execution.';
    case 'subagent_workflow':
      return 'Already using the heaviest mode. Simplify if task turns out to be straightforward.';
  }
}

// ── Plan step construction ───────────────────────────────────────────

function buildPlanSteps(shape: TaskShape, task: string, context?: ComposerContext): PlanStep[] {
  if (shape.type === 'mixed' && shape.phases) {
    return buildMixedSteps(shape.phases, task, context);
  }
  return buildShapeSteps(shape.type, task, context);
}

function buildShapeSteps(
  shapeType: TaskShapeType,
  task: string,
  context?: ComposerContext,
): PlanStep[] {
  const matchedSkill = context?.skills
    ? findMatchingSkill({ type: shapeType } as TaskShape, context.skills)
    : undefined;

  switch (shapeType) {
    case 'research':
      return [
        { name: 'Gather sources', action: 'Search memory, web, and files for relevant information' },
        { name: 'Synthesize findings', action: 'Organize and synthesize raw findings into a coherent summary', skill: matchedSkill?.name },
      ];
    case 'compare':
      return [
        { name: 'Identify options', action: 'Clarify the options being compared and the criteria' },
        { name: 'Analyze each option', action: 'Evaluate each option against the criteria' },
        { name: 'Present comparison', action: 'Summarize tradeoffs and key differences', skill: matchedSkill?.name },
      ];
    case 'draft':
      return [
        { name: 'Gather context', action: 'Pull relevant context from memory and workspace' },
        { name: 'Write draft', action: 'Produce the requested document or content', skill: matchedSkill?.name },
      ];
    case 'review':
      return [
        { name: 'Read and understand', action: 'Read the material being reviewed' },
        { name: 'Identify issues', action: 'Evaluate for accuracy, completeness, clarity, and quality' },
        { name: 'Provide feedback', action: 'Present structured feedback with specific suggestions', skill: matchedSkill?.name },
      ];
    case 'decide':
      return [
        { name: 'Frame the decision', action: 'Clarify the question, constraints, and success criteria' },
        { name: 'Evaluate options', action: 'Assess each option against criteria' },
        { name: 'Recommend', action: 'Present recommendation with reasoning', skill: matchedSkill?.name },
      ];
    case 'plan-execute':
      return [
        { name: 'Analyze scope', action: 'Understand the full scope and constraints' },
        { name: 'Break into phases', action: 'Decompose into ordered, actionable phases' },
        { name: 'Identify risks', action: 'Flag dependencies, risks, and unknowns' },
        { name: 'Present plan', action: 'Deliver structured plan with clear next steps', skill: matchedSkill?.name },
      ];
    default:
      return [
        { name: 'Execute task', action: 'Handle the request directly' },
      ];
  }
}

function buildMixedSteps(
  phases: ComponentPhase[],
  _task: string,
  context?: ComposerContext,
): PlanStep[] {
  const steps: PlanStep[] = [];
  for (const phase of phases) {
    const phaseSteps = buildShapeSteps(phase.shape, phase.trigger, context);
    // For mixed tasks, take the key action from each phase (not all sub-steps)
    if (phaseSteps.length <= 2) {
      steps.push(...phaseSteps);
    } else {
      // Consolidate to the most important step per phase
      steps.push({
        name: `${capitalize(phase.shape)}`,
        action: phaseSteps.map(s => s.action).join('; '),
        skill: phaseSteps.find(s => s.skill)?.skill,
      });
    }
  }
  return steps;
}

// ── Template construction (only for subagent_workflow) ────────────────

function buildTemplate(shape: TaskShape, task: string, steps: PlanStep[]): WorkflowTemplate {
  const workflowSteps: WorkflowStep[] = steps.map((step, i) => ({
    name: step.name,
    role: mapStepToRole(step),
    task: `${step.action}:\n\n${task}`,
    dependsOn: i > 0 ? [steps[i - 1].name] : undefined,
    contextFrom: i > 0 ? steps.slice(0, i).map(s => s.name) : undefined,
    maxTurns: 25,
  }));

  return {
    name: `composed-${shape.type}`,
    description: `Dynamically composed workflow for ${shape.type} task`,
    steps: workflowSteps,
    aggregation: 'last',
  };
}

function mapStepToRole(step: PlanStep): string {
  const action = step.action.toLowerCase();
  if (action.includes('search') || action.includes('gather') || action.includes('research')) return 'researcher';
  if (action.includes('write') || action.includes('draft') || action.includes('produce')) return 'writer';
  if (action.includes('review') || action.includes('evaluate') || action.includes('critique')) return 'reviewer';
  if (action.includes('plan') || action.includes('break') || action.includes('decompose')) return 'planner';
  if (action.includes('synthesize') || action.includes('summarize') || action.includes('consolidate')) return 'synthesizer';
  return 'analyst';
}

// ── User-facing explanation ──────────────────────────────────────────

function buildExplanation(shape: TaskShape, steps: PlanStep[], mode: ExecutionMode): string {
  const stepCount = steps.length;

  // Short intro based on mode
  let intro: string;
  switch (mode) {
    case 'direct':
      return `I'll handle this directly.`;
    case 'skill_guided': {
      const skill = steps.find(s => s.skill);
      return `I'll use the **${skill?.skill}** skill to guide this.`;
    }
    case 'structured_single_agent':
      intro = `I'd handle this in ${stepCount} step${stepCount > 1 ? 's' : ''}`;
      break;
    case 'subagent_workflow':
      intro = `I'd run this as a ${stepCount}-step workflow with specialist agents`;
      break;
  }

  // Build step list
  const stepDescs = steps.map((s, i) => {
    const prefix = stepCount <= 3
      ? ['First', 'Then', 'Finally'][i] ?? `Step ${i + 1}`
      : `${i + 1}.`;
    return `${prefix}, ${s.action.charAt(0).toLowerCase()}${s.action.slice(1)}`;
  });

  return `${intro}:\n${stepDescs.join('\n')}`;
}

// ── Validation ───────────────────────────────────────────────────────

export interface ValidationError {
  field: string;
  message: string;
}

export function validateTemplate(template: WorkflowTemplate): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!template.name) errors.push({ field: 'name', message: 'Template name is required' });
  if (!template.steps || template.steps.length === 0) {
    errors.push({ field: 'steps', message: 'At least one step is required' });
    return errors;
  }
  if (!['concatenate', 'last', 'synthesize'].includes(template.aggregation)) {
    errors.push({ field: 'aggregation', message: `Invalid aggregation: ${template.aggregation}` });
  }

  const stepNames = new Set<string>();
  for (const step of template.steps) {
    if (!step.name) errors.push({ field: 'steps', message: 'Step name is required' });
    if (!step.role) errors.push({ field: 'steps', message: `Step "${step.name}" requires a role` });
    if (!step.task) errors.push({ field: 'steps', message: `Step "${step.name}" requires a task` });
    if (stepNames.has(step.name)) {
      errors.push({ field: 'steps', message: `Duplicate step name: ${step.name}` });
    }
    stepNames.add(step.name);

    // Check dependency references
    for (const dep of step.dependsOn ?? []) {
      if (!stepNames.has(dep) && !template.steps.some(s => s.name === dep)) {
        errors.push({ field: 'steps', message: `Step "${step.name}" depends on unknown step "${dep}"` });
      }
    }
  }

  // Check for cycles
  if (hasCycle(template.steps)) {
    errors.push({ field: 'steps', message: 'Workflow has circular dependencies' });
  }

  return errors;
}

function hasCycle(steps: WorkflowStep[]): boolean {
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const adjMap = new Map<string, string[]>();

  for (const step of steps) {
    adjMap.set(step.name, step.dependsOn ?? []);
  }

  function dfs(node: string): boolean {
    if (inStack.has(node)) return true;
    if (visited.has(node)) return false;
    visited.add(node);
    inStack.add(node);
    for (const dep of adjMap.get(node) ?? []) {
      if (dfs(dep)) return true;
    }
    inStack.delete(node);
    return false;
  }

  for (const step of steps) {
    if (dfs(step.name)) return true;
  }
  return false;
}

// ── Helpers ──────────────────────────────────────────────────────────

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
