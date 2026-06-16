# Vendored τ²-bench

- **Upstream:** https://github.com/sierra-research/tau2-bench
- **License:** MIT (retained at `upstream/LICENSE`)
- **Pinned commit:** `5ebebbe827b455b3ed04fcb9294235c6ef4e5fd6`
  ("feat: make review model configurable (#346)", verified HEAD 2026-06-16).
  Kept in lockstep with `TAU2_PINNED_COMMIT` in
  `benchmarks/harness/src/tau2/vendor-pin.ts`.

The vendored tree (`upstream/`) is **gitignored** — we do NOT commit τ²'s MIT
source into this repo. It is re-clonable at the pinned SHA via `scripts/vendor.sh`.
Only our adapter code, `vendor-pin.ts`, this file, and `scripts/vendor.sh` are
tracked.

## Re-vendoring

```bash
bash benchmarks/tau2/scripts/vendor.sh          # clones/updates upstream/ at the pinned SHA, prints HEAD SHA, runs `uv sync`
# then paste the printed SHA into vendor-pin.ts::TAU2_PINNED_COMMIT and update this file.
```

The vendoring probe `benchmarks/harness/tests/tau2/vendor-pin.test.ts` re-asserts
the checkout's HEAD == the pin and that `upstream/LICENSE` is MIT.

## Python environment

Installed with `uv` (`uv sync` in `upstream/`). Run the τ² CLI via
`uv run tau2 ...` from inside `upstream/` (the integration smoke passes the
launcher via `WAGGLE_TAU2_LAUNCHER`, default `tau2`).

## Domains used

`mock` (integration smoke), `retail` / `airline` / `telecom` (Phase 1).
