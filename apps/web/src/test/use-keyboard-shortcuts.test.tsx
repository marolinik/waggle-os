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
});
