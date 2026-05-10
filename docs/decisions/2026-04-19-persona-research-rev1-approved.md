# Decision — Persona Research Rev 1 Approved, Faza 2 (IA) Authorized

**Datum**: 2026-04-19
**Odluka**: LOCKED
**Kontekst**: Marko odobrio Rev 1 dokument `strategy/landing/persona-research-2026-04-18-rev1.md` i autorizovao prelazak na Fazu 2 (Landing Information Architecture).

## Šta je zaključano

1. **11 persona finalno za v1 launch.** Nonprofit/NGO researcher i educator eksplicitno isključeni iz v1 (nemaju budget za Pro tier). Government digital agent se implicitno pokriva kroz Henrika (P10) i Klaudiju (P11).

2. **Centralna pozicijska teza §3.1 je interni anchor, ne copy.** Tri stuba (Kontinuitet, Lokalnost, Strukturna organizacija) drže. Hero per-persona reformulacija je Fazi 3 copy posao. §3.1 se NE menja sada.

3. **KVARK bridge na landingu = jedna sekcija, jedna generička rečenica, bez persona-targeted copy.** Klaudia, Yuki, Priya NE dobijaju KVARK-usmeren copy na landingu. CRM "KVARK qualification flag" je interni sales ops artefakt za 90-day review, ne landing signal.

4. **Split arhetipa H (P8 press + P9 enterprise) ostaje.** Ne spajati nazad — incentive structure i vreme reakcije različiti.

5. **Konsolidacija arhetipa D (P4 Eliza) ostaje.** Researcher + writer hibrid kao jedna persona sa sub-varijantama.

6. **Claude Memory diferencijator sa pet tačaka zaključan** kao najvidljivija kategorija konkurentske pokrivenosti na landingu. Peta tačka (enterprise kill-switch) ostaje strateški argument.

7. **Novi zahtev za Fazu 3 copy**: ChatGPT Memory (OpenAI equivalent) pokriva se kao **kratak paragraf** u okviru Claude Memory diferencijatora — NE kao nova persona, NE kao posebna sekcija. Varijanta iste pretnje.

## Pravila izvršenja za Fazu 2 (IA)

Sledeća pravila se prenose direktno iz Markovog odobrenja u IA dokument kao ograničenja dizajna:

1. Landing IA izvodi se iz 11 persona **journey events** iz §4 persona research-a, ne iz feature liste.
2. KVARK bridge = jedna sekcija, jedna rečenica, generična.
3. Proof points iz §3.4 (LoCoMo, Gemma 108.8%, Apache 2.0, zero-cloud, EU AI Act) dobijaju **dedicated sekciju** — ne razbacane.
4. CTA hijerarhija: **Download > Beta signup > Pro/Teams**. Desktop-first, ne SaaS-default.
5. Hero per-persona varijante se NE dizajniraju u Fazi 2 (to je Fazi 3 copy). IA MORA prihvatiti varijacije kroz `<PersonaHero persona="..." variant="..." />` pattern iz landing-auth-infra brief-a P1.3.
6. Anti-pattern lista iz §3.5 je obavezna referenca. Svaki IA izbor mora proći test "ne krši anti-pattern".

## Deliverable i control gate

- **Deliverable**: `strategy/landing/information-architecture-2026-04-19.md`
- **Estimat**: 0.5 sesije
- **Control gate**: Marko QA na IA draft pre prelaska na Fazu 3 (Copy)

## Paralelni status

Pending artefakt `briefs/landing-auth-infra-brief-2026-04-18.md` ostaje plasiran. Claude Code ga ne dira dok ne spusti H-34 extraction. Brief ostaje važeći jer IA koju sada produkujem mora biti kompatibilna sa P1.3 component scaffolding acceptance kriterijumima iz brief-a.

---

## Faza 2 IA Control-Gate 2 — Open Questions Resolutions (2026-04-19, kasnije iste sesije)

Marko odobrio IA draft `strategy/landing/information-architecture-2026-04-19.md` ("IA je ok") i odgovorio na svih 7 otvorenih pitanja iz §11. Sve zaključano kao LOCKED.

### 1. Annual billing discount — LOCKED 20%

- Pro: $19/mo monthly ili $182/year annual (20% ušteda).
- Teams: $49/seat/mo monthly ili $470/seat/year annual (20% ušteda po sedištu).
- Stripe konfiguracija zahteva dva price ID-a po tier-u. Ulazi u landing-auth-infra brief P2.
- Pricing toggle (Monthly | Annual) renderuje se u TierComparison komponenti, default Monthly.

### 2. /compare/<alternative> subpages — LOCKED defer u v1.1

- v1 ne nosi compare stranice. Differentiators sekcija na home-u kompresuje competitor coverage.
- SEO long-tail tactic planiran za v1.1 kad imamo javno objavljene benchmark rezultate sa preciznim brojevima protiv Mem0/Letta/Cognee/Notion AI/ChatGPT Memory.
- Prioritet u v1.1: vs Mem0 (najveća direktna konkurencija memory-layer), vs Letta (brand recall), vs ChatGPT Memory (consumer awareness anchor).

