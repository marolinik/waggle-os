import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { Provider } from '@/hooks/useProviders';
import ModelPilotCard from './ModelPilotCard';

const PROVIDERS: Provider[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    hasKey: true,
    badge: null,
    keyUrl: null,
    requiresKey: true,
    models: [
      { id: 'gpt-5', name: 'GPT-5', cost: '$$$', speed: 'fast' },
      { id: 'gpt-5-mini', name: 'GPT-5 mini', cost: '$$', speed: 'fast' },
      { id: 'gpt-5-nano', name: 'GPT-5 nano', cost: '$', speed: 'fast' },
    ],
  },
];

describe('ModelPilotCard', () => {
  it('names the budget threshold slider and preserves update behavior', () => {
    const onUpdate = vi.fn();

    render(
      <TooltipProvider>
        <ModelPilotCard
          defaultModel="gpt-5"
          fallbackModel="gpt-5-mini"
          budgetModel="gpt-5-nano"
          budgetThreshold={0.6}
          dailyBudget={20}
          providers={PROVIDERS}
          onUpdate={onUpdate}
        />
      </TooltipProvider>,
    );

    const threshold = screen.getByRole('slider', { name: /budget saver activation threshold/i });
    expect(threshold).toHaveAttribute('name', 'budgetThreshold');
    expect(threshold.className).toContain('focus-visible:ring-2');

    fireEvent.change(threshold, { target: { value: '0.75' } });
    expect(onUpdate).toHaveBeenCalledWith({ budgetThreshold: 0.75 });
  });
});
