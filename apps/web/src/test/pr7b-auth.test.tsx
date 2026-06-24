/**
 * PR7b — Auth (screen 13) B1: the pre-shell /auth route + custom warm split layout.
 * Pins the honest local-first (accountless) state and the no-fabrication gates:
 *  - renders the "you're running fully local" / "you don't need this to start" framing;
 *  - NEVER a fabricated identity, demo email, or a fake SSO button that does nothing
 *    (F1/F10 — there is no Clerk SDK in B1);
 *  - the brand panel carries the verbatim trust copy (recon 03 §2e);
 *  - "Continue to Waggle" navigates into the fully-local app (/home).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (orig) => {
  const actual = await orig<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
});

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('PR7b · /auth (B1 accountless)', () => {
  it('renders the honest local-first state with NO fabricated identity (F1/F10)', async () => {
    const { default: AuthRoute } = await import('@/routes/AuthRoute');
    render(<MemoryRouter><AuthRoute /></MemoryRouter>);
    expect(screen.getByText(/running fully local/i)).toBeInTheDocument();
    expect(screen.getByText(/don.t need this to start/i)).toBeInTheDocument();
    // No fake signed-in user, demo email, or non-functional SSO button.
    expect(screen.queryByText(/mara@egzakta/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/continue with google/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/signed in/i)).not.toBeInTheDocument();
  });

  it('brand panel carries the verbatim trust copy (recon 03 §2e)', async () => {
    const { default: AuthRoute } = await import('@/routes/AuthRoute');
    render(<MemoryRouter><AuthRoute /></MemoryRouter>);
    expect(screen.getByText(/An account is optional/i)).toBeInTheDocument();
    expect(screen.getByText(/Your memory stays yours/i)).toBeInTheDocument();
  });

  it('"Continue to Waggle" navigates into the fully-local app (/home)', async () => {
    const { default: AuthRoute } = await import('@/routes/AuthRoute');
    render(<MemoryRouter><AuthRoute /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /Continue to Waggle/i }));
    expect(navigateMock).toHaveBeenCalledWith('/home');
  });
});
