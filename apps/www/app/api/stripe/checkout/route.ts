import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import Stripe from 'stripe';

/**
 * /api/stripe/checkout — Stripe Checkout Session creator with Clerk linkage.
 *
 * Sesija E §5.3 Phase C: lazy-create Stripe Customer pattern. On first
 * paid checkout for a user we create the Customer, store its id in
 * `Clerk.user.publicMetadata.stripeCustomerId`, and reuse it forever after.
 * Customer.metadata.clerkUserId mirrors the linkage in the other direction
 * so subscription webhooks can map back to a Clerk user.
 *
 * GET ?tier=pro|teams&billing=monthly|annual
 *   - Canonical entrypoint (per §5.3 brief). Used by Clerk SignUp's
 *     `forceRedirectUrl` after sign-up completion.
 *   - Returns 303 redirect to the Stripe Checkout URL on success.
 *   - Signed-out: 303 to /sign-in with redirect_url back to this endpoint.
 *
 * POST { tier, billingPeriod }
 *   - Backward-compat shim for the existing Pricing.tsx button. §5.4 will
 *     migrate Pricing.tsx to the GET-based flow and this handler can go away.
 *   - Returns JSON { url } on success or { message } on error.
 *   - Signed-out: 401 JSON { message }.
 */

type Tier = 'pro' | 'teams';
type Billing = 'monthly' | 'annual';

const TIERS: readonly Tier[] = ['pro', 'teams'];
const BILLINGS: readonly Billing[] = ['monthly', 'annual'];

interface ClerkPublicMetadata {
  readonly stripeCustomerId?: string;
  readonly subscriptionTier?: Tier;
  readonly subscriptionStatus?:
    | 'active'
    | 'past_due'
    | 'canceled'
    | 'trialing'
    | 'incomplete';
}

interface CheckoutSuccess {
  readonly kind: 'success';
  readonly url: string;
}

interface CheckoutAuthRedirect {
  readonly kind: 'auth_required';
  readonly signInUrl: string;
}

interface CheckoutFailure {
  readonly kind: 'failure';
  readonly status: number;
  readonly message: string;
}

type CheckoutResult = CheckoutSuccess | CheckoutAuthRedirect | CheckoutFailure;

function normalizeTier(value: unknown): Tier | null {
  if (typeof value !== 'string') return null;
  const lower = value.toLowerCase();
  return TIERS.includes(lower as Tier) ? (lower as Tier) : null;
}

function normalizeBilling(value: unknown): Billing | null {
  if (typeof value !== 'string') return null;
  const lower = value.toLowerCase();
  return BILLINGS.includes(lower as Billing) ? (lower as Billing) : null;
}

function isValidStripeKey(key: string | undefined): key is string {
  return (
    typeof key === 'string' &&
    (key.startsWith('sk_test_') || key.startsWith('sk_live_'))
  );
}

async function ensureStripeCustomer(
  userId: string,
  email: string | null,
  existingId: string | undefined,
  stripe: Stripe,
): Promise<string> {
  if (existingId) return existingId;

  const customer = await stripe.customers.create({
    email: email ?? undefined,
    metadata: { clerkUserId: userId },
  });

  const cc = await clerkClient();
  await cc.users.updateUserMetadata(userId, {
    publicMetadata: { stripeCustomerId: customer.id } satisfies ClerkPublicMetadata,
  });

  return customer.id;
}

async function resolvePriceId(
  stripe: Stripe,
  tier: Tier,
  billing: Billing,
): Promise<string | null> {
  // Prefer env-pinned IDs (zero round-trip). Fall back to lookup_key resolution
  // so the route still works in environments where price IDs aren't pinned.
  const envKey = `STRIPE_PRICE_${tier.toUpperCase()}_${billing.toUpperCase()}`;
  const pinned = process.env[envKey];
  if (pinned && pinned.startsWith('price_')) return pinned;

  const lookupKey = `${tier}_${billing}`;
  const list = await stripe.prices.list({
    lookup_keys: [lookupKey],
    active: true,
    limit: 1,
  });
  return list.data[0]?.id ?? null;
}

