# Waggle OS — engineering handoff (v1.2)

This folder is the entry point for the engineering team taking over Waggle OS.

**Start here:** [00-START-HERE.en.md](00-START-HERE.en.md)

## Languages

Every document in this package exists in two versions in the same folder:

- `<name>.md`: the Serbian original. It is authoritative.
- `<name>.en.md`: the English translation, with the same structure, IDs, numbers, code and paths.

Links inside the English files point to the English versions. Report any mismatch between the two versions to the founder.

A few inline code spans (`...`) keep their original Serbian wording on purpose, because code spans are reproduced byte for byte. Dates are written DD.MM.YYYY. "wd" means working days.

## What is in this folder

| File | Purpose |
|---|---|
| [00-START-HERE.en.md](00-START-HERE.en.md) | What the project and package are, reading order, first 10 days, what is decided and what is open, prohibitions, escalation |
| [01-ONBOARDING-DEV-ENV.en.md](01-ONBOARDING-DEV-ENV.en.md) | Developer environment (Windows first), isolation from any live installation, known traps |
| [02-WORKING-AGREEMENT.en.md](02-WORKING-AGREEMENT.en.md) | Branch and worktree model, PR rules, review, Definition of Ready and Done, evidence and freezes |
| [03-BACKLOG.en.md](03-BACKLOG.en.md) and [backlog.en.csv](backlog.en.csv) | 123 tickets, one per delivery-plan PR. G1 cards are sprint-ready. Import the CSV into your tracker |
| [04-CODEBASE-MAP.en.md](04-CODEBASE-MAP.en.md) | Code areas the plan touches, what to preserve, known defects, hotspot owners |
| [05-RISKS-DECISIONS-ESCALATION.en.md](05-RISKS-DECISIONS-ESCALATION.en.md) | Open founder decisions, unknowns, external gates, risks, escalation rules |
| [templates/](templates/) | Proposed PR template and CI change for the integration branch. They are not installed in `.github/` |

## The rest of the package

- Product and functional specs: [../Waggle_PRD_v1.2_DRAFT.en.md](../Waggle_PRD_v1.2_DRAFT.en.md) and [../Waggle_FRD_v1.2_DRAFT.en.md](../Waggle_FRD_v1.2_DRAFT.en.md). DOCX versions sit next to them.
- Delivery plan, safe-implementation checklist, migrations, build-vs-borrow, benchmark protocol and audit disposition: [../plans/](../plans/)
- Architecture decision records ADR-01 to ADR-10: [../decisions/ADR-INDEX.en.md](../decisions/ADR-INDEX.en.md)
- Code-level evidence behind the plan, verified against `main` at `2af0904d`: [../plans/v1.2-evidence/README.en.md](../plans/v1.2-evidence/README.en.md)

## Ground rules

- The delivery plan is a draft until the founder approves it. No feature work before that.
- After approval, all work goes to `integration/waggle-next` through small reviewed PRs, with one worktree per developer or agent.
- Never merge to `main`, never force-push, never push `v*` tags (they trigger the release pipeline), no releases.
- Use an isolated data directory and non-default ports. External write actions stay off.
- The full list is in [../plans/SAFE-IMPLEMENTATION-CHECKLIST.en.md](../plans/SAFE-IMPLEMENTATION-CHECKLIST.en.md).
