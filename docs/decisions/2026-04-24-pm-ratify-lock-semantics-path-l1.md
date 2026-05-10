# LOCKED — PM-RATIFY-LOCK-SEMANTICS Path L-1

**Date**: 2026-04-24
**Ratified by**: Marko Marković (via PM verified evidence)
**PM**: claude-opus-4-7 (Cowork)
**Prerequisite gate**: 1/3 (Task #29 progress)

## Odluka

**Path L-1 RATIFIED.** §7.4 `concurrent_runners: FORBIDDEN` pokriva cross-process threat model. Intra-wrapper `--parallel-concurrency N` spawns preko fail-open TOCTOU race. Manifest v4 anchor `dedd698` ostaje validan. Code freeze HEAD `373516c` nepromenjen. Bez manifest v5 reemisije.

## Waiver tekst (authoritative)

> §7.4 applies only to cross-process invocations. Intra-wrapper parallel spawns under `--parallel-concurrency N` are exempt. HEAD `373516c` behaviour satisfies the intent.

## Evidence verified

- `runner-lock.ts:77-112` check-then-write pattern confirmed. TOCTOU prozor između readExistingLock i fs.writeFileSync.
- `runner.ts:67-72` + 848-851 intent explicitly cross-process ("sentinel contend regardless of their --output paths")
- Gate D halt log: pid 4984 + pid 65668 oba logovali `[bench:lock] acquired` unutar 3s, file retained last-writer pid=65668

## Path L-2 rejection rationale

Per-cell sentinel ili O_EXCL flag edit zahteva izmenu u `runner.ts:852` i/ili `runner-lock.ts`, oba frozen per manifest v4 §11. Triggers manifest v5 reemisiju. Ne opravdano kada L-1 waiver drži.

## Artefact

- Memo: `benchmarks/results/manifest-v4-lock-semantics-clarification.md`
- Memo SHA-256: `f410b4f5e6c97c405cd39c51c385dfca9079a6f80a0a296a904309d5ab239d83`
- Anchor commit: `67eb89914a49ec38049379bf952d5f62b82c188d` on `feature/c3-v3-wrapper`

## Task 2.6 carry-over ticket

**`bench-lock-exclusive-create`** (defensive upgrade, Stage-3-independent):
- Swap `fs.writeFileSync` → `fs.openSync(path, 'wx')` (O_EXCL) in `runner-lock.ts`
- Per-cell sentinel path in `runner.ts:852`
- Parallel-acquire unit test (exactly one succeeds, other throws)

## Next gate

CC-1 authorized to advance to §1.2 Runner Early-Exit RCA memo. No self-advance to N=400 re-kick.
