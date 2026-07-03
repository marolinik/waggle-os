# Security Policy

Waggle OS runs on a user's own machine and touches sensitive material — API
keys, connector credentials, the local filesystem, and imported conversation
history. We take reports seriously and appreciate responsible disclosure.

For the trust boundary, the controls that enforce it, and the currently known
gaps, read [`THREAT_MODEL.md`](./THREAT_MODEL.md). It is the authoritative
description of what Waggle defends against and what it does not.

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Report privately through either channel:

1. **GitHub Security Advisories (preferred).** On the repository, go to the
   **Security** tab → **Report a vulnerability**. This opens a private advisory
   visible only to the maintainers.
2. **Email.** Send details to **marko@egzakta.com** with `SECURITY` in the
   subject line.

Please include:

- A description of the issue and the impact you believe it has.
- Step-by-step reproduction instructions (or a proof of concept).
- The affected component/package and version or commit SHA.
- Your environment (OS, Node version, desktop build vs. web).

## What to Expect

- **Acknowledgement** within 5 business days.
- An initial assessment and severity classification shortly after.
- Coordinated disclosure: we will agree on a timeline with you and credit you in
  the release notes unless you prefer to remain anonymous.

Please give us a reasonable window to release a fix before any public
disclosure.

## Scope

In scope:

- The desktop app (Tauri shell + bundled sidecar), the web app, and the
  workspace packages under `packages/` and `apps/`.
- The memory substrate (`packages/hive-mind-core`) and its MCP servers.
- Prompt-injection paths, secret handling (the vault), the filesystem boundary,
  and the capability/approval gates — see `THREAT_MODEL.md` for the details.

Out of scope (documented, not vulnerabilities):

- The known gaps enumerated in `THREAT_MODEL.md` (e.g. the pattern-based
  injection scanner and the absence of an OS-level shell sandbox). If you can
  demonstrate impact meaningfully beyond what is already documented there, we
  still want to hear about it.
- Findings that require a compromised operator account or physical access to the
  user's machine — the operator is trusted by design.

## Secrets

If a report involves an exposed secret (an API key, token, or credential), note
it explicitly so we can rotate it immediately. Never include live secrets in a
public issue or PR.
