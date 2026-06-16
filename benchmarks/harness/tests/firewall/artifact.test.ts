/**
 * Artifact contract tests — the universe of written mind content the firewall scans.
 */
import { describe, expect, it } from 'vitest';
import {
  collectArtifactTexts,
  type Artifact,
  ARTIFACT_KINDS,
} from '../../src/firewall/artifact.js';

describe('Artifact contract', () => {
  it('exposes every written-artifact kind the firewall must cover (03 C1)', () => {
    expect(ARTIFACT_KINDS).toEqual([
      'frame',
      'skill_body',
      'write_back',
      'identity',
      'awareness',
      'user_turn',
    ]);
  });
});

describe('collectArtifactTexts', () => {
  const artifacts: Artifact[] = [
    { kind: 'frame', id: 'f1', text: 'Alice: I bought order 555.' },
    { kind: 'skill_body', id: 's1', text: '# process_return(order)\nLook up the order, ...' },
    { kind: 'write_back', id: 'wb1', text: 'Change-fee policy is $50.' },
    { kind: 'identity', id: 'id1', text: 'User prefers window seats.' },
    { kind: 'awareness', id: 'aw1', text: 'Currently rebooking flight.' },
    { kind: 'user_turn', id: 'u1', text: 'I would like to return something.' },
  ];

  it('returns one entry per artifact, preserving kind+id+text', () => {
    const flat = collectArtifactTexts(artifacts);
    expect(flat).toHaveLength(6);
    expect(flat[1]).toEqual({ kind: 'skill_body', id: 's1', text: artifacts[1].text });
  });

  it('does not mutate the input array or its objects', () => {
    const snapshot = JSON.stringify(artifacts);
    collectArtifactTexts(artifacts);
    expect(JSON.stringify(artifacts)).toBe(snapshot);
  });

  it('rejects a non-array input', () => {
    expect(() => collectArtifactTexts({} as unknown as Artifact[])).toThrow(/array of artifacts/);
  });

  it('rejects an artifact with an unknown kind', () => {
    const bad = [{ kind: 'secret', id: 'x', text: 'leak' }] as unknown as Artifact[];
    expect(() => collectArtifactTexts(bad)).toThrow(/unknown artifact kind/);
  });

  it('rejects an artifact missing text', () => {
    const bad = [{ kind: 'frame', id: 'x' }] as unknown as Artifact[];
    expect(() => collectArtifactTexts(bad)).toThrow(/text must be a string/);
  });
});
