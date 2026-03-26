import { describe, it, expect } from 'vitest';
import {
  composeWorkflow,
  validateTemplate,
  type ComposerContext,
  type WorkflowPlan,
} from '../src/workflow-composer.js';
import type { TaskShape } from '../src/task-shape.js';
import type { WorkflowTemplate } from '../src/subagent-orchestrator.js';

function makeShape(overrides: Partial<TaskShape> = {}): TaskShape {
  return {
    type: 'research',
    confidence: 0.7,
    signals: [{ shape: 'research', match: 'research', weight: 2 }],
    complexity: 'moderate',
    ...overrides,
  };
}

describe('Workflow Composer', () => {
  // ── Execution mode selection ────────────────────────────────────────

  describe('execution mode selection', () => {
    it('selects direct for simple tasks', () => {
      const plan = composeWorkflow(
        makeShape({ complexity: 'simple' }),
        'What is Docker?',
      );
      expect(plan.executionMode).toBe('direct');
    });

    it('selects direct for low-confidence detection', () => {
      const plan = composeWorkflow(
        makeShape({ confidence: 0.2 }),
        'hello',
      );
      expect(plan.executionMode).toBe('direct');
    });

    it('selects structured_single_agent for moderate single-shape tasks', () => {
      const plan = composeWorkflow(
        makeShape({ complexity: 'moderate', type: 'research' }),
        'Research the state of WebAssembly',
      );
      expect(plan.executionMode).toBe('structured_single_agent');
    });

    it('selects structured_single_agent for mixed with 2 phases', () => {
      const plan = composeWorkflow(
        makeShape({
          type: 'mixed',
          complexity: 'moderate',
          phases: [
            { shape: 'research', trigger: 'research options' },
            { shape: 'draft', trigger: 'write a summary' },
          ],
        }),
        'Research options then write a summary',
      );
      expect(plan.executionMode).toBe('structured_single_agent');
    });

    it('selects subagent_workflow for complex mixed tasks with 3+ phases', () => {
      const plan = composeWorkflow(
        makeShape({
          type: 'mixed',
          complexity: 'complex',
          phases: [
            { shape: 'research', trigger: 'research' },
            { shape: 'compare', trigger: 'compare' },
            { shape: 'draft', trigger: 'draft' },
          ],
        }),
        'Research, compare, and draft',
        { subAgentsAvailable: true },
      );
      expect(plan.executionMode).toBe('subagent_workflow');
    });

    it('falls back to structured_single_agent when sub-agents unavailable', () => {
      const plan = composeWorkflow(
        makeShape({ type: 'mixed', complexity: 'complex', phases: [
          { shape: 'research', trigger: 'r' },
          { shape: 'compare', trigger: 'c' },
          { shape: 'draft', trigger: 'd' },
        ] }),
        'Complex task',
        { subAgentsAvailable: false },
      );
      expect(plan.executionMode).toBe('structured_single_agent');
    });

    it('selects skill_guided when a matching skill exists', () => {
      const plan = composeWorkflow(
        makeShape({ type: 'research', complexity: 'moderate' }),
        'Research the market',
        {
          skills: [{ name: 'research-synthesis', content: 'A skill for research tasks' }],
        },
      );
      expect(plan.executionMode).toBe('skill_guided');
    });
  });

  // ── Plan structure ──────────────────────────────────────────────────

  describe('plan structure', () => {
    it('always includes steps', () => {
      const plan = composeWorkflow(makeShape(), 'Do something');
      expect(plan.steps.length).toBeGreaterThan(0);
    });

    it('includes shape in output', () => {
      const shape = makeShape({ type: 'compare' });
      const plan = composeWorkflow(shape, 'Compare A vs B');
      expect(plan.shape).toBe(shape);
    });

    it('includes modeReason', () => {
      const plan = composeWorkflow(makeShape(), 'Research something');
      expect(plan.modeReason).toBeTruthy();
      expect(typeof plan.modeReason).toBe('string');
    });

    it('includes escalationTrigger', () => {
      const plan = composeWorkflow(makeShape(), 'Research something');
      expect(plan.escalationTrigger).toBeTruthy();
    });

    it('includes user-facing explanation', () => {
      const plan = composeWorkflow(makeShape(), 'Research something');
      expect(plan.explanation).toBeTruthy();
      expect(typeof plan.explanation).toBe('string');
    });

    it('only includes template for subagent_workflow mode', () => {
      // Direct mode — no template
      const directPlan = composeWorkflow(
        makeShape({ complexity: 'simple' }),
        'Simple task',
      );
      expect(directPlan.template).toBeUndefined();

      // Structured — no template
      const structPlan = composeWorkflow(
        makeShape({ complexity: 'moderate' }),
        'Moderate task',
      );
      expect(structPlan.template).toBeUndefined();

      // Subagent — has template
      const subPlan = composeWorkflow(
        makeShape({
          type: 'mixed',
          complexity: 'complex',
          phases: [
            { shape: 'research', trigger: 'r' },
            { shape: 'compare', trigger: 'c' },
            { shape: 'draft', trigger: 'd' },
          ],
        }),
        'Complex multi-phase task',
        { subAgentsAvailable: true },
      );
      expect(subPlan.template).toBeDefined();
      expect(subPlan.template!.steps.length).toBeGreaterThan(0);
    });
  });

  // ── Step generation per shape ───────────────────────────────────────

  describe('shape-specific steps', () => {
    it('generates research steps', () => {
      const plan = composeWorkflow(makeShape({ type: 'research' }), 'Research topic');
      const stepNames = plan.steps.map(s => s.name.toLowerCase());
      expect(stepNames.some(n => n.includes('gather') || n.includes('source'))).toBe(true);
      expect(stepNames.some(n => n.includes('synthesize') || n.includes('finding'))).toBe(true);
    });

    it('generates compare steps', () => {
      const plan = composeWorkflow(makeShape({ type: 'compare' }), 'Compare A vs B');
      expect(plan.steps.length).toBeGreaterThanOrEqual(2);
    });

    it('generates draft steps', () => {
      const plan = composeWorkflow(makeShape({ type: 'draft' }), 'Write a memo');
      expect(plan.steps.length).toBeGreaterThanOrEqual(2);
    });

    it('generates review steps', () => {
      const plan = composeWorkflow(makeShape({ type: 'review' }), 'Review this code');
      expect(plan.steps.length).toBeGreaterThanOrEqual(2);
    });

    it('generates decide steps', () => {
      const plan = composeWorkflow(makeShape({ type: 'decide' }), 'Should I use X?');
      expect(plan.steps.length).toBeGreaterThanOrEqual(2);
    });

    it('generates plan-execute steps', () => {
      const plan = composeWorkflow(makeShape({ type: 'plan-execute' }), 'Plan the migration');
      expect(plan.steps.length).toBeGreaterThanOrEqual(3);
    });
  });

  // ── Explanation quality ─────────────────────────────────────────────

  describe('user-facing explanation', () => {
    it('is concise for direct mode', () => {
      const plan = composeWorkflow(makeShape({ complexity: 'simple' }), 'Quick task');
      expect(plan.explanation.length).toBeLessThan(100);
    });

    it('mentions step count for structured mode', () => {
      const plan = composeWorkflow(
        makeShape({ type: 'research', complexity: 'moderate' }),
        'Research task',
      );
      expect(plan.explanation).toMatch(/\d+\s+step/i);
    });
  });
});

