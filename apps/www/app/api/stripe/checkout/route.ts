import { NextResponse } from 'next/server';
import Stripe from 'stripe';

/**
 * POST /api/stripe/checkout
 *
 * Internal Stripe Checkout Session creator. Replaces the legacy external
 * call to cloud.waggle-os.ai/api/stripe/create-checkout-session per amendment
 * §3 acceptance criterion #12.
 *
 * Behavior per §0.b PM ratification:
 *   - When STRIPE_SECRET_KEY is missing or equals the placeholder value
 *     "sk_test_REPLACE_ME", the route returns 503 with a "configuration
 *     required" message instead of attempting a real Stripe call.
 *   - Real keys are a Marko-side pre-launch action (Monday with finance).
 *
 * Body: { tier: "PRO" | "TEAMS", billingPeriod: "monthly" | "annual" }
 * Returns: { url: string } on success, { message: string } on error.
 */

const PLACEHOLDER_KEY = 'sk_test_REPLACE_ME';

const VALID_TIERS = ['PRO', 'TEAMS'] as const;
const VALID_BILLING = ['monthly', 'annual'] as const;

type Tier = (typeof VALID_TIERS)[number];
type Billing = (typeof VALID_BILLING)[number];

interface CheckoutBody {
  readonly tier?: unknown;
  readonly billingPeriod?: unknown;
}

function isPlaceholderOrMissing(key: string | undefined): boolean {
  return !key || key === PLACEHOLDER_KEY || key.startsWith('pk_test_REPLACE_ME');
}

function getPriceId(tier: Tier, billing: Billing): string | undefined {
  const envKey = `STRIPE_PRICE_${tier}_${billing.toUpperCase()}`;
  const value = process.env[envKey];
  return value && !value.startsWith('price_REPLACE_ME') ? value : undefined;
}

export async function POST(req: Request): Promise<NextResponse> {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  // Placeholder env vars → 503 configuration required (per §0.b).
  if (isPlaceholderOrMissing(secretKey)) {
    return NextResponse.json(
      {
        message:
          'Stripe checkout configuration required. Real keys are a pre-launch action — try again after the Stripe wiring is live.',
      },
      { status: 503 },
    );
  }

  // Parse + validate body.
  let body: CheckoutBody;
  try {
    body = (await req.json()) as CheckoutBody;
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  const tier = body.tier;
  const billing = body.billingPeriod;
  if (
    typeof tier !== 'string' ||
    typeof billing !== 'string' ||
    !VALID_TIERS.includes(tier as Tier) ||
    !VALID_BILLING.includes(billing as Billing)
  ) {
    return NextResponse.json(
      {
        message: `Invalid request. tier must be one of ${VALID_TIERS.join('|')}, billingPeriod must be one of ${VALID_BILLING.join('|')}.`,
      },
      { status: 400 },
    );
  }

  const priceId = getPriceId(tier as Tier, billing as Billing);
  if (!priceId) {
    return NextResponse.json(
      {
        message: `Stripe price ID not configured for ${tier}/${billing}. Set STRIPE_PRICE_${tier}_${billing.toUpperCase()} in env.`,
      },
      { status: 503 },
    );
  }

  // Create checkout session.
  const stripe = new Stripe(secretKey as string);
  const origin = req.headers.get('origin') ?? 'https://waggle-os.ai';

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/pricing?session_id={CHECKOUT_SESSION_ID}&status=success`,
      cancel_url: `${origin}/pricing?status=cancelled`,
      metadata: { tier, billingPeriod: billing },
    });

    if (!session.url) {
      return NextResponse.json(
        { message: 'Stripe session created without redirect URL' },
        { status: 500 },
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Stripe API error';
    return NextResponse.json({ message }, { status: 500 });
  }
}
