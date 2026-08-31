import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ImportStep from '@/components/os/overlays/onboarding/ImportStep';
import type { ImportStepProps } from '@/components/os/overlays/onboarding/types';

const baseProps = (overrides: Partial<ImportStepProps> = {}): ImportStepProps => ({
  importSource: null,
  importItems: [],
  importDone: false,
  importing: false,
  importError: null,
  onFileImport: vi.fn(),
  onImportCommit: vi.fn(),
  onContinue: vi.fn(),
  ...overrides,
});

afterEach(cleanup);

describe('Onboarding ImportStep', () => {
  it('makes high-volume Claude Code history a deliberate review flow', () => {
    const onContinue = vi.fn();
    const onClaudeCodeHarvest = vi.fn();

    render(
      <ImportStep
        {...baseProps({
          claudeCodeDetected: {
            found: true,
            itemCount: 5514,
            path: 'C:/Users/Marko/.claude/projects',
          },
          onClaudeCodeHarvest,
          onContinue,
        })}
      />,
    );

    expect(screen.getByText(/5,514 items from Claude Code/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /import my history/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /review after setup/i }));
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onClaudeCodeHarvest).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /import 5,514 now/i }));
    expect(onClaudeCodeHarvest).toHaveBeenCalledTimes(1);
  });

  it('keeps the simple import CTA for small detected histories', () => {
    const onClaudeCodeHarvest = vi.fn();

    render(
      <ImportStep
        {...baseProps({
          claudeCodeDetected: {
            found: true,
            itemCount: 12,
            path: 'C:/Users/Marko/.claude/projects',
          },
          onClaudeCodeHarvest,
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /import my history/i }));
    expect(onClaudeCodeHarvest).toHaveBeenCalledTimes(1);
  });

  it('announces a recoverable import error without removing retry or skip actions', () => {
    render(
      <ImportStep
        {...baseProps({
          importSource: 'chatgpt',
          importItems: [{ id: 'memory-1', title: 'Decision', kind: 'fact', confidence: 0.9 }],
          importError: "Couldn't confirm the import. It is safe to try again, or skip and review Memory later.",
        })}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/couldn't confirm the import/i);
    expect(screen.getByRole('button', { name: /import 1 item/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /skip this step/i })).toBeEnabled();
  });

  it('locks file selection, import, and skip while work is pending', () => {
    const first = render(
      <ImportStep
        {...baseProps({
          importSource: 'chatgpt',
          importItems: [{ id: 'memory-1', title: 'Decision', kind: 'fact', confidence: 0.9 }],
          importing: true,
        })}
      />,
    );

    expect(screen.getByRole('button', { name: /import 1 item/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /skip this step/i })).toBeDisabled();
    first.unmount();

    render(<ImportStep {...baseProps({ importing: true })} />);
    for (const input of screen.getAllByLabelText(/Import .* export file/i)) {
      expect(input).toBeDisabled();
    }
    expect(screen.getByRole('button', { name: /skip this step/i })).toBeDisabled();
  });
});
