"""
Pytest for the Waggle τ² agent's HTTP-forwarding contract (Approach A+).

Hermetic: monkeypatches the module-level `_post` so NO bridge / network / model
is needed — only that the agent (a) discriminates UserMessage / ToolMessage /
MultiToolMessage into the right /turn payload, and (b) builds the right
AssistantMessage (tool_calls with dict arguments + content None, OR text content)
from the bridge response.

Requires the pinned τ² checkout importable (data_model.message + base_agent).
Skips cleanly if tau2 / the agent module isn't importable in this env.
"""
from __future__ import annotations

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(__file__))

pytest.importorskip("tau2.data_model.message")
pytest.importorskip("tau2.agent.base_agent")

from tau2.data_model.message import (  # noqa: E402
    AssistantMessage,
    MultiToolMessage,
    ToolMessage,
    UserMessage,
)

import waggle_tau2_agent as wta  # noqa: E402


def _make_agent() -> wta.WaggleBridgeAgent:
    return wta.WaggleBridgeAgent(tools=[], domain_policy="POLICY", llm="some-model")


def _capture_post(monkeypatch, response: dict) -> list:
    """Patch _post to record payloads and return a scripted response dict."""
    seen: list = []

    def fake_post(path: str, payload: dict) -> dict:
        seen.append((path, payload))
        return response

    monkeypatch.setattr(wta, "_post", fake_post)
    return seen


def test_user_message_forwards_as_message(monkeypatch):
    seen = _capture_post(monkeypatch, {"content": "hello there", "tool_calls": None})
    agent = _make_agent()
    msg, state = agent.generate_next_message(UserMessage(role="user", content="hi"), "sess-1")
    assert state == "sess-1"
    path, payload = seen[-1]
    assert path == "/turn"
    assert payload["message"] == {"role": "user", "content": "hi"}
    assert "tool_results" not in payload
    assert isinstance(msg, AssistantMessage)
    assert msg.content == "hello there"
    assert not msg.is_tool_call()


def test_tool_message_forwards_as_single_tool_result(monkeypatch):
    seen = _capture_post(monkeypatch, {"content": "ok", "tool_calls": None})
    agent = _make_agent()
    tm = ToolMessage(id="call_1", role="tool", content='{"status":"shipped"}', error=False)
    agent.generate_next_message(tm, "sess-2")
    path, payload = seen[-1]
    assert "message" not in payload
    assert payload["tool_results"] == [
        {"id": "call_1", "content": '{"status":"shipped"}', "error": False}
    ]


def test_multi_tool_message_forwards_all_results(monkeypatch):
    seen = _capture_post(monkeypatch, {"content": "ok", "tool_calls": None})
    agent = _make_agent()
    mtm = MultiToolMessage(
        role="tool",
        tool_messages=[
            ToolMessage(id="call_1", role="tool", content="r1", error=False),
            ToolMessage(id="call_2", role="tool", content="r2", error=True),
        ],
    )
    agent.generate_next_message(mtm, "sess-3")
    _, payload = seen[-1]
    assert payload["tool_results"] == [
        {"id": "call_1", "content": "r1", "error": False},
        {"id": "call_2", "content": "r2", "error": True},
    ]


def test_tool_calls_response_builds_tool_call_assistant_message(monkeypatch):
    _capture_post(
        monkeypatch,
        {
            "content": None,
            "tool_calls": [
                {"id": "call_1", "name": "get_order_details", "arguments": {"order_id": "#W1"}}
            ],
        },
    )
    agent = _make_agent()
    msg, _ = agent.generate_next_message(UserMessage(role="user", content="where is my order"), "sess-4")
    assert isinstance(msg, AssistantMessage)
    assert msg.is_tool_call()
    assert msg.content is None
    assert len(msg.tool_calls) == 1
    tc = msg.tool_calls[0]
    assert tc.id == "call_1"
    assert tc.name == "get_order_details"
    assert isinstance(tc.arguments, dict)
    assert tc.arguments == {"order_id": "#W1"}
    # τ²'s run() calls validate() on every agent message — must not raise.
    msg.validate()


def test_text_response_sets_content_and_validates(monkeypatch):
    _capture_post(monkeypatch, {"content": "Your order shipped.", "tool_calls": None})
    agent = _make_agent()
    msg, _ = agent.generate_next_message(UserMessage(role="user", content="status?"), "sess-5")
    assert not msg.is_tool_call()
    assert msg.content == "Your order shipped."
    msg.validate()


def test_empty_text_response_falls_back_to_nonempty(monkeypatch):
    _capture_post(monkeypatch, {"content": None, "tool_calls": None})
    agent = _make_agent()
    msg, _ = agent.generate_next_message(UserMessage(role="user", content="?"), "sess-6")
    assert not msg.is_tool_call()
    assert msg.content and msg.content.strip()
    msg.validate()
