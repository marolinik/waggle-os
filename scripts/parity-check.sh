#!/usr/bin/env bash
#
# RETIRED 2026-04-30 — the memory substrate moved to
# packages/hive-mind-core/src and the public mirror adopted a curated layout.
# This pre-migration injector cannot prove current parity and must not run.
#
# Current maintainer workflow:
#   1. Read AGENTS.md §7.5 and packages/hive-mind-core/CONTRIBUTING.md.
#   2. Run scripts/oss-drift-check.sh against a clean OSS checkout.
#   3. Prepare and review a maintainer-curated forward-port.

set -euo pipefail

echo "[parity-check] RETIRED: this pre-migration parity injector is disabled." >&2
echo "[parity-check] Use scripts/oss-drift-check.sh and the curated workflow in AGENTS.md §7.5." >&2
exit 2
