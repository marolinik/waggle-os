# Egzakta Legal Text Drafts — Day-0 Placeholder

**Status:** DRAFT — for Marko review before swap into `apps/www/app/(legal)/*/page.tsx`
**Disposition:** generic-but-plausible legal text; replaces lorem ipsum but keeps `noindex` on
**Long-term:** to be replaced by Egzakta legal counsel-reviewed text within T+30d
**Authoring stance:** pragmatic boilerplate covering actual data flows (Stripe + Clerk + PostHog + local-only memory). NOT a substitute for actual legal review.

---

## How to use these drafts

1. Read each block below.
2. For each, copy the text between `BEGIN BODY` and `END BODY` markers.
3. Replace the lorem-ipsum body in the corresponding `apps/www/app/(legal)/<route>/page.tsx`.
4. Keep the existing `robots: { index: false, follow: false }` in metadata.
5. Replace the `pendingNoteStyle` paragraph ("Content pending Egzakta Group legal review...") with the new opening paragraph from each draft below.
6. **OR**: tell CC "swap drafts into legal route group" and CC handles the file edits in one commit.

---

## Block 1 — Privacy Policy

**Route:** `apps/www/app/(legal)/privacy/page.tsx`
**Heading:** Privacy Policy

```
BEGIN BODY

**Effective date:** [Day-0 launch date]
**Last updated:** [Day-0 launch date]

Waggle OS is provided by Egzakta Group d.o.o. ("Egzakta", "we", "us"), a company
registered in the Republic of Serbia. This Privacy Policy explains what personal
data we collect, how we use it, and your rights.

### 1. Data we collect

- **Account data**: when you sign up via Clerk, we collect your email address,
  display name, and optional profile information. Clerk Inc. processes this data
  as an authentication sub-processor under their own privacy policy
  (https://clerk.com/privacy).
- **Subscription data**: when you upgrade to Pro or Teams, Stripe Inc. processes
  your payment information. We never see or store your card details — Stripe
  returns only a customer ID and subscription status to us. Stripe's privacy
  practices: https://stripe.com/privacy.
- **Product analytics**: with your opt-in (default off), we collect
  anonymous usage events (onboarding completion, feature interactions) via
  PostHog Inc. to improve the product. You can opt out at any time in Settings
  → Privacy. PostHog's privacy: https://posthog.com/privacy.
- **Local memory**: Waggle OS stores your conversations, memories, and harvested
  content **locally on your device** in a SQLite database (`.waggle/` directory).
  We do not transmit this data to our servers. If you choose to enable shared
  team workspaces (Teams tier), encrypted memory bundles are stored on our
  infrastructure for synchronization; you control which workspaces sync.

### 2. How we use your data

- Provide the Service (authentication, subscription management, support).
- Improve the Service (analytics where you've opted in).
- Comply with legal obligations (tax records, fraud prevention).
- We do not sell your personal data and do not use it for advertising.

### 3. Where your data lives

- Account + subscription data: Clerk + Stripe (US- and EU-region processors).
- Analytics (opt-in only): PostHog (US-region).
- Memory + conversations: your device. Optionally your Teams workspace bundle.
- Egzakta's own systems: minimal account + billing metadata in encrypted storage.

### 4. Your rights (GDPR + similar regimes)

You have the right to access, rectify, port, restrict, or delete your personal
data, and to object to processing. To exercise these rights, email
**privacy@egzakta.com**. We aim to respond within 30 days.

Local memory data: you can erase all locally-stored data at any time via
Settings → Privacy → Erase All Data. This is irreversible and does not require
contacting us.

### 5. Retention

- Account data: retained while your account is active + 90 days after deletion
  for billing reconciliation.
- Subscription data: retained per Stripe's record-keeping requirements (typically
  7 years for accounting).
- Analytics (opt-in only): retained 12 months.
- Local memory: retained until you delete it. Egzakta has no access.

### 6. Cookies and tracking

We use strictly-necessary cookies for authentication (Clerk session) and, with
your opt-in, analytics cookies (PostHog). See our [Cookie Policy](/cookies).

### 7. Changes to this policy

We may update this policy. Material changes will be announced via the product
and email. Continued use after a change means you accept the updated terms.

### 8. Contact

Egzakta Group d.o.o.
[Egzakta registered address — Marko to fill]
Email: **privacy@egzakta.com**
Data Protection Officer: **dpo@egzakta.com** (designated point of contact for
EU residents)

END BODY
```

---

## Block 2 — Terms of Service

**Route:** `apps/www/app/(legal)/terms/page.tsx`
**Heading:** Terms of Service

