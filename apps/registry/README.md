# Waggle Skill Registry · `apps/registry/`

Future home of the **public skill registry web property** (FR-3 from the 2026-05-28 addictiveness audit).

## Status — MVP 0.1.0 (2026-05-28)

The MVP ships as a **single sidecar route** rather than a separate Vite app:

- `GET http://127.0.0.1:3333/registry` — self-contained HTML page (search + category filter + grid of 148 skills + "Open in Waggle" deep-link)
- `GET http://127.0.0.1:3333/api/registry/catalog` — canonical JSON for any future client (Vite app, mobile, RSS feed, peer Waggle install discovering skills, etc.)

Both endpoints are defined in `packages/server/src/local/routes/registry.ts`. Visiting `/registry` in the user's browser while their Waggle sidecar is running is the v0.1.0 user path.

## Why one-file MVP instead of a real Vite app here

The audit's iter-8 cell-impact estimate for FR-3 was 4-6 cells (P4/P8/P9/P10). A separate Vite app would have shipped 0 of those cells until deployed somewhere public — the actual lift comes from *peers being able to link to a skill page*, which only works after `registry.waggle-os.ai` (or wherever) is live. The MVP delivers the substrate (canonical JSON + HTML renderer) without burning a sprint on Vite scaffolding before the hosting decision is made.

## Roadmap

### v0.2 — Anchored URLs + scroll-into-view
Today's HTML renders the grid but `/registry#stripe` doesn't scroll to the Stripe card. Add `id=` attributes + `scrollIntoView` on hash change.

### v0.3 — Deep-link handler (the actual addictive surface)
`Open in Waggle` button currently links to `http://127.0.0.1:3333/?openSkill=<id>`. The desktop frontend needs to:
1. Parse `?openSkill=` on launch
2. Open Marketplace
3. Scroll to the skill + flash its card
4. Pre-fill an install confirm with provenance ("opened from the public registry")

Without v0.3 the click works only if Waggle is already running. v0.4 adds a Tauri custom protocol handler (`waggle://`) so the registry page can actually launch the desktop.

### v0.5 — Extract this folder into a real Vite app
When we decide the hosting plan (Vercel? Cloudflare Pages? self-hosted?), move the HTML out of the route file into here as a Vite app. Wire `apps/registry/package.json` + a build to `apps/registry/dist/`. The canonical `/api/registry/catalog` JSON endpoint stays exactly the same — that's the whole point of shipping the JSON-first MVP.

### v1.0 — Submissions UX
Add a "Submit a skill" path that opens a GitHub PR template against `packages/shared/src/mcp-catalog.ts`. The catalog stays the single source of truth; the registry is just the read surface.

## Catalog source

The 148 MCP server entries live in `packages/shared/src/mcp-catalog.ts`. Adding a skill means PR-ing that file. The `@waggle/shared` package is the single import the registry route reads from — same data the in-app `MarketplaceApp` already renders.

## Testing the MVP

```bash
# Sidecar must be running (npx tsx packages/server/src/local/start.ts)
curl http://127.0.0.1:3333/api/registry/catalog | head -c 200
# → {"version":"0.1.0","generatedAt":"…","categories":["Database",…
open http://127.0.0.1:3333/registry
# → renders the grid. Search + category chips work. "Open in Waggle"
#   deep-link works ONLY if Waggle desktop is already running (v0.3
#   blocker — protocol handler).
```
