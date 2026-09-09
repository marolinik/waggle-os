import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

  it('announces a save failure with explicit retry and continue-without-personalization actions', () => {
    const onContinue = vi.fn();
    const onContinueWithoutPersonalization = vi.fn();
    render(
      <WhoAreYouStep
        profile={profile}
        onChange={vi.fn()}
        onContinue={onContinue}
        onContinueWithoutPersonalization={onContinueWithoutPersonalization}
        saving={false}
        saveError="We couldn't confirm your profile was saved."
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/couldn't confirm your profile was saved/i);
    fireEvent.click(screen.getByRole('button', { name: 'Retry saving profile' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue without personalization' }));
    expect(onContinue).toHaveBeenCalledOnce();
    expect(onContinueWithoutPersonalization).toHaveBeenCalledOnce();
  });

  it('freezes every editable profile control while persistence is pending', () => {
    const onChange = vi.fn();
    render(
      <WhoAreYouStep
        profile={profile}
        onChange={onChange}
        onContinue={vi.fn()}
        saving
      />,
    );

    expect(screen.getByRole('textbox', { name: 'Name' })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'Role' })).toBeDisabled();
    expect(screen.getByLabelText('Industry')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Engineering' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Just me' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remember everything I work on' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(onChange).not.toHaveBeenCalled();
  });
});
