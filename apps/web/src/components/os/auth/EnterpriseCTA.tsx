/**
 * EnterpriseCTA — PR7b Auth (design §2d, D15). The SSO/enterprise panel as a custom
 * "Talk to sales → KVARK/Teams" CTA. NOT a live SAML/SCIM form: those are
 * Teams/KVARK/Clerk-Enterprise features, so rendering a working-looking SAML form would
 * be a fabrication (F11 / recon 03 §5.5). This is the KVARK funnel.
 */
export default function EnterpriseCTA() {
  return (
    <div className="mt-6 pt-5 border-t border-[var(--line-soft)] text-center">
      <p className="text-[12px] leading-relaxed text-[var(--text-muted)]">
        SAML, SCIM provisioning, and audit logs are available on{' '}
        <b className="text-foreground">Teams</b> and <b className="text-foreground">KVARK</b>.
      </p>
      <a
        href="https://www.kvark.ai"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block mt-1.5 text-[12.5px] font-[650] text-primary hover:text-[var(--honey-bright)] transition-colors"
      >
        Talk to sales →
      </a>
    </div>
  );
}