async function runCheckout(
  origin: string,
  tier: Tier,
  billing: Billing,
): Promise<CheckoutResult> {
  const { userId } = await auth();
  if (!userId) {
    const target = `/api/stripe/checkout?tier=${tier}&billing=${billing}`;
    return {
      kind: 'auth_required',
      signInUrl: `${origin}/sign-in?redirect_url=${encodeURIComponent(target)}`,
    };
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!isValidStripeKey(secretKey)) {
    return {
      kind: 'failure',
      status: 503,
      message:
        'Stripe checkout configuration required. Set STRIPE_SECRET_KEY in env (sk_test_* or sk_live_*).',
    };
  }

  const stripe = new Stripe(secretKey);

  const cc = await clerkClient();
  const user = await cc.users.getUser(userId);
  const publicMetadata = (user.publicMetadata ?? {}) as ClerkPublicMetadata;
  const email = user.primaryEmailAddress?.emailAddress ?? null;

  const customerId = await ensureStripeCustomer(
    userId,
    email,
    publicMetadata.stripeCustomerId,
    stripe,
  );

  const priceId = await resolvePriceId(stripe, tier, billing);
  if (!priceId) {
    return {
      kind: 'failure',
      status: 503,
      message: `No active Stripe price found for ${tier}/${billing}. Set STRIPE_PRICE_${tier.toUpperCase()}_${billing.toUpperCase()} or assign lookup_key="${tier}_${billing}".`,
    };
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/account?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/pricing?checkout=cancelled`,
    metadata: { clerkUserId: userId, tier, billing },
    subscription_data: {
      metadata: { clerkUserId: userId, tier, billing },
    },
  });

  if (!session.url) {
    return {
      kind: 'failure',
      status: 500,
      message: 'Stripe session created without redirect URL',
    };
  }

  return { kind: 'success', url: session.url };
}

function originOf(req: Request): string {
  const headerOrigin = req.headers.get('origin');
  if (headerOrigin) return headerOrigin;
  return new URL(req.url).origin;
}

async function safeRunCheckout(
  origin: string,
  tier: Tier,
  billing: Billing,
): Promise<CheckoutResult> {
  try {
    return await runCheckout(origin, tier, billing);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Stripe API error';
    return { kind: 'failure', status: 500, message };
  }
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const tier = normalizeTier(url.searchParams.get('tier'));
  const billing = normalizeBilling(url.searchParams.get('billing'));
  if (!tier || !billing) {
    return NextResponse.json(
      {
        message:
          'Invalid query. Expected ?tier=pro|teams&billing=monthly|annual.',
      },
      { status: 400 },
    );
  }

  const result = await safeRunCheckout(originOf(req), tier, billing);

  switch (result.kind) {
    case 'success':
      return Response.redirect(result.url, 303);
    case 'auth_required':
      return Response.redirect(result.signInUrl, 303);
    case 'failure':
      return NextResponse.json(
        { message: result.message },
        { status: result.status },
      );
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ message: 'Invalid body' }, { status: 400 });
  }

  const obj = body as Record<string, unknown>;
  const tier = normalizeTier(obj.tier);
  // Accept legacy field name `billingPeriod` from existing Pricing.tsx
  // alongside the new canonical `billing`.
  const billing = normalizeBilling(obj.billingPeriod ?? obj.billing);
  if (!tier || !billing) {
    return NextResponse.json(
      {
        message:
          'Invalid body. Expected { tier: "pro"|"teams", billingPeriod: "monthly"|"annual" }.',
      },
      { status: 400 },
    );
  }

  const result = await safeRunCheckout(originOf(req), tier, billing);

  switch (result.kind) {
    case 'success':
      return NextResponse.json({ url: result.url });
    case 'auth_required':
      return NextResponse.json(
        { message: 'Sign in required', signInUrl: result.signInUrl },
        { status: 401 },
      );
    case 'failure':
      return NextResponse.json(
        { message: result.message },
        { status: result.status },
      );
  }
}
