"""Tests for the Groq-backed weekly-digest generation (B5).

The Groq client is fully mocked -- NO network happens. We verify:
- the rendered prompt carries the aggregated numbers,
- no user-identifier-like content leaks into the prompt (privacy / PRD 7.3),
- a mocked structured response maps cleanly onto ``DigestResponse``.
"""

import json
from types import SimpleNamespace

import pytest

from app import digest
from app.models import DigestResponse, Suggestion


SENTINEL_UUID = "11111111-2222-3333-4444-555555555555"


def sample_metrics() -> dict:
    return {
        "zone_name": "The Quiet Corner",
        "window_days": 7,
        "quiet_index_trend": [
            {"day": "2026-06-15", "avg_value": 80.0, "avg_active_count": 5.0},
            {"day": "2026-06-16", "avg_value": 72.5, "avg_active_count": 4.0},
        ],
        "check_in_count": 37,
        "total_quiet_minutes": 1840.0,
        "total_points_accrued": 920,
        "redemption_count": 6,
        "peak_window": {"hour_of_day": 14, "max_active_count": 8},
    }


def test_build_user_content_contains_aggregated_numbers():
    metrics = sample_metrics()
    content = digest.build_user_content(metrics)

    assert "The Quiet Corner" in content
    assert "37" in content  # check_in_count
    assert "920" in content  # total_points_accrued


def test_build_messages_is_user_role_with_aggregated_numbers():
    metrics = sample_metrics()
    messages = digest.build_messages(metrics)

    assert isinstance(messages, list)
    assert len(messages) == 1
    assert messages[0]["role"] == "user"

    text = str(messages[0]["content"])
    assert "The Quiet Corner" in text
    assert "37" in text
    assert "920" in text


def test_prompt_has_no_user_identifiers():
    """Privacy guard (SR / PRD 7.3): only aggregated keys are rendered.

    The metrics dict has no per-user fields. Assert a sentinel UUID injected
    *outside* the known keys never reaches the prompt, and that no
    ``user_id``-like token appears.
    """
    metrics = sample_metrics()
    # Someone later stuffing a raw row in must not silently leak it.
    metrics_with_stray = {**metrics, "user_id": SENTINEL_UUID, "device_token": SENTINEL_UUID}

    content = digest.build_user_content(metrics_with_stray)

    assert SENTINEL_UUID not in content
    assert "user_id" not in content
    assert "device_token" not in content
    assert "auth.uid" not in content


def test_system_prompt_is_calm_anti_engagement():
    system = digest.SYSTEM_PROMPT.lower()
    # Calm, factual, non-hype framing.
    assert "calm" in system or "plain" in system
    # 2-4 gentle suggestions.
    assert "suggestion" in system


def _fake_completion(content: str):
    return SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=content))]
    )


def test_generate_digest_maps_structured_response(monkeypatch):
    expected_payload = {
        "summary": "A calm, steady week in the zone.",
        "suggestions": [
            {"title": "Keep the afternoon rhythm", "body": "The 2pm window is your busiest."},
            {"title": "Gently invite a few more", "body": "A small nudge could help."},
        ],
    }

    captured = {}

    class FakeCompletions:
        def create(self, **kwargs):
            captured.update(kwargs)
            return _fake_completion(json.dumps(expected_payload))

    class FakeChat:
        completions = FakeCompletions()

    class FakeClient:
        chat = FakeChat()

    monkeypatch.setattr(digest, "_client", lambda: FakeClient())
    monkeypatch.setattr(
        digest,
        "get_settings",
        lambda: SimpleNamespace(GROQ_API_KEY="test-key", DIGEST_MODEL="openai/gpt-oss-120b"),
    )

    result = digest.generate_digest(sample_metrics())

    assert isinstance(result, DigestResponse)
    assert result.summary == "A calm, steady week in the zone."
    assert len(result.suggestions) == 2
    assert result.suggestions[0].title == "Keep the afternoon rhythm"

    # Bound to the strict JSON-schema structured-output surface with the right model.
    assert captured["model"] == "openai/gpt-oss-120b"
    assert captured["max_tokens"] == 2048
    response_format = captured["response_format"]
    assert response_format["type"] == "json_schema"
    assert response_format["json_schema"]["strict"] is True
    assert response_format["json_schema"]["schema"] == DigestResponse.model_json_schema()
    # System prompt goes in the messages list (Groq has no top-level system param).
    assert captured["messages"][0] == {"role": "system", "content": digest.SYSTEM_PROMPT}
    assert captured["messages"][1]["role"] == "user"


def test_generate_digest_validates_json_content(monkeypatch):
    """The response's message.content is a JSON string that gets validated."""
    payload = {
        "summary": "Quiet and low-key.",
        "suggestions": [{"title": "Rest", "body": "Low activity is fine."}],
    }

    class FakeCompletions:
        def create(self, **kwargs):
            return _fake_completion(json.dumps(payload))

    class FakeChat:
        completions = FakeCompletions()

    class FakeClient:
        chat = FakeChat()

    monkeypatch.setattr(digest, "_client", lambda: FakeClient())
    monkeypatch.setattr(
        digest,
        "get_settings",
        lambda: SimpleNamespace(GROQ_API_KEY="test-key", DIGEST_MODEL="openai/gpt-oss-120b"),
    )

    result = digest.generate_digest(sample_metrics())
    assert isinstance(result, DigestResponse)
    assert result.summary == "Quiet and low-key."
    assert result.suggestions[0].title == "Rest"


def test_client_built_lazily(monkeypatch):
    """The Groq client is constructed on demand, not at import time."""
    digest._client.cache_clear()

    constructed = {}

    class FakeGroq:
        def __init__(self, *, api_key):
            constructed["api_key"] = api_key

    monkeypatch.setattr(digest, "Groq", FakeGroq)
    monkeypatch.setattr(
        digest,
        "get_settings",
        lambda: SimpleNamespace(GROQ_API_KEY="test-key", DIGEST_MODEL="openai/gpt-oss-120b"),
    )

    client = digest._client()
    assert isinstance(client, FakeGroq)
    assert constructed["api_key"] == "test-key"
    digest._client.cache_clear()
