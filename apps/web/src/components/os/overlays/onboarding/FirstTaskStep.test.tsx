/** PR5 Phase C2 — the terminal First-task step (seed the first message, open the workspace). */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import FirstTaskStep from './FirstTaskStep';

const base = {
  message: 'Do a thing',
  onMessageChange: vi.fn(),
  suggestions: ['Suggestion A', 'Suggestion B'],
  onPickSuggestion: vi.fn(),
  onLetsGo: vi.fn(),
  createError: null,
};

afterEach(() => cleanup());

describe('FirstTaskStep', () => {
  it('shows the seeded first message and edits it', () => {
    const onMessageChange = vi.fn();
    render(<FirstTaskStep {...base} onMessageChange={onMessageChange} />);
    const ta = screen.getByLabelText(/first task/i);
    expect(ta).toHaveValue('Do a thing');
    expect(ta).toHaveAttribute('name', 'onboardingFirstTask');
    expect(ta).toHaveAttribute('autocomplete', 'off');
    fireEvent.change(ta, { target: { value: 'New task' } });
    expect(onMessageChange).toHaveBeenCalledWith('New task');
  });

  it('picks a suggested prompt', () => {
    const onPickSuggestion = vi.fn();
    render(<FirstTaskStep {...base} onPickSuggestion={onPickSuggestion} />);
    const suggestion = screen.getByRole('button', { name: /suggestion a/i });
    expect(suggestion).toHaveClass('text-foreground/80');
    fireEvent.click(suggestion);
    expect(onPickSuggestion).toHaveBeenCalledWith('Suggestion A');
  });

  it('opens the workspace on "Let\'s go"', () => {
    const onLetsGo = vi.fn();
    render(<FirstTaskStep {...base} onLetsGo={onLetsGo} />);
    fireEvent.click(screen.getByRole('button', { name: /let's go/i }));
    expect(onLetsGo).toHaveBeenCalledTimes(1);
  });
});
