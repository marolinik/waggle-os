import { describe, it, expect } from 'vitest';
import {
  HookRegistry,
  Plan,
  PermissionManager,
  READONLY_TOOLS,
  filterToolsForContext,
  needsConfirmation,
  ConfirmationGate,
  MemoryLinker,
} from '@waggle/agent';
import { Ontology, validateEntity } from '@waggle/core';

describe('M3c Integration', () => {
  it('hook registry registers and fires', async () => {
    const registry = new HookRegistry();
    const calls: string[] = [];
    registry.on('pre:tool', async (ctx) => { calls.push(`pre:${ctx.toolName}`); });
    registry.on('post:tool', async (ctx) => { calls.push(`post:${ctx.toolName}`); });
    await registry.fire('pre:tool', { toolName: 'bash' });
    await registry.fire('post:tool', { toolName: 'bash' });
    expect(calls).toEqual(['pre:bash', 'post:bash']);
  });

  it('permission manager blocks blacklisted tools', () => {
    const pm = new PermissionManager({ blacklist: ['bash'] });
    expect(pm.isAllowed('bash')).toBe(false);
    expect(pm.isAllowed('read_file')).toBe(true);
  });

  it('sandbox mode restricts to readonly tools', () => {
    const pm = PermissionManager.sandbox();
    expect(pm.isAllowed('read_file')).toBe(true);
    expect(pm.isAllowed('bash')).toBe(false);
    expect(pm.isAllowed('write_file')).toBe(false);
  });

  it('plan mode creates, advances, and completes', () => {
    const plan = new Plan();
    plan.addStep({ title: 'Step 1' });
    plan.addStep({ title: 'Step 2' });
    expect(plan.getCurrentStep()?.title).toBe('Step 1');
    plan.completeCurrentStep('done');
    expect(plan.getCurrentStep()?.title).toBe('Step 2');
    plan.completeCurrentStep('done');
    expect(plan.isComplete()).toBe(true);
  });

  it('tool filtering narrows by context', () => {
    const tools = [
      { name: 'bash', description: '', parameters: {}, execute: async () => '' },
      { name: 'read_file', description: '', parameters: {}, execute: async () => '' },
      { name: 'web_search', description: '', parameters: {}, execute: async () => '' },
    ];
    const research = filterToolsForContext(tools, 'research');
    expect(research.map(t => t.name)).toContain('read_file');
    expect(research.map(t => t.name)).toContain('web_search');
    expect(research.map(t => t.name)).not.toContain('bash');
  });

  it('confirmation gates identify sensitive ops', () => {
    expect(needsConfirmation('bash')).toBe(true);
    expect(needsConfirmation('write_file')).toBe(true);
    expect(needsConfirmation('read_file')).toBe(false);
    expect(needsConfirmation('git_commit')).toBe(true);
  });

  it('ontology validates entities', () => {
    const ontology = new Ontology();
    ontology.define('person', { required: ['name'], optional: ['email'] });

    const valid = validateEntity(ontology, { type: 'person', properties: { name: 'Alice' } });
    expect(valid.valid).toBe(true);

    const invalid = validateEntity(ontology, { type: 'person', properties: { email: 'a@b.com' } });
    expect(invalid.valid).toBe(false);
    expect(invalid.issues).toContain('Missing required property: name');
  });

  it('all M3c modules integrate without conflicts', async () => {
    // Create all components — verify no import/construction errors
    const hooks = new HookRegistry();
    const plan = new Plan();
    const permissions = PermissionManager.sandbox();
    const gate = new ConfirmationGate({ interactive: false });
    const ontology = new Ontology();

    // Wire hooks into permission check
    hooks.on('pre:tool', async (ctx) => {
      if (!permissions.isAllowed(ctx.toolName!)) {
        return { cancel: true, reason: 'Not allowed by permissions' };
      }
    });

    // Fire for allowed tool
    const r1 = await hooks.fire('pre:tool', { toolName: 'read_file' });
    expect(r1.cancelled).toBe(false);

    // Fire for blocked tool
    const r2 = await hooks.fire('pre:tool', { toolName: 'bash' });
    expect(r2.cancelled).toBe(true);

    // Confirmation auto-approves in non-interactive
    const approved = await gate.confirm('bash', {});
    expect(approved).toBe(true);

    // Plan works
    plan.addStep({ title: 'Research' });
    plan.completeCurrentStep('Found info');
    expect(plan.isComplete()).toBe(true);
  });
});
