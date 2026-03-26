import { describe, it, expect } from 'vitest';
import { SkillRecommender, type SkillRecommenderDeps } from '../src/skill-recommender.js';

function makeDeps(
  skills: Array<{ name: string; content: string }>,
  activeSkills?: string[],
): SkillRecommenderDeps {
  return {
    getSkills: () => skills,
    activeSkills,
  };
}

describe('SkillRecommender', () => {
  const sampleSkills = [
    { name: 'code-review', content: 'Guidelines for reviewing pull requests. Check style, logic errors, and test coverage.' },
    { name: 'writing-style', content: 'Maintain a professional tone. Use active voice. Avoid jargon.' },
    { name: 'data-analysis', content: 'Steps for analyzing datasets: clean data, explore patterns, visualize results, report findings.' },
    { name: 'project-planning', content: 'Break work into milestones. Estimate effort. Track dependencies and risks.' },
  ];

  it('returns recommendations when skills match context keywords', () => {
    const rec = new SkillRecommender(makeDeps(sampleSkills));
    const results = rec.recommend('I need help reviewing code for this pull request');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].skillName).toBe('code-review');
    expect(results[0].relevanceScore).toBeGreaterThan(0);
    expect(results[0].reason).toBeTruthy();
  });

  it('name matches score higher than content-only matches', () => {
    const skills = [
      { name: 'analysis-helper', content: 'Generic helper skill with no special keywords.' },
      { name: 'generic-skill', content: 'This skill helps with analysis of data and patterns.' },
    ];
    const rec = new SkillRecommender(makeDeps(skills));
    // Use multiple keywords so the 2x name-match weight creates a gap
    const results = rec.recommend('analysis helper tool');
    expect(results.length).toBe(2);
    // Name match should score higher (name hits "analysis" and "helper" at 2x each)
    expect(results[0].skillName).toBe('analysis-helper');
    expect(results[0].relevanceScore).toBeGreaterThan(results[1].relevanceScore);
  });

  it('filters out active skills', () => {
    const rec = new SkillRecommender(makeDeps(sampleSkills, ['code-review']));
    const results = rec.recommend('review code pull request');
    const names = results.map(r => r.skillName);
    expect(names).not.toContain('code-review');
  });

  it('returns empty array when no skills match', () => {
    const rec = new SkillRecommender(makeDeps(sampleSkills));
    const results = rec.recommend('quantum physics entanglement');
    expect(results).toEqual([]);
  });

  it('respects topN limit', () => {
    const rec = new SkillRecommender(makeDeps(sampleSkills));
    // Use a broad context that could match multiple skills
    const results = rec.recommend('review code data analysis planning style', 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('case-insensitive matching', () => {
    const rec = new SkillRecommender(makeDeps(sampleSkills));
    const lower = rec.recommend('code review');
    const upper = rec.recommend('CODE REVIEW');
    expect(lower.length).toBe(upper.length);
    expect(lower[0].skillName).toBe(upper[0].skillName);
    expect(lower[0].relevanceScore).toBe(upper[0].relevanceScore);
  });

  it('handles empty context gracefully', () => {
    const rec = new SkillRecommender(makeDeps(sampleSkills));
    expect(rec.recommend('')).toEqual([]);
    expect(rec.recommend('   ')).toEqual([]);
  });

  it('minimum score threshold filters noise', () => {
    // Skill with content that barely overlaps — lots of keywords, only one match
    const skills = [
      { name: 'xyz-unrelated', content: 'This mentions code once but nothing else relevant.' },
    ];
    const rec = new SkillRecommender(makeDeps(skills));
    // Many keywords, "code" matches but score will be low
    const results = rec.recommend(
      'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda code',
    );
    // "code" matches in content = 1 point, 12 keywords total => score ~0.083 < 0.1
    // Some stop words filter out, let's check: alpha(ok) beta(ok) gamma(ok) delta(ok)
    // epsilon(ok) zeta(ok) eta(ok=3chars) theta(ok) iota(ok=4chars) kappa(ok) lambda(ok) code(ok)
    // That's 12 keywords, 1 match => 0.083 => below threshold
    expect(results).toEqual([]);
  });

  it('returns reason describing name match', () => {
    const rec = new SkillRecommender(makeDeps(sampleSkills));
    const results = rec.recommend('code review');
    const codeReview = results.find(r => r.skillName === 'code-review');
    expect(codeReview).toBeDefined();
    expect(codeReview!.reason).toContain('Skill name matches');
  });

  it('returns reason describing content match', () => {
    const skills = [
      { name: 'my-skill', content: 'This skill teaches visualization techniques for charts.' },
    ];
    const rec = new SkillRecommender(makeDeps(skills));
    const results = rec.recommend('visualization charts');
    expect(results.length).toBe(1);
    expect(results[0].reason).toContain('Skill content mentions');
  });
});
