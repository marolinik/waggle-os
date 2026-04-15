# Harness Audit Follow-ons — Q6 / Q7 / Q8 / Q9

**Drafted:** 2026-04-15
**Context:** S2 handoff (`.claude/projects/D--Projects-waggle-os/memory/project_session_handoff_0415_s2.md`) left four harness questions open after the P1/P2/P3a/P6/P7/P8 proposals shipped. This memo makes the call on each.

**Why this lives here and not in `~/.claude/`:** changes to `~/.claude/` touch every session on this workstation. Per the S2 handoff's rule "global settings changes require explicit Marko approval + backup." This memo is the approval package.

---

## Q6 — P4 plugin cull: `marketing`, `sales`, `productivity`

**Decision: DEFER all three. Keep installed, do not enable, revisit at SocialPresence kickoff.**

### Rationale

- The S2 handoff explicitly noted these three were held off because "SocialPresence work may use them." No SocialPresence work has started since, so the premise is unchanged.
- Installed-but-idle plugins cost ~0 at runtime (they only load on trigger patterns) — the real cost is auto-suggestion noise. None of the three match Waggle-repo paths, so they don't pollute current sessions.
- Disabling now and re-enabling later creates a sync burden (version drift between disable-date and re-enable-date).

### Actionable triggers for revisit

| Condition | Action |
|---|---|
| SocialPresence scoping starts and needs outreach templates | Keep `marketing`; audit `sales` for overlap with native connectors; disable `productivity` |
| No SocialPresence work by 2026-07-15 (3 months) | Disable all three and reclaim plugin-cache disk space |
| Any of them emits a false-positive hook during a Waggle session | Disable that specific one on the spot |

### If Marko wants to disable now anyway

Add to `~/.claude/settings.json` under the `plugins.disabled` key (JSON shape — validate before saving):

```
plugins.disabled = [
  "marketing@knowledge-work-plugins",
  "sales@knowledge-work-plugins",
  "productivity@knowledge-work-plugins"
]
```

Backup first: copy the existing `settings.json` to `settings.json.backup-<date>` before editing.

---

## Q7 — P5 MCP health check on SessionStart

**Decision: ADD (lightweight form). The ≤10-second cost is worth avoiding a silent-failure session.**

### Rationale

- MCP servers can die silently between sessions (network, auth token expiry, process crash on reboot). Currently the first indication is a tool call failing mid-turn, which burns a turn and confuses the user.
- A SessionStart hook that pings each registered MCP and logs the status list is non-blocking and would surface broken servers as a single warning line rather than causing per-turn mysteries.

### Hook behavior (specification)

The hook should:

1. Read `~/.claude/settings.json`, enumerate keys under `mcpServers`.
2. For each server with a `command` field: verify the binary exists on PATH. For each with a `url` field: note the URL is configured (skip live HEAD requests — network-dependent and slow).
3. Per-server timeout: 2 seconds. Total budget: 10 seconds. Servers not checked before the budget runs out are reported as `unchecked`.
4. Print a single warning line only if one or more servers are offline:
   `[MCP health] 2/12 server(s) offline: <names>`
5. Always exit 0 — a broken MCP must never block session start.

### Suggested file layout

- **Script:** `~/.claude/hooks/mcp-health-check.js` — single Node.js file, no dependencies.
- **Settings wiring:** add as a second entry under `hooks.SessionStart` in `~/.claude/settings.json`, after the existing `output-discipline.js`.

### Rollback

- Delete the added entry from `hooks.SessionStart`.
- Delete `~/.claude/hooks/mcp-health-check.js`.
- Restore `settings.json.backup-<date>`.

### When approved

Ping me in the next session with "apply Q7" — I'll write the actual script + settings edit as a focused change with a diff before you apply.

---

## Q8 — P3 expansion: promote 5 more GSD workers to Haiku

**Decision: HOLD until 2-3 full sessions of soak on verifier / code-reviewer / build-error-resolver at Haiku.**

### Rationale

