# LOCKED — Gemma Architecture Sensitivity Probe (Week 3)

**Datum:** 2026-04-20
**Odobrio:** Marko Marković
**Status:** LOCKED
**Scope:** Week 3 arhitekturni kontrapunkt unutar benchmark plana

---

## Odluka

Gemma 2 9B ili Gemma 2 27B (izbor finalizovati u Week 2) uključuje se u benchmark plan kao **Week 3 architecture sensitivity probe**, ne kao četvrta ćelija u primarnom four-cell headline rezultatu.

Glavni claim Week 1 branimo na Qwen 35B-A3B × LoCoMo sa četvoroćelijskom ablacijom. Week 2 proširuje na Llama-3.1-8B-Instruct i claude-opus-4-6. Week 3 dodaje Gemma kao eksplicitan non-MoE dense attention kontrapunkt.

---

## Rezon

Prethodni interni testovi pokazuju da memory+evolve sloj ne radi na Gemma-i. Publishable negativni rezultat je **jači** za nas nego tišina.

Kada enterprise kupac pita "da li radi na Gemma-i" — a pitaće, jer Gemma je defaultna evaluaciona meta za mnoge EU compliance i security timove (procenjena verovatnoća pitanja u prvim trima sovereign-deal evaluacijama: 65-75%) — odgovor "dokumentovali smo negativan rezultat, pokazujemo gde ne radi i zašto (non-MoE dense attention, specifična KV cache struktura, drugačiji instruction-tuning mix)" je kredibilnije od "nismo probali".

Transparentnost o granicama memory+evolve sloja ne urušava headline claim; ona ga **specifikuje**. Claim se pretvara iz "radi svuda" (što je lako oboriti) u "radi na MoE + specifičnoj klasi arhitektura, evo tačno na kojima" (što je defensible i publishable).

Verovatnoća da bi "nismo probali" odgovor urušio deal u momentu procurement review-a: 25-35%. Cost Gemma probe-a: $150-300 jedan model × dva benchmarka, ne menja primarni Week 1-2 timing. ROI favorizuje uključenje.

---

## Uslov publikabilnosti

Publishable negativni rezultat podiže primarni claim **samo ako** je postavljen jasno sa distinktnom failure mode klasifikacijom — koji tačno sloj memory+evolve-a puca na Gemma-i (retrieval, reasoning, instruction adherence, context utilization). Bez dekompozicije, negativni rezultat je samo "nije radilo" — niti pomaže niti šteti.

Zato Gemma probe mora deliti failure modes taxonomy (5 mode-a) sa glavnim four-cell run-om. To je zadatak Week 2 research spec-a, mora biti razrađen pre Week 3 run-a.

---

## Selekcija 9B vs 27B

Finalizovati u Week 2 posle Llama-3.1-8B run-a:
- **Gemma 2 9B** — direktno uporediv scale sa Llama-3.1-8B; jasnije izoluje arhitekturni uticaj
- **Gemma 2 27B** — bliže Qwen 35B-A3B scale; eliminiše "možda je scale" confounder ali dodaje cost

Preporuka: **Gemma 2 9B** osim ako Week 2 rezultati ne ukažu da je scale primarni driver razlike. Racionalno: jeftinije, direktno uparene sa Llama-i u small-dense klasi, arhitektura postaje dominantna varijabla.

---

## Referenca

- 7 obaveza LOCKED: `decisions/2026-04-20-benchmark-7-obligations-locked.md`
- Strategy doc: `strategy/2026-04-20-benchmark-alignment-plan.md` (Pitanje 2b)
