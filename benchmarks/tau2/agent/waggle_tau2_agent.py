"""
Waggle τ² custom agent — forwards every turn to the Node bridge server.

Implements τ²'s HalfDuplexAgent contract (get_init_state / generate_next_message).
All agent logic lives in the Node bridge (runAgentLoop); this class is a thin
HTTP forwarder so --agent-llm flows straight into runAgentLoop's `model`.

Bridge URL comes from $WAGGLE_TAU2_BRIDGE_URL (default http://127.0.0.1:8088).
Register via register.py: registry.register_agent_factory(create_waggle_agent, "waggle").

Tool schema: τ²'s Tool exposes a property `openai_schema` returning the full
OpenAI function wrapper {"type": "function", "function": {name, description,
parameters}} (verified against the pinned τ²-bench checkout, 2026-06-16). We
extract the inner function dict for the bridge contract, with dict fallbacks for
robustness across τ² versions.
"""

from __future__ import annotations

import json
import os
import urllib.request
import uuid
from typing import Any, List, Optional

from tau2.agent.base_agent import HalfDuplexAgent


BRIDGE_URL = os.environ.get("WAGGLE_TAU2_BRIDGE_URL", "http://127.0.0.1:8088")


def _post(path: str, payload: dict) -> dict:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{BRIDGE_URL}{path}",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=300) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _tool_schema(t: Any) -> dict:
    """Normalize a τ² Tool (or dict) to {name, description, parameters}.

    τ²'s Tool.openai_schema is a property returning:
      {"type": "function", "function": {"name", "description", "parameters"}}
    We unwrap the inner function dict. Falls back to attribute/dict access for
    older/other τ² shapes.
    """
    name = getattr(t, "name", None) or (t.get("name") if isinstance(t, dict) else None)
    desc = getattr(t, "description", "") or (t.get("description", "") if isinstance(t, dict) else "")
    params: Optional[dict] = None

    schema = getattr(t, "openai_schema", None)
    if schema is None and isinstance(t, dict):
        schema = t.get("openai_schema")
    if isinstance(schema, dict):
        fn = schema.get("function", schema)
        if isinstance(fn, dict):
            params = fn.get("parameters")
            name = name or fn.get("name")
            desc = desc or fn.get("description", "")
    if params is None and isinstance(t, dict):
        params = t.get("parameters")

    return {
        "name": name,
        "description": desc,
        "parameters": params or {"type": "object", "properties": {}},
    }


class WaggleBridgeAgent(HalfDuplexAgent[str]):
    """HalfDuplexAgent[str] — state is the bridge session id.

    Inherits the base so τ²'s runner gets set_seed() + is_stop() for free
    (both are concrete on the base); we override only get_init_state +
    generate_next_message, which forward each turn to the Node bridge."""

    def __init__(self, tools: List[Any], domain_policy: str, llm: str,
                 llm_args: Optional[dict] = None) -> None:
        super().__init__(tools=tools, domain_policy=domain_policy)
        self.llm = llm
        self.llm_args = llm_args or {}

    def _tool_schemas(self) -> List[dict]:
        return [_tool_schema(t) for t in self.tools]

    def get_init_state(self, message_history: Optional[list] = None) -> str:
        # A fresh bridge session per task. message_history (if any) is replayed.
        session_id = uuid.uuid4().hex
        if message_history:
            for m in message_history:
                role = getattr(m, "role", None) or (m.get("role") if isinstance(m, dict) else "user")
                content = getattr(m, "content", "") or (m.get("content", "") if isinstance(m, dict) else "")
                _post("/turn", {
                    "session_id": session_id, "model": self.llm,
                    "domain_policy": self.domain_policy,
                    "message": {"role": role, "content": content or ""},
                    "tools": self._tool_schemas(),
                })
        return session_id

    def generate_next_message(self, message: Any, state: str):
        role = getattr(message, "role", None) or (message.get("role") if isinstance(message, dict) else "user")
        content = getattr(message, "content", "") or (message.get("content", "") if isinstance(message, dict) else "")
        out = _post("/turn", {
            "session_id": state, "model": self.llm,
            "domain_policy": self.domain_policy,
            "message": {"role": role, "content": content or ""},
            "tools": self._tool_schemas(),
        })
        # τ² expects an AssistantMessage; import lazily to avoid a hard dep at
        # module import time (keeps this file importable for a smoke that only
        # checks registration).
        from tau2.data_model.message import AssistantMessage  # type: ignore
        return AssistantMessage(role="assistant", content=out.get("content", "")), state


def create_waggle_agent(tools, domain_policy, **kwargs):
    """Factory matching τ²'s register_agent_factory signature."""
    return WaggleBridgeAgent(
        tools=tools,
        domain_policy=domain_policy,
        llm=kwargs.get("llm"),
        llm_args=kwargs.get("llm_args"),
    )