- S2 promoted 3 read-only GSD workers to Haiku: `gsd-verifier`, `gsd-code-reviewer`, `build-error-resolver`. Remaining candidates per the handoff: `gsd-executor`, `gsd-ui-auditor`, `gsd-ui-checker`, `gsd-integration-checker`, `gsd-doc-verifier`.
- The handoff explicitly said "after 2-3 session soak." The current session is the FIRST of that soak. Promoting the next batch now would violate the soak gate.
- `gsd-executor` is particularly sensitive — it's NOT read-only. Haiku downgrading an executor that writes code is higher-risk than downgrading a verifier. Needs separate scrutiny.

### Soak checklist

For the 3 already-promoted workers, passing soak requires:

- [ ] No quality regression in 2+ sessions of substantive work (this session counts as 1)
- [ ] No unexpected verification failures where Sonnet would have caught an issue Haiku missed
- [ ] No cost anomalies (Haiku is cheaper per token — runaway turns would signal the model needs more nudging to converge)

### Prepared edits for post-soak

When the gate passes, add `model: haiku` to the frontmatter of these 4 files (NOT `gsd-executor` — that one gets its own careful review):

- `~/.claude/agents/gsd-ui-auditor.md`
- `~/.claude/agents/gsd-ui-checker.md`
- `~/.claude/agents/gsd-integration-checker.md`
- `~/.claude/agents/gsd-doc-verifier.md`

`gsd-executor` evaluation criteria (separate from the other 4):

- Read its system prompt end-to-end
- Confirm it has narrow scope (specific plan execution, not open-ended coding)
- Run a side-by-side comparison (one task with Sonnet, same task with Haiku) before promoting
- If comparison is equivocal → keep Sonnet

---

## Q9 — MAX_THINKING_TOKENS=10000 empirical check

**Decision: DOCUMENT the methodology, DO NOT change settings. Run the check during the next genuinely-hard reasoning session.**

### What needs verification

S2 added `MAX_THINKING_TOKENS: "10000"` to `~/.claude/settings.json.env` per Marko's own `performance.md`. The open question: does `effortLevel: "high"` (when set explicitly on a turn) still override the cap on complex architectural turns? If the cap is a hard ceiling, we might silently under-think on exactly the turns where we need maximum reasoning.

### Observation protocol

During a genuinely-hard reasoning turn (architecture decision, debugging a subtle race, non-trivial refactor scope):

1. **Enable verbose thinking output:** `Ctrl+O` (shows the thinking stream in-UI).
2. **Watch the thinking stream length.** If thinking hits ~10k tokens and visibly cuts off mid-thought → the cap is a hard ceiling, `effortLevel: high` does NOT override.
3. **Compare:** on a similarly-hard turn, raise `MAX_THINKING_TOKENS` to `20000` via `export` in a shell before starting Claude Code, rerun, and see if the thinking stream is noticeably longer.

### What "fail" looks like

If the cap is a hard ceiling: revert to the Claude Code default (no `MAX_THINKING_TOKENS` set), and instead set `alwaysThinkingEnabled: true` in settings. The default dynamic budget (31,999 tokens per the CLI docs) handles the hard turns and Sonnet / Haiku's own cost-optimization handles the easy ones.

### What "pass" looks like

The cap respects `effortLevel: high` overrides, or the cap is sufficient for ~95% of turns and the remaining 5% self-identify as needing more. In that case keep at 10,000.

---

## Summary of decisions

| Question | Decision | Action |
|---|---|---|
| Q6 Plugin cull | **Defer** (keep installed, idle) | None now. Revisit at SocialPresence kickoff. |
| Q7 MCP health check | **Add** | On approval: I write the script + settings delta as a focused change. |
| Q8 P3 expansion | **Hold** | Complete 2-3 session soak on current 3 workers, then apply to 4 of 5 candidates. |
| Q9 MAX_THINKING cap | **Observe** | Document methodology; run on next hard-reasoning session. |

**Immediate action for Marko:** zero forced now. Q7 is opt-in ready. Q6/Q8 have clear revisit triggers; Q9 is a methodology doc.