```
BEGIN BODY

**Effective date:** [Day-0 launch date]
**Last updated:** [Day-0 launch date]

These Terms of Service ("Terms") govern your use of Waggle OS (the "Service"),
provided by Egzakta Group d.o.o. ("Egzakta", "we", "us"). By creating an
account or installing the Waggle desktop application, you agree to these Terms.

### 1. The Service

Waggle OS is a desktop AI agent platform with persistent local memory. The
Service includes the Waggle desktop application, the cloud-hosted account
infrastructure, and optional team collaboration features.

### 2. Account

You must be at least 16 years old to use the Service. You are responsible for
maintaining the confidentiality of your account credentials. You agree to
provide accurate and current information when creating an account.

### 3. Acceptable use

You agree not to:
- Use the Service to violate any law or third-party rights.
- Attempt to reverse-engineer, modify, or interfere with the Service's
  protections.
- Use the Service to generate content that infringes intellectual property,
  defames individuals, or violates privacy.
- Submit data you do not have the right to submit (including confidential or
  copyrighted third-party content).
- Use the Service to develop or train competing AI products.

### 4. Subscription and billing

Free tier: available at no cost, subject to documented usage limits.
Pro tier (USD 19/month): unlocks advanced features and unlimited memory.
Teams tier (USD 49/seat/month): adds shared workspaces and team collaboration.

Subscriptions are billed in advance through Stripe. Auto-renewal is on by
default; you can cancel at any time in account settings. Cancellations take
effect at the end of the current billing period. We do not refund partial
periods except where required by law.

### 5. Trial

A free 15-day trial of all features is available to new accounts. If you do
not subscribe at trial end, your account converts to the Free tier and trial
features become inaccessible. Trial data is retained per the Privacy Policy.

### 6. Intellectual property

You retain ownership of content you create, store, or process via the Service.
You grant Egzakta a limited license to host and process your content solely
to provide the Service.

Egzakta retains all rights in the Service, including source code,
documentation, and marketing materials. Open-source components are governed
by their respective licenses (notably Apache 2.0 for the hive-mind substrate).

### 7. Disclaimer of warranties

The Service is provided "as is" without warranties of any kind. We do not
warrant that the Service will be uninterrupted, error-free, or that AI-
generated outputs will be accurate, complete, or fit for any particular
purpose. You are responsible for verifying AI-generated content before
acting on it.

### 8. Limitation of liability

To the maximum extent permitted by law, Egzakta's total liability for any
claim arising from the Service is limited to the fees you paid Egzakta in
the 12 months preceding the claim. We are not liable for indirect, incidental,
or consequential damages.

### 9. Termination

Either party may terminate at any time. We may suspend or terminate your
account for material breach of these Terms. Upon termination, you may
export your data for 30 days; after that, we may delete your account data
in accordance with the Privacy Policy.

### 10. Governing law

These Terms are governed by the laws of the Republic of Serbia. Disputes
shall be resolved in the competent courts of Belgrade, Serbia, except where
mandatory consumer protection laws in your jurisdiction provide otherwise.

### 11. Changes to the Terms

We may update these Terms. Material changes will be announced at least 30
days in advance via the product and email. Continued use after the change
means you accept the updated Terms.

### 12. Contact

Egzakta Group d.o.o.
[Egzakta registered address — Marko to fill]
Email: **legal@egzakta.com**

END BODY
```

---

## Block 3 — Cookie Policy

**Route:** `apps/www/app/(legal)/cookies/page.tsx`
**Heading:** Cookie Policy

```
BEGIN BODY

**Effective date:** [Day-0 launch date]
**Last updated:** [Day-0 launch date]

This Cookie Policy explains how Waggle OS uses cookies and similar technologies
on its web properties (the marketing site at waggle-os.ai and any in-product
web views).

### 1. What cookies are

Cookies are small text files stored by your browser when you visit a website.
They allow the site to remember information about your visit (e.g., your
login state). Similar technologies include local storage, session storage,
and pixels.

### 2. Cookies we use

#### Strictly necessary

These cookies are required for the Service to function and cannot be disabled.

- **Clerk session cookies** — keep you logged in. Set by `clerk.waggle-os.ai`.
  Cleared on logout.
- **CSRF protection** — prevents cross-site request forgery. Cleared on tab close.

#### Analytics (opt-in)

These cookies are loaded only if you opt in via Settings → Privacy → "Allow
anonymous product analytics." Default is opt-out.

- **PostHog `ph_*` cookies** — capture anonymous usage events for product
  improvement. We do not use PostHog session recordings, do not capture form
  inputs, and do not link analytics to your account email.

### 3. No advertising or social-media tracking

We do not use third-party advertising networks, social-media pixels (Meta,
TikTok, X), or cross-site tracking. We do not sell or share data with
advertisers.

### 4. Managing cookies

You can clear cookies through your browser settings. For granular control of
the analytics cookie, use Settings → Privacy in the Waggle product.

### 5. Changes to this policy

We may update this Cookie Policy. Material changes will be announced via
the product and email.

### 6. Contact

Email: **privacy@egzakta.com**

END BODY
```

---

