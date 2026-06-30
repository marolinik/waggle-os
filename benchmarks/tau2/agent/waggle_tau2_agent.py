"""
Waggle τ² custom agent — forwards every turn to the Node bridge server.

Implements τ²'s HalfDuplexAgent contract (get_init_state / generate_next_message).
The agent turn is produced in the Node bridge (direct litellm /chat/completions +
system-prompt assembly + memory injection); this class is a thin HTTP forwarder.
It discriminates the τ² input (UserMessage vs Tool/MultiToolMessage), forwards the
model's tool_calls back to τ² for execution, and threads tool results into the next
turn. --agent-llm flows straight into the bridge /turn `model` field.

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
            # Seed prior history WITHOUT running the agent (append-only) — matches
            # the stock agent: get_init_state records history, only
            # generate_next_message calls the LLM. (Posting /turn here would run
            # the agent on a seeded assistant greeting → Anthropic 400.) Forward
            # tool history too (assistant.tool_calls / tool.id) so an initial_state
            # tool round-trip is preserved.
            for m in message_history:
                seed_msg = self._seed_message(m)
                if seed_msg is not None:
                    _post("/seed", {"session_id": session_id, "message": seed_msg})
        return session_id

    @staticmethod
    def _seed_message(m: Any) -> Optional[dict]:
        """Render a τ² history message into the bridge /seed wire shape, keeping
        tool history. Returns None for shapes the bridge can't seed."""
        role = getattr(m, "role", None) or (m.get("role") if isinstance(m, dict) else "user")
        content = getattr(m, "content", None)
        if content is None and isinstance(m, dict):
            content = m.get("content")
        tool_calls = getattr(m, "tool_calls", None)
        if tool_calls is None and isinstance(m, dict):
            tool_calls = m.get("tool_calls")
        if role == "assistant" and tool_calls:
            return {
                "role": "assistant",
                "content": "",
                "tool_calls": [
                    {
                        "id": getattr(tc, "id", "") or (tc.get("id", "") if isinstance(tc, dict) else ""),
                        "type": "function",
                        "function": {
                            "name": getattr(tc, "name", "") or (tc.get("name", "") if isinstance(tc, dict) else ""),
                            "arguments": json.dumps(
                                getattr(tc, "arguments", None)
                                or (tc.get("arguments") if isinstance(tc, dict) else None)
                                or {}
                            ),
                        },
                    }
                    for tc in tool_calls
                ],
            }
        if role == "tool":
            tool_id = getattr(m, "id", None) or (m.get("id") if isinstance(m, dict) else None)
            return {"role": "tool", "content": content or "", "tool_call_id": tool_id}
        return {"role": role, "content": content or ""}

    def generate_next_message(self, message: Any, state: str):
        # τ² hands the agent one of: UserMessage (user-sim turn), ToolMessage or
        # MultiToolMessage (environment turn after the agent's tool_calls ran).
        # Import lazily to keep this file importable for a registration-only smoke.
        from tau2.data_model.message import (  # type: ignore
            AssistantMessage,
            MultiToolMessage,
            ToolCall,
            ToolMessage,
        )

        payload: dict = {
            "session_id": state,
            "model": self.llm,
            "domain_policy": self.domain_policy,
            "tools": self._tool_schemas(),
        }
        if isinstance(message, MultiToolMessage):
            payload["tool_results"] = [
                {"id": tm.id, "content": tm.content or "", "error": bool(getattr(tm, "error", False))}
                for tm in message.tool_messages
            ]
        elif isinstance(message, ToolMessage):
            payload["tool_results"] = [
                {"id": message.id, "content": message.content or "", "error": bool(getattr(message, "error", False))}
            ]
        else:  # UserMessage (or dict fallback)
            role = getattr(message, "role", None) or (message.get("role") if isinstance(message, dict) else "user")
            content = getattr(message, "content", "") or (message.get("content", "") if isinstance(message, dict) else "")
            payload["message"] = {"role": role, "content": content or ""}

        out = _post("/turn", payload)

        tcs = out.get("tool_calls")
        if tcs:
            tool_calls = [
                ToolCall(id=tc["id"], name=tc["name"], arguments=tc.get("arguments") or {})
                for tc in tcs
            ]
            return AssistantMessage(role="assistant", content=None, tool_calls=tool_calls), state
        return AssistantMessage(
            role="assistant",
            content=out.get("content") or "I'm sorry, could you clarify?",
        ), state


def create_waggle_agent(tools, domain_policy, **kwargs):
    """Factory matching τ²'s register_agent_factory signature."""
    return WaggleBridgeAgent(
        tools=tools,
        domain_policy=domain_policy,
        llm=kwargs.get("llm"),
        llm_args=kwargs.get("llm_args"),
    )
