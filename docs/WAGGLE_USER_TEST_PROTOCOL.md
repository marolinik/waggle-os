# Waggle OS — Protokol za Korisnički Test
## Od prvog klika do "Bog te video"

<div style="background:#08090c;color:#e5a000;padding:16px 24px;border-radius:8px;margin:16px 0">
**Svrha:** Otkriti da li Waggle stvara addiction loop ili je samo još jedan AI alat koji se otvori jednom.<br>
**Trajanje:** 90 minuta po korisniku + 30 min debriefing<br>
**Broj učesnika:** Minimum 5, optimalno 8 (svaki novi korisnik donosi nove scerarije)<br>
**Ko vodi:** 1 moderator (posmatrač, ne pomagač), 1 noter
</div>

---

# DEO 1: PRIPREMA

## Profil korisnika za regrutovanje

Traži ljude koji:
- Koriste ChatGPT ili Claude bar 3x nedeljno za posao
- Imaju konkretan, repetitvni posao koji rade rukom (istraživanje, pisanje, analiza)
- Nisu videli Waggle pre testa
- Rade u konsaltingu, pravu, finansijama, prodaji, ili sličnim knowledge-intensive oblastima

**NE traži:** tehničare, developere, AI entuzijaste. Oni su pristrasni. Hoćeš ljude kojima AI pomaže, ali nije njihova profesija.

## Materijali

- Laptop sa Waggle-om instaliranim, LLM konfigurisan (Qwen 27B ili Claude API key spreman)
- Screen recorder koji snima ekran + kameru korisnika + zvuk
- Lapus papir pored laptopa (korisnik piše šta misli)
- Šolju kafe/vode (smanjuje formalnost)
- Lista od 5 realnih zadataka korisnika (pitaš ih unapred emailom: "Pošalji mi 3 zadatka koja radiš svake nedelje")

## Uputstvo moderatoru

**Jedino pravilo:** Ne pomaži nikako. Ako korisnik zapne, reci: "Šta misliš da treba da uradiš?" Ako ponovo zapne, reci: "Uradi šta ti deluje logično." Nikada ne pokazuj kursor, ne klikćeš, ne objašnjavaš.

Tvoj posao je da posmatraš i notesuješ:
- Gde pauziraju (zbunjenost)
- Gde se smeju ili uzdahnu (emocija)
- Gde ubrzaju (engagement)
- Šta komentarišu naglas

---

# DEO 2: TEST PROTOKOL

## FAZA 0 — Pre prvog klika (5 minuta)

**Šta radimo:** Razgovor pre nego što korisnik dotakne laptop.

**Pitanja koja postavljamo:**

"Opiši mi dan kada si koristio AI alat i bio stvarno zadovoljan rezultatom."
*(Slušaš šta definiše "dobar" za njega — brzina? Kvalitet? Manje posla?)*

"Koja je razlika između kako koristiš ChatGPT i kako koristiš Google?"
*(Otkriva mentalni model — tretira li AI kao search ili kao saradnika)*

"Da li si ikada poželeo da AI pamti ko si i šta radiš?"
*(Direktno meri da li memory sistem ima vrednost za njega)*

**Šta meriš:**
- Koji bol opisuje (ovo je tvoj benchmark — da li Waggle to rešava?)
- Da li govori o jednom alatu ili više (fragmentisanost = opportunity)
- Energija kada priča — entuzijazam ili frustracija sa trenutnim alatima

**Zelenа zastava:** Korisnik spontano opisuje frustraciju sa "resetovanjem konteksta" svaki put.
**Crvena zastava:** Korisnik je potpuno zadovoljan ChatGPT-om i ne vidi problem.

---

## FAZA 1 — Onboarding (8-15 minuta)

**Šta radimo:** Korisnik otvara Waggle prvi put. Posmatramo bez reči.

**Merimo vreme do:**
- Prvog klika (oklevanje = zbunjenost)
- Odabira template-a (razume li kategorije?)
- Odabira persone (razume li koncept?)
- Prvog poslatog chat-a

**Posmatramo:**

*Lice:* Digne li obrve pri čitanju opisa? To je momenat razumevanja. Sužuju li se oči? To je zbunjenost.

*Ruke:* Lebde li prsti iznad tastature? Okleva. Kuca brzo? Siguran je.

*Usta:* Šta govori naglas? Svaki komentar je zlato. Zapiši reč-po-reč.

*Scroll:* Da li lista sve opcije ili odabere prvu dostupnu? Brzina = samopouzdanje.

