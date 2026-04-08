import { describe, it, expect } from 'vitest';
import { WORKFLOW_TEMPLATES, listWorkflowTemplates } from '../src/workflow-templates.js';

describe('New workflow templates', () => {
  it('ticket-resolve template exists', () => {
    expect(WORKFLOW_TEMPLATES['ticket-resolve']).toBeDefined();
    const template = WORKFLOW_TEMPLATES['ticket-resolve']('Test ticket');
    expect(template.name).toBe('ticket-resolve');
    expect(template.steps.length).toBeGreaterThanOrEqual(3);
  });

  it('content-pipeline template exists', () => {
    expect(WORKFLOW_TEMPLATES['content-pipeline']).toBeDefined();
    const template = WORKFLOW_TEMPLATES['content-pipeline']('Test content');
    expect(template.name).toBe('content-pipeline');
    expect(template.steps.length).toBeGreaterThanOrEqual(3);
  });

  it('lists all 5 templates', () => {
    const names = listWorkflowTemplates();
    expect(names).toContain('research-team');
    expect(names).toContain('review-pair');
    expect(names).toContain('plan-execute');
    expect(names).toContain('ticket-resolve');
    expect(names).toContain('content-pipeline');
    expect(names.length).toBe(5);
  });
});
