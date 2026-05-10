# LOCKED Decision — Wave 1 Memory Install Cleanup Plan

**Date:** 2026-04-30
**Status:** LOCKED
**Author:** PM
**Ratified by:** Marko ("ok zapamti ovo da se uradi", 2026-04-30)
**Trigger:** Discovery 2026-04-30 da hive-mind-cli postinstall na Windows + Claude Code MCP health-check hook fail-uje sa `ENOENT` zbog spawn(.cmd) shim resolucije
**Binds:** Wave 1 cleanup brief autoring + Wave 2 cursor-hooks gating
**Related:** `feedback_memory_install_dead_simple` (NEW, ratifikovana 2026-04-30)

---

## §1 — Decision sazetak

Memory installation za Waggle Solo $19/mo + Pro/Teams tier MORA biti **dead-simple zero-config out of box** na Windows + macOS + Linux. Ako Solo korisnik (ne developer) treba da debug-uje `.cmd` shim issues, patch-uje plugin hook-ove, ili manualno unblock-uje quarantined MCP servers — to je **launch blocker, ne edge case**.

Tactical brzi fix (CC patch hook-a u tekucoj sesiji) je dozvoljen za tvoju testing sesiju, ali **strukturalni fix** ide u Wave 1 cleanup brief koji PM autoring-uje posle Phase 5 §0 PASS.

---

## §2 — Wave 1 cleanup brief scope (autoring post Phase 5 §0 PASS)

PM (ja) ce autoring brief sa sledecim deliverables za CC izvrsenje:

### §2.1 — Hive-mind-cli postinstall script

Cilj: postinstall script u `D:\Projects\hive-mind\packages\cli\` koji **sam distribuisemo** Windows-compatible MCP health-check hook config sa svakim `npm install -g @waggle/hive-mind-cli`. Ne polazimo od Claude Code generic-a koji ima Windows spawn bug; mi sami nosimo svoj hook.

Acceptance: posle `npm install -g @waggle/hive-mind-cli` na cisto Windows VM-u, `claude mcp list` mora pokazivati `hive-mind ✓ Connected` + bilo koji `mcp__hive-mind__*` tool call mora da radi bez ENOENT ili quarantine, **bez ijednog manual koraka korisnika izmedju install i prvi tool call**.

### §2.2 — mcp-health-check.js root structural patch

Cilj: u `${CLAUDE_PLUGIN_ROOT}/scripts/hooks/mcp-health-check.js` (ili wherever je hook fizicki kod), Windows .cmd resolution + spawn options { shell: true } koji ne breakuje Linux/macOS behavior.

Logika:
- Detect Windows (`process.platform === 'win32'`)
- Probati `${name}.cmd` ako `${name}` ne resolve
- ILI use `spawn(name, args, { shell: true })` na Windows path
- Preserve POSIX behavior intact

Acceptance: cross-platform CI test koji pokrije sve 3 OS-a, hook ne quarantine validan server.

### §2.3 — Dead-simple install acceptance kriterija

Per `feedback_memory_install_dead_simple` rule:

- Installer (`npm install -g @waggle/hive-mind-cli` ili curl|sh installer) MORA setup-ovati sve hooks bez user input
- Cross-platform Windows + macOS + Linux zero-config out of box
- Auto-detect MCP klijent (Claude Code, Cursor, native Waggle harness, drugi)
- Health-check failure mora self-recover (auto-retry sa proper spawn) umesto da kvarantne i zahteva manual unblock
- Forbidden: post-install required steps koji zahtevaju shell access ili konfiguracioni file edit za bilo sta drugacije od EULA accept + license key entry
- Forbidden: requiring developer-class debugging za normal install path

Test: install + first-use end-to-end na cisto Windows VM gde korisnik klikne "next next finish" i ima zero configuration kontaktiranja. Ako bilo koji korak zahteva terminal komand izvan instalacionog wizard-a, fail acceptance.

### §2.4 — Memory probe end-to-end test

Cilj: verifikovati da posle install + Wave 1 hooks operational, memory probe radi end-to-end:

1. `save_memory` — pisi content frame
2. `recall_memory` — read taj frame
3. `harvest_local` — verifikuj content frames ne samo session telemetry (user-prompt-submit + stop events)
4. `compile_health` — surface gaps if any

Acceptance: posle 5-10 min korisnickog rada na cisto VM-u, recall_memory query za nesto memorabilno (npr. "remember X is Y") vrati relevant frame sa odgovarajucim score-om (ne 0.013 telemetry score). Harvest path puni content store, ne samo telemetry.

---

## §3 — Wave 2 cursor-hooks gating

Wave 2 (cursor-hooks) ostaje **STANDBY** dok Wave 1 cleanup brief ne zatvori sledece:

- §2.1 postinstall script LIVE u npm registry
- §2.2 mcp-health-check.js patch merged u main
- §2.3 dead-simple acceptance criteria validated na cisto Windows + macOS VM
- §2.4 memory probe end-to-end PASS sa content frames

Wave 2 acceptance kriterija nasleduje istu disciplinu — cursor-hooks moraju takodje zero-config install na cisto Cursor instalaciji bez user debugging.

---

## §4 — Tactical CC patch (tekuca sesija)

Marko CC sesija je dobila instruction Opcija 1 — patch the health-check hook sa Windows .cmd resolution + shell: true. To je dozvoljen kao tactical brzi unblock samo za tu testing sesiju. Patch nece biti merged u main bez Wave 1 cleanup brief acceptance kriterija; tactical patch je **session-scoped workaround**, ne canonical fix.

Acceptance posle CC tactical patch:
1. `get_identity` radi bez ENOENT
2. Quarantine clear
3. `save_memory` + `recall_memory` probe end-to-end
4. Harvest path puni content frames (ne samo session telemetry)
5. CC emit "tactical patch verified — Wave 1 cleanup needed for canonical fix" u report-u

Rezultati feed Wave 1 cleanup brief acceptance criteria — ako tactical patch otkrije dodatne issues (npr. harvest path je broken nezavisno od spawn bug-a), Wave 1 brief inkorporise to.

---

## §5 — Audit trail anchors

- Memory entry: `feedback_memory_install_dead_simple.md` (ratifikovana 2026-04-30)
- Tekuca CC sesija report: paste-ovan u PM chat 2026-04-30 (Marko-side testing sesija, ne Phase 5 sesija)
- Wave 1 cleanup brief: TBD (autoring post Phase 5 §0 PASS, file: `briefs/<DATE>-wave-1-memory-install-cleanup.md`)
- Wave 2 cursor-hooks brief: TBD (autoring post Wave 1 acceptance validation, file: `briefs/<DATE>-wave-2-cursor-hooks.md`)
- Strateski kontekst: `project_locked_decisions` (Solo $19 / Teams $49 pricing) + `project_waggle_kvark_demand_generation` (Waggle = demand generator za KVARK; broken Solo install = broken demand pipeline)

---

## §6 — PM action item summary (tracked u TodoList)

1. **Standby za CC tactical patch verification report** — task #18 created
2. **Wave 1 cleanup brief autoring** — task #17 created, gated by Phase 5 §0 PASS
3. **Wave 2 cursor-hooks brief autoring** — gated by Wave 1 acceptance validation, ne kreira sad task

---

**End of LOCKED decision. Wave 1 cleanup ratifikovan. Tactical CC patch dozvoljen kao session-scoped workaround.**
