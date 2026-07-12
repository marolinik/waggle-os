import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import AgentCard from './AgentCard';

describe('AgentCard action names', () => {
  it('names custom-agent delete without selecting the card', () => {
    const onSelect = vi.fn();
    const onDelete = vi.fn();

    const { container } = render(
      <AgentCard
        agent={{
          id: 'custom-1',
          name: 'Custom Analyst',
          description: 'A tailored agent',
          icon: 'C',
          custom: true,
        }}
        selected={false}
        onSelect={onSelect}
        onDelete={onDelete}
      />,
    );

    expect(container.querySelector('[role="button"] button')).toBeNull();

    const select = screen.getByRole('button', { name: /select agent "custom analyst"/i });
    expect(select).toHaveAttribute('aria-pressed', 'false');
    expect(select.className).toContain('focus-visible:ring-2');
    expect(select.className).not.toContain('transition-all');

    const deleteButton = screen.getByRole('button', { name: /delete custom analyst/i });
    expect(deleteButton.className).toContain('focus-visible:ring-2');
    expect(deleteButton.className).not.toContain('transition-all');

    fireEvent.click(deleteButton);

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