**Metrike koje beleže:**

| Momenat | Cilj | Alarm |
|---|---|---|
| Vreme do prvog chata | < 3 min | > 7 min = onboarding problem |
| Pitanja moderatoru | 0 | 3+ = UX problem |
| Napuštanje onboardinga (klik na X/Skip) | Nikad | Jednom = kritično |
| Izraz lica pri opisu "Waggle pamti ko si" | Interes | Ravnodušnost = value prop ne prolazi |

**Pitanje posle onboardinga:**
"Šta si sada razumeo o ovom alatu u jednoj rečenici?"

*Ako kaže "AI koji pamti" ili "moj AI asistent" — onboarding radi.*
*Ako kaže "još jedan chatbot" — onboarding ne radi.*

---

## FAZA 2 — Prva realna upotreba (20 minuta)

**Šta radimo:** Korisnik radi SVOJE zadatke, ne naše. Dajemo mu papirić sa 3 zadatka koja nam je poslao emailom i kažemo: "Radi ih kao što bi radio normalno, samo koristi Waggle."

**Ovo je najvažnija faza.**

**Zadatak A — Zadatak koji ZNA kako da uradi (8 min)**

Neka uradi nešto što inače radi u ChatGPT-u. Posmatramo:

- *Kako formuliše prompt?* Da li piše kratko (naviknut na kontekstuelni AI) ili dugačko (naviknut na stateless)?
- *Da li mu je rezultat bolji, isti ili lošiji od ChatGPT-a?* Pita ga se direktno.
- *Da li koristi persona feature?* Ako ne, znači da ne razume vrednost. Ako da — i vidi razliku — to je aha momenat.

**Merimo:**
- Broj reči u prvom promptu (duži = manje poverenja u kontekst)
- Vreme do "submita" (duže = nesigurnost)
- Da li menja prompt posle prvog odgovora (iterira = engaged)
- Reakcija na odgovor — čita pažljivo ili skroluje?

**Zadatak B — Zadatak koji nikad nije radio sa AI (10 min)**

Neka pokuša nešto gde nije siguran. Posmatramo:

- *Da li traži pomoć od Waggle-a drugačije nego od Google-a?*
- *Kada dobije loš odgovor — šta radi?* Zatvori tab ili iterira?
- *Da li spontano kaže "ovo je korisno/beskorisno"?*

**Zadatak C — Multi-step zadatak (10 min)**

Zadatak koji zahteva više koraka (istraži kompaniju X, napiši email CEO-u, sačuvaj u memory-u za sledeći put). Posmatramo:

- *Da li razume da može da nastavi od tamo gde je stao?*
- *Da li svesno koristi memory ili ga ignoriše?*
- *Da li ga zbunjuje multi-workspace koncept?*

**Pitanja IZMEĐU zadataka (ne posle — između):**

"Šta si sada očekivao da se desi?"
"Zašto si kliknuo tu?"
"Šta bi ti rekao da ovo nije alat koji si ti hteo?"

---

## FAZA 3 — Stresni test (10 minuta)

**Šta radimo:** Namerno ga ubacujemo u situacije gde Waggle može da razočara.

**Test 1 — Loš odgovor**

Pitaj korisnika da pita Waggle nešto gde je odgovor siguran da će biti netačan ili generičan. Posmatramo:

- *Šta radi kada AI greši?* To je ključno za retention. Ako napusti = loš sign. Ako ponovo pita = trust postoji.
- *Da li zamera Waggle-u ili sebi (loš prompt)?*
- *Da li govori naglas "ma hajde" ili "ok, hajde da probam drugačije"?*

**Test 2 — Spor odgovor**

Namerno (ili ne) čekanje na odgovor 8-15 sekundi. Posmatramo:

- *Da li odmah klikće negde drugo ili čeka?*
- *Koliko sekundi pre nego što pokaže nestrpljenje?* Beleži egzaktno.
- *Šta radi dok čeka — čita prethodni odgovor ili gleda u prazan ekran?*

**Test 3 — Breakflow momenat**

Zamoli ga da promeni workspace usred zadatka. Posmatramo:

- *Da li nađe workspace switcher bez pomoći?*
- *Da li razume da prethodni kontekst ostaje u prvom workspaceu?*
- *Da li se „gubi" u UI-u?*

---

## FAZA 4 — Addiction momenat (15 minuta)

**Šta radimo:** Slobodna upotreba. Kažemo: "Imaš 15 minuta, radi šta god hoćeš."

Ovo je najvažniji signal.

