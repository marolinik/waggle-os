import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ToolOutputPane } from './ToolOutputPane';
import { adapter } from '@/lib/adapter';

describe('ToolOutputPane', () => {
  it('renders streamed lines and the exit chip', () => {
    let onLine!: (l: string) => void;
    let onExit!: (c: number | null) => void;
    vi.spyOn(adapter, 'streamToolOutput').mockImplementation((_pid, h) => {
      onLine = h.onLine;
      onExit = h.onExit;
      return () => {};
    });
    render(<ToolOutputPane pid={5} toolId="claude-code" observed />);
    act(() => {
      onLine('building...');
      onLine('done');
      onExit(0);
    });
    expect(screen.getByText('building...')).toBeInTheDocument();
    expect(screen.getByText('done')).toBeInTheDocument();
    expect(screen.getByText(/exit 0/i)).toBeInTheDocument();
  });

  it('shows the detached-launch hint when not observed (no stream opened)', () => {
    const spy = vi.spyOn(adapter, 'streamToolOutput');
    render(<ToolOutputPane pid={6} toolId="cursor" observed={false} />);
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByText(/Watch a coding agent live/i)).toBeInTheDocument();
  });
});
