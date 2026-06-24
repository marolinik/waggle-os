/**
 * PR7b — Auth (screen 13): the pre-shell /auth route.
 *  B1 (no key): the honest accountless local-first state — never a fabricated identity,
 *    demo email, or a fake SSO button that does nothing (F1/F10).
 *  B2 (key present): the real prebuilt Clerk <SignIn/>/<SignUp/> (D13) with a redirect to
 *    the fully-local app, the §2b honey local-first note on Sign up, our own design-faithful
 *    toggle, and the enterprise panel as a sales CTA (not a live SAML form — F11/D15).
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock the Clerk SDK so tests never touch the network or need a real ClerkProvider.
vi.mock('@clerk/themes', () => ({ dark: { __mock: 'dark' } }));
vi.mock('@clerk/clerk-react', () => ({
  ClerkProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SignIn: (p: { forceRedirectUrl?: string }) => (
    <div data-testid="clerk-signin" data-redirect={p.forceRedirectUrl} />
  ),
  SignUp: (p: { forceRedirectUrl?: string }) => (
    <div data-testid="clerk-signup" data-redirect={p.forceRedirectUrl} />
  ),
}));

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (orig) => {
  const actual = await orig<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
});

afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllEnvs(); });

describe('PR7b · /auth — B1 accountless (no Clerk key)', () => {
  beforeEach(() => vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', ''));

  it('renders the honest local-first state with NO fabricated identity (F1/F10)', async () => {
    const { default: AuthRoute } = await import('@/routes/AuthRoute');
    render(<MemoryRouter><AuthRoute /></MemoryRouter>);
    expect(screen.getByText(/running fully local/i)).toBeInTheDocument();
    expect(screen.getByText(/don.t need this to start/i)).toBeInTheDocument();
    expect(screen.queryByText(/mara@egzakta/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('clerk-signin')).not.toBeInTheDocument();
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

describe('PR7b · /auth — B2 Clerk form (key present)', () => {
  beforeEach(() => vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_x'));

  it('renders the real prebuilt Clerk <SignIn/> redirecting to /home (no fake SSO/OTP — F10)', async () => {
    const { default: AuthRoute } = await import('@/routes/AuthRoute');
    render(<MemoryRouter><AuthRoute /></MemoryRouter>);
    const signin = screen.getByTestId('clerk-signin');
    expect(signin).toBeInTheDocument();
    expect(signin).toHaveAttribute('data-redirect', '/home');
    expect(screen.queryByText(/mara@egzakta/i)).not.toBeInTheDocument();
  });

  it('toggles to Sign up (with the honey local-first note) and back', async () => {
    const { default: AuthRoute } = await import('@/routes/AuthRoute');
    render(<MemoryRouter><AuthRoute /></MemoryRouter>);
    expect(screen.getByTestId('clerk-signin')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Create an account/i }));
    expect(screen.getByTestId('clerk-signup')).toBeInTheDocument();
    expect(screen.getByText(/don.t need this to start/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Sign in$/i }));
    expect(screen.getByTestId('clerk-signin')).toBeInTheDocument();
  });

  it('enterprise panel is a sales CTA → kvark.ai, NOT a live SAML form (F11/D15)', async () => {
    const { default: AuthRoute } = await import('@/routes/AuthRoute');
    render(<MemoryRouter><AuthRoute /></MemoryRouter>);
    expect(screen.getByRole('link', { name: /Talk to sales/i })).toHaveAttribute('href', 'https://www.kvark.ai');
    expect(screen.queryByPlaceholderText(/work email|organization/i)).not.toBeInTheDocument();
  });
});
