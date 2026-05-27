# Waggle OS — 5-Persona Knowledge-Worker UX Audit
**Started:** 2026-05-27
**Goal:** Iterate UI/UX until all 5 personas score 10/10
**Effort:** max · ULTRATHINK

## Loop
1. Boot waggle at `http://127.0.0.1:3333` (built UI via sidecar)
2. For each persona: simulate their first 5 min via Chrome DevTools MCP
3. Score against 10-dim rubric, capture screenshots, log frictions
4. Triage findings → fix highest-impact issues (surgical, per CLAUDE.md §3.3)
5. Rebuild · re-audit · re-score
6. Stop when every persona = 10/10

## Surfaces in scope
- `apps/web/src/components/os/Desktop.tsx`, `Dock.tsx`, `BootScreen.tsx`
- `apps/web/src/components/os/apps/ChatApp.tsx` (primary task surface)
- `apps/web/src/components/os/apps/{agents,memory,files,cockpit,connectors}/*`
- `apps/web/src/components/os/overlays/{OnboardingWizard,PersonaSwitcher,SpawnAgentDialog,GlobalSearch,ContextRail}.tsx`

## Out of scope
- Sidecar/backend logic unless it surfaces UX friction
- Performance work beyond perceived-speed audit
- Code-signing / launch / billing
- Anything not user-facing
