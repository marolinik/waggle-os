# hive-mind v0.1.0 SHIPPED na npm

**Datum**: 2026-04-19
**Status**: LIVE — 4/4 paketi, GitHub Release javan
**Vreme završetka**: 22:54:49Z (Claude Code confirmation)
**Izvor**: Claude Code handoff u hive-mind repo-u (`memory/project_session_handoff_0419_s1.md`)

## Artefakti koji su live

- **4/4 npm paketi HTTP 200**: @hive-mind/core, wiki-compiler, mcp-server, cli (svi v0.1.0)
- **GitHub Release v0.1.0**: https://github.com/marolinik/hive-mind/releases/tag/v0.1.0
  - Published status (ne draft, ne prerelease)
  - Marked as latest stable public release

## Scope što je pala u jednu sesiju

Ceo `hive-mind-ci-npm-publish-brief-2026-04-19.md` brief se izvršio: CI pipeline,
package metadata hardening, README normalizacija, CHANGELOG v0.1.0, first-run smoke,
npm dry-run + publish, GitHub Release. Jedna sesija, jedan fokus, sve ciljeve
pogođeno.

## Security incident — pending detail

Claude Code je u handoff-u zabeležio "security incident noted". Detalj nije poznat
iz chat konteksta — mora se pročitati iz `memory/project_session_handoff_0419_s1.md`
u hive-mind repo-u (trenutno nije mounted u PM-Waggle-OS workspace).

Mogući kandidati (hipoteze):
1. Token leak u git history (npm token accidentally commit-ovan, mora history rewrite)
2. Exposed secret u package tarball (npm paketi sadrže nešto što ne treba — API key, .env)
3. 2FA bypass warning eskalirao na stvarnu exposure situaciju
4. Dependency vulnerability u package.json lockfile-u detektovana tokom CI-a

Akcija: Marko mora verifikovati koji je scenario pre nego što se otvara sledeća
sesija. Ako je tipa 1 ili 2, treba hitna remedijacija (npm unpublish unutar 72h prozora,
rotacija svih tokena, git history scrub).

## Šta je otvoreno posle 0.1.0 ship-a

Tri trek opcije koje je Claude Code identifikovao:

- **Track A — v0.1.x follow-ups** (hive-mind polish)
  - Cross-platform CI matrix (Windows, macOS)
  - Trusted Publishing migration (OIDC federation, no long-lived token)
  - GitHub Pages docs site
  - Community onboarding (CONTRIBUTING.md, CODE_OF_CONDUCT.md, issue templates)
  - Nijedan ne blokira launch. Low priority.

- **Track B — benchmarks + waggle-os** (critical path)
  - v2 GEPA eksperiment (čeka [M]-02 judge model revision — Marko decision)
  - LoCoMo benchmark runs H-42/43/44 (preduslov SOTA proof-a)
  - Remaining waggle-os launch hardening (Stripe svix, i18n, auth handshake)
  - Ovo je jedini preostali tehnički path do launch-a.

- **Track C — announcement draft** (marketing)
  - Blog post, LinkedIn threads, press outreach
  - Persona-aware varijante (P8 Aisha press analyst iz persona research Rev 1)
  - Bez benchmark dokaza, samo "we shipped" story — weak.
  - Može u PM-Waggle-OS kao draft dok benchmark radi.

## LOCKED preporuka (ako Marko pita)

Sledeća Claude Code sesija ide na **Track B**, sekvenca:
1. Marko odluka o [M]-02 judge model revision (pre sesije)
2. v2 GEPA eksperiment rerun (1 sesija)
3. LoCoMo benchmark H-42/43/44 (1-2 sesije)

Paralelno u PM-Waggle-OS: Track C announcement draft rad, bez publikovanja dok
benchmark ne padne. Track A ide community/external kad projekt dobije kontribucije.
