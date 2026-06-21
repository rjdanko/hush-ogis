import pytest
from fastapi import HTTPException

from app import rate_limit
from app.rate_limit import check_rate_limit, enforce_rate_limit


@pytest.fixture(autouse=True)
def reset_state():
    rate_limit._reset()
    yield
    rate_limit._reset()


@pytest.fixture
def fake_clock(monkeypatch):
    state = {"now": 1000.0}
    monkeypatch.setattr(rate_limit, "_now", lambda: state["now"])
    return state


def test_within_limit_all_allowed(fake_clock):
    limit = 5
    for _ in range(limit):
        assert check_rate_limit("op", "digest", limit, 60.0) is True


def test_over_limit_not_allowed(fake_clock):
    limit = 3
    for _ in range(limit):
        assert check_rate_limit("op", "digest", limit, 60.0) is True
    assert check_rate_limit("op", "digest", limit, 60.0) is False


def test_window_resets_after_elapse(fake_clock):
    limit = 1
    assert check_rate_limit("op", "digest", limit, 60.0) is True
    assert check_rate_limit("op", "digest", limit, 60.0) is False
    # Advance past the window.
    fake_clock["now"] += 61.0
    assert check_rate_limit("op", "digest", limit, 60.0) is True


def test_independent_identity_buckets(fake_clock):
    limit = 1
    assert check_rate_limit("op-a", "digest", limit, 60.0) is True
    assert check_rate_limit("op-b", "digest", limit, 60.0) is True
    assert check_rate_limit("op-a", "digest", limit, 60.0) is False


def test_independent_action_buckets(fake_clock):
    limit = 1
    assert check_rate_limit("op", "digest", limit, 60.0) is True
    assert check_rate_limit("op", "other", limit, 60.0) is True
    assert check_rate_limit("op", "digest", limit, 60.0) is False


def test_enforce_raises_429_when_over_limit(fake_clock):
    limit = 1
    enforce_rate_limit("op", "digest", limit, 60.0)
    with pytest.raises(HTTPException) as exc_info:
        enforce_rate_limit("op", "digest", limit, 60.0)
    assert exc_info.value.status_code == 429
    assert exc_info.value.detail == "rate_limited"
