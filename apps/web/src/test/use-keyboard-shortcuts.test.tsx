import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

const options = () => ({
  onOpenApp: vi.fn(),
  onToggleGlobalSearch: vi.fn(),
  onTogglePersonaSwitcher: vi.fn(),
  onToggleWorkspaceSwitcher: vi.fn(),
  onToggleKeyboardHelp: vi.fn(),
  onNewChatWindow: vi.fn(),
});

function Harness({ callbacks }: { callbacks: ReturnType<typeof options> }) {
  useKeyboardShortcuts(callbacks);
  return <input aria-label="Quick capture" />;
}

afterEach(() => cleanup());

describe('useKeyboardShortcuts', () => {
  it('keeps Ctrl+Shift+N available when a text input is focused', () => {
    const callbacks = options();
    render(<Harness callbacks={callbacks} />);

    screen.getByRole('textbox', { name: 'Quick capture' }).focus();
    fireEvent.keyDown(window, { key: 'N', code: 'KeyN', ctrlKey: true, shiftKey: true });

    expect(callbacks.onNewChatWindow).toHaveBeenCalledTimes(1);
  });

  // Pillar 2.7 — "open last workspace" ≤2-keystroke power path.
  it('opens the last/active workspace desktop on Ctrl+Shift+O, even from an input', () => {
    const callbacks = options();
    render(<Harness callbacks={callbacks} />);

    // Global (survives input focus) like new-chat.
    screen.getByRole('textbox', { name: 'Quick capture' }).focus();
    fireEvent.keyDown(window, { key: 'O', code: 'KeyO', ctrlKey: true, shiftKey: true });

    expect(callbacks.onOpenApp).toHaveBeenCalledTimes(1);
    expect(callbacks.onOpenApp).toHaveBeenCalledWith('workspace-desktop');
  });

  // Pillar 2.7 — the conventional "press ? for help" discoverability path.
  it('opens the shortcut cheat sheet on a bare "?" when no input is focused', () => {
    const callbacks = options();
    render(<Harness callbacks={callbacks} />);

    fireEvent.keyDown(window, { key: '?' });

    expect(callbacks.onToggleKeyboardHelp).toHaveBeenCalledTimes(1);
  });

  it('never hijacks a literal "?" typed into an input', () => {
    const callbacks = options();
    render(<Harness callbacks={callbacks} />);

    screen.getByRole('textbox', { name: 'Quick capture' }).focus();
    fireEvent.keyDown(window, { key: '?' });

    expect(callbacks.onToggleKeyboardHelp).not.toHaveBeenCalled();
  });
});
