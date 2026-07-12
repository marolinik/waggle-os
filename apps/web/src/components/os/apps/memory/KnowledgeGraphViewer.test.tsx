import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { KGEdge, KGNode } from '@/lib/types';
import KnowledgeGraphViewer from './KnowledgeGraphViewer';

const nodes: KGNode[] = [
  { id: 'person-1', label: 'Ada Lovelace', type: 'person' },
  { id: 'project-1', label: 'Analytical Engine', type: 'project' },
];

const edges: KGEdge[] = [
  { source: 'person-1', target: 'project-1', relationship: 'designed' },
];

function renderGraph() {
  return render(
    <TooltipProvider>
      <div className="h-[420px] w-[680px]">
        <KnowledgeGraphViewer
          nodes={nodes}
          edges={edges}
          scope="current"
          onScopeChange={vi.fn()}
        />
      </div>
    </TooltipProvider>,
  );
}

afterEach(() => {
  cleanup();
});

describe('KnowledgeGraphViewer', () => {
  it('names graph toolbar controls and exposes stable form metadata', () => {
    renderGraph();

    const search = screen.getByRole('textbox', { name: /filter graph nodes/i });
    expect(search).toHaveAttribute('name', 'knowledgeGraphSearch');
    expect(search).toHaveAttribute('autocomplete', 'off');
    expect(search.parentElement?.className).toContain('focus-within:ring-2');
    expect(search.parentElement?.className).toContain('focus-within:ring-[var(--focus-ring)]');

    const scope = screen.getByRole('combobox', { name: /knowledge graph scope/i });
    expect(scope).toHaveAttribute('name', 'knowledgeGraphScope');
    expect(scope).toHaveAttribute('autocomplete', 'off');
    expect(scope.className).toContain('focus-visible:ring-2');
    expect(scope.className).toContain('focus-visible:ring-[var(--focus-ring)]');

    for (const name of [
      /zoom out graph/i,
      /zoom in graph/i,
      /reset graph view/i,
      /export graph as svg/i,
      /export graph as png/i,
      /enter fullscreen graph/i,
    ]) {
      const control = screen.getByRole('button', { name });
      expect(control.className).toContain('focus-visible:ring-2');
      expect(control.className).toContain('focus-visible:ring-[var(--focus-ring)]');
    }
  });
});