### 3. Hero secondary CTA — LOCKED "See Benchmarks"

- Default secondary CTA u Hero-u: "See Benchmarks" → vodi na `/benchmarks` subpage.
- /benchmarks subpage u v1 sadrži: LoCoMo metodologija paragraf, Waggle 91.6% target rezultat (kad padne), v1 Gemma 108.8% raw rezultat, comparison tabela vs Mem0/Letta/MemGPT.
- Demo video produkcija je nezavisan deliverable, ulazi kao A/B varijanta posle launch-a kad postoji baseline conversion data za "See Benchmarks" varijantu.

### 4. OS detection micro-caption — LOCKED pattern

- Server-side User-Agent header detection.
- Caption renderuje ispod Download CTA dugmeta:
  - macOS: "Download for macOS · Apple Silicon" (default M1+; ako je Intel detektovan → "Intel")
  - Windows: "Download for Windows · 64-bit"
  - Linux: "Download for Linux · .deb / .AppImage"
  - Fallback (mobile, neznano): "Download for your OS" → vodi na `/download` selector stranicu.
- Mobile uvek vidi "Download for your OS" jer Tauri 2.0 desktop app nije mobile-relevantan.

### 5. /manifesto subpage u v1 — LOCKED da

- Format: 300-500 reči, jedan scroll, Markov autorski glas, English first.
- Srpska verzija prebacuje se u v1.1 (ne ulazi u launch-blocking i18n setup).
- Faza 3 copy zadatak: skeleton sa core thesis ("LLM + memorija + retrieval + wiki = cognitive layer"), tri stuba (Kontinuitet, Lokalnost, Strukturna organizacija), cloud refusal kao etički stav. Marko finalizuje glas.

### 6. /press minimalan, BEZ Markove slike, Egzakta veza DA (factual) — LOCKED

- /press sadrži:
  - Jedan paragraf company description.
  - Logo download (PNG + SVG arhiva).
  - Press kontakt email (`press@waggle.dev` ili konačna varijanta).
  - 3-5 factual bullet-a (Apache 2.0, EU sovereign, benchmark rezultati, tier struktura, founding team).
  - Jedan red factual reference na Egzakta vezu: "Founded by Marko Marković, Partner at Egzakta Advisory (Belgrade) — 200-person consultancy active in regulated-industry digital transformation."
- NE sadrži: Markovu fotografiju, press releases listu, media coverage list, interview request forme.
- Egzakta logo u footer-u sa "founded by" ili "backed by" tagom — opciono, čeka tvoju potvrdu u Fazi 3 copy review-u (nije launch-blocking, može se dodati posle launch-a ako se pokaže relevantnim).

### 7. Klaudia UTM — LOCKED simplified (overshoot uklonjen)

Marko označio originalni predlog kao "overshooting". Skinuto:
- ❌ Sticky banner sa "You were referred by Egzakta Advisory" porukom — narušava landing aesthetics.
- ❌ KvarkBridge CTA tekstualna modifikacija na "Schedule pilot consultation" — kontradiktorno disciplini "jedna rečenica, jedan generički CTA" iz §3.5 anti-pattern liste.

Zadržano (minimal viable):
- ✅ UTM pattern: `?utm_source=egzakta&utm_medium=advisory&utm_campaign=banking-pilot` (ili campaign varijanta po sektoru: `pharma-pilot`, `gov-pilot`).
- ✅ PostHog event tagovanje: `referral_source=egzakta_advisory` na svaki event sesije sa tim UTM-om.
- ✅ CRM dedup: kad Klaudia klikne KvarkBridge CTA i submit-uje sales formu, CRM lead ima `source=egzakta_advisory` field auto-popunjen za high-touch routing.

Klaudia vidi standardni landing bez vidljivih UI razlika. Razlika je 100% u backend tagovanju i CRM routing-u. Ovo daje Egzakta advisory praksi pravo da pošalje Klaudie kroz dedicated link bez narušavanja landing brand discipline.

---

## Status posle Faze 2 control-gate 2

- ✅ Faza 2 IA — completed, approved, locked
- ⏭️ Faza 3 Copy — može krenuti čim:
  1. Claude Code engineering audit potvrdi da landing-auth-infra brief može ući u sprint (pending H-34 spuštanje i preostali Critical audit ajtemi)
  2. Marko potvrdi Egzakta logo footer pitanje (može se rešavati u toku Faze 3 review-a, nije gating)
- 🔄 Paralelni stream: Claude Code zatvara backlog → engineering audit refresh na osnovu novog session handoff-a + codebase stanja → odluka o tajmingu Faze 3 copy launch-a u sledećoj sesiji.
