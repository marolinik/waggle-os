/**
 * ContextMenu (Pillar 2.7, Lane K) — the arrow-key roving highlight paints a
 * visible focus indicator using the systemic --focus-ring token, so keyboard
 * navigation reads the same as the app-wide :focus-visible ring.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import ContextMenu from '@/components/os/ContextMenu';

afterEach(() => cleanup());

describe('ContextMenu keyboard focus ring', () => {
  it('rings the keyboard-highlighted item with --focus-ring after ArrowDown', () => {
    render(
      <ContextMenu
        items={[{ label: 'Rename', onClick: vi.fn() }, { label: 'Delete', onClick: vi.fn() }]}
        position={{ x: 0, y: 0 }}
        onClose={vi.fn()}
      />,
    );
    // At rest nothing is roving-highlighted.
    expect(screen.getByText('Rename').className).not.toContain('ring-[var(--focus-ring)]');
    // ArrowDown moves the roving highlight onto the first action item.
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    expect(screen.getByText('Rename').className).toContain('ring-[var(--focus-ring)]');
  });
});
