/**
 * Stub event taxonomy for the v3.2 landing per amendment §2.1.
 *
 * Logs to console in development; no-op in production. Replace with a real
 * analytics provider (PostHog / Plausible) in Phase 2.
 */

export interface LandingEvent {
  readonly name: string;
  readonly properties?: Record<string, unknown>;
}

export const events = {
  pageView: 'landing.page_view',
  sectionVisible: 'landing.section_visible',
  ctaClick: 'landing.cta_click',
  pricingBillingToggle: 'landing.pricing.billing_toggle.changed',
} as const;

export function emit(event: LandingEvent): void {
  if (process.env.NODE_ENV === 'production') return;
  // eslint-disable-next-line no-console
  console.info('[landing.event]', event.name, event.properties ?? {});
}
