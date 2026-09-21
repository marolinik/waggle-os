/**
 * F4 — ErrorBlock: actionable chat error panel.
 *
 * Pins the auth-shape classifier and the two conditional actions (Retry only
 * when onRetry is wired; "Open API key settings" only for auth-shaped copy,
 * deep-linking to Settings → Models).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import ErrorBlock, { isAuthShapedError } from './ErrorBlock';
import type { ErrorContentBlock } from '@/lib/types';

afterEach(cleanup);

function block(message: string): ErrorContentBlock {
  return { type: 'error', blockId: 'e1', message };
}

/** Probe that records the current pathname+search so we can assert navigation. */
function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname + loc.search}</div>;
}

function renderBlock(b: ErrorContentBlock, onRetry?: () => void) {
  return render(
    <MemoryRouter initialEntries={['/workspaces/ws-1/chat']}>
      <Routes>
        <Route path="*" element={<><ErrorBlock block={b} onRetry={onRetry} /><LocationProbe /></>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('isAuthShapedError', () => {
  it('matches the server auth/API-key copy and raw 401', () => {
    expect(isAuthShapedError('API key is invalid or expired. Update it in Settings > API Keys.')).toBe(true);
    expect(isAuthShapedError('Request failed with 401')).toBe(true);
    expect(isAuthShapedError('Unauthorized')).toBe(true);
  });

  it('does not misclassify endpoint connectivity as an API-key failure', () => {
    expect(isAuthShapedError('Could not reach the AI model. Check that your API key is configured.')).toBe(false);
    expect(isAuthShapedError('The model endpoint is not responding. It may be down or restarting.')).toBe(false);
    expect(isAuthShapedError('The request timed out. Try again.')).toBe(false);
    expect(isAuthShapedError('Chat request failed (500): boom')).toBe(false);
  });
});

describe('ErrorBlock', () => {
  it('auth-shaped error shows both actions; settings click deep-links to Models', () => {
    const onRetry = vi.fn();
    renderBlock(block('API key is invalid or expired. Update it in Settings > API Keys.'), onRetry);
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    const keyBtn = screen.getByRole('button', { name: /open api key settings/i });
    fireEvent.click(keyBtn);
    expect(screen.getByTestId('loc').textContent).toBe('/settings?tab=models');
  });

  it('non-auth error shows Retry only (no settings action)', () => {
    renderBlock(block('The request timed out. Try again.'), vi.fn());
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /open api key settings/i })).toBeNull();
  });

  it('endpoint outage shows Retry and model settings, never API-key settings', () => {
    renderBlock(
      block('The model endpoint is not responding. It may be down or restarting. Check Settings > Models, then try again.'),
      vi.fn(),
    );
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    const modelSettings = screen.getByRole('button', { name: /open model settings/i });
    fireEvent.click(modelSettings);
    expect(screen.getByTestId('loc').textContent).toBe('/settings?tab=models');
    expect(screen.queryByRole('button', { name: /open api key settings/i })).toBeNull();
  });

  it('without onRetry, no Retry button renders', () => {
    renderBlock(block('Chat request failed (500): boom'));
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull();
  });
});
