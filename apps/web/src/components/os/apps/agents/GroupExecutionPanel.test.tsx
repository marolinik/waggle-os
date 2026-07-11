import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GroupExecutionPanel from './GroupExecutionPanel';
import type { BackendPersona, GroupExecState } from './types';

vi.mock('@/lib/personas', () => ({ PERSONAS: [] }));

afterEach(cleanup);

describe('GroupExecutionPanel', () => {
  it('opens the canonical Room while the legacy group job is still queued', () => {
    const exec: GroupExecState = {
      jobId: 'job-1',
      roomId: 'room/alpha beta',
      status: 'queued',
      task: 'Compare both implementations',
      startedAt: Date.now(),
      members: [{ agentId: 'coder', status: 'pending' }],
    };
    const agents: BackendPersona[] = [{
      id: 'coder',
      name: 'Coder',
      description: 'Implements the task',
    }];

    render(
      <GroupExecutionPanel
        exec={exec}
        agents={agents}
        strategy="parallel"
        onDismiss={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole('link', { name: 'Open Room' })).toHaveAttribute(
      'href',
      '/room?room=room%2Falpha%20beta',
    );
    expect(screen.getByText('Compare both implementations')).toBeInTheDocument();
    expect(screen.getByText('Coder')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });
});
