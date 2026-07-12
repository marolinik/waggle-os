import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WorkspaceCreateStep from './WorkspaceCreateStep';

afterEach(() => cleanup());

describe('WorkspaceCreateStep', () => {
  it('a11y: workspace name exposes stable form metadata', () => {
    render(
      <WorkspaceCreateStep
        workspaceType="project"
        workspaceName="Launch"
        onSelectType={vi.fn()}
        onNameChange={vi.fn()}
        onCreate={vi.fn()}
        onBack={vi.fn()}
        creating={false}
        createError={null}
      />,
    );

    const name = screen.getByRole('textbox', { name: /workspace name/i });
    expect(name).toHaveAttribute('name', 'onboardingWorkspaceName');
    expect(name).toHaveAttribute('autocomplete', 'off');
  });
});
