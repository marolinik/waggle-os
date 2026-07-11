/**
 * #15 skill requirement badges: the amber "setup needed" badge renders only
 * when a skill's declared requirements are unsatisfied, with a tooltip
 * listing every missing item. Badge-only v1 — the skill stays active, so the
 * badge must never appear for satisfied or requirement-free skills.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import SkillRow from '@/components/os/apps/skills/SkillRow';
import type { Skill } from '@/lib/types';

afterEach(cleanup);

const base: Skill = { name: 'video-helper', status: 'installed' };
const renderRow = (skill: Skill) =>
  render(<ul><SkillRow skill={skill} onTest={() => {}} onEdit={() => {}} /></ul>);

describe('SkillRow "setup needed" badge (#15)', () => {
  it('shows the badge with a tooltip listing missing env + bins', () => {
    renderRow({
      ...base,
      requirements: { satisfied: false, missingEnv: ['OPENAI_API_KEY'], missingBins: ['ffmpeg'] },
    });
    const badge = screen.getByText('setup needed');
    expect(badge).toBeInTheDocument();
    expect(badge.closest('[title]')).toHaveAttribute(
      'title',
      'Missing: OPENAI_API_KEY (env), ffmpeg (binary)',
    );
  });

  it('shows NO badge when requirements are satisfied', () => {
    renderRow({ ...base, requirements: { satisfied: true, missingEnv: [], missingBins: [] } });
    expect(screen.queryByText('setup needed')).toBeNull();
  });

  it('shows NO badge when the skill declares no requirements (null/absent)', () => {
    renderRow({ ...base, requirements: null });
    expect(screen.queryByText('setup needed')).toBeNull();
    cleanup();
    renderRow(base);
    expect(screen.queryByText('setup needed')).toBeNull();
  });
});
