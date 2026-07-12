import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  adapter: {
    listComplianceTemplates: vi.fn(),
    deleteComplianceTemplate: vi.fn(),
    updateComplianceTemplate: vi.fn(),
    createComplianceTemplate: vi.fn(),
  },
}));

vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));

import { ComplianceTemplateModal, type ComplianceTemplate } from '@/components/os/apps/cockpit/ComplianceTemplateModal';

const template: ComplianceTemplate = {
  id: 7,
  name: 'High Risk Template',
  description: 'EU AI Act evidence packet',
  sections: {
    interactions: true,
    oversight: true,
    models: true,
    provenance: true,
    riskAssessment: true,
    fria: true,
  },
  riskClassification: 'high-risk',
  orgName: 'Egzakta',
  footerText: null,
  createdAt: '2026-07-08T08:00:00.000Z',
  updatedAt: '2026-07-08T09:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.adapter.listComplianceTemplates.mockResolvedValue({ templates: [template] });
  mocks.adapter.deleteComplianceTemplate.mockResolvedValue({ ok: true });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ComplianceTemplateModal trust flows', () => {
  it('exposes template form fields with stable metadata and focus rings', async () => {
    render(<ComplianceTemplateModal open onClose={vi.fn()} />);
    await screen.findByText('High Risk Template');

    fireEvent.click(screen.getByRole('button', { name: /new template/i }));

    const name = screen.getByRole('textbox', { name: /^name$/i });
    expect(name).toHaveAttribute('name', 'complianceTemplateName');
    expect(name).toHaveAttribute('autocomplete', 'off');
    expect(name.className).toContain('focus-visible:ring-2');
    expect(name.className).toContain('focus-visible:ring-[var(--focus-ring)]');

    const description = screen.getByRole('textbox', { name: /description/i });
    expect(description).toHaveAttribute('name', 'complianceTemplateDescription');
    expect(description).toHaveAttribute('autocomplete', 'off');
    expect(description.className).toContain('focus-visible:ring-2');
    expect(description.className).toContain('focus-visible:ring-[var(--focus-ring)]');

    const riskClass = screen.getByRole('combobox', { name: /risk class/i });
    expect(riskClass).toHaveAttribute('name', 'complianceTemplateRiskClass');
    expect(riskClass).toHaveAttribute('autocomplete', 'off');
    expect(riskClass.className).toContain('focus-visible:ring-2');
    expect(riskClass.className).toContain('focus-visible:ring-[var(--focus-ring)]');

    const orgName = screen.getByRole('textbox', { name: /org name/i });
    expect(orgName).toHaveAttribute('name', 'complianceTemplateOrgName');
    expect(orgName).toHaveAttribute('autocomplete', 'organization');
    expect(orgName.className).toContain('focus-visible:ring-2');
    expect(orgName.className).toContain('focus-visible:ring-[var(--focus-ring)]');

    const footerText = screen.getByRole('textbox', { name: /footer text/i });
    expect(footerText).toHaveAttribute('name', 'complianceTemplateFooterText');
    expect(footerText).toHaveAttribute('autocomplete', 'off');
    expect(footerText.className).toContain('focus-visible:ring-2');
    expect(footerText.className).toContain('focus-visible:ring-[var(--focus-ring)]');
  });

  it('asks in-app before deleting a compliance template', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onChange = vi.fn();

    render(<ComplianceTemplateModal open onClose={vi.fn()} onChange={onChange} />);
    await screen.findByText('High Risk Template');

    fireEvent.click(screen.getByRole('button', { name: /delete high risk template/i }));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(mocks.adapter.deleteComplianceTemplate).not.toHaveBeenCalled();
    const modal = await screen.findByTestId('approval-modal');
    expect(modal).toHaveTextContent(/delete compliance template/i);
    expect(modal).toHaveTextContent(/high risk template/i);
    expect(modal).toHaveTextContent(/saved report shape/i);

    fireEvent.click(screen.getByTestId('approval-modal-approve'));

    await waitFor(() => expect(mocks.adapter.deleteComplianceTemplate).toHaveBeenCalledWith(7));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
