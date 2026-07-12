import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WhoAreYouStep from './WhoAreYouStep';
import type { OnboardingProfileFields } from './types';

const profile: OnboardingProfileFields = {
  name: 'Mara',
  role: 'Operations Lead',
  industry: 'Technology',
  workType: 'operations',
  teamSize: 'small',
  goals: ['remember'],
};

afterEach(() => cleanup());

describe('WhoAreYouStep', () => {
  it('a11y: identity fields expose stable form metadata', () => {
    render(
      <WhoAreYouStep
        profile={profile}
        onChange={vi.fn()}
        onContinue={vi.fn()}
        saving={false}
      />,
    );

    const name = screen.getByRole('textbox', { name: 'Name' });
    expect(name).toHaveAttribute('name', 'onboardingName');
    expect(name).toHaveAttribute('autocomplete', 'name');

    const role = screen.getByRole('textbox', { name: 'Role' });
    expect(role).toHaveAttribute('name', 'onboardingRole');
    expect(role).toHaveAttribute('autocomplete', 'organization-title');
  });

  it('keeps unselected profile chips readable instead of looking disabled', () => {
    render(
      <WhoAreYouStep
        profile={{ ...profile, workType: '', teamSize: '', goals: [] }}
        onChange={vi.fn()}
        onContinue={vi.fn()}
        saving={false}
      />,
    );

    for (const name of ['Engineering', 'Just me', 'Remember everything I work on']) {
      const chip = screen.getByRole('button', { name });
      expect(chip).toHaveClass('text-[var(--text-tertiary)]');
      expect(chip).toHaveClass('border-[var(--line-affordance)]');
    }
  });
});
