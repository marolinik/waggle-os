import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Memory } from '@/lib/types';
import { MemoryCard } from './MemoryCard';

const memory: Memory = {
  id: 'memory-research-note',
  kind: 'fact',
  title: 'Research Note',
  content: 'The supplier review belongs in the Q3 diligence packet.',
  scope: 'personal',
  workspaceId: undefined,
  source: 'user_stated',
  sourceId: null,
  sourceUrl: null,
  importance: 'normal',
  status: 'active',
  confidence: 91,
  tags: ['research'],
  evidence: [],
  hasOriginalSource: false,
  createdAt: '2026-07-08T08:00:00.000Z',
  updatedAt: '2026-07-08T09:00:00.000Z',
};

describe('MemoryCard', () => {
  it('gives the selection checkbox a specific accessible name and stable metadata', () => {
    const onSelect = vi.fn();

    render(<MemoryCard memory={memory} selected={false} onSelect={onSelect} />);

    const checkbox = screen.getByRole('checkbox', { name: /select memory research note/i });
    expect(checkbox).toHaveAttribute('name', 'selectedMemoryIds');
    expect(checkbox).toHaveAttribute('value', 'memory-research-note');

    fireEvent.click(checkbox);
    expect(onSelect).toHaveBeenCalledWith(true);
  });

  it('labels temporary memories as provisional instead of presenting them as facts', () => {
    render(
      <MemoryCard
        memory={{ ...memory, importance: 'temporary', source: 'agent_inferred', status: 'unreviewed' }}
      />,
    );

    expect(screen.getByText('Provisional')).toBeInTheDocument();
    expect(screen.getByText('Needs review')).toBeInTheDocument();
    expect(screen.queryByText('Fact')).not.toBeInTheDocument();
  });
});
