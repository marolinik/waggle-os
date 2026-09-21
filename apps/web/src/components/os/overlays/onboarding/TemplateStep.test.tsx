/** PR5 Phase C2 — the Template step (curated 6; selecting creates the workspace). */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Microscope } from 'lucide-react';
import TemplateStep from './TemplateStep';

const templates = [
  { id: 'research-project', name: 'Research Hub', icon: Microscope, hint: 'Design a literature review', desc: 'Deep dive' },
  { id: 'blank', name: 'Blank Workspace', icon: Microscope, hint: 'Hello!', desc: 'From scratch' },
];

afterEach(() => cleanup());

describe('TemplateStep', () => {
  it('renders the curated templates and selects one by id', () => {
    const onSelect = vi.fn();
    render(<TemplateStep templates={templates} onSelect={onSelect} creating={false} creatingId={null} createError={null} />);
    fireEvent.click(screen.getByRole('button', { name: /research hub/i }));
    expect(onSelect).toHaveBeenCalledWith('research-project');
  });

  it('disables the cards while creating and marks the chosen one busy', () => {
    render(<TemplateStep templates={templates} onSelect={vi.fn()} creating creatingId="blank" createError={null} />);
    expect(screen.getByRole('button', { name: /research hub/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /blank workspace/i })).toHaveAttribute('aria-busy', 'true');
  });

  it('announces an actionable create error', () => {
    render(<TemplateStep templates={templates} onSelect={vi.fn()} creating={false} creatingId={null} createError="Could not create workspace. Try again." />);
    expect(screen.getByRole('alert')).toHaveTextContent(/could not create workspace.*try again/i);
  });

  it('shows no Recommended badge and keeps input order when recommendedId is null', () => {
    render(<TemplateStep templates={templates} onSelect={vi.fn()} creating={false} creatingId={null} createError={null} recommendedId={null} />);
    expect(screen.queryByText(/recommended/i)).not.toBeInTheDocument();
    const cards = screen.getAllByRole('button');
    expect(cards[0]).toHaveTextContent(/research hub/i);
  });

  it('badges the recommended template and floats it first', () => {
    // blank is second in the input list; recommending it must move it to the front.
    render(<TemplateStep templates={templates} onSelect={vi.fn()} creating={false} creatingId={null} createError={null} recommendedId="blank" />);
    expect(screen.getByText(/recommended/i)).toBeInTheDocument();
    const cards = screen.getAllByRole('button');
    expect(cards[0]).toHaveTextContent(/blank workspace/i);
    expect(cards[0]).toHaveTextContent(/recommended/i);
  });
});
