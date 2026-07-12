/**
 * SuggestedAgentCards (Agent Center sparse-state affordance) — Wave W Lane A
 * item 2. Pins the entrance choreography contract:
 *  - the suggested bee cards enter on the shelf's `card-enter` grammar with a
 *    ~40ms/card stagger (reused from the memory surface, capped ≤500ms)
 *  - the roster strip follows one 40ms beat after the last card
 *  - reduced motion opts out entirely (no rise/fade)
 *  - the presentational contract (a card per persona) survives
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { PersonaConfig } from '@/lib/personas';

// Drive the reduced-motion branch deterministically; preserve every other
// framer-motion export so the rest of the tree is untouched.
const motionMock = vi.hoisted(() => ({ reduce: false }));
vi.mock('framer-motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('framer-motion')>()),
  useReducedMotion: () => motionMock.reduce,
}));

import SuggestedAgentCards from './SuggestedAgentCards';

const persona = (id: string, name: string): PersonaConfig => ({
  id, name, description: `${name} desc`, avatar: '', role: id,
});

// The "six suggested-agent bee cards" from the spec.
const six: PersonaConfig[] = [
  persona('researcher', 'Researcher'),
  persona('writer', 'Writer'),
  persona('analyst', 'Analyst'),
  persona('planner', 'Planner'),
  persona('coder', 'Coder'),
  persona('consultant', 'Consultant'),
];

beforeEach(() => { motionMock.reduce = false; });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('SuggestedAgentCards entrance choreography', () => {
  it('renders a card per persona (presentational contract)', () => {
    render(<SuggestedAgentCards personas={six} onPick={vi.fn()} />);
    expect(screen.getByTestId('suggested-agents')).toBeInTheDocument();
    expect(screen.getByText('Researcher')).toBeInTheDocument();
    expect(screen.getByText('Consultant')).toBeInTheDocument();
  });

  it('cascades the bee cards in — staggered card-enter, ~40ms apart (Wave W Lane A item 2)', () => {
    render(<SuggestedAgentCards personas={six} onPick={vi.fn()} />);
    const first = screen.getByText('Researcher').closest('li') as HTMLElement;
    const second = screen.getByText('Writer').closest('li') as HTMLElement;
    // Reuses the memory surface's card-enter keyframe (8px rise + fade).
    expect(first.style.animation).toContain('card-enter');
    expect(first.style.animationDelay).toBe('0ms');
    expect(second.style.animationDelay).toBe('40ms');
  });

  it('the roster strip follows one beat after the last card (Wave W Lane A item 2)', () => {
    render(
      <SuggestedAgentCards personas={six} onPick={vi.fn()} allPersonas={six} onBrowseAll={vi.fn()} />,
    );
    // Last card (6 personas → capped index 4) lands at 160ms…
    const last = screen.getByText('Consultant').closest('li') as HTMLElement;
    expect(last.style.animationDelay).toBe('160ms');
    // …and the strip enters one 40ms beat later.
    const strip = screen.getByTestId('persona-roster');
    expect(strip.style.animation).toContain('card-enter');
    expect(strip.style.animationDelay).toBe('200ms');
  });

  it('reduced motion opts out of the entrance entirely — no rise/fade (Wave W Lane A item 3)', () => {
    motionMock.reduce = true;
    render(
      <SuggestedAgentCards personas={six} onPick={vi.fn()} allPersonas={six} onBrowseAll={vi.fn()} />,
    );
    expect((screen.getByText('Researcher').closest('li') as HTMLElement).style.animation).toBe('');
    expect(screen.getByTestId('persona-roster').style.animation).toBe('');
  });

  it('keeps avatar media dimensions stable and avoids broad transitions', () => {
    const { container } = render(
      <SuggestedAgentCards personas={six} onPick={vi.fn()} allPersonas={six} onBrowseAll={vi.fn()} />,
    );

    const images = Array.from(container.querySelectorAll('img'));
    expect(images).toHaveLength(11);
    images.forEach((image) => {
      expect(image).toHaveAttribute('width');
      expect(image).toHaveAttribute('height');
    });
    expect(container.innerHTML).not.toContain('transition-all');
  });
});
