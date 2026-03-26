import { describe, it, expect } from 'vitest';
import { createPlanTools } from '../src/plan-tools.js';

describe('createPlanTools', () => {
  it('returns correct tool names', () => {
    const tools = createPlanTools();
    const names = tools.map(t => t.name);
    expect(names).toEqual(['create_plan', 'add_plan_step', 'execute_step', 'show_plan']);
  });

  it('create_plan creates a plan', async () => {
    const tools = createPlanTools();
    const createPlan = tools.find(t => t.name === 'create_plan')!;
    const result = await createPlan.execute({ title: 'My Test Plan' });
    expect(result).toContain('Plan created');
    expect(result).toContain('My Test Plan');
  });

  it('add_plan_step adds a step to the current plan', async () => {
    const tools = createPlanTools();
    const createPlan = tools.find(t => t.name === 'create_plan')!;
    const addStep = tools.find(t => t.name === 'add_plan_step')!;

    await createPlan.execute({ title: 'Plan' });
    const result = await addStep.execute({ title: 'Step 1', command: 'echo hi', description: 'First step' });
    expect(result).toContain('Step added');
    expect(result).toContain('Step 1');

    // Verify step appears in show_plan
    const showPlan = tools.find(t => t.name === 'show_plan')!;
    const shown = await showPlan.execute({});
    expect(shown).toContain('Step 1');
    expect(shown).toContain('pending');
  });

  it('add_plan_step returns error when no plan exists', async () => {
    const tools = createPlanTools();
    const addStep = tools.find(t => t.name === 'add_plan_step')!;
    const result = await addStep.execute({ title: 'Step 1' });
    expect(result).toContain('Error');
  });

  it('execute_step marks the current step as complete', async () => {
    const tools = createPlanTools();
    const createPlan = tools.find(t => t.name === 'create_plan')!;
    const addStep = tools.find(t => t.name === 'add_plan_step')!;
    const executeStep = tools.find(t => t.name === 'execute_step')!;
    const showPlan = tools.find(t => t.name === 'show_plan')!;

    await createPlan.execute({ title: 'Plan' });
    await addStep.execute({ title: 'Do thing' });
    const result = await executeStep.execute({ result: 'Done successfully' });
    expect(result).toContain('Step completed');
    expect(result).toContain('Do thing');

    // Verify status changed
    const shown = await showPlan.execute({});
    expect(shown).toContain('done');
  });
});