## Block 4 — EU AI Act Statement

**Route:** `apps/www/app/(legal)/eu-ai-act/page.tsx`
**Heading:** EU AI Act Statement

```
BEGIN BODY

**Effective date:** [Day-0 launch date]
**Last updated:** [Day-0 launch date]

Egzakta Group d.o.o. ("we") publishes this statement to describe how Waggle OS
relates to Regulation (EU) 2024/1689 ("EU AI Act"). Our intent is to be a
transparent participant in the AI value chain, even as the EU AI Act's
provisions phase in through 2026.

### 1. Our role in the AI value chain

Waggle OS is a **deployer** (sometimes called "deployer of AI systems") under
EU AI Act terminology when end-users install the Waggle desktop application
and use it for their own purposes. Egzakta is **not** a provider of general-
purpose AI models (GPAI providers — defined in Article 51). Waggle OS routes
user requests to third-party AI providers (Anthropic, OpenAI, Mistral, and
others). The underlying GPAI providers fulfill the obligations applicable
to them.

### 2. Article 50 — transparency obligations

We comply with the transparency obligations of Article 50 by:
- **Clearly labeling AI-generated output**: the Waggle UI marks AI-generated
  responses as such; the user always knows they are interacting with an AI
  system.
- **Disclosing system prompts on request**: users can view the active persona's
  system prompt in Settings → Personas → [persona] → System Prompt.
- **No deepfake generation**: Waggle OS does not generate synthetic images,
  audio, or video that could be confused with authentic media.

### 3. Article 5 — prohibited practices

Waggle OS does not implement, encourage, or facilitate any prohibited AI
practice under Article 5, including:
- Subliminal manipulation or exploitation of vulnerabilities.
- Social scoring of natural persons.
- Real-time remote biometric identification in publicly accessible spaces.
- Emotion inference in workplace or education contexts.

### 4. High-risk AI systems

Waggle OS in its default consumer configuration is not a high-risk AI system
under Annex III. If users deploy Waggle OS for high-risk purposes (e.g.,
employment screening, credit scoring), the deployer is responsible for
fulfilling the obligations applicable to that high-risk system.

### 5. General-purpose AI (GPAI) considerations

Waggle OS depends on GPAI models provided by third parties. Those providers
publish their own EU AI Act compliance information:
- Anthropic: https://www.anthropic.com/eu-ai-act
- OpenAI: https://openai.com/eu-ai-act
- Mistral: https://mistral.ai/eu-ai-act

### 6. Risk management and documentation

Egzakta maintains internal documentation of:
- Models routed to and their provenance.
- Safety testing for the persona system + behavioral spec.
- The evolution subsystem (see arxiv paper, pending submission).
- User-facing transparency mechanisms.

We will publish a public AI risk management summary by Article 50's effective
date (2026-08-02 for Article 50 obligations).

### 7. Data protection alignment

Personal data handling is governed by our [Privacy Policy](/privacy) and the
GDPR. We do not train AI models on user data without explicit consent. Local
memory data never leaves the user's device unless they explicitly enable team
sharing (Teams tier).

### 8. Contact for data subject and EU AI Act inquiries

Email: **ai-compliance@egzakta.com**
Data Protection Officer: **dpo@egzakta.com**
Registered representative for EU AI Act purposes: [to be designated if/when
Egzakta has no Union establishment per Article 25].

END BODY
```

---

## Marko-side TODOs before swapping these in

1. **Confirm Egzakta registered address** for the Privacy + Terms contact blocks.
2. **Designate** `privacy@egzakta.com` + `legal@egzakta.com` + `dpo@egzakta.com` + `ai-compliance@egzakta.com` mailboxes (or alias them to a single forwarder).
3. **Set effective date** = your chosen Day-0 launch date (e.g., 2026-05-15).
4. **Ratify** the EU AI Act framing — specifically the "deployer not GPAI provider" classification. This is the standard read for an aggregator like Waggle but Egzakta legal counsel should sign off in T+30d.
5. **Decide** whether to keep `robots: noindex` on Day-0 (recommended for placeholder text) or remove once Egzakta legal review concludes.

---

## Disposition options

- **Option A (recommended for Day-0):** Tell CC "swap drafts into legal route group" and CC does the 4 file edits in one commit (`docs(legal): replace lorem ipsum with Day-0 placeholder text per egzakta-legal-text-drafts.md`). `noindex` stays on. Egzakta legal does proper review in T+30d.
- **Option B:** You hand these drafts to Egzakta legal counsel for review, they redline, CC swaps the final versions. T+5-15d.
- **Option C:** Ship as lorem ipsum + noindex placeholder for Day-0 launch. These drafts stay in `docs/launch/drafts/` for future swap. Cheapest path, weakest signal to any pilot user who clicks through.

---

*Drafted 2026-05-12 by CC for Marko ratification. Not a substitute for legal review.*
