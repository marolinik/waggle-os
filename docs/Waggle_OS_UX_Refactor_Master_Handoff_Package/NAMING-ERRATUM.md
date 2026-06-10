# NAMING ERRATUM — Waggle OS UX Refactor Master Handoff Package

**Date:** 2026-06-10 · **Authority:** ratified decision register D9/D10
(`docs/ux-refactor/deltas/open-questions.md`, section "UX Refactor v2.1 — Ratification of
Decision Register D1–D15 (2026-06-10)")

This package (blueprint PDF/docx, deck, PRD, mockup images) is annotated, **not regenerated**,
per ratified D9. Read it with the corrections below.

## (a) "Win+K" is superseded — the surface is "Command Center", binding **Ctrl+K**

Every occurrence of **"Win+K"** in this package — the blueprint PDF/docx (14 hits), the PRD
(~22 hits, e.g. lines 19, 461), the Implementation Handoff (5 hits), and the mockup filename
`Waggle_OS_Handoff_Assets/screen_03_win_k_command_center.png` — is **superseded**:

- The surface is the **Command Center** palette; the binding is **Ctrl+K** (**Cmd+K on macOS**),
  per Brief v2.1 rule 1 and ratified **D9**.
- **Win+K was never shipped and cannot be**: the Win key is OS-reserved on Windows (Win+K opens
  the Cast/Connect flyout). The actual binding has always been Ctrl+K — see
  `apps/web/src/hooks/useKeyboardShortcuts.ts` (lines 32, 92–93: `e.ctrlKey || e.metaKey` +
  `'k'`; `metaKey` provides Cmd+K on macOS).
- Disambiguation (ratified **D8**): "Command Center" is **reserved for the Ctrl+K palette**.
  The dock System-zone entry formerly labeled "Command Center" (`appId 'cockpit'`) is relabeled
  "Mission Control".

## (b) Mockup images are visual direction only

The generated mockup images in `Waggle_OS_Handoff_Assets/` (`screen_01`–`screen_17`,
`screens_18_21`, the `0X_board_*` boards, and the brainstorm photos) are **visual direction
only**. Where an image conflicts with the written blueprint or the brief, **the written
blueprint + Brief v2.1 govern** (brief §"Do not"). Pixel details, copy, and labels in the
images (including any "Win+K" text) carry no spec authority.

## (c) Authority chain (ratified D10)

When documents conflict, higher wins:

1. **v2.1 ratification register** — `docs/ux-refactor/deltas/open-questions.md`
   ("Ratification of Decision Register D1–D15", 2026-06-10)
2. **Brief v2.1** (Workspace-First UX Refactor v2.1, Launch Cut, Audit-First)
3. **`docs/UX_REFACTOR_STATE_AUDIT.md`** (repo-state audit, 2026-06-10)
4. **This blueprint package** (`docs/Waggle_OS_UX_Refactor_Master_Handoff_Package/`)
5. **Prior-plan docs** (`docs/ux-refactor/`)

## (d) Path corrections (accepted from audit §7)

The brief/package guess some file locations; the verified locations are:

| File | Actual location |
|---|---|
| `workspace-manager.ts` | `packages/hive-mind-core/src/workspace-manager.ts` (moved 2026-04-30 migration; re-exported via `@waggle/core`) |
| `workspace-state.ts` | `packages/server/src/local/workspace-state.ts` |
| `workspace-context.ts` | `packages/server/src/local/routes/workspace-context.ts` |

---

*Per D10, the package's text files (PRD, Implementation Handoff, `_blueprint_extracted.txt`,
assets `README.md` + `ASSET_MANIFEST.json`, and this erratum) are committed; the binary exports
(pdf/docx/pptx/png/jpg, ~85 MB) are gitignored and remain local-only.*
