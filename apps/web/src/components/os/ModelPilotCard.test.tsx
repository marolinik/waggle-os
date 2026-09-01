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
  it('exposes lane-specific model controls and their expanded picker', () => {
    render(
      <TooltipProvider>
        <ModelPilotCard
          defaultModel="gpt-5"
          fallbackModel="gpt-5-mini"
          budgetModel="gpt-5-nano"
          budgetThreshold={0.6}
          dailyBudget={20}
          providers={PROVIDERS}
          onUpdate={vi.fn()}
        />
      </TooltipProvider>,
    );

    for (const lane of ['Primary', 'Fallback', 'Budget Saver']) {
      const control = screen.getByRole('button', { name: `Change ${lane} model` });
      const popupId = control.getAttribute('aria-controls');

      expect(popupId).toBeTruthy();
      expect(control).toHaveAttribute('type', 'button');
      expect(control).toHaveAttribute('aria-expanded', 'false');
      expect(document.getElementById(popupId!)).not.toBeInTheDocument();

      fireEvent.click(control);

      expect(control).toHaveAttribute('aria-expanded', 'true');
      const popup = document.getElementById(popupId!);
      expect(popup).toHaveAttribute('role', 'group');
      expect(popup).toHaveAccessibleName(`${lane} model options`);

      fireEvent.click(control);
      expect(control).toHaveAttribute('aria-expanded', 'false');
      expect(document.getElementById(popupId!)).not.toBeInTheDocument();
    }
  });

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
    expect(threshold).toHaveAttribute('min', '0.5');
    expect(threshold).toHaveAttribute('max', '0.95');
    expect(threshold.className).toContain('focus-visible:ring-2');

    fireEvent.change(threshold, { target: { value: '0.75' } });
    expect(onUpdate).toHaveBeenCalledWith({ budgetThreshold: 0.75 });
  });
});
