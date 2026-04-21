/**
 * Canonical 13-persona data source for Waggle bee mascots.
 *
 * Copy is ratified per `PM-Waggle-OS/decisions/2026-04-22-personas-card-copy-locked.md`.
 * Do NOT rewrite or paraphrase in consumer components — import from this module only.
 *
 * Asset paths are relative (no leading slash) to work with Vite's `base: '/waggle/'`
 * configuration. This matches the existing convention in `components/Hero.tsx`.
 */

export type PersonaSlug =
  | 'hunter'
  | 'researcher'
  | 'analyst'
  | 'connector'
  | 'architect'
  | 'builder'
  | 'writer'
  | 'orchestrator'
  | 'marketer'
  | 'team'
  | 'celebrating'
  | 'confused'
  | 'sleeping';

export interface Persona {
  /** Canonical slug used for keying, asset lookup, analytics callbacks. */
  readonly slug: PersonaSlug;
  /** Display title, e.g. "The Hunter". Verbatim from locked copy. */
  readonly title: string;
  /** One-line JTBD copy below the title. Verbatim from locked copy. */
  readonly role: string;
  /** Accessible image label — "Waggle {title} bee mascot". */
  readonly alt: string;
  /** Relative asset path, resolved against Vite `base`. */
  readonly imagePath: string;
  /** 1-13 canonical reading order (input → process → output → meta). */
  readonly order: number;
}

function buildPersona(
  slug: PersonaSlug,
  title: string,
  role: string,
  order: number,
): Persona {
  return {
    slug,
    title,
    role,
    alt: `Waggle ${title} bee mascot`,
    imagePath: `brand/bee-${slug}-dark.png`,
    order,
  };
}

export const personas: readonly Persona[] = [
  buildPersona('hunter', 'The Hunter', 'Finds the source you forgot you saved.', 1),
  buildPersona('researcher', 'The Researcher', 'Goes deep and brings back a verdict.', 2),
  buildPersona('analyst', 'The Analyst', 'Sees the shape of what keeps repeating.', 3),
  buildPersona(
    'connector',
    'The Connector',
    "Links yesterday's thought to tomorrow's decision.",
    4,
  ),
  buildPersona(
    'architect',
    'The Architect',
    'Gives chaos a structure you can reason about.',
    5,
  ),
  buildPersona('builder', 'The Builder', 'Turns a spec into something that ships.', 6),
  buildPersona('writer', 'The Writer', 'Shapes the story the memory wants to tell.', 7),
  buildPersona(
    'orchestrator',
    'The Orchestrator',
    'Coordinates the agents, tools, and memory.',
    8,
  ),
  buildPersona(
    'marketer',
    'The Marketer',
    'Translates what you do into what matters to them.',
    9,
  ),
  buildPersona('team', 'The Team', 'Many hands, one hive.', 10),
  buildPersona(
    'celebrating',
    'The Milestone',
    'Marks the moment when the work compounds.',
    11,
  ),
  buildPersona(
    'confused',
    'The Signal',
    'Raises a flag when memory and reality disagree.',
    12,
  ),
  buildPersona(
    'sleeping',
    'The Night Shift',
    'Consolidates while you rest — the hive never closes.',
    13,
  ),
] as const;

/** O(1) lookup by slug. */
export const personaBySlug: Readonly<Record<PersonaSlug, Persona>> = Object.freeze(
  personas.reduce(
    (acc, persona) => {
      acc[persona.slug] = persona;
      return acc;
    },
    {} as Record<PersonaSlug, Persona>,
  ),
);

/**
 * Path to the hex-texture PNG used as filler-tile background and as
 * placeholder canvas when a persona asset fails to load.
 */
export const HEX_TEXTURE_PATH = 'brand/hex-texture-dark.png';
