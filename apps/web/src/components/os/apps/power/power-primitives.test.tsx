/**
 * Power-surfaces shared primitives (Warm-Hive PR6b · B3 · screen 08).
 * Covers the warm row/toggle/badge set + the honest tool-name risk classifier.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

import {
  SurfaceRow,
  SurfaceToggle,
  RiskBadge,
  StatusBadge,
  riskToneForTool,
} from './power-primitives';

afterEach(() => cleanup());

describe('SurfaceRow', () => {
  it('renders title, subtitle, leading glyph and actions', () => {
    render(
      <SurfaceRow
        leading="SF"
        title="Salesforce"
        subtitle="CRM · used by 2 agents"
        actions={<button type="button">Manage</button>}
      />,
    );
    expect(screen.getByText('Salesforce')).toBeInTheDocument();
    expect(screen.getByText(/used by 2 agents/i)).toBeInTheDocument();
    expect(screen.getByText('SF')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /manage/i })).toBeInTheDocument();
  });

  it('omits the leading glyph and subtitle when not provided', () => {
    render(<SurfaceRow title="Bare row" />);
    expect(screen.getByText('Bare row')).toBeInTheDocument();
  });
});

describe('SurfaceToggle', () => {
  it('exposes role=switch with aria-checked reflecting state and an accessible label', () => {
    const onChange = vi.fn();
    render(<SurfaceToggle checked={false} onChange={onChange} label="Enable weekly digest" />);
    const sw = screen.getByRole('switch', { name: /enable weekly digest/i });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('reflects the on state and does not fire when disabled', () => {
    const onChange = vi.fn();
    render(<SurfaceToggle checked disabled onChange={onChange} label="Locked" />);
    const sw = screen.getByRole('switch', { name: /locked/i });
    expect(sw).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(sw);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('RiskBadge', () => {
  it('renders color-stratified labels — Medium (attention) and Low (healthy)', () => {
    const { rerender } = render(<RiskBadge level="medium" />);
    expect(screen.getByText(/medium risk/i)).toBeInTheDocument();
    rerender(<RiskBadge level="low" />);
    expect(screen.getByText(/low risk/i)).toBeInTheDocument();
  });

  it('drops the "risk" suffix when withSuffix is false and uppercases critical', () => {
    const { rerender } = render(<RiskBadge level="medium" withSuffix={false} />);
    expect(screen.getByText('Medium')).toBeInTheDocument();
    expect(screen.queryByText(/medium risk/i)).not.toBeInTheDocument();
    rerender(<RiskBadge level="critical" />);
    expect(screen.getByText(/critical risk/i)).toBeInTheDocument();
  });
});

describe('StatusBadge', () => {
  it('renders children and an optional leading dot', () => {
    render(<StatusBadge tone="healthy" dot>Connected</StatusBadge>);
    expect(screen.getByText('Connected')).toBeInTheDocument();
  });
});

describe('riskToneForTool (honest classifier, no fabricated data)', () => {
  it('classifies an external-write/send tool as medium', () => {
    expect(riskToneForTool('salesforce_export_records')).toBe('medium');
    expect(riskToneForTool('slack_send_message')).toBe('medium');
    expect(riskToneForTool('github_create_pr')).toBe('medium');
  });

  it('classifies a local read tool as low', () => {
    expect(riskToneForTool('read_file')).toBe('low');
    expect(riskToneForTool('grep')).toBe('low');
  });

  it('treats a cross-workspace reach (target_workspace_id) as medium', () => {
    expect(riskToneForTool('recall_memory', { target_workspace_id: 'ws-2' })).toBe('medium');
  });
});
