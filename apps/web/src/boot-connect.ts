/**
 * UX Refactor v2.1 P1b (D3) — boot connect kickoff.
 *
 * MUST stay main.tsx's FIRST import: ES-module import hoisting evaluates this
 * module before any sibling, so the adapter's connect attempt is in flight
 * before any component module could possibly issue a request — that is what
 * arms the adapter's ensureReady() deferral gate for the entire boot burst
 * (ServiceProvider's effect runs LAST among mount effects because it is the
 * outermost provider; without this kickoff every child mount fetch would fire
 * token-less first).
 *
 * Errors are swallowed here: ServiceProvider owns retry/backoff and the
 * user-facing connection state, and a settled-failed attempt releases (then
 * re-arms) the gate rather than wedging it.
 */
import { adapter } from './lib/adapter';

adapter.connect().catch(() => { /* ServiceProvider surfaces connection state */ });