**Addiction znakovi — beleži svaki:**

🟢 **Jak signal:**
- Korisnik sam smisli novi use case koji mi nismo predvideli
- Pita "može li Waggle da..." (mentalno širi granice)
- Zaboravi da smo tu (fokus na zadatak, ne na test)
- Spontano kaže "ovo je dobro" ili "ovo je korisno" bez pitanja
- Pita koliko košta / kada može da počne da koristi

🟡 **Slab signal:**
- Završi zadatak koji smo dali i čeka sledeću instrukciju
- Koristi ga, ali ne komentariše ništa
- Kaže "ovo je ok" na pitanje

🔴 **Anti-signal:**
- Prebaci na telefon tokom slobodnog vremena
- Pita "a to može u ChatGPT-u?"
- Gleda sat

**Zlatno pitanje na kraju slobodnog vremena:**

"Da li bi sutra otvorio Waggle pre ili posle ChatGPT-a?"

Ako kaže PRE — tu je nešto. Ako kaže POSLE ili UMESTO — nisi ni blizu.

---

## FAZA 5 — Emocionalni debriefing (15 minuta)

**Šta radimo:** Korisnik je završio. Sada razgovaramo.

**Pitanja redom (ne menjaj redosled):**

**1. "Opiši mi šta si radio danas u tri rečenice, kao da objašnjavaš kolegi."**
*(Ako može jasno da objasni → razumeo je. Ako se muca → nije razumeo vrednost.)*

**2. "Koji momenat tokom testa bi pamtio sutra ujutru?"**
*(Tražiš spontani aha momenat. Ako ne može da nabroji nijedan → nema ga.)*

**3. "Šta te je iznenadilo — pozitivno ili negativno?"**
*(Ovo je unapređenje backlog. Svaki odgovor je feature request ili bug.)*

**4. "Zamisli da Waggle ne postoji. Šta bi koristio za ove zadatke?"**
*(Competitor analysis. Ako kaže Excel ili Word — nisi mu jasno prodao AI. Ako kaže ChatGPT/Claude — na dobrom si tragu.)*

**5. "Šta bi morao da se promeni da bi Waggle bio tvoj primarni AI alat?"**
*(Ovo je product roadmap. Korisnici su brutalno iskreni ovde.)*

**6. "Proceni Waggle od 1 do 10 u odnosu na ChatGPT za tvoje svakodnevne zadatke."**
*(Benchmark metric. Ispod 6 — kritično. 7-8 — ok, ali postoji gap. 9-10 — tu je magic.)*

**7. Finalno, ne pitanjem nego šutnjom:**
Zatvori notes, naslonih se i reci: "To je to. Hvala. Ako ima nešto što nisi rekao, slobodno."
Posle ove rečenice, što god korisnik kaže spontano — beleži to. To je uvek najiskreniji feedback.

---

# DEO 3: SCORECARD

## Popunjava se za svakog korisnika odmah posle testa.

**ONBOARDING (max 25 poena)**

| Kriterijum | Loše (0) | OK (1) | Odlično (2) |
|---|---|---|---|
| Vreme do prvog chata | >7 min | 3-7 min | <3 min |
| Razumevanje posle onboardinga | "chatbot" | "pamti me" | "moj AI" |
| Pitanja moderatoru tokom onboarding | 3+ | 1-2 | 0 |
| Pronalazak template koji mu odgovara | Nije našao | Pronašao uz čitanje | Odmah kliknuo |
| Spontani komentar tokom onboardinga | Negativan | Nijedan | Pozitivan |

---

**PRVA UPOTREBA (max 30 poena)**

| Kriterijum | Loše (0) | OK (1) | Odlično (2) |
|---|---|---|---|
| Kvalitet prvog prompta | 1 reč / generičan | Konkretan | Konkretan + kontekstualan |
| Reakcija na prvi odgovor | Zatvori tab | Čita, ali šuti | Komentariše ili iterira |
| Korišćenje persone (svesno) | Ne zna da postoji | Video ali nije koristio | Aktivno koristio |
| Otkrivanje memory funkcije | Nije ni primetio | Primetio, nije koristio | Koristio i komentarisao |
| Poređenje sa ChatGPT-om | "ChatGPT je bolji" | "Slično" | "Ovo je bolje jer..." |

---

**RESILIENCE TEST (max 20 poena)**

