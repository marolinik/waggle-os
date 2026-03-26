# Pack Reconciliation — Waggle Repo × Marketplace

**Date**: 2026-03-16
**Status**: Documentation only — no code changes executed
**Purpose**: Map marketplace packs to Waggle's existing pack/family model and identify overlap

---

## Current Waggle Packs (5, live in repo)

These are production, tested, installed by real users:

| Pack | Skills | Family |
|------|--------|--------|
| Research Workflow | research-synthesis, explain-concept, research-team | Research & Analysis |
| Writing Suite | draft-memo, compare-docs, extract-actions | Writing & Docs |
| Planning Master | daily-plan, task-breakdown, plan-execute | Planning & Organization |
| Team Collaboration | catch-up, status-update, meeting-prep, review-pair | Communication |
| Decision Framework | decision-matrix, risk-assessment, retrospective | Decision Support |

**Total**: 18 skills across 5 packs (7 families in Install Center).

---

## Marketplace Packs (18, in marketplace.db)

| Slug | Name | Priority | Target Roles |
|------|------|----------|-------------|
| content_operator | Content Operator Pack | HIGH | Content creators, copywriters |
| consultant | Consultant Pack | HIGH | Management consultants |
| engineering_lead | Engineering Lead Pack | HIGH | Engineering managers, tech leads |
| founder | Founder Pack | HIGH | Startup founders, CEOs |
| pm | PM Pack | HIGH | Product/program managers |
| research_analyst | Research Analyst Pack | HIGH | Market researchers, analysts |
| social_selling | Social Selling Pack | HIGH | Sales reps, SDRs |
| business_ops | Business Ops Pack | HIGH | Operations managers, COOs |
| data_science | Data Science Pack | MEDIUM | Data scientists, ML engineers |
| design_lead | Design Lead Pack | MEDIUM | Design managers, UX leads |
| devops_sre | DevOps / SRE Pack | MEDIUM | DevOps engineers, SREs |
| investment_banking | Investment Banking Pack | MEDIUM | IB analysts, associates |
| legal_compliance | Legal & Compliance Pack | MEDIUM | Legal teams, compliance officers |
| private_equity | Private Equity Pack | MEDIUM | PE analysts, associates |
| wealth_management | Wealth Management Pack | MEDIUM | Financial advisors |
| customer_success | Customer Success Pack | LOW | CS managers, support leads |
| knowledge_worker | Knowledge Worker Pack | LOW | Generalist knowledge workers |
| recruiter | Recruiter Pack | LOW | HR recruiters, hiring managers |

**Total**: 120 packages across 18 packs.

---

## Overlap Analysis

| Waggle Pack | Closest Marketplace Pack | Overlap |
|-------------|------------------------|---------|
| Research Workflow | research_analyst | HIGH — both do research/synthesis |
| Writing Suite | content_operator | MEDIUM — content_operator is broader (social, copywriting) |
| Planning Master | pm | MEDIUM — PM pack includes planning but also roadmapping |
| Team Collaboration | (no exact match) | LOW — marketplace has no team coordination pack |
| Decision Framework | consultant | MEDIUM — consultant includes decision tools + strategy |

---

## Reconciliation Recommendations

### Keep as-is (no changes)
- **Waggle's 5 packs remain the default starter catalog**. They're tested, curated, and match the 7-family Install Center UI.

### Candidate additions (evaluate for future)
- **Founder Pack** — distinct persona not covered by current 5
- **Engineering Lead Pack** — distinct from Decision Framework (more code/architecture)
- **Knowledge Worker Pack** — generalist, could serve as "default for everyone"

### Do NOT auto-merge
- **Financial packs** (investment_banking, private_equity, wealth_management) — niche, vertical. Wrong for general Solo product.
- **DevOps/SRE Pack** — too specialized for Solo; better suited for Teams+ tier.
- **Social Selling Pack** — sales-specific, not core knowledge work.

### Priority mapping
Marketplace uses HIGH/MEDIUM/LOW. Waggle uses core/recommended/optional. Proposed mapping:
- HIGH → Evaluate for inclusion in Waggle's curated catalog
- MEDIUM → Available in marketplace, not promoted
- LOW → Available but hidden unless searched

---

## Decision

**Waggle's 5 packs stay as the default.** Marketplace's 18 packs become the expansion catalog, available via marketplace backend but NOT automatically replacing the Install Center. Curation happens pack-by-pack before promotion.

**Next step**: When marketplace catalog goes user-facing (post-B0), show Waggle's 5 as "Recommended" and marketplace packs as "Community" with their marketplace priority as secondary sort.
