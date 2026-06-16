"""Importing this module registers the 'waggle' agent with τ²'s registry."""
from tau2.registry import registry  # type: ignore
from waggle_tau2_agent import create_waggle_agent

registry.register_agent_factory(create_waggle_agent, "waggle")
