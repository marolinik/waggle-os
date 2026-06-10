/**
 * Phase 3C (S19) — Skill Builder: kebab-name gating, ordered steps editing,
 * the exact create payload (C13 create-to-local), the C14 inputs/outputs
 * body-markdown append (including the honest partial-failure path), the Hub
 * wiring (create → refresh → editor drawer opens), and the overlay a11y
 * contract.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';

const mocks = vi.hoisted(() => ({
  adapter: {
    connect: vi.fn().mockResolvedValue(undefined),
    getSkills: vi.fn(),
    getStarterPacks: vi.fn(),
    getMarketplacePacks: vi.fn(),
    getCapabilityPacks: vi.fn(),
    testSkill: vi.fn(),
    installSkill: vi.fn(),
    installMarketplacePack: vi.fn(),
    createSkill: vi.fn(),
    updateSkill: vi.fn(),
    fetch: vi.fn(),
  },
}));
vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));

import CapabilitiesApp from '@/components/os/apps/CapabilitiesApp';
import SkillBuilder, { appendIoSections } from '@/components/os/apps/skills/SkillBuilder';
import { ServiceProvider } from '@/providers/ServiceProvider';

const renderBuilder = (over: Partial<Parameters<typeof SkillBuilder>[0]> = {}) => {
  const props = {
    onCreated: vi.fn(),
    onCancel: vi.fn(),
    onTierError: vi.fn().mockReturnValue(false),
    ...over,
  };
  render(<SkillBuilder {...props} />);
  return props;
};

const fillIdentity = (name = 'weekly-report') => {
  fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: name } });
  fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Weekly digest' } });
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.adapter.connect.mockResolvedValue(undefined);
  mocks.adapter.getSkills.mockResolvedValue([]);
  mocks.adapter.getStarterPacks.mockResolvedValue([]);
  mocks.adapter.getMarketplacePacks.mockResolvedValue([]);
  mocks.adapter.getCapabilityPacks.mockResolvedValue([]);
});
afterEach(cleanup);

describe('SkillBuilder — S19', () => {
  it('gates Identity on a kebab-case name + description, with an inline error', () => {
    renderBuilder();
    const next = screen.getByTestId('skill-builder-next');
    expect(next).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'My Skill!' } });
    expect(screen.getByTestId('skill-builder-name-error')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Weekly digest' } });
    expect(next).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'weekly-report' } });
    expect(screen.queryByTestId('skill-builder-name-error')).not.toBeInTheDocument();
    expect(next).not.toBeDisabled();
  });

  it('gates Content on at least one step; reordering steps reorders the payload', async () => {
    const props = renderBuilder();
    fillIdentity();
    fireEvent.click(screen.getByTestId('skill-builder-next')); // → Content
    expect(screen.getByTestId('skill-builder-next')).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Step 1'), { target: { value: 'Draft the report' } });
    fireEvent.click(screen.getByTestId('skill-builder-add-step'));
    fireEvent.change(screen.getByLabelText('Step 2'), { target: { value: 'Gather activity' } });
    // Reorder: move step 2 up so "Gather activity" runs first.
    fireEvent.click(screen.getByRole('button', { name: 'Move step 2 up' }));

    fireEvent.click(screen.getByTestId('skill-builder-next')); // → Scope
    fireEvent.click(screen.getByTestId('skill-builder-next')); // → Review
    mocks.adapter.createSkill.mockResolvedValue(undefined);
    fireEvent.click(screen.getByTestId('skill-builder-finish'));

    await waitFor(() => expect(props.onCreated).toHaveBeenCalledWith('weekly-report'));
    expect(mocks.adapter.createSkill).toHaveBeenCalledWith({
      name: 'weekly-report',
      description: 'Weekly digest',
      steps: ['Gather activity', 'Draft the report'],
      category: 'writing',
    });
    // No inputs/outputs → no body rewrite round-trip.
    expect(mocks.adapter.fetch).not.toHaveBeenCalled();
    expect(mocks.adapter.updateSkill).not.toHaveBeenCalled();
  });

  it('C14: inputs/outputs append to the created body as ## Inputs / ## Outputs via updateSkill', async () => {
    const props = renderBuilder();
    fillIdentity();
    fireEvent.click(screen.getByTestId('skill-builder-next'));
    fireEvent.change(screen.getByLabelText('Step 1'), { target: { value: 'Draft the report' } });
    fireEvent.change(screen.getByLabelText(/^Inputs/), { target: { value: 'topic — what to cover\naudience' } });
    fireEvent.change(screen.getByLabelText(/^Outputs/), { target: { value: 'a one-page summary' } });
    fireEvent.click(screen.getByTestId('skill-builder-next'));
    fireEvent.click(screen.getByTestId('skill-builder-next'));

    mocks.adapter.createSkill.mockResolvedValue(undefined);
    mocks.adapter.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: '---\nname: weekly-report\n---\n\n# weekly-report\n\nBody\n' }),
    });
    mocks.adapter.updateSkill.mockResolvedValue(undefined);
    fireEvent.click(screen.getByTestId('skill-builder-finish'));

    await waitFor(() => expect(props.onCreated).toHaveBeenCalledWith('weekly-report'));
    expect(mocks.adapter.fetch).toHaveBeenCalledWith('/api/skills/weekly-report');
    const [savedName, savedContent] = mocks.adapter.updateSkill.mock.calls[0] as [string, string];
    expect(savedName).toBe('weekly-report');
    expect(savedContent).toContain('## Inputs');
    expect(savedContent).toContain('- topic — what to cover');
    expect(savedContent).toContain('- audience');
    expect(savedContent).toContain('## Outputs');
    expect(savedContent).toContain('- a one-page summary');
  });

  it('C14 partial failure is honest: skill exists, warning renders, Done still hands the name back', async () => {
    const props = renderBuilder();
    fillIdentity();
    fireEvent.click(screen.getByTestId('skill-builder-next'));
    fireEvent.change(screen.getByLabelText('Step 1'), { target: { value: 'Draft the report' } });
    fireEvent.change(screen.getByLabelText(/^Inputs/), { target: { value: 'topic' } });
    fireEvent.click(screen.getByTestId('skill-builder-next'));
    fireEvent.click(screen.getByTestId('skill-builder-next'));

    mocks.adapter.createSkill.mockResolvedValue(undefined);
    mocks.adapter.fetch.mockRejectedValue(new Error('boom'));
    fireEvent.click(screen.getByTestId('skill-builder-finish'));

    const warning = await screen.findByTestId('skill-builder-warning');
    expect(warning).toHaveTextContent('was created, but the Inputs/Outputs sections could not be written');
    expect(props.onCreated).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(props.onCreated).toHaveBeenCalledWith('weekly-report');
  });

  it('post-warning the wizard is frozen: navigation is inert and Done hands back the CREATED name, not the live field', async () => {
    const props = renderBuilder();
    fillIdentity();
    fireEvent.click(screen.getByTestId('skill-builder-next'));
    fireEvent.change(screen.getByLabelText('Step 1'), { target: { value: 'Draft the report' } });
    fireEvent.change(screen.getByLabelText(/^Inputs/), { target: { value: 'topic' } });
    fireEvent.click(screen.getByTestId('skill-builder-next'));
    fireEvent.click(screen.getByTestId('skill-builder-next'));

    mocks.adapter.createSkill.mockResolvedValue(undefined);
    mocks.adapter.fetch.mockRejectedValue(new Error('boom'));
    fireEvent.click(screen.getByTestId('skill-builder-finish'));
    await screen.findByTestId('skill-builder-warning');

    // Back / step-pill navigation is frozen — the review (+ warning) stays up.
    fireEvent.click(screen.getByTestId('skill-builder-back'));
    fireEvent.click(screen.getByTestId('skill-builder-step-identity'));
    expect(screen.getByTestId('skill-builder-warning')).toBeInTheDocument();

    // Even if the name state could drift, Done returns the name the skill
    // was actually created under.
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(props.onCreated).toHaveBeenCalledWith('weekly-report');
  });

  it('blocks creating over an existing skill name (silent-overwrite guard)', async () => {
    mocks.adapter.getSkills.mockResolvedValue([{ id: 'code-review', name: 'code-review', installed: true }]);
    renderBuilder();
    fillIdentity('code-review');

    const taken = await screen.findByTestId('skill-builder-name-taken');
    expect(taken).toHaveTextContent('already exists');
    expect(screen.getByTestId('skill-builder-next')).toBeDisabled();

    // A fresh name clears the guard.
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'code-review-v2' } });
    expect(screen.queryByTestId('skill-builder-name-taken')).not.toBeInTheDocument();
    expect(screen.getByTestId('skill-builder-next')).not.toBeDisabled();
  });

  it('routes a 403 through onTierError instead of rendering it as a plain error', async () => {
    const props = renderBuilder({ onTierError: vi.fn().mockReturnValue(true) });
    fillIdentity();
    fireEvent.click(screen.getByTestId('skill-builder-next'));
    fireEvent.change(screen.getByLabelText('Step 1'), { target: { value: 'Draft' } });
    fireEvent.click(screen.getByTestId('skill-builder-next'));
    fireEvent.click(screen.getByTestId('skill-builder-next'));

    mocks.adapter.createSkill.mockRejectedValue(Object.assign(new Error('tier_insufficient'), { status: 403 }));
    fireEvent.click(screen.getByTestId('skill-builder-finish'));

    await waitFor(() => expect(props.onTierError).toHaveBeenCalledWith(expect.any(Error), 'weekly-report'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(props.onCreated).not.toHaveBeenCalled();
  });

  it('Hub wiring: Create Skill opens the builder; created skill refreshes the Hub and opens the editor drawer', async () => {
    mocks.adapter.createSkill.mockResolvedValue(undefined);
    // SkillEditorDrawer loads the body of the freshly created skill.
    mocks.adapter.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: '# weekly-report' }),
    });
    render(
      <ServiceProvider><TooltipProvider><CapabilitiesApp /></TooltipProvider></ServiceProvider>,
    );
    fireEvent.click(await screen.findByTestId('skills-hub-create'));
    await screen.findByTestId('skill-builder');

    fillIdentity();
    fireEvent.click(screen.getByTestId('skill-builder-next'));
    fireEvent.change(screen.getByLabelText('Step 1'), { target: { value: 'Draft the report' } });
    fireEvent.click(screen.getByTestId('skill-builder-next'));
    fireEvent.click(screen.getByTestId('skill-builder-next'));
    fireEvent.click(screen.getByTestId('skill-builder-finish'));

    // Builder closes, catalogs reload, the editor drawer opens on the new skill.
    await waitFor(() => expect(screen.queryByTestId('skill-builder')).not.toBeInTheDocument());
    expect(mocks.adapter.getSkills.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(await screen.findByLabelText('Skill markdown content')).toBeInTheDocument();
  });

  it('a11y: mounts as a focus-trapped dialog with aria-current step, Escape cancels', () => {
    const props = renderBuilder();
    const dialog = screen.getByRole('dialog', { name: 'Skill Builder' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(screen.getByTestId('skill-builder-step-identity')).toHaveAttribute('aria-current', 'step');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('appendIoSections (C14)', () => {
  it('appends only the declared sections and preserves the body', () => {
    const out = appendIoSections('# skill\n\nBody\n', ['a', 'b'], []);
    expect(out).toContain('# skill');
    expect(out).toContain('## Inputs\n\n- a\n- b');
    expect(out).not.toContain('## Outputs');
  });
});
