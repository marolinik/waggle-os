# Pilot Mutual Non-Disclosure Agreement — Template

> **Editorial note (delete before sending):** This is a starting draft for Waggle OS pilot agreements. It is **not legal advice** and has **not been reviewed by counsel**. Before sending to any pilot user, have a qualified lawyer review in your jurisdiction (EU privacy law, US trade-secret law, and any local commercial law that applies to the pilot user's seat). Replace every `[…]` placeholder. For Egzakta-led pilots, Marko Marković is named as the Disclosing Party representative — change for any pilot Marko is not personally signing.

---

## Mutual Non-Disclosure Agreement
### Waggle OS Pilot Program

**Effective Date:** `[YYYY-MM-DD]`

**Parties:**
- **Disclosing/Receiving Party A — Provider:**
  Egzakta DOO, registered at `[Address]`, represented by Marko Marković (Founder).
- **Disclosing/Receiving Party B — Pilot User:**
  `[Legal name]`, registered at `[Address]`, represented by `[Name, role]`.

Each party may, in the course of the pilot, both disclose and receive Confidential Information. Accordingly each party is, at different moments, the "Disclosing Party" and the "Receiving Party" with respect to specific information.

---

### 1. Purpose of Disclosure

The parties wish to evaluate Waggle OS (the "Software") in real workflows for a defined period (the "Pilot"). For that evaluation to be useful, both parties may share information that would harm them if it became public. This Agreement sets the rules under which that information moves between the parties.

The Pilot itself is described in the separate Pilot Letter dated `[date]` and signed alongside this Agreement.

### 2. Definition of "Confidential Information"

"Confidential Information" means any information that is either:
(a) marked or stamped "Confidential", "Proprietary", or with similar wording at the time of disclosure; or
(b) of a nature that a reasonable business person would treat as confidential, including without limitation:
- the Software's source code, build artifacts, model weights, prompts, and design documents;
- any technical details about the Software's memory architecture (`.mind` files, harvest pipeline, memory routing) the pilot user becomes aware of through use or screen-share;
- the pilot user's business processes, customer lists, financial data, internal documents, prompts, and the contents of any file the pilot user processes through the Software during the Pilot;
- the existence and terms of this Agreement and the Pilot Letter.

"Confidential Information" does NOT include information that:
(c) was already in the receiving party's lawful possession before disclosure, with documentary proof;
(d) is or becomes publicly known through no fault of the receiving party;
(e) is independently developed by the receiving party without reference to the disclosed information; or
(f) is rightfully obtained from a third party who is free to disclose it.

### 3. Use Restrictions

The Receiving Party agrees:
- to use Confidential Information **only** for the purpose described in § 1;
- to protect Confidential Information with at least the same care it uses for its own Confidential Information of similar sensitivity, and **never less than reasonable care**;
- to limit access to those of its employees, contractors, and advisors who have a need to know for the Pilot purpose, and who are themselves bound by written confidentiality obligations no less protective than this Agreement;
- not to reverse-engineer, decompile, or disassemble the Software except to the extent expressly permitted by mandatory applicable law;
- not to publish benchmarks, screenshots, or comparative claims about the Software without the Provider's prior written approval, with this exception: the pilot user may share **anonymized, aggregated** insights with their internal stakeholders.

### 4. Required Disclosure (Court / Regulator)

If the Receiving Party is required by law, court order, or regulator to disclose Confidential Information, it will:
(a) where legally permitted, give the Disclosing Party prompt written notice so the Disclosing Party can seek a protective order;
(b) disclose only the minimum amount required;
(c) treat anything actually disclosed as still confidential under this Agreement to the extent legally possible.

### 5. Pilot Data Specifics

The Provider commits, during and after the Pilot:
- to handle the pilot user's data exactly as described in `docs/pilot/data-handling-policy.md` (the "Data Policy"), the version current on the Effective Date;
- to honor the pilot user's erasure request via the in-app erasure flow (`POST /api/data/erase`) within the technical limits stated in the Data Policy § 4;
- not to use the pilot user's prompts, files, or memory frames to train or fine-tune any model, except where the pilot user explicitly opts in by toggle in `Settings → Privacy → Help improve Waggle OS`. Default: OFF.

The pilot user commits:
- not to upload to the Software any data they do not have authority to process (third-party PII, regulated health data outside HIPAA-compliant scope, classified material, etc.);
- to inform the Provider in writing within `[X]` business days if they discover a defect in the Software that has caused or could cause data loss or unauthorized disclosure.

### 6. Term

This Agreement is effective from the Effective Date and continues until the **later** of:
(a) two (2) years after the Effective Date; or
(b) two (2) years after the Pilot ends, regardless of how it ends.

Confidentiality obligations for information that constitutes a **trade secret** survive indefinitely, until the information ceases to qualify as a trade secret under applicable law.

### 7. Return / Destruction

Upon written request by the Disclosing Party, or no later than thirty (30) days after the Pilot ends, the Receiving Party will, at the Disclosing Party's option:
(a) return all Confidential Information in tangible form; or
(b) destroy it (including by invoking the erasure flow described in the Data Policy § 4 for any of the Disclosing Party's data the Receiving Party holds in the Software);
and certify in writing that it has done so. Routine archival backups that cannot be selectively deleted may be retained subject to continued confidentiality obligations until they are overwritten in the ordinary course of business.

### 8. No License / No Warranty

Disclosure under this Agreement does not grant any license to patents, trademarks, copyrights, or trade secrets except as strictly necessary to perform the Pilot. The Software is provided **AS IS, without warranty of any kind**, express or implied, during the Pilot. The pilot user accepts that pre-launch software may contain bugs that cause data loss; the recommended mitigation is the manual backup procedure in the Data Policy § 3.

### 9. Remedies

Each party acknowledges that money damages may be inadequate for breach of this Agreement and that the Disclosing Party is entitled to seek injunctive relief in addition to any other remedies available at law or in equity.

### 10. General

- **No Assignment** without the other party's prior written consent, except to a successor in connection with a merger or sale of substantially all assets.
- **Governing law:** the laws of `[jurisdiction]`. Disputes go to the exclusive jurisdiction of `[court]`.
- **Entire agreement.** This Agreement, together with the Pilot Letter, is the entire agreement between the parties regarding confidentiality of Pilot information and supersedes prior discussions.
- **Severability.** If any provision is held unenforceable, the rest remains in force.
- **Counterparts / electronic signature.** This Agreement may be signed in counterparts and delivered electronically (PDF, DocuSign, equivalent) — each counterpart is an original, all together one Agreement.

---

**SIGNED:**

For Egzakta DOO:
________________________________________
Name: Marko Marković
Title: Founder
Date: `[YYYY-MM-DD]`

For `[Pilot User Legal Name]`:
________________________________________
Name: `[…]`
Title: `[…]`
Date: `[YYYY-MM-DD]`

---

## Companion checklist (delete before sending)

Before sending this template to a pilot user, confirm:

- [ ] Counsel has reviewed the latest version of this template against the pilot user's jurisdiction.
- [ ] § 1 — purpose matches the actual pilot scope (length, deliverables, named individuals).
- [ ] § 5 — `[X]` business-days defect-notice window is filled in (recommend 5–10).
- [ ] § 6 — the 2/2 year term still matches Egzakta's standard practice.
- [ ] § 10 — `[jurisdiction]` and `[court]` filled in (typically the pilot user's home jurisdiction unless they accept ours).
- [ ] The accompanying Pilot Letter is drafted, attached, and references this NDA by Effective Date.
- [ ] The data-handling policy version date in § 5 matches the version of `docs/pilot/data-handling-policy.md` you'll point them at.
- [ ] You will store the executed copy in a place that survives Marko personally — Egzakta corporate share, not a personal Drive.

If you change the wording of this template after a pilot user signs it, **the version they signed is what governs them**, not the latest in the repo. Treat each signed instance as a separate document.
