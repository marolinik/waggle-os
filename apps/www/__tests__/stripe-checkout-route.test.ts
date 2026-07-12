import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const clerkMocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getUser: vi.fn(),
  updateUserMetadata: vi.fn(),
}));

const stripeMocks = vi.hoisted(() => ({
  checkoutSessionsCreate: vi.fn(),
  customersCreate: vi.fn(),
  pricesList: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: clerkMocks.auth,
  clerkClient: vi.fn(async () => ({
    users: {
      getUser: clerkMocks.getUser,
      updateUserMetadata: clerkMocks.updateUserMetadata,
    },
  })),
}));

vi.mock('stripe', () => ({
  default: vi.fn().mockImplementation(() => ({
    checkout: {
      sessions: {
        create: stripeMocks.checkoutSessionsCreate,
      },
    },
    customers: {
      create: stripeMocks.customersCreate,
    },
    prices: {
      list: stripeMocks.pricesList,
    },
  })),
}));

import { GET } from '../app/api/stripe/checkout/route';

describe('/api/stripe/checkout', () => {
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_checkout';
    process.env.STRIPE_PRICE_TEAMS_ANNUAL = 'price_team_annual';
    clerkMocks.auth.mockResolvedValue({ userId: 'user_123' });
    clerkMocks.getUser.mockResolvedValue({
      publicMetadata: { stripeCustomerId: 'cus_existing' },
      primaryEmailAddress: { emailAddress: 'team@example.test' },
    });
    stripeMocks.checkoutSessionsCreate.mockResolvedValue({
      url: 'https://checkout.stripe.test/session',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_PRICE_TEAMS_ANNUAL;
  });

  it('sends cancelled checkouts back to the homepage pricing section', async () => {
    const res = await GET(
      new Request(
        'https://waggle.example/api/stripe/checkout?tier=teams&billing=annual',
      ),
    );

    expect(res.status).toBe(303);
    expect(stripeMocks.checkoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        cancel_url: 'https://waggle.example/?checkout=cancelled#pricing',
      }),
    );
  });

  it('sends signed-out users to sign-in and preserves the checkout target', async () => {
    clerkMocks.auth.mockResolvedValueOnce({ userId: null });

    const res = await GET(
      new Request(
        'https://waggle.example/api/stripe/checkout?tier=teams&billing=monthly',
      ),
    );

    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(
      'https://waggle.example/sign-in?redirect_url=%2Fapi%2Fstripe%2Fcheckout%3Ftier%3Dteams%26billing%3Dmonthly',
    );
    expect(stripeMocks.checkoutSessionsCreate).not.toHaveBeenCalled();
  });
});
