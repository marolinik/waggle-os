/**
 * UserProfileApp — PR6b §16 / D20: the read-only "What Waggle knows about you"
 * facts section. The contract under test is the no-fabrication gate: facts are
 * derived ONLY from stored profile values that actually exist; an empty profile
 * renders zero facts (and the section is hidden), never an invented one.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, within } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  adapter: {
    getProfile: vi.fn(),
    updateProfile: vi.fn(),
    analyzeWritingStyle: vi.fn(),
    analyzeBrand: vi.fn(),
    researchProfile: vi.fn(),
  },
}));
vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));

import UserProfileApp from './UserProfileApp';

beforeEach(() => {
  mocks.adapter.updateProfile.mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('UserProfileApp — What Waggle knows (D20)', () => {
  it('renders read-only facts derived from the stored profile values', async () => {
    mocks.adapter.getProfile.mockResolvedValue({
      name: 'Mara Kovač',
      role: 'Strategy Consultant',
      company: 'Egzakta',
      industry: 'Consulting',
      interests: ['Strategy', 'Finance'],
    });
    render(<UserProfileApp />);

    const section = await screen.findByRole('region', { name: /what waggle knows about you/i });
    expect(section).toBeInTheDocument();
    // Each stored value surfaces as a fact — scoped to the facts section so it
    // doesn't collide with the same string in a <select> option or input.
    const inSection = within(section);
    expect(inSection.getByText('Mara Kovač')).toBeInTheDocument();
    expect(inSection.getByText('Strategy Consultant')).toBeInTheDocument();
    expect(inSection.getByText('Egzakta')).toBeInTheDocument();
    expect(inSection.getByText('Consulting')).toBeInTheDocument();
    // Interests fold into one line.
    expect(inSection.getByText('Strategy, Finance')).toBeInTheDocument();
    // 5 facts (name/role/company/industry + interests), no bio.
    expect(inSection.getAllByTestId('known-fact')).toHaveLength(5);
  });

  it('hides the facts section entirely for an empty profile (no fabrication)', async () => {
    mocks.adapter.getProfile.mockResolvedValue({});
    render(<UserProfileApp />);

    // Wait for load to settle (the Identity tab heading appears).
    await screen.findByText(/who are you\?/i);
    expect(screen.queryByRole('region', { name: /what waggle knows about you/i })).not.toBeInTheDocument();
    expect(screen.queryAllByTestId('known-fact')).toHaveLength(0);
  });

  it('renders only the facts that exist — a partial profile yields partial facts', async () => {
    mocks.adapter.getProfile.mockResolvedValue({ name: 'Solo User' });
    render(<UserProfileApp />);

    await waitFor(() => expect(screen.getByText('Solo User')).toBeInTheDocument());
    // Exactly one fact — name only.
    expect(screen.getAllByTestId('known-fact')).toHaveLength(1);
  });
});
