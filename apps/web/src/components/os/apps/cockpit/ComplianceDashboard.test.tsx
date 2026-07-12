import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';

const mocks = vi.hoisted(() => ({
  adapter: {
    listComplianceTemplates: vi.fn(),
    getComplianceStatus: vi.fn(),
    getHarvestSources: vi.fn(),
    exportComplianceReport: vi.fn(),
    exportComplianceReportPdf: vi.fn(),
  },
}));

vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));

import ComplianceDashboard from './ComplianceDashboard';

beforeEach(() => {
  mocks.adapter.listComplianceTemplates.mockResolvedValue({ templates: [] });
  mocks.adapter.getHarvestSources.mockResolvedValue({ sources: [] });
  mocks.adapter.getComplianceStatus.mockResolvedValue({
    overall: 'compliant',
    art12Logging: { status: 'compliant', detail: 'ok', totalInteractions: 1 },
    art14Oversight: { status: 'compliant', detail: 'ok', humanActions: 1, approvalRate: 1 },
    art19Retention: { status: 'compliant', detail: 'ok', oldestLogDate: null, retentionDays: 30 },
    art26Monitoring: { status: 'compliant', detail: 'ok', activeMonitors: [] },
    art50Transparency: { status: 'compliant', detail: 'ok', modelsDisclosed: true },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ComplianceDashboard action names', () => {
  it('exposes report option fields with stable metadata and focus rings', async () => {
    render(
      <TooltipProvider>
        <ComplianceDashboard />
      </TooltipProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /show report options/i }));

    const template = screen.getByRole('combobox', { name: /template/i });
    expect(template).toHaveAttribute('name', 'complianceReportTemplateId');
    expect(template).toHaveAttribute('autocomplete', 'off');
    expect(template.className).toContain('focus-visible:ring-2');
    expect(template.className).toContain('focus-visible:ring-[var(--focus-ring)]');

    const from = screen.getByLabelText(/^from$/i);
    expect(from).toHaveAttribute('name', 'complianceReportFromDate');
    expect(from).toHaveAttribute('autocomplete', 'off');
    expect(from.className).toContain('focus-visible:ring-2');
    expect(from.className).toContain('focus-visible:ring-[var(--focus-ring)]');

    const to = screen.getByLabelText(/^to$/i);
    expect(to).toHaveAttribute('name', 'complianceReportToDate');
    expect(to).toHaveAttribute('autocomplete', 'off');
    expect(to.className).toContain('focus-visible:ring-2');
    expect(to.className).toContain('focus-visible:ring-[var(--focus-ring)]');
  });

  it('uses a sequential heading and names report actions', async () => {
    render(
      <TooltipProvider>
        <ComplianceDashboard />
      </TooltipProvider>,
    );

    expect(await screen.findByRole('button', { name: /refresh compliance status/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: /eu ai act compliance/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /show report options/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download compliance json report/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download compliance pdf report/i })).toBeInTheDocument();
  });
});
