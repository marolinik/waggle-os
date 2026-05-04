import { NextResponse } from 'next/server';
import { clerkClient } from '@clerk/nextjs/server';
import Stripe from 'stripe';

/**
 * /api/webhooks/stripe — Stripe webhook receiver (Sesija E §5.3 Phase C).
 *
 * Verifies signature against STRIPE_WEBHOOK_SECRET, then mirrors subscription
 * state from Stripe → Clerk user.publicMetadata so the Next.js app can gate
 * features on tier/status without round-tripping to Stripe on every request.
 *
 * Handled events:
 *   checkout.session.completed     → set tier + status='active'
 *   customer.subscription.updated  → map status, refresh tier
 *   customer.subscription.deleted  → status='canceled'
 *
 * Linkage strategy: every Checkout Session and Subscription gets
 * `metadata.clerkUserId` set by the checkout route. As a fallback, the Stripe
 * Customer also carries `metadata.clerkUserId` (set during lazy-create), so
 * subscription events that lack metadata can still resolve the user.
 *
 * Returns 200 quickly so Stripe's retry queue stays clean. Handler errors
 * surface as 500 (Stripe will retry up to its standard backoff schedule).
 */

type Tier = 'pro' | 'teams';

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

function isValidStripeKey(key: string | undefined): key is string {
  return (
    typeof key === 'string' &&
    (key.startsWith('sk_test_') || key.startsWith('sk_live_'))
  );
}

function isValidWebhookSecret(value: string | undefined): value is string {
  return typeof value === 'string' && value.startsWith('whsec_');
}

function asTier(value: unknown): Tier | undefined {
  return value === 'pro' || value === 'teams' ? value : undefined;
}

function mapStatus(
  status: Stripe.Subscription.Status,
): NonNullable<ClerkPublicMetadata['subscriptionStatus']> {
  // Collapse Stripe's 8 statuses into the 5 we expose to the app:
  //   active | past_due | canceled | trialing | incomplete
  switch (status) {
    case 'active':
    case 'past_due':
    case 'canceled':
    case 'trialing':
    case 'incomplete':
      return status;
    case 'unpaid':
    case 'incomplete_expired':
      return 'past_due';
    case 'paused':
      return 'canceled';
    default:
      return 'incomplete';
  }
}

async function findClerkUserIdFromCustomer(
  customerId: string,
  stripe: Stripe,
): Promise<string | null> {
  const customer = await stripe.customers.retrieve(customerId);
  if ('deleted' in customer && customer.deleted) return null;
  const meta = (customer as Stripe.Customer).metadata;
  return meta?.clerkUserId ?? null;
}

async function patchClerkPublicMetadata(
  userId: string,
  patch: Partial<ClerkPublicMetadata>,
): Promise<void> {
  const cc = await clerkClient();
  const user = await cc.users.getUser(userId);
  const current = (user.publicMetadata ?? {}) as ClerkPublicMetadata;
  await cc.users.updateUserMetadata(userId, {
    publicMetadata: { ...current, ...patch } satisfies ClerkPublicMetadata,
  });
}

async function handleCheckoutCompleted(
  event: Stripe.CheckoutSessionCompletedEvent,
): Promise<void> {
  const session = event.data.object;
  const userId = session.metadata?.clerkUserId;
  const tier = asTier(session.metadata?.tier);
  if (!userId || !tier) return;

  await patchClerkPublicMetadata(userId, {
    subscriptionTier: tier,
    subscriptionStatus: 'active',
  });
}

async function handleSubscriptionUpdated(
  event: Stripe.CustomerSubscriptionUpdatedEvent,
  stripe: Stripe,
): Promise<void> {
  const sub = event.data.object;
  const userId =
    sub.metadata?.clerkUserId ??
    (typeof sub.customer === 'string'
      ? await findClerkUserIdFromCustomer(sub.customer, stripe)
      : null);
  if (!userId) return;

  const tier = asTier(sub.metadata?.tier);
  const patch: ClerkPublicMetadata = {
    subscriptionStatus: mapStatus(sub.status),
    ...(tier ? { subscriptionTier: tier } : {}),
  };

  await patchClerkPublicMetadata(userId, patch);
}

async function handleSubscriptionDeleted(
  event: Stripe.CustomerSubscriptionDeletedEvent,
  stripe: Stripe,
): Promise<void> {
  const sub = event.data.object;
  const userId =
    sub.metadata?.clerkUserId ??
    (typeof sub.customer === 'string'
      ? await findClerkUserIdFromCustomer(sub.customer, stripe)
      : null);
  if (!userId) return;

  await patchClerkPublicMetadata(userId, { subscriptionStatus: 'canceled' });
}

export async function POST(req: Request): Promise<NextResponse> {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!isValidStripeKey(secretKey)) {
    return NextResponse.json(
      { message: 'Stripe not configured (STRIPE_SECRET_KEY missing/invalid)' },
      { status: 503 },
    );
  }
  if (!isValidWebhookSecret(webhookSecret)) {
    return NextResponse.json(
      {
        message:
          'Webhook secret not configured (STRIPE_WEBHOOK_SECRET missing/invalid)',
      },
      { status: 503 },
    );
  }

  const sig = req.headers.get('stripe-signature');
  if (!sig) {
    return NextResponse.json(
      { message: 'Missing stripe-signature header' },
      { status: 400 },
    );
  }

  const rawBody = await req.text();
  const stripe = new Stripe(secretKey);

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Invalid signature';
    return NextResponse.json(
      { message: `Signature verification failed: ${msg}` },
      { status: 400 },
    );
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event, stripe);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event, stripe);
        break;
      default:
        // Unhandled events ack with 200 — Stripe will keep delivering them
        // even if we don't act, so just no-op rather than returning an error.
        break;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Handler error';
    return NextResponse.json(
      { message: `Handler error: ${msg}`, eventType: event.type },
      { status: 500 },
    );
  }

  return NextResponse.json({ received: true, eventType: event.type });
}
