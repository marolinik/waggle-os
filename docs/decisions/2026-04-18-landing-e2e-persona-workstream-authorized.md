# Decision — Landing & E2E Persona Workstream Authorized

**Datum**: 2026-04-18
**Donosilac**: Marko Marković
**Status**: LOCKED

## Odluka

Pokreće se formalni šestofazni workstream u PM-Waggle-OS za landing page i E2E persona testiranje, paralelno sa kod-side radom Claude Code-a na H-34 hive-mind extraction-u i v2 GEPA eksperimentu.

Scope workstream-a (per `strategy/landing/WORKSTREAM-PLAN-2026-04-18.md`):
1. Persona research (users → konkurencija → pozicioniranje → persone)
2. Landing information architecture
3. Copy (engleski, i18n-ready struktura)
4. Wireframes (low-fi, klikalni)
5. Visual design sa Claude design system referencom
6. E2E persona testing pack-ovi koje Marko manuelno izvršava

## Potvrđeni principi

- **Engleski copy first, i18n infra predefinisana** — svaki string externalizovan tako da dodavanje bilo kog locale-a bude dodavanje fajla, ne refaktor.
- **Merljivost** — svaki journey kvantitativan (event schema, funnel-i, conversion metrike) plus kvalitativan (friction log, JTBD satisfaction).
- **Control-gate** — posle svake faze obavezno Marko QA pre sledeće faze. Ne "plan → execute", nego "plan → control → execute".
- **Launch uslov** — Waggle OS + memorija + benchmark dokazi + merljivi rezultati, sve zajedno. Ship together, ne fragmentarno.

## Kod-side dependency

Brief `briefs/landing-auth-infra-brief-2026-04-18.md` položen kao pending artefakt sa sedam gap-ova (P0.1 svix, P0.2 auth handshake, P0.3 beta signup, P1.1 i18n, P1.2 analytics, P1.3 content scaffolding, P2.x polish). Integracija u BACKLOG-MASTER-2026-04-18.md v2 kao H13 blok se dešava kad Claude Code spusti trenutni backlog.

## Marko-side queue inkrement

Predloženo dodavanje [M]-15 (Auth architecture decision) i [M]-16 (Beta signup capture mechanism) u Marko-side queue na sledećem backlog reconciliation pass-u.

## Sledeći korak

Po autorizaciji u ovoj sesiji, krećem Fazu 1 — Persona Research — kad Marko kaže "krećemo". Do tada workstream plan i brief stoje kao položeni artefakti, spremni za izvršenje.