| Kriterijum | Loše (0) | OK (1) | Odlično (2) |
|---|---|---|---|
| Reakcija na loš odgovor | Napusta | Proba jednom | Iterira do dobrog |
| Tolerancija na čekanje | <5 sec pre nestrpljenja | 5-10 sec | >10 sec strpljivo čeka |
| Oporavak od zbunjenosti | Pita moderatora | Eksperimentiše | Rešava sam i nastavi |

---

**ADDICTION SIGNAL (max 25 poena)**

| Kriterijum | Loše (0) | OK (1) | Odlično (2) | Bonus (3) |
|---|---|---|---|---|
| Slobodnih 15 min — šta radi | Čeka instrukcije | Radi zadatak | Sam smisli novi use case | Pita koliko košta |
| "Pre ili posle ChatGPT-a sutra?" | Posle | Umesto | Pre | — |
| Pamtljivi momenat | Nijedan | Jedan generičan | Konkretan i emotivan | — |
| Spontana preporuka drugima | Ne bi preporučio | Možda | Odmah misli ko bi koristio | — |

---

**UKUPNA INTERPRETACIJA:**

| Score | Interpretacija | Akcija |
|---|---|---|
| 0-40 | Produkt nije spreman. Korisnici ne razumeju vrednost. | Kreni od value prop, ne od features. |
| 41-60 | Ima potencijala ali kritični problemi postoje. | Identifikuj top 3 friction pointa i reši ih. |
| 61-75 | Solidno. Korisnici vide vrednost ali nema magic momenta. | Pronađi gde je aha momenat i napravi ga ranijim. |
| 76-90 | Dobar produkt. Addiction loop postoji za određene korisnike. | Definiši koji user archetype — i fokusiraj se na njega. |
| 91-100 | Spreman za pravo testiranje. | Pusti 10-20 realnih korisnika bez moderatora. |

---

# DEO 4: ŠABLONI ZA NOTIRANJE

## Tokom testa — beleži ove kolone:

```
Vreme | Akcija korisnika | Komentar naglas | Izraz lica | Signal (+ / - / ?)
```

Primer:
```
02:14 | Kliknuo na "Strategy Consultant" template | "Ovo mi zvuči..." | Smeši se | +
03:45 | Stao, čita opise pesona | (tišina 12 sec) | Sužene oči | ?
04:20 | Odabrao "Researcher" personu | "Pa ovo nije to što sam mislio" | Namrštio se | -
05:10 | Otkucao prvi prompt | "Reci mi o konkurentima X kompanije" | Neutralno | ?
05:28 | Čita odgovor | "Hm... ok, ovo nije loše zapravo" | Diže obrve | +
```

---

# DEO 5: ANALIZA POSLE 5 TESTOVA

Kada završiš sa 5 korisnika, popuni ovaj agregat:

**Friction mapa** — za svaki korak onboardinga i prve upotrebe, obeležiti gde je najviše korisnika zapelo (>3/5).

**Aha momenat mapa** — koji feature je izazvao pozitivnu reakciju kod >=3/5 korisnika?

**Retention predictor** — od 5 korisnika, koliko bi sledeći dan otvorilo Waggle?
- 0-1/5: Kritično. Produkt nije spreman.
- 2-3/5: Niche fit postoji ali nije mainstream.
- 4-5/5: Spreman za širu distribuciju.

**Verbatim citati** — izdvoji 3-5 direktnih citata koji opisuju vrednost ili problem. Ovo je tvoja copy za landing page ili investitorsku prezentaciju.

---

# DEO 6: KADA JE "BOG TE VIDEO" MOMENAT?

Ovaj momenat se prepoznaje po jednom od sledećeg:

**Scenario A — The Time Save:** Korisnik završi za 8 minuta nešto što inače traje sat. Zaustavlja se, gleda u ekran, i kaže nešto poput "Čekaj..." ili "Stvarno?" ili "Pa da."

**Scenario B — The Connection:** Waggle referencira nešto iz prethodnog razgovora ili workspace-a bez da je korisnik to rekao. Korisnik se zagleda i pita "Odakle zna ovo?"

**Scenario C — The Unexpected Use:** Korisnik spontano primeni Waggle na problem koji smo mu mi nikad dali. To znači da je mentalni model formiran i da ekstrapolira.

**Scenario D — The Social Share:** Korisnik spontano pomene ime osobe kojoj bi rekao za Waggle. "Ovo bi voleo moj kolega X."

**Ako se nijedan od ova četiri scenarija ne desi u 5 testova — produkt nije spreman za akviziciju. Vredi ga raditi dalje, ali ne vredi trošiti novac na marketing.**