// ── Template validation ─────────────────────────────────────────────

describe('Template Validation', () => {
  function makeTemplate(overrides: Partial<WorkflowTemplate> = {}): WorkflowTemplate {
    return {
      name: 'test-workflow',
      description: 'A test workflow',
      steps: [
        { name: 'step-1', role: 'researcher', task: 'Do research', maxTurns: 10 },
        { name: 'step-2', role: 'writer', task: 'Write output', dependsOn: ['step-1'], maxTurns: 10 },
      ],
      aggregation: 'last',
      ...overrides,
    };
  }

  it('accepts valid template', () => {
    const errors = validateTemplate(makeTemplate());
    expect(errors).toHaveLength(0);
  });

  it('rejects template without name', () => {
    const errors = validateTemplate(makeTemplate({ name: '' }));
    expect(errors.some(e => e.field === 'name')).toBe(true);
  });

  it('rejects template without steps', () => {
    const errors = validateTemplate(makeTemplate({ steps: [] }));
    expect(errors.some(e => e.field === 'steps')).toBe(true);
  });

  it('rejects invalid aggregation', () => {
    const errors = validateTemplate(makeTemplate({ aggregation: 'invalid' as any }));
    expect(errors.some(e => e.field === 'aggregation')).toBe(true);
  });

  it('rejects duplicate step names', () => {
    const errors = validateTemplate(makeTemplate({
      steps: [
        { name: 'dup', role: 'a', task: 'x', maxTurns: 5 },
        { name: 'dup', role: 'b', task: 'y', maxTurns: 5 },
      ],
    }));
    expect(errors.some(e => e.message.includes('Duplicate'))).toBe(true);
  });

  it('rejects steps with missing role', () => {
    const errors = validateTemplate(makeTemplate({
      steps: [{ name: 'step', role: '', task: 'x', maxTurns: 5 }],
    }));
    expect(errors.some(e => e.message.includes('role'))).toBe(true);
  });

  it('rejects steps with missing task', () => {
    const errors = validateTemplate(makeTemplate({
      steps: [{ name: 'step', role: 'analyst', task: '', maxTurns: 5 }],
    }));
    expect(errors.some(e => e.message.includes('task'))).toBe(true);
  });

  it('detects circular dependencies', () => {
    const errors = validateTemplate(makeTemplate({
      steps: [
        { name: 'a', role: 'r', task: 'x', dependsOn: ['b'], maxTurns: 5 },
        { name: 'b', role: 'r', task: 'y', dependsOn: ['a'], maxTurns: 5 },
      ],
    }));
    expect(errors.some(e => e.message.includes('circular'))).toBe(true);
  });

  it('accepts valid aggregation types', () => {
    for (const agg of ['concatenate', 'last', 'synthesize'] as const) {
      const errors = validateTemplate(makeTemplate({ aggregation: agg }));
      expect(errors.filter(e => e.field === 'aggregation')).toHaveLength(0);
    }
  });
});
