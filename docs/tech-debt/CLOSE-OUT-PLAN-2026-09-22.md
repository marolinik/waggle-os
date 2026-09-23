# Tech-Debt Close-Out Plan — 2026-09-22

Founder direction (2026-09-22): **close every finding the `/remove-technical-debt` journey
recorded, then deal with production.** This plan is the route from today's ledger to that
state. It supersedes the "fix as you touch it" pacing of the Debt Budget policy for the
rows listed here; the policy itself stays as the rule for new debt.

Production readiness is a separate track with its own authority
(`docs/production-readiness/09-LAUNCH_RECOMMENDATION.md`). Nothing below is a launch gate,
and closing all of it does not by itself make a release GO.

## Where the ledger actually stands (measured 2026-09-22)

| Priority | Open | Partial | Closed |
|---|---|---|---|
| P1 | 1 | 3 | 1 |
| P2 | 16 | 5 | 9 |
| P3 | 27 | 1 | 4 |

53 ledger rows are not finished. 36 of them are in `packages/server/src/local/routes/chat.ts`.
Outside the ledger: `CA-5b` open (ARCHITECTURE.md), `R-3` narrowed / `R-4` / `R-5` / `R-7`
open (RELIABILITY.md), `D-1` / `D-2` open (ARCHITECTURE.md).

**Correction, applied with this plan:** the tracker said CA-3/CA-4 ("invert the memory
boundary") were the largest piece of debt left and had not been attempted. They are
**closed** — `cbf65c12` (pins), `f24d192b` (inversion), `edc2f455` (seam), and
`memory-layers-default.ts` now owns all 12 gateway constructions, guarded by
`memory-gateway-confinement.test.ts`. Three places in
`docs/REMOVE-TECHNICAL-DEBT-PLAN.md` still claimed otherwise and are corrected.

## Waves

Each wave is a set of PRs. Rows are grouped by the file region they touch, because a CI
run costs about 45 minutes of runner time and a region can only be pinned once.

| Wave | Content | Rows | PRs (est.) |
|---|---|---|---|
| W1 (in flight) | Finish TD-CHAT-3: slice 6 (the five singles), then the control-flow extractions | TD-CHAT-3, and with it TD-CHAT-25, TD-CHAT-33; unblocks TD-CHAT-16, TD-TEST-1 | 9-10 |
| W2 | `chat.ts` behavior fixes, pin-first, batched by region: validation/env; notifications and capture; streaming and budget; trace and logging; errors and persistence; workspace resolution; governance | TD-CHAT-5, 6, 7, 11, 12, 13, 14, 17, 19, 20, 21, 22, 24, 27, 28, 29, 30, 35, 39, 40, 41, 42, 44, 48, 49 | 6-7 |
| W3 | Test infrastructure | TD-TEST-1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 14 | 4-5 |
| W4 | `@waggle/agent` package rows | TD-CHAT-1, 2, 31, 36, 37, 45 | 2-3 |
| W5 | Architecture, reliability, DDD | CA-5b, R-3, R-4, R-7, D-1, D-2 | 4-5 |
| W6 | Dependency pin | TD-DEP-2 (undici 8) | 1-2 |

**Estimate: 26-32 PRs, 10-12 sessions** at the current pace of 2-3 PRs per session. Every
PR keeps the shape this journey uses: pin first in its own commit, structure-only or
behavior change in a second, docs in a third.

## Blocked, and on what

| Row | Blocked on |
|---|---|
| TD-CHAT-26 | Founder: is there a personal-scope root key for the `os.homedir()` fallback sites |
| TD-CHAT-36 | Founder: the deny-to-prompt posture change for the four in-hook `describeToolUse` sites |
| TD-CHAT-31, TD-CHAT-37 | TD-CHAT-36 |
| TD-CHAT-43 | Founder: reversing the H-AUDIT-1 turn-entry ruling (F4) |
| TD-CHAT-45 | Founder ruled ledger-only 2026-09-16 — close as won't-fix, or reopen |
| TD-CHAT-4 | Largely follows TD-CHAT-3; the remaining edge is the agent→core package boundary |
| TD-CHAT-16, TD-TEST-1 | TD-CHAT-3 |
| TD-CHAT-24 | TD-TEST-3 |
| TD-CHAT-41 | TD-CHAT-19 |
| TD-TEST-7 | TD-TEST-4 |
| TD-DEP-2 | Security review of the SSRF guard, plus an OSS forward-port (CLAUDE.md §7.5) |
| R-3 | OSS forward-port (§7.5); pin each query first |
| R-5 | Founder — release engineering, entangled with the signing gates |
| D-1 | Resolving sticky erasure vs. a compliance trail a GDPR erase must not delete |

Six of these need a founder decision before the work can start: TD-CHAT-26, TD-CHAT-36,
TD-CHAT-43, TD-CHAT-45, R-5, D-1. Batching those six into one decision round removes the
largest scheduling risk in this plan.

**Decision round held 2026-09-23** (recorded in the tracker's decision log): TD-CHAT-26 → managed personal folder; TD-CHAT-43 → won't fix; TD-CHAT-45 → stays open; R-5 and D-1 → stay in W5. TD-CHAT-36 needs no new ruling.

## Definition of done

The review is closed when all of these hold:

- [ ] Every Debt Ledger row is `closed` or `won't fix` with the ruling recorded in the row.
- [ ] Every CA-, R- and D- row is closed or carries a recorded owner decision.
- [ ] The tracker's Journey Exit Checklist is fully met, with no stale claims.
- [ ] `docs/TESTING.md` has a Safety Net Map row for every region these changes touched.
- [ ] The full suite is green and CI is green on `main`.

## Ordering rules

1. Pin first, always. A row that names its own pin ("pin via …") does that pin in its own
   commit before the fix.
2. Group by region, not by priority. Two P3 rows in one function are one PR; two P2 rows in
   different files are two.
3. A behavior change never shares a commit with a structural one.
4. Every row closed in a PR is updated in the same PR's docs commit, with the commit that
   closed it.
5. A row that turns out to be wrong when read against the code is corrected in the ledger
   rather than silently fixed — a wrong ledger row is a defect in its own right.
