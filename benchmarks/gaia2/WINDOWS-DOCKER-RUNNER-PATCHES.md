# Windows Docker runner patches — recovery reference

**Why this file exists:** the gaia2-runner lives under `external/meta-agents-research-environments/`
which is **gitignored**. The 3 patches below make the runner work on Docker Desktop for Windows.
They are plain files on disk (not tracked), so a `docker system prune`, an `external/` reset, or a
fresh `uv sync` would silently wipe them. This file is the tracked source of truth — reapply from here.

**Target files (in the MAIN repo working dir, not this worktree):**
- `D:/Projects/waggle-os/external/meta-agents-research-environments/gaia2-cli/runner/gaia2_runner/launcher.py`
- `D:/Projects/waggle-os/external/meta-agents-research-environments/gaia2-cli/runner/gaia2_runner/runner.py`

All three are no-ops on Linux/macOS (guarded by `platform.system()` or UTF-8-default behavior),
so this is also the basis for a clean upstream PR (Path A in PHASE-4-P4.2-PROGRESS-2026-05-21.md §5).

---

## Patch 1 — drop `--network=host` on Windows (`launcher.py` ~line 410)

Inside `launch_container(...)`, immediately after `container_name = self._container_name(...)`:

```python
        # 2026-05-21 Marko patch: drop --network=host on Docker Desktop Windows.
        # `host` networking + `-p` port publishing is a broken combo on Docker
        # Desktop (host network refers to the Linux VM, not Windows; published
        # ports fail to bind). Default bridge network + -p mapping works.
        import platform
        use_host_network = platform.system() != "Windows" and network == "host"

        cmd = [
            *self._rt,
            "run",
            "-d",
            f"--name={container_name}",
        ]
        if use_host_network:
            cmd.append(f"--network={network}")
        elif network != "host":
            # Explicit non-host network passed by caller — honor it
            cmd.append(f"--network={network}")
        # else: Windows + host-default → use Docker's default bridge
```

## Patch 2 — publish adapter port to host (`launcher.py` ~line 444)

In the dynamic-port-allocation block, the `adapter_port` branch must publish the port:

```python
        if adapter_port is not None:
            cmd.extend(["-e", f"GAIA2_ADAPTER_PORT={adapter_port}"])
            cmd.extend(["-p", f"{adapter_port}:{adapter_port}"])   # <-- the added line
```

Without the `-p` line the host-side `_poll_for_response` against `127.0.0.1:8090` fails with
`WinError 10061` because Docker Desktop runs the container in a Linux VM, so "host" loopback
is the VM, not Windows.

## Patch 3 — force UTF-8 on artifact writes (`runner.py` ~line 722)

In the artifact-write block, every `write_text` / `json.dumps` must use UTF-8:

```python
            # 2026-05-21 Marko patch: force UTF-8 encoding on all artifact writes.
            # Windows default is cp1252 (charmap) which fails on Unicode chars
            # like -> OK that appear in agent_response + judge output.
            (artifact_dir / "events.jsonl").write_text(events_raw, encoding="utf-8")
            (artifact_dir / "agent_response.txt").write_text(agent_response or "", encoding="utf-8")
            (artifact_dir / "result.json").write_text(
                json.dumps(result, indent=2, default=str, ensure_ascii=False) + "\n",
                encoding="utf-8",
            )
```

---

## Verification after reapply

```powershell
# from gaia2-cli/ with Docker Desktop running:
docker port <container>          # should now show 8090/tcp -> 0.0.0.0:8090
# runner status poll should succeed instead of WinError 10061
```

**Provenance:** captured 2026-05-22 from the on-disk patched files (mtime 2026-05-21 19:03/19:11),
which produced the P4.3 N=10 result committed in `b0248b6` (8/10 strict, 8/8 judged-only).
