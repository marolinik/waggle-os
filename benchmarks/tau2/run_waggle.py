#!/usr/bin/env python
"""Preload the Waggle τ² agent registration, then hand off to τ²'s CLI.

τ²'s `--agent <name>` resolves against its in-process registry and the CLI has
NO flag to import an external agent module (verified: upstream/src/tau2/cli.py is
argparse with no import hook). So we import `register` (sibling in ./agent) FIRST
— that calls `registry.register_agent_factory(create_waggle_agent, "waggle")` —
then invoke `tau2.cli.main()`, which now sees `waggle`.

Run as (cwd = ./upstream, under the upstream uv env):
    uv run python ../run_waggle.py run --domain retail --agent waggle ...
"""
import os
import sys

_AGENT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "agent")
if _AGENT_DIR not in sys.path:
    sys.path.insert(0, _AGENT_DIR)

import register  # noqa: E402,F401  — side effect: registers the 'waggle' factory

from tau2.cli import main  # noqa: E402

if __name__ == "__main__":
    main()
