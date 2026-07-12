import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import GroupCard from './GroupCard';
import type { AgentGroup, BackendPersona } from './types';

const agents: BackendPersona[] = [
  { id: 'researcher', name: 'Researcher', description: 'Finds source material' },
  { id: 'writer', name: 'Writer', description: 'Drafts copy' },
];

const group: AgentGroup = {
  id: 'research-pack',
  name: 'Research Pack',
  strategy: 'parallel',
  members: [
    { agentId: 'researcher', roleInGroup: 'lead', executionOrder: 0 },
    { agentId: 'writer', roleInGroup: 'worker', executionOrder: 1 },
  ],
};

describe('GroupCard action names', () => {
  it('keeps selection and delete controls separate and labelled', () => {
    const onSelect = vi.fn();
    const onDelete = vi.fn();

    const { container } = render(
      <GroupCard
        group={group}
        agents={agents}
        selected={false}
        onSelect={onSelect}
        onDelete={onDelete}
      />,
    );

    expect(container.querySelector('button button')).toBeNull();

    const select = screen.getByRole('button', { name: /select group "research pack"/i });
    expect(select.className).toContain('focus-visible:ring-2');
    expect(select.className).not.toContain('transition-all');

    const deleteButton = screen.getByRole('button', { name: /delete group "research pack"/i });
    expect(deleteButton.className).toContain('focus-visible:ring-2');
    expect(deleteButton.className).not.toContain('transition-all');

    fireEvent.click(deleteButton);

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
