import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import CreateAgentForm from './CreateAgentForm';
import CreateGroupForm from './CreateGroupForm';
import GroupDetail from './GroupDetail';
import type { AgentGroup, BackendPersona, ToolDef } from './types';

const tools: ToolDef[] = [
  { name: 'web_search', description: 'Search the web' },
  { name: 'write_file', description: 'Write a file' },
];

const agents: BackendPersona[] = [
  { id: 'researcher', name: 'Researcher', description: 'Finds source material' },
  { id: 'writer', name: 'Writer', description: 'Drafts copy' },
];

const group: AgentGroup = {
  id: 'research-pack',
  name: 'Research Pack',
  description: 'Coordinates source gathering and drafting',
  strategy: 'parallel',
  members: [
    { agentId: 'researcher', roleInGroup: 'lead', executionOrder: 0 },
    { agentId: 'writer', roleInGroup: 'worker', executionOrder: 1 },
  ],
};

describe('Agent template creation forms', () => {
  it('a11y: custom agent fields expose labels and stable form metadata', () => {
    render(
      <CreateAgentForm
        allTools={tools}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        generating={false}
        onGenerate={vi.fn().mockResolvedValue(null)}
      />,
    );

    const aiPrompt = screen.getByRole('textbox', { name: /describe agent to generate/i });
    expect(aiPrompt).toHaveAttribute('name', 'agentGeneratePrompt');
    expect(aiPrompt).toHaveAttribute('autocomplete', 'off');

    const icon = screen.getByRole('textbox', { name: 'Icon' });
    expect(icon).toHaveAttribute('name', 'agentIcon');
    expect(icon).toHaveAttribute('autocomplete', 'off');

    const name = screen.getByRole('textbox', { name: 'Name' });
    expect(name).toHaveAttribute('name', 'agentTemplateName');
    expect(name).toHaveAttribute('autocomplete', 'off');

    const description = screen.getByRole('textbox', { name: 'Description' });
    expect(description).toHaveAttribute('name', 'agentTemplateDescription');
    expect(description).toHaveAttribute('autocomplete', 'off');

    const systemPrompt = screen.getByRole('textbox', { name: 'System Prompt' });
    expect(systemPrompt).toHaveAttribute('name', 'agentTemplateSystemPrompt');
    expect(systemPrompt).toHaveAttribute('autocomplete', 'off');

    const toolFilter = screen.getByRole('textbox', { name: /filter tools/i });
    expect(toolFilter).toHaveAttribute('name', 'agentTemplateToolFilter');
    expect(toolFilter).toHaveAttribute('autocomplete', 'off');
  });

  it('a11y: group builder fields and strategy buttons expose control state', () => {
    render(
      <TooltipProvider>
        <CreateGroupForm agents={agents} onSave={vi.fn()} onCancel={vi.fn()} />
      </TooltipProvider>,
    );

    const name = screen.getByRole('textbox', { name: 'Name' });
    expect(name).toHaveAttribute('name', 'agentGroupName');
    expect(name).toHaveAttribute('autocomplete', 'off');

    const description = screen.getByRole('textbox', { name: 'Description' });
    expect(description).toHaveAttribute('name', 'agentGroupDescription');
    expect(description).toHaveAttribute('autocomplete', 'off');

    const parallel = screen.getByRole('button', { name: /parallel all agents work simultaneously/i });
    expect(parallel).toHaveAttribute('aria-pressed', 'true');
    expect(parallel.className).toContain('focus-visible:ring-2');
  });

  it('a11y: group detail task runner exposes metadata and visible action focus', () => {
    render(
      <GroupDetail
        group={group}
        agents={agents}
        onRun={vi.fn().mockResolvedValue(null)}
        onEdit={vi.fn()}
        onDuplicate={vi.fn()}
      />,
    );

    const task = screen.getByRole('textbox', { name: /group task/i });
    expect(task).toHaveAttribute('name', 'agentGroupTask');
    expect(task).toHaveAttribute('autocomplete', 'off');

    expect(screen.getByRole('button', { name: /duplicate/i }).className).toContain('focus-visible:ring-2');
    expect(screen.getByRole('button', { name: /edit/i }).className).toContain('focus-visible:ring-2');
    expect(screen.getByRole('button', { name: 'Run' }).className).toContain('focus-visible:ring-2');
  });
});
