import { describe, it, expect } from 'vitest';
import { Plan } from '../src/plan.js';

describe('Plan', () => {
  it('creates plan and adds steps with pending status', () => {
    const plan = new Plan();
    plan.addStep({ title: 'Install deps', command: 'npm install' });
    plan.addStep({ title: 'Run build', description: 'Build the project' });
    plan.addStep({ title: 'Deploy' });

    const steps = plan.getSteps();
    expect(steps).toHaveLength(3);
    expect(steps[0]).toEqual({ title: 'Install deps', command: 'npm install', status: 'pending' });
    expect(steps[1]).toEqual({ title: 'Run build', description: 'Build the project', status: 'pending' });
    expect(steps[2]).toEqual({ title: 'Deploy', status: 'pending' });
  });

  it('advances through steps with completeCurrentStep', () => {
    const plan = new Plan();
    plan.addStep({ title: 'Step 1' });
    plan.addStep({ title: 'Step 2' });
    plan.addStep({ title: 'Step 3' });

    expect(plan.getCurrentStep()?.title).toBe('Step 1');

    plan.completeCurrentStep('Done with step 1');
    expect(plan.getCurrentStep()?.title).toBe('Step 2');
    expect(plan.getSteps()[0].status).toBe('done');
    expect(plan.getSteps()[0].result).toBe('Done with step 1');

    plan.completeCurrentStep('Done with step 2');
    expect(plan.getCurrentStep()?.title).toBe('Step 3');
  });

  it('reports isComplete after all steps done', () => {
    const plan = new Plan();
    plan.addStep({ title: 'Step 1' });
    plan.addStep({ title: 'Step 2' });

    expect(plan.isComplete()).toBe(false);

    plan.completeCurrentStep('ok');
    expect(plan.isComplete()).toBe(false);

    plan.completeCurrentStep('ok');
    expect(plan.isComplete()).toBe(true);
    expect(plan.getCurrentStep()).toBeUndefined();
  });

  it('serializes and deserializes via toJSON/fromJSON', () => {
    const plan = new Plan();
    plan.addStep({ title: 'Step 1', command: 'echo hi' });
    plan.addStep({ title: 'Step 2', description: 'Second step' });
    plan.completeCurrentStep('result-1');

    const json = plan.toJSON();
    const restored = Plan.fromJSON(json as any);

    expect(restored.getSteps()).toEqual(plan.getSteps());
    expect(restored.getCurrentStep()?.title).toBe('Step 2');
    expect(restored.isComplete()).toBe(false);

    restored.completeCurrentStep('result-2');
    expect(restored.isComplete()).toBe(true);
  });

  it('fails a step with reason and advances', () => {
    const plan = new Plan();
    plan.addStep({ title: 'Step 1' });
    plan.addStep({ title: 'Step 2' });

    plan.failCurrentStep('network error');

    const steps = plan.getSteps();
    expect(steps[0].status).toBe('failed');
    expect(steps[0].reason).toBe('network error');
    expect(plan.getCurrentStep()?.title).toBe('Step 2');
    expect(plan.isComplete()).toBe(false);
  });
});
