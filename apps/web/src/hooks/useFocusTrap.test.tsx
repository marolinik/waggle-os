/**
 * useFocusTrap — WCAG 2.1.1 / 2.4.3 modal focus management.
 *
 * Drives the hook through a minimal dialog component and asserts the four
 * behaviors: focus-in on open, Escape callback, Tab/Shift+Tab cycling, and
 * focus restore on unmount.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { useFocusTrap } from './useFocusTrap';

afterEach(cleanup);

function Dialog({ onEscape }: { onEscape?: () => void }) {
  const ref = useFocusTrap<HTMLDivElement>(true, onEscape);
  return (
    <div ref={ref} role="dialog" aria-modal="true" tabIndex={-1} data-testid="dialog">
      <button data-testid="first">First</button>
      <button data-testid="middle">Middle</button>
      <button data-testid="last">Last</button>
    </div>
  );
}

describe('useFocusTrap', () => {
  it('moves focus into the dialog on open', () => {
    const { getByTestId } = render(<Dialog />);
    expect(document.activeElement).toBe(getByTestId('dialog'));
  });

  it('invokes onEscape when Escape is pressed', () => {
    const onEscape = vi.fn();
    const { getByTestId } = render(<Dialog onEscape={onEscape} />);
    fireEvent.keyDown(getByTestId('dialog'), { key: 'Escape' });
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('Tab from the last element wraps to the first (forward trap)', () => {
    const { getByTestId } = render(<Dialog />);
    getByTestId('last').focus();
    fireEvent.keyDown(getByTestId('dialog'), { key: 'Tab' });
    expect(document.activeElement).toBe(getByTestId('first'));
  });

  it('Shift+Tab from the first element wraps to the last (backward trap)', () => {
    const { getByTestId } = render(<Dialog />);
    getByTestId('first').focus();
    fireEvent.keyDown(getByTestId('dialog'), { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(getByTestId('last'));
  });

  it('restores focus to the previously-focused element on close', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    expect(document.activeElement).toBe(opener);

    const { unmount } = render(<Dialog />);
    unmount();

    expect(document.activeElement).toBe(opener);
    document.body.removeChild(opener);
  });
});
