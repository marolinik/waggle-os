/**
 * §D2 skill-audit: the "verified" badge renders on a skill row only when the
 * audit loop confirmed the skill, with confidence shown as a percentage. Skill
 * audit is a free (Solo) feature, so the badge's presence must track the
 * verified flag exactly (never shown on an unverified skill).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import SkillRow from '@/components/os/apps/skills/SkillRow';
import type { Skill } from '@/lib/types';

afterEach(cleanup);

const base: Skill = { name: 'deploy-helper', status: 'installed' };
const renderRow = (skill: Skill, props: Partial<{ onVerify: (s: Skill) => void; verifying: boolean }> = {}) =>
  render(<ul><SkillRow skill={skill} onTest={() => {}} onEdit={() => {}} {...props} /></ul>);

describe('SkillRow verified badge (§D2)', () => {
  it('shows "verified · NN%" when the skill is verified with confidence', () => {
    renderRow({ ...base, verified: true, confidence: 0.88 });
    expect(screen.getByText('verified · 88%')).toBeInTheDocument();
  });

  it('shows a bare "verified" badge when confidence is absent', () => {
    renderRow({ ...base, verified: true });
    expect(screen.getByText('verified')).toBeInTheDocument();
  });

  it('shows NO verified badge for an unverified skill', () => {
    renderRow({ ...base, verified: false, confidence: 0.2 });
    expect(screen.queryByText(/verified/)).toBeNull();
  });

  it('shows NO verified badge when the audit field is absent (legacy skill)', () => {
    renderRow(base);
    expect(screen.queryByText(/verified/)).toBeNull();
  });
});

describe('SkillRow Verify trigger (§D2)', () => {
  it('renders a Verify button and calls onVerify when provided', () => {
    const onVerify = vi.fn();
    renderRow(base, { onVerify });
    const btn = screen.getByLabelText(/Verify skill deploy-helper/);
    fireEvent.click(btn);
    expect(onVerify).toHaveBeenCalledWith(base);
  });

  it('renders NO Verify button when onVerify is not provided', () => {
    renderRow(base);
    expect(screen.queryByLabelText(/Verify skill/)).toBeNull();
  });

  it('disables the Verify button while verifying', () => {
    renderRow(base, { onVerify: () => {}, verifying: true });
    expect(screen.getByLabelText(/Verify skill deploy-helper/)).toBeDisabled();
  });
});
