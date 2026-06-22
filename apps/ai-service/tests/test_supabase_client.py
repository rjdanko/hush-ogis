import pytest

from app import supabase_client
from app.supabase_client import (
    ZoneNotAuthorizedError,
    fetch_zone_badge_average,
    fetch_zone_weekly_metrics,
)

SAMPLE_METRICS = {"zone_id": "z1", "sessions": 12, "avg_silence_score": 87}


class _FakeExecuteResult:
    def __init__(self, data):
        self.data = data


class _FakeRpc:
    def __init__(self, fake):
        self._fake = fake

    def execute(self):
        if self._fake.raise_error is not None:
            raise self._fake.raise_error
        return _FakeExecuteResult(self._fake.data)


class _FakeClient:
    def __init__(self, data=None, raise_error=None):
        self.data = data
        self.raise_error = raise_error
        self.last_rpc_name = None
        self.last_rpc_params = None

    def rpc(self, name, params):
        self.last_rpc_name = name
        self.last_rpc_params = params
        return _FakeRpc(self)


def test_fetch_passes_rpc_name_and_params_and_returns_data(monkeypatch):
    fake = _FakeClient(data=SAMPLE_METRICS)
    monkeypatch.setattr(supabase_client, "_client", lambda: fake)

    result = fetch_zone_weekly_metrics("zone-123", "op-456")

    assert fake.last_rpc_name == "zone_weekly_metrics"
    assert fake.last_rpc_params == {"p_zone_id": "zone-123", "p_operator_id": "op-456"}
    assert result == SAMPLE_METRICS


def test_not_authorized_translates_to_custom_error(monkeypatch):
    err = Exception("PostgREST error: not_authorized")
    fake = _FakeClient(raise_error=err)
    monkeypatch.setattr(supabase_client, "_client", lambda: fake)

    with pytest.raises(ZoneNotAuthorizedError):
        fetch_zone_weekly_metrics("zone-123", "op-456")


def test_other_errors_propagate(monkeypatch):
    err = RuntimeError("connection refused")
    fake = _FakeClient(raise_error=err)
    monkeypatch.setattr(supabase_client, "_client", lambda: fake)

    with pytest.raises(RuntimeError):
        fetch_zone_weekly_metrics("zone-123", "op-456")


def test_fetch_badge_average_passes_rpc_name_and_params_and_returns_data(monkeypatch):
    fake = _FakeClient(data=87.5)
    monkeypatch.setattr(supabase_client, "_client", lambda: fake)

    result = fetch_zone_badge_average("zone-123", "op-456")

    assert fake.last_rpc_name == "zone_badge_average"
    assert fake.last_rpc_params == {"p_zone_id": "zone-123", "p_operator_id": "op-456"}
    assert result == 87.5


def test_fetch_badge_average_not_authorized_translates_to_custom_error(monkeypatch):
    err = Exception("PostgREST error: not_authorized")
    fake = _FakeClient(raise_error=err)
    monkeypatch.setattr(supabase_client, "_client", lambda: fake)

    with pytest.raises(ZoneNotAuthorizedError):
        fetch_zone_badge_average("zone-123", "op-456")
