/**
 * PR3.5 Phase A — Memory Trust (screen 19) host shell.
 *
 * Pins the segmented-control contract: two views behind one switch, each with
 * its own editorial hero + trust-principle footnote. The Manage body embeds the
 * per-mind list (stubbed here — Phase C replaces it with the native rows); the
 * Why body shows an honest empty state until Phase D wires the real trace.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';

// Stub the embedded list — this test pins the Trust SHELL, not list internals.
vi.mock('@/components/os/apps/memory/MemoryCenterTab', () => ({
  default: (props: { mind?: string; workspaceId?: string }) => (
    <div data-testid="stub-mc-tab" data-mind={String(props.mind)} data-ws={String(props.workspaceId)} />
  ),
}));

import MemoryTrust from '@/components/os/apps/MemoryTrust';

afterEach(cleanup);

describe('MemoryTrust shell (PR3.5 Phase A)', () => {
  it('defaults to the Manage view: hero + segmented control + per-mind list + principle', () => {
    render(<MemoryTrust mind="personal" />);
    expect(screen.getByText('Manage memory')).toBeTruthy();
    expect(screen.getByText('Why did you do that?')).toBeTruthy();
    expect(screen.getByText(/Memory you can/)).toBeTruthy();
    expect(screen.getByText(/correct, age, and forget\./)).toBeTruthy();
    expect(screen.getByTestId('stub-mc-tab').getAttribute('data-mind')).toBe('personal');
    expect(screen.getByText(/Nothing is remembered behind your back\./)).toBeTruthy();
  });

  it('passes the workspace mind through to the embedded list', () => {
    render(<MemoryTrust mind="workspace" workspaceId="w1" />);
    const tab = screen.getByTestId('stub-mc-tab');
    expect(tab.getAttribute('data-mind')).toBe('workspace');
    expect(tab.getAttribute('data-ws')).toBe('w1');
  });

  it('toggles to the Why view: trace hero + honest empty state + its principle', () => {
    render(<MemoryTrust mind="personal" />);
    fireEvent.click(screen.getByText('Why did you do that?'));
    // Why hero + empty state (no synthesized reason) + Why-specific principle.
    // (Match the hero by its unique opener — "why did you do that?" also appears
    // on the segmented button.)
    expect(screen.getByText(/Ask the agent/i)).toBeTruthy();
    expect(screen.getByText(/to see why Waggle acted/i)).toBeTruthy();
    expect(screen.getByText(/Every agent action keeps its trace\./)).toBeTruthy();
    // The Manage list is unmounted on the Why view.
    expect(screen.queryByTestId('stub-mc-tab')).toBeNull();
  });
});
