/**
 * Presentation helpers for SkillPack cards + detail drawer (M-45 / P29).
 *
 * The pack list used to render cards with no click affordance; now a
 * card click opens a detail drawer. These pure helpers carry the
 * user-facing vocabulary (trust-level copy, capability count summary)
 * so a rename never ships without a failing test.
 */

export type PackTrust = 'verified' | 'community' | 'experimental' | string;

export interface SkillPackLike {
  readonly id?: string;
  readonly name: string;
  readonly description?: string;
  readonly category?: string;
  readonly trust?: PackTrust;
  readonly skills?: readonly string[];
  readonly installed?: boolean;
}

/** Human-friendly trust label + one-line explainer for the detail drawer. */
export function describeTrust(trust: string | undefined): { label: string; explainer: string } {
  switch (trust) {
    case 'verified':
      return {
        label: 'Verified',
        explainer: 'Reviewed + signed by Waggle. Safe default.',
      };
    case 'community':
      return {
        label: 'Community',
        explainer: 'User-contributed. No official review.',
      };
    case 'experimental':
      return {
        label: 'Experimental',
        explainer: 'In-progress work. Behaviour may change.',
      };
    default:
      return {
        label: 'Unknown',
        explainer: 'Trust level not declared — treat as community.',
      };
  }
}

/**
 * Stable id for a pack — prefers `id`, falls back to `name`. A missing
 * identifier is still better than throwing; the caller supplies an
 * index-based suffix at the render site for the React `key`.
 */
export function packIdentity(pack: SkillPackLike): string {
  if (pack.id && pack.id.trim().length > 0) return pack.id;
  if (pack.name && pack.name.trim().length > 0) return pack.name;
  return '';
}

/** Pluralised "N skills" / "1 skill" / "No skills" summary. */
export function summariseSkills(skills: readonly string[] | undefined): string {
  const count = skills?.length ?? 0;
  if (count === 0) return 'No skills bundled';
  if (count === 1) return '1 skill';
  return `${count} skills`;
}
