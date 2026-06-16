/**
 * The artifact contract — the universe of written mind content the leakage
 * firewall scans.
 *
 * 03-REDTEAM-RESOLUTIONS.md C1 (critical): the firewall must cover ALL written
 * artifacts, not just ingest frames. A Phase-A skill body is LLM-authored
 * markdown that could encode a Phase-B-determining procedure; a write-back frame
 * could bank a discovered gold; user-sim turns are goal-conditioned and may
 * paraphrase the target (C4). Each kind is a distinct failure class, so we tag it.
 *
 * Kinds:
 *   frame       — ingest / harvest I/P/B frame content (memory_frames.content)
 *   skill_body  — LLM-authored distilled-skill markdown (D1 create_skill)
 *   write_back  — cognify / write-back banked fact
 *   identity    — IdentityLayer persisted profile text
 *   awareness   — AwarenessLayer active-task/state text
 *   user_turn   — simulated-user conversational turn banked for M4 personalization
 */

export const ARTIFACT_KINDS = [
  'frame',
  'skill_body',
  'write_back',
  'identity',
  'awareness',
  'user_turn',
] as const;

export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

export interface Artifact {
  kind: ArtifactKind;
  /** Stable identifier for the audit trail (frame id, skill id, etc.). */
  id: string;
  /** The full text written into the mind for this artifact. */
  text: string;
}

/** A flattened, validated copy ready for a gate to scan. Same shape as Artifact
 *  today, kept as a distinct type so a future flattener can split multi-field
 *  artifacts (e.g. a frame with title+body) into multiple scan units. */
export interface ArtifactText {
  kind: ArtifactKind;
  id: string;
  text: string;
}

const KIND_SET: ReadonlySet<string> = new Set<string>(ARTIFACT_KINDS);

export function collectArtifactTexts(artifacts: readonly Artifact[]): ArtifactText[] {
  if (!Array.isArray(artifacts)) {
    throw new Error('collectArtifactTexts requires an array of artifacts');
  }
  return artifacts.map((a, i) => {
    if (!a || !KIND_SET.has(a.kind)) {
      throw new Error(`unknown artifact kind at index ${i}: ${a?.kind}`);
    }
    if (typeof a.text !== 'string') {
      throw new Error(`artifact text must be a string at index ${i} (kind ${a.kind}, id ${a.id})`);
    }
    if (typeof a.id !== 'string') {
      throw new Error(`artifact id must be a string at index ${i} (kind ${a.kind})`);
    }
    return { kind: a.kind, id: a.id, text: a.text };
  });
}
