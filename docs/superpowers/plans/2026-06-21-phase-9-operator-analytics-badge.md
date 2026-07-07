# Phase 9 — Operator Analytics & Certification Badge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give operators a 7-day Quiet Index trend chart + reward-economics snapshot (O3), polish the live feed with an active-check-in count (O2), and ship a signed, short-TTL, tamper-proof embeddable certification badge (O4, SR-11).

**Architecture:** Mirror the Phase 7 digest pattern throughout: a new Postgres `SECURITY DEFINER` function does the IDOR-guarded aggregate read (badge average), a new FastAPI route verifies the operator JWT then calls it, and a new Next.js API route re-authenticates the operator and proxies to FastAPI with their access token as the Bearer credential. The badge itself is a **stateless, self-contained signed JWT**: the average Quiet Index is baked into the token at mint time, so the public render endpoint never touches the DB — it only verifies the signature and expiry before drawing the SVG. That is what makes "forged" and "stale" two independently testable rejection paths.

**Tech Stack:** Supabase Postgres (`SECURITY DEFINER` SQL function + pgTAP), FastAPI + PyJWT (already a dependency), Next.js API routes, React + Recharts (new dependency) for the trend chart.

---

## Before you start

Read these existing files — every task below extends their exact patterns:

- `apps/ai-service/app/routes_digest.py`, `app/supabase_client.py`, `app/auth.py`, `app/settings.py`, `app/rate_limit.py`, `app/models.py` — the FastAPI patterns this plan mirrors.
- `supabase/migrations/0023_zone_weekly_metrics.sql` and `supabase/tests/database/020_zone_weekly_metrics.sql` — the `SECURITY DEFINER` + pgTAP pattern this plan mirrors.
- `apps/dashboard/app/api/digest/route.ts`, `apps/dashboard/components/DigestPanel.tsx`, `apps/dashboard/components/LiveQuietIndex.tsx`, `apps/dashboard/lib/quiet-index.ts` — the dashboard proxy/component patterns this plan mirrors.
- `apps/ai-service/tests/test_digest_endpoint.py`, `apps/ai-service/tests/test_supabase_client.py`, `apps/dashboard/tests/api/digest.test.ts` — the test patterns this plan mirrors.

---

## Task 1: `zone_badge_average` DB function (SR-7, SR-11 data source)

**Files:**
- Create: `supabase/migrations/0024_zone_badge_average.sql`
- Create: `supabase/tests/database/021_zone_badge_average.sql`

- [ ] **Step 1: Write the failing pgTAP test**

```sql
-- supabase/tests/database/021_zone_badge_average.sql
-- Fixture tests for public.zone_badge_average() (0024_zone_badge_average.sql).
-- Same IDOR-guard-first pattern as zone_weekly_metrics (020): the badge value
-- is the ONE thing in the system that becomes publicly embeddable (via a
-- signed token minted from this number), so the ownership check must run
-- before a single quiet_index row is read.
begin;
select plan(4);

select tests.create_test_user('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0'::uuid); -- operatorA
select tests.create_test_user('b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0'::uuid); -- operatorB

reset role;

insert into public.operators (id, venue_name) values
  ('a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', 'Op A'),
  ('b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0', 'Op B')
on conflict do nothing;

insert into public.zones (id, operator_id, name, geofence, reward_config) values
  ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0', 'Zone A',
   st_geogfromtext('POLYGON((0 0, 0 1, 1 1, 1 0, 0 0))'),
   '{"earn_rate_per_quiet_minute":1,"min_score_for_earning":70,"daily_point_cap":120}'::jsonb),
  ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1', 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0', 'Zone B (no quiet_index rows)',
   st_geogfromtext('POLYGON((0 0, 0 1, 1 1, 1 0, 0 0))'),
   '{"earn_rate_per_quiet_minute":1,"min_score_for_earning":70,"daily_point_cap":120}'::jsonb);

-- Zone A: two in-window rows (avg 80), one stale row OUTSIDE the 7-day window
-- that must be excluded from the average.
insert into public.quiet_index (zone_id, ts, value, active_count) values
  ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', now() - interval '1 day', 70, 5),
  ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', now() - interval '2 days', 90, 5),
  ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', now() - interval '30 days', 10, 5);

select is(
  public.zone_badge_average('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0'),
  80.0,
  'averages only the in-window quiet_index rows (70, 90), excluding the stale one'
);

select is(
  public.zone_badge_average('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1', 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0'),
  null,
  'returns null (insufficient data) for a zone with no quiet_index history'
);

-- IDOR negative (SR-7): operatorB must not be able to read zoneA's average.
select throws_ok(
  $$ select public.zone_badge_average('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1'::uuid, 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0'::uuid) $$,
  'not_authorized',
  'an operator who does not own the zone cannot read its badge average (IDOR guard)'
);

-- Grants: only service_role may execute this function directly.
select isnt(
  has_function_privilege('authenticated', 'public.zone_badge_average(uuid,uuid)', 'execute'),
  true,
  'authenticated role has no execute grant on zone_badge_average (service_role only)'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx supabase test db`
Expected: FAIL — `function public.zone_badge_average(uuid, uuid) does not exist`

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/0024_zone_badge_average.sql
-- Average Quiet Index for the certification badge (O4, SR-11). Same
-- authorization-guard-first pattern as zone_weekly_metrics (0023): the SR-7
-- IDOR guard runs before any quiet_index row is read. Returns NULL (rather
-- than 0) when the zone has no quiet_index history yet, so the caller can
-- tell "not authorized" (exception) apart from "no data" (null) and the
-- badge-token endpoint can refuse to mint a token with no real value to show.
create or replace function public.zone_badge_average(p_zone_id uuid, p_operator_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_zone_name text;
  v_avg numeric;
begin
  select name into v_zone_name
  from public.zones
  where id = p_zone_id and operator_id = p_operator_id;

  if v_zone_name is null then
    raise exception 'not_authorized';
  end if;

  select round(avg(value), 1)
    into v_avg
  from public.quiet_index
  where zone_id = p_zone_id
    and ts >= now() - interval '7 days';

  return v_avg;
end;
$$;

-- Revoke the default PUBLIC execute grant, then hand execute to service_role
-- ONLY -- same revoke-then-grant-the-caller idiom as zone_weekly_metrics.
-- service_role has BYPASSRLS but is NOT exempt from function EXECUTE
-- privilege, so it needs an explicit grant.
revoke all on function public.zone_badge_average(uuid, uuid) from public, anon, authenticated;
grant execute on function public.zone_badge_average(uuid, uuid) to service_role;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx supabase test db`
Expected: PASS (4/4 in `021_zone_badge_average.sql`)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0024_zone_badge_average.sql supabase/tests/database/021_zone_badge_average.sql
git commit -m "feat(db): add zone_badge_average aggregation function (O4, SR-11)"
```

---

## Task 2: ai-service settings + `fetch_zone_badge_average`

**Files:**
- Modify: `apps/ai-service/app/settings.py`
- Modify: `apps/ai-service/app/supabase_client.py`
- Modify: `apps/ai-service/tests/test_supabase_client.py`

- [ ] **Step 1: Write the failing test**

Add to `apps/ai-service/tests/test_supabase_client.py`:

```python
from app.supabase_client import fetch_zone_badge_average  # add to existing import line


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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/ai-service && pytest tests/test_supabase_client.py -v`
Expected: FAIL — `ImportError: cannot import name 'fetch_zone_badge_average'`

- [ ] **Step 3: Add the setting and the client function**

In `apps/ai-service/app/settings.py`, add two fields to `Settings` (after `DIGEST_MODEL`):

```python
    DIGEST_MODEL: str = "claude-haiku-4-5"
    BADGE_SIGNING_SECRET: str
    BADGE_TOKEN_TTL_SECONDS: int = 300
```

In `apps/ai-service/app/supabase_client.py`, add below `fetch_zone_weekly_metrics`:

```python
def fetch_zone_badge_average(zone_id: str, operator_id: str) -> float | None:
    """Call the ``zone_badge_average`` RPC; ``None`` means no data yet.

    Translates the DB function's ``not_authorized`` error into
    ``ZoneNotAuthorizedError``, same as ``fetch_zone_weekly_metrics`` above.
    """
    try:
        response = (
            _client()
            .rpc(
                "zone_badge_average",
                {"p_zone_id": zone_id, "p_operator_id": operator_id},
            )
            .execute()
        )
    except Exception as exc:  # noqa: BLE001 -- inspect, then re-raise or translate
        if "not_authorized" in _error_text(exc):
            raise ZoneNotAuthorizedError(str(exc)) from exc
        raise

    return response.data
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/ai-service && pytest tests/test_supabase_client.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/ai-service/app/settings.py apps/ai-service/app/supabase_client.py apps/ai-service/tests/test_supabase_client.py
git commit -m "feat(ai-service): add BADGE_SIGNING_SECRET setting + fetch_zone_badge_average"
```

---

## Task 3: signed badge token sign/verify (`app/badge.py`)

**Files:**
- Create: `apps/ai-service/app/badge.py`
- Create: `apps/ai-service/tests/test_badge.py`

- [ ] **Step 1: Write the failing test**

```python
# apps/ai-service/tests/test_badge.py
"""Unit tests for signed badge token mint/verify (O4, SR-11).

These two properties are the entire security contract of the public badge
endpoint, so they're tested directly here, independent of the HTTP layer:
forged signatures and expired tokens must both be rejected.
"""

import time

import jwt
import pytest

from app.badge import BadgeTokenError, sign_badge_token, verify_badge_token
from app.settings import get_settings

TEST_BADGE_SECRET = "test-badge-secret"


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test")
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "jwt-secret")
    monkeypatch.setenv("BADGE_SIGNING_SECRET", TEST_BADGE_SECRET)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_sign_then_verify_round_trips_claims():
    token = sign_badge_token("zone-1", 82.5, ttl_seconds=60)
    claims = verify_badge_token(token)
    assert claims["zone_id"] == "zone-1"
    assert claims["avg_value"] == 82.5


def test_forged_signature_is_rejected():
    payload = {
        "zone_id": "zone-1",
        "avg_value": 82.5,
        "iat": int(time.time()),
        "exp": int(time.time()) + 60,
    }
    forged = jwt.encode(payload, "wrong-secret", algorithm="HS256")
    with pytest.raises(BadgeTokenError):
        verify_badge_token(forged)


def test_expired_token_is_rejected():
    expired_payload = {
        "zone_id": "zone-1",
        "avg_value": 82.5,
        "iat": int(time.time()) - 1000,
        "exp": int(time.time()) - 1,
    }
    expired = jwt.encode(expired_payload, TEST_BADGE_SECRET, algorithm="HS256")
    with pytest.raises(BadgeTokenError):
        verify_badge_token(expired)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/ai-service && pytest tests/test_badge.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.badge'`

- [ ] **Step 3: Write the implementation**

```python
# apps/ai-service/app/badge.py
"""Signed, short-TTL certification badge tokens (O4, SR-11).

The badge token is a self-contained, signed JWT carrying the zone id and the
average Quiet Index value as of mint time. The public render endpoint
(app/routes_badge.py) trusts ONLY this signature + expiry -- it never
re-touches the DB -- so a forged or stale (expired) token must be rejected
here before the value it carries is ever drawn into an SVG.
"""

import time

import jwt

from app.settings import get_settings


class BadgeTokenError(Exception):
    """Raised when a badge token fails signature or expiry verification."""


def sign_badge_token(zone_id: str, avg_value: float, ttl_seconds: int) -> str:
    """Mint a signed JWT carrying the zone id and average Quiet Index value."""
    now = int(time.time())
    payload = {
        "zone_id": zone_id,
        "avg_value": avg_value,
        "iat": now,
        "exp": now + ttl_seconds,
    }
    return jwt.encode(payload, get_settings().BADGE_SIGNING_SECRET, algorithm="HS256")


def verify_badge_token(token: str) -> dict:
    """Verify signature + expiry and return the token's claims.

    Raises ``BadgeTokenError`` on any forged signature or expired token -- the
    underlying PyJWT error reason is never surfaced (SR-15).
    """
    try:
        return jwt.decode(
            token,
            get_settings().BADGE_SIGNING_SECRET,
            algorithms=["HS256"],
        )
    except jwt.PyJWTError as exc:
        raise BadgeTokenError("invalid_or_expired_token") from exc
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/ai-service && pytest tests/test_badge.py -v`
Expected: PASS (3/3)

- [ ] **Step 5: Commit**

```bash
git add apps/ai-service/app/badge.py apps/ai-service/tests/test_badge.py
git commit -m "feat(ai-service): add signed short-TTL badge token sign/verify (SR-11)"
```

---

## Task 4: badge SVG rendering (`app/badge_svg.py`)

**Files:**
- Create: `apps/ai-service/app/badge_svg.py`
- Create: `apps/ai-service/tests/test_badge_svg.py`

- [ ] **Step 1: Write the failing test**

```python
# apps/ai-service/tests/test_badge_svg.py
from app.badge_svg import render_badge_svg, render_unverified_badge_svg


def test_render_badge_svg_includes_rounded_value():
    svg = render_badge_svg(82.7)
    assert svg.startswith("<svg")
    assert "83" in svg  # rounded
    assert "Hush Quiet Index" in svg


def test_render_unverified_badge_svg_has_no_numeric_value_and_says_unavailable():
    svg = render_unverified_badge_svg()
    assert svg.startswith("<svg")
    assert "Badge unavailable" in svg
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/ai-service && pytest tests/test_badge_svg.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.badge_svg'`

- [ ] **Step 3: Write the implementation**

```python
# apps/ai-service/app/badge_svg.py
"""Minimal SVG renderer for the embeddable certification badge (O4).

Calm, single-color, no animation -- this renders server-side as a static
image, so any motion language from the Design Brief doesn't apply here.
"""

_WIDTH = 220
_HEIGHT = 60


def render_badge_svg(avg_value: float) -> str:
    """Render the verified badge SVG showing the average Quiet Index."""
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{_WIDTH}" height="{_HEIGHT}" '
        f'role="img" aria-label="Hush Quiet Index">'
        f'<rect width="{_WIDTH}" height="{_HEIGHT}" rx="8" fill="#1c1c1e"/>'
        f'<text x="16" y="24" fill="#9a9a9a" font-family="sans-serif" font-size="11">'
        f"Hush Quiet Index</text>"
        f'<text x="16" y="46" fill="#e8e8e8" font-family="sans-serif" font-size="22">'
        f"{round(avg_value)}</text>"
        f"</svg>"
    )


def render_unverified_badge_svg() -> str:
    """Render the fallback SVG shown when a badge token fails verification."""
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{_WIDTH}" height="{_HEIGHT}" '
        f'role="img" aria-label="Hush badge unavailable">'
        f'<rect width="{_WIDTH}" height="{_HEIGHT}" rx="8" fill="#1c1c1e"/>'
        f'<text x="16" y="34" fill="#9a9a9a" font-family="sans-serif" font-size="13">'
        f"Badge unavailable</text>"
        f"</svg>"
    )
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/ai-service && pytest tests/test_badge_svg.py -v`
Expected: PASS (2/2)

- [ ] **Step 5: Commit**

```bash
git add apps/ai-service/app/badge_svg.py apps/ai-service/tests/test_badge_svg.py
git commit -m "feat(ai-service): add badge SVG renderer"
```

---

## Task 5: badge HTTP endpoints (`app/routes_badge.py`)

**Files:**
- Create: `apps/ai-service/app/routes_badge.py`
- Modify: `apps/ai-service/app/models.py`
- Modify: `apps/ai-service/app/main.py`
- Create: `apps/ai-service/tests/test_badge_endpoint.py`

- [ ] **Step 1: Write the failing test**

```python
# apps/ai-service/tests/test_badge_endpoint.py
"""Integration tests for the badge endpoints (O4, SR-11).

Hermetic: ``fetch_zone_badge_average`` is monkeypatched on app.routes_badge so
no real DB is hit. The forged/stale rejection tests exercise the real
sign/verify path end to end through the HTTP layer.
"""

import time

import jwt
import pytest
from fastapi.testclient import TestClient

from app import rate_limit
from app.main import app
from app.settings import get_settings
from app.supabase_client import ZoneNotAuthorizedError

TEST_JWT_SECRET = "test-jwt-secret"
TEST_BADGE_SECRET = "test-badge-secret"
OPERATOR_ID = "11111111-1111-1111-1111-111111111111"
ZONE_ID = "22222222-2222-2222-2222-222222222222"

REQUIRED_ENV = {
    "ANTHROPIC_API_KEY": "sk-ant-test",
    "SUPABASE_URL": "https://example.supabase.co",
    "SUPABASE_SERVICE_ROLE_KEY": "service-role-key",
    "SUPABASE_JWT_SECRET": TEST_JWT_SECRET,
    "BADGE_SIGNING_SECRET": TEST_BADGE_SECRET,
}


@pytest.fixture(autouse=True)
def _env_and_state(monkeypatch):
    for key, val in REQUIRED_ENV.items():
        monkeypatch.setenv(key, val)
    get_settings.cache_clear()
    rate_limit._reset()
    try:
        yield
    finally:
        get_settings.cache_clear()
        rate_limit._reset()


@pytest.fixture
def client():
    return TestClient(app, raise_server_exceptions=False)


def _mint_operator_token(secret: str = TEST_JWT_SECRET, **overrides) -> str:
    payload = {"sub": OPERATOR_ID, "aud": "authenticated", "exp": int(time.time()) + 3600}
    payload.update(overrides)
    return jwt.encode(payload, secret, algorithm="HS256")


def _auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_mint_returns_signed_token(client, monkeypatch):
    monkeypatch.setattr(
        "app.routes_badge.fetch_zone_badge_average", lambda zone_id, operator_id: 87.0
    )
    resp = client.post(f"/zones/{ZONE_ID}/badge-token", headers=_auth_header(_mint_operator_token()))
    assert resp.status_code == 200
    body = resp.json()
    assert "token" in body
    assert body["expires_in"] == 300


def test_mint_requires_operator_auth(client):
    resp = client.post(f"/zones/{ZONE_ID}/badge-token")
    assert resp.status_code == 401


def test_mint_zone_not_owned_returns_generic_404(client, monkeypatch):
    def _raise(zone_id, operator_id):
        raise ZoneNotAuthorizedError("zone not owned")

    monkeypatch.setattr("app.routes_badge.fetch_zone_badge_average", _raise)
    resp = client.post(f"/zones/{ZONE_ID}/badge-token", headers=_auth_header(_mint_operator_token()))
    assert resp.status_code == 404
    assert resp.json() == {"detail": "not_found"}


def test_mint_insufficient_data_returns_422(client, monkeypatch):
    monkeypatch.setattr(
        "app.routes_badge.fetch_zone_badge_average", lambda zone_id, operator_id: None
    )
    resp = client.post(f"/zones/{ZONE_ID}/badge-token", headers=_auth_header(_mint_operator_token()))
    assert resp.status_code == 422


def test_mint_rate_limit_returns_429(client, monkeypatch):
    monkeypatch.setattr(
        "app.routes_badge.fetch_zone_badge_average", lambda zone_id, operator_id: 50.0
    )
    last = None
    for _ in range(11):  # limit is 10 within the window
        last = client.post(f"/zones/{ZONE_ID}/badge-token", headers=_auth_header(_mint_operator_token()))
    assert last.status_code == 429


def test_render_valid_token_returns_svg(client, monkeypatch):
    monkeypatch.setattr(
        "app.routes_badge.fetch_zone_badge_average", lambda zone_id, operator_id: 73.4
    )
    mint = client.post(f"/zones/{ZONE_ID}/badge-token", headers=_auth_header(_mint_operator_token()))
    token = mint.json()["token"]

    resp = client.get(f"/badge/{token}")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("image/svg+xml")
    assert "73" in resp.text


def test_render_forged_token_is_rejected(client):
    forged = jwt.encode(
        {"zone_id": ZONE_ID, "avg_value": 99.0, "exp": int(time.time()) + 60},
        "wrong-secret",
        algorithm="HS256",
    )
    resp = client.get(f"/badge/{forged}")
    assert resp.status_code == 403
    assert resp.headers["content-type"].startswith("image/svg+xml")


def test_render_stale_token_is_rejected(client):
    expired = jwt.encode(
        {"zone_id": ZONE_ID, "avg_value": 99.0, "exp": int(time.time()) - 1},
        TEST_BADGE_SECRET,
        algorithm="HS256",
    )
    resp = client.get(f"/badge/{expired}")
    assert resp.status_code == 403
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/ai-service && pytest tests/test_badge_endpoint.py -v`
Expected: FAIL — `404 Not Found` (routes don't exist yet)

- [ ] **Step 3: Add the response model, the routes, and wire them into main.py**

Add to `apps/ai-service/app/models.py`:

```python
class BadgeTokenResponse(BaseModel):
    token: str
    expires_in: int
```

```python
# apps/ai-service/app/routes_badge.py
"""Certification badge endpoints (O4, SR-11).

Two halves with very different trust boundaries:
  * POST /zones/{zone_id}/badge-token -- operator-authenticated (SR-3/SR-7);
    computes the zone's current average Quiet Index and mints a short-TTL
    signed token carrying that value.
  * GET /badge/{token} -- public (this is the URL embedded on an external
    page, so it cannot require a bearer header); trusts ONLY the token's
    signature + expiry, never touches the DB.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from app.auth import require_operator
from app.badge import BadgeTokenError, sign_badge_token, verify_badge_token
from app.badge_svg import render_badge_svg, render_unverified_badge_svg
from app.models import BadgeTokenResponse
from app.rate_limit import enforce_rate_limit
from app.settings import get_settings
from app.supabase_client import ZoneNotAuthorizedError, fetch_zone_badge_average

router = APIRouter()

_BADGE_TOKEN_RATE_LIMIT = 10
_BADGE_TOKEN_RATE_WINDOW_SECONDS = 60


@router.post("/zones/{zone_id}/badge-token", response_model=BadgeTokenResponse)
def create_badge_token(
    zone_id: uuid.UUID,
    operator_id: str = Depends(require_operator),
) -> BadgeTokenResponse:
    enforce_rate_limit(
        operator_id,
        "badge-token",
        limit=_BADGE_TOKEN_RATE_LIMIT,
        window_seconds=_BADGE_TOKEN_RATE_WINDOW_SECONDS,
    )

    try:
        avg_value = fetch_zone_badge_average(str(zone_id), operator_id)
    except ZoneNotAuthorizedError:
        raise HTTPException(status_code=404, detail="not_found") from None

    if avg_value is None:
        raise HTTPException(status_code=422, detail="insufficient_data")

    ttl_seconds = get_settings().BADGE_TOKEN_TTL_SECONDS
    token = sign_badge_token(str(zone_id), avg_value, ttl_seconds)
    return BadgeTokenResponse(token=token, expires_in=ttl_seconds)


@router.get("/badge/{token}")
def render_badge(token: str) -> Response:
    try:
        claims = verify_badge_token(token)
    except BadgeTokenError:
        return Response(
            content=render_unverified_badge_svg(),
            media_type="image/svg+xml",
            status_code=403,
        )

    return Response(
        content=render_badge_svg(claims["avg_value"]),
        media_type="image/svg+xml",
    )
```

In `apps/ai-service/app/main.py`, add the new router:

```python
from app.errors import install_error_handlers
from app.routes_badge import router as badge_router
from app.routes_digest import router as digest_router

app = FastAPI(title="Hush AI Service")

app.include_router(digest_router)
app.include_router(badge_router)
install_error_handlers(app)
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/ai-service && pytest tests/test_badge_endpoint.py -v`
Expected: PASS (8/8)

- [ ] **Step 5: Run the full ai-service suite to check for regressions**

Run: `cd apps/ai-service && pytest -v`
Expected: PASS (all tests, including the pre-existing digest/auth/rate-limit suites)

- [ ] **Step 6: Commit**

```bash
git add apps/ai-service/app/routes_badge.py apps/ai-service/app/models.py apps/ai-service/app/main.py apps/ai-service/tests/test_badge_endpoint.py
git commit -m "feat(ai-service): add badge-token mint + public badge render endpoints (O4, SR-11)"
```

---

## Task 6: operator analytics endpoint (`app/routes_analytics.py`)

**Files:**
- Modify: `apps/ai-service/app/models.py`
- Create: `apps/ai-service/app/routes_analytics.py`
- Modify: `apps/ai-service/app/main.py`
- Create: `apps/ai-service/tests/test_analytics_endpoint.py`

- [ ] **Step 1: Write the failing test**

```python
# apps/ai-service/tests/test_analytics_endpoint.py
"""Integration tests for GET /zones/{zone_id}/analytics (O3).

Reuses fetch_zone_weekly_metrics (same RPC the digest endpoint calls) but
returns the raw aggregate numbers as JSON for the dashboard's trend chart,
instead of Claude's text summary.
"""

import time

import jwt
import pytest
from fastapi.testclient import TestClient

from app import rate_limit
from app.main import app
from app.settings import get_settings
from app.supabase_client import ZoneNotAuthorizedError

TEST_SECRET = "test-jwt-secret"
OPERATOR_ID = "11111111-1111-1111-1111-111111111111"
ZONE_ID = "22222222-2222-2222-2222-222222222222"

REQUIRED_ENV = {
    "ANTHROPIC_API_KEY": "sk-ant-test",
    "SUPABASE_URL": "https://example.supabase.co",
    "SUPABASE_SERVICE_ROLE_KEY": "service-role-key",
    "SUPABASE_JWT_SECRET": TEST_SECRET,
    "BADGE_SIGNING_SECRET": "test-badge-secret",
}

_FAKE_METRICS = {
    "zone_name": "Demo Cafe",
    "window_days": 7,
    "quiet_index_trend": [
        {"day": "2026-06-15T00:00:00+00:00", "avg_value": 81.2, "avg_active_count": 4.0}
    ],
    "check_in_count": 12,
    "total_quiet_minutes": 240.5,
    "total_points_accrued": 480,
    "redemption_count": 3,
    "peak_window": {"hour_of_day": 18, "max_active_count": 9},
}


@pytest.fixture(autouse=True)
def _env_and_state(monkeypatch):
    for key, val in REQUIRED_ENV.items():
        monkeypatch.setenv(key, val)
    get_settings.cache_clear()
    rate_limit._reset()
    try:
        yield
    finally:
        get_settings.cache_clear()
        rate_limit._reset()


@pytest.fixture
def client():
    return TestClient(app, raise_server_exceptions=False)


def _mint(secret: str = TEST_SECRET, **overrides) -> str:
    payload = {"sub": OPERATOR_ID, "aud": "authenticated", "exp": int(time.time()) + 3600}
    payload.update(overrides)
    return jwt.encode(payload, secret, algorithm="HS256")


def _auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_happy_path_returns_metrics(client, monkeypatch):
    monkeypatch.setattr(
        "app.routes_analytics.fetch_zone_weekly_metrics",
        lambda zone_id, operator_id: _FAKE_METRICS,
    )
    resp = client.get(f"/zones/{ZONE_ID}/analytics", headers=_auth_header(_mint()))
    assert resp.status_code == 200
    body = resp.json()
    assert body["zone_name"] == "Demo Cafe"
    assert body["quiet_index_trend"][0]["avg_value"] == 81.2
    assert body["peak_window"]["hour_of_day"] == 18


def test_no_token_returns_401(client):
    resp = client.get(f"/zones/{ZONE_ID}/analytics")
    assert resp.status_code == 401


def test_zone_not_authorized_returns_generic_404(client, monkeypatch):
    def _raise(zone_id, operator_id):
        raise ZoneNotAuthorizedError("zone not owned")

    monkeypatch.setattr("app.routes_analytics.fetch_zone_weekly_metrics", _raise)
    resp = client.get(f"/zones/{ZONE_ID}/analytics", headers=_auth_header(_mint()))
    assert resp.status_code == 404
    assert resp.json() == {"detail": "not_found"}


def test_rate_limit_returns_429(client, monkeypatch):
    monkeypatch.setattr(
        "app.routes_analytics.fetch_zone_weekly_metrics",
        lambda zone_id, operator_id: _FAKE_METRICS,
    )
    last = None
    for _ in range(31):  # limit is 30 within the window
        last = client.get(f"/zones/{ZONE_ID}/analytics", headers=_auth_header(_mint()))
    assert last.status_code == 429
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/ai-service && pytest tests/test_analytics_endpoint.py -v`
Expected: FAIL — `404 Not Found`

- [ ] **Step 3: Add the response models, the route, and wire it into main.py**

Add to `apps/ai-service/app/models.py`:

```python
class QuietIndexTrendPoint(BaseModel):
    day: str
    avg_value: float
    avg_active_count: float


class PeakWindow(BaseModel):
    hour_of_day: int | None = None
    max_active_count: int | None = None


class ZoneAnalyticsResponse(BaseModel):
    zone_name: str
    window_days: int
    quiet_index_trend: list[QuietIndexTrendPoint]
    check_in_count: int
    total_quiet_minutes: float
    total_points_accrued: int
    redemption_count: int
    peak_window: PeakWindow
```

```python
# apps/ai-service/app/routes_analytics.py
"""Operator analytics endpoint (O3): the raw zone_weekly_metrics aggregate,
for the dashboard's trend chart. The digest endpoint (routes_digest.py)
already calls the same RPC but only returns Claude's text summary -- this
exposes the underlying numbers directly so the chart doesn't need an LLM call
just to render.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException

from app.auth import require_operator
from app.models import ZoneAnalyticsResponse
from app.rate_limit import enforce_rate_limit
from app.supabase_client import ZoneNotAuthorizedError, fetch_zone_weekly_metrics

router = APIRouter()

_ANALYTICS_RATE_LIMIT = 30
_ANALYTICS_RATE_WINDOW_SECONDS = 60


@router.get("/zones/{zone_id}/analytics", response_model=ZoneAnalyticsResponse)
def get_zone_analytics(
    zone_id: uuid.UUID,
    operator_id: str = Depends(require_operator),
) -> ZoneAnalyticsResponse:
    enforce_rate_limit(
        operator_id,
        "analytics",
        limit=_ANALYTICS_RATE_LIMIT,
        window_seconds=_ANALYTICS_RATE_WINDOW_SECONDS,
    )

    try:
        metrics = fetch_zone_weekly_metrics(str(zone_id), operator_id)
    except ZoneNotAuthorizedError:
        raise HTTPException(status_code=404, detail="not_found") from None

    return ZoneAnalyticsResponse(**metrics)
```

In `apps/ai-service/app/main.py`:

```python
from app.errors import install_error_handlers
from app.routes_analytics import router as analytics_router
from app.routes_badge import router as badge_router
from app.routes_digest import router as digest_router

app = FastAPI(title="Hush AI Service")

app.include_router(digest_router)
app.include_router(badge_router)
app.include_router(analytics_router)
install_error_handlers(app)
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/ai-service && pytest tests/test_analytics_endpoint.py -v`
Expected: PASS (4/4)

- [ ] **Step 5: Run the full ai-service suite**

Run: `cd apps/ai-service && pytest -v`
Expected: PASS (all tests)

- [ ] **Step 6: Commit**

```bash
git add apps/ai-service/app/models.py apps/ai-service/app/routes_analytics.py apps/ai-service/app/main.py apps/ai-service/tests/test_analytics_endpoint.py
git commit -m "feat(ai-service): add operator analytics endpoint (O3)"
```

---

## Task 7: env documentation for the new secret

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Add the new vars to the AI service block**

In `.env.example`, in the `# ---- AI service (server-only) ----` block, after the `SUPABASE_JWT_SECRET` line:

```
# Signs the embeddable certification badge's short-TTL JWT (O4, SR-11).
# Server-only -- never bundled into any client. Generate with:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
BADGE_SIGNING_SECRET=
# How long a minted badge token stays valid before the public render endpoint
# rejects it as stale (SR-11).
BADGE_TOKEN_TTL_SECONDS=300
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs(env): document BADGE_SIGNING_SECRET / BADGE_TOKEN_TTL_SECONDS"
```

---

## Task 8: live feed polish — active check-in count (O2)

**Files:**
- Modify: `apps/dashboard/lib/quiet-index.ts`
- Modify: `apps/dashboard/tests/quiet-index.test.ts`
- Modify: `apps/dashboard/components/LiveQuietIndex.tsx`
- Modify: `apps/dashboard/app/(dashboard)/zones/[id]/page.tsx`
- Modify: `apps/dashboard/app/(dashboard)/zones/[id]/zone-edit-client.tsx`

- [ ] **Step 1: Write the failing test**

Replace the contents of `apps/dashboard/tests/quiet-index.test.ts` with:

```typescript
import { describe, expect, it } from "vitest";
import { fetchLatestQuietIndex, formatQuietIndex } from "../lib/quiet-index";

describe("formatQuietIndex", () => {
  it("shows an em dash when quorum (SR-10) has never been met", () => {
    expect(formatQuietIndex(null)).toBe("—");
  });

  it("renders a rounded value out of 100", () => {
    expect(formatQuietIndex(73.4)).toBe("73/100");
    expect(formatQuietIndex(73.6)).toBe("74/100");
  });

  it("clamps to the 0-100 range", () => {
    expect(formatQuietIndex(-5)).toBe("0/100");
    expect(formatQuietIndex(105)).toBe("100/100");
  });
});

describe("fetchLatestQuietIndex", () => {
  function fakeSupabase(data: unknown, error: unknown = null) {
    return {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: () => Promise.resolve({ data, error }),
              }),
            }),
          }),
        }),
      }),
    } as never;
  }

  it("returns nulls when there is no row yet", async () => {
    const result = await fetchLatestQuietIndex(fakeSupabase(null), "zone-1");
    expect(result).toEqual({ value: null, activeCount: null });
  });

  it("returns the value and active count from the latest row", async () => {
    const result = await fetchLatestQuietIndex(fakeSupabase({ value: 73.4, active_count: 5 }), "zone-1");
    expect(result).toEqual({ value: 73.4, activeCount: 5 });
  });

  it("throws when the query errors", async () => {
    await expect(fetchLatestQuietIndex(fakeSupabase(null, new Error("boom")), "zone-1")).rejects.toThrow("boom");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/dashboard && npm test -- quiet-index`
Expected: FAIL — `fetchLatestQuietIndex` returns a bare number, not `{ value, activeCount }`

- [ ] **Step 3: Update `lib/quiet-index.ts`**

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";

export interface QuietIndexReading {
  value: number | null;
  activeCount: number | null;
}

// `null` means quorum (SR-10) has never been met for this zone -- distinct
// from a real low score, so it renders as "no reading yet", not "0/100".
export function formatQuietIndex(value: number | null): string {
  if (value === null) return "—";
  const clamped = Math.max(0, Math.min(100, value));
  return `${Math.round(clamped)}/100`;
}

export async function fetchLatestQuietIndex(supabase: SupabaseClient, zoneId: string): Promise<QuietIndexReading> {
  const { data, error } = await supabase
    .from("quiet_index")
    .select("value, active_count")
    .eq("zone_id", zoneId)
    .order("ts", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { value: null, activeCount: null };
  const row = data as { value: number; active_count: number };
  return { value: Number(row.value), activeCount: Number(row.active_count) };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/dashboard && npm test -- quiet-index`
Expected: PASS (6/6)

- [ ] **Step 5: Update `LiveQuietIndex.tsx` to show the active count**

```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "../lib/supabase/client";
import { formatQuietIndex, type QuietIndexReading } from "../lib/quiet-index";

export function LiveQuietIndex({
  zoneId,
  initialReading,
}: {
  zoneId: string;
  initialReading: QuietIndexReading;
}) {
  const [reading, setReading] = useState(initialReading);

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    // Realtime authorizes postgres_changes filters against the connection's
    // own JWT (via has_column_privilege), not the apikey query param -- without
    // this, the socket authenticates as `anon`, which has no grant on
    // quiet_index at all, and every filtered subscribe is rejected server-side
    // with "invalid column for filter" instead of ever firing onUpdate.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) supabase.realtime.setAuth(data.session.access_token);

      channel = supabase
        .channel(`quiet-index:${zoneId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "quiet_index", filter: `zone_id=eq.${zoneId}` },
          (payload: { new: { value: number; active_count: number } }) =>
            setReading({ value: Number(payload.new.value), activeCount: Number(payload.new.active_count) })
        )
        .subscribe();
    });

    return () => {
      channel?.unsubscribe();
    };
  }, [zoneId]);

  return (
    <section className="flex flex-col gap-1 rounded border border-neutral-200 p-4">
      <h2 className="text-sm uppercase tracking-wide text-neutral-500">Live Quiet Index</h2>
      <p className="text-3xl font-light">{formatQuietIndex(reading.value)}</p>
      <p className="text-sm font-light text-neutral-500">
        {reading.activeCount === null ? "No active check-ins" : `${reading.activeCount} active check-ins`}
      </p>
    </section>
  );
}
```

- [ ] **Step 6: Update the call sites**

In `apps/dashboard/app/(dashboard)/zones/[id]/page.tsx`, the variable name and prop stay compatible since `fetchLatestQuietIndex` now returns `QuietIndexReading` — just rename the prop passed to `ZoneEditClient`:

```tsx
import { createClient } from "../../../../lib/supabase/server";
import { toReward, toZone, ZONE_SELECT } from "../../../../lib/mappers";
import { fetchLatestQuietIndex } from "../../../../lib/quiet-index";
import { ZoneEditClient } from "./zone-edit-client";

export default async function ZoneDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: zoneRow } = await supabase.from("zones").select(ZONE_SELECT).eq("id", id).single();
  const { data: rewardRows } = await supabase
    .from("rewards")
    .select("id, zone_id, name, points_cost, created_at")
    .eq("zone_id", id);

  if (!zoneRow) {
    return <p>Zone not found.</p>;
  }

  const zone = toZone(zoneRow);
  const rewards = (rewardRows ?? []).map(toReward);
  const initialReading = await fetchLatestQuietIndex(supabase, zone.id);

  return <ZoneEditClient zone={zone} rewards={rewards} initialReading={initialReading} />;
}
```

In `apps/dashboard/app/(dashboard)/zones/[id]/zone-edit-client.tsx`, update the props interface and the `LiveQuietIndex` call (full file shown so the later tasks' additions land in the right place):

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ZoneForm, type ZoneFormValues } from "../../../../components/ZoneForm";
import { RewardForm } from "../../../../components/RewardForm";
import { LiveQuietIndex } from "../../../../components/LiveQuietIndex";
import { AnalyticsPanel } from "../../../../components/AnalyticsPanel";
import { DigestPanel } from "../../../../components/DigestPanel";
import { BadgeEmbed } from "../../../../components/BadgeEmbed";
import { toReward } from "../../../../lib/mappers";
import type { QuietIndexReading } from "../../../../lib/quiet-index";
import type { Reward, Zone } from "@hush/shared-types";

interface ZoneEditClientProps {
  zone: Zone;
  rewards: Reward[];
  initialReading: QuietIndexReading;
}

export function ZoneEditClient({ zone, rewards: initialRewards, initialReading }: ZoneEditClientProps) {
  const router = useRouter();
  const [rewards, setRewards] = useState(initialRewards);

  async function handleZoneSubmit(values: ZoneFormValues) {
    const response = await fetch(`/api/zones/${zone.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: values.name,
        geofence: values.geofence,
        silenceContract: values.silenceContract,
        rewardConfig: values.rewardConfig,
      }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(typeof body.error === "string" ? body.error : "Failed to update zone.");
    }
    router.refresh();
  }

  async function handleRewardSubmit(values: { name: string; pointsCost: number }) {
    const response = await fetch("/api/rewards", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ zoneId: zone.id, name: values.name, pointsCost: values.pointsCost }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(typeof body.error === "string" ? body.error : "Failed to add reward.");
    }
    const row = await response.json();
    setRewards((current) => [...current, toReward(row)]);
  }

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-light tracking-wide">{zone.name}</h1>
      <LiveQuietIndex zoneId={zone.id} initialReading={initialReading} />
      <AnalyticsPanel zoneId={zone.id} />
      <DigestPanel zoneId={zone.id} />
      <BadgeEmbed zoneId={zone.id} />
      <ZoneForm
        key={zone.id}
        initialValues={{
          name: zone.name,
          geofence: zone.geofence,
          silenceContract: zone.silenceContract,
          rewardConfig: zone.rewardConfig,
        }}
        onSubmit={handleZoneSubmit}
        submitLabel="Save changes"
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-light tracking-wide">Rewards</h2>
        <ul className="flex flex-col gap-1">
          {rewards.map((reward) => (
            <li key={reward.id}>
              {reward.name} — {reward.pointsCost} points
            </li>
          ))}
        </ul>
        <RewardForm onSubmit={handleRewardSubmit} />
      </section>
    </div>
  );
}
```

(`AnalyticsPanel` and `BadgeEmbed` don't exist yet — they're created in Tasks 9 and 10. This file will not compile until then; that's expected and resolved within this same work session.)

- [ ] **Step 7: Commit**

```bash
git add apps/dashboard/lib/quiet-index.ts apps/dashboard/tests/quiet-index.test.ts apps/dashboard/components/LiveQuietIndex.tsx "apps/dashboard/app/(dashboard)/zones/[id]/page.tsx" "apps/dashboard/app/(dashboard)/zones/[id]/zone-edit-client.tsx"
git commit -m "feat(dashboard): show active check-in count on the live feed (O2)"
```

---

## Task 9: analytics trend chart (O3)

**Files:**
- Modify: `apps/dashboard/package.json`
- Create: `apps/dashboard/app/api/analytics/route.ts`
- Create: `apps/dashboard/tests/api/analytics.test.ts`
- Create: `apps/dashboard/components/AnalyticsPanel.tsx`

- [ ] **Step 1: Add the Recharts dependency**

In `apps/dashboard/package.json`, add to `dependencies` (alphabetical, after `next`):

```json
    "next": "^15.1.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "recharts": "^3.8.0",
```

Run: `npm install --workspace apps/dashboard`
Expected: lockfile updates, no peer-dependency errors (recharts 3.x declares React 19 support).

- [ ] **Step 2: Write the failing test for the proxy route**

```typescript
// apps/dashboard/tests/api/analytics.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetUser = vi.fn();
const mockGetSession = vi.fn();

vi.mock("../../lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mockGetUser, getSession: mockGetSession },
  }),
}));

import { POST } from "../../app/api/analytics/route";

const AI_SERVICE_URL = "http://ai-service.test";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/analytics", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.AI_SERVICE_URL = AI_SERVICE_URL;
  mockGetSession.mockResolvedValue({ data: { session: { access_token: "access-token-123" } } });
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /api/analytics", () => {
  it("returns 401 when there is no user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const response = await POST(jsonRequest({ zoneId: "zone-1" }));
    expect(response.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns 400 when the body lacks zoneId", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const response = await POST(jsonRequest({}));
    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("relays the upstream analytics JSON with the Bearer header on a GET", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "happy-user" } } });
    const analytics = { zone_name: "Demo Cafe", quiet_index_trend: [] };
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => analytics,
    });

    const response = await POST(jsonRequest({ zoneId: "zone-42" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(analytics);

    expect(fetch).toHaveBeenCalledWith(
      `${AI_SERVICE_URL}/zones/zone-42/analytics`,
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer access-token-123" }) })
    );
  });

  it("returns 502 when the upstream responds non-ok (without relaying its body)", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-502" } } });
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "internal_error", secret: "leak" }),
    });

    const response = await POST(jsonRequest({ zoneId: "zone-1" }));
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body).toEqual({ error: "Failed to load analytics" });
    expect(JSON.stringify(body)).not.toContain("leak");
  });

  it("returns 429 once the per-user rate limit is exceeded", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "rate-limit-user" } } });
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ zone_name: "x" }),
    });
    let lastResponse;
    for (let i = 0; i < 31; i++) {
      lastResponse = await POST(jsonRequest({ zoneId: "zone-1" }));
    }
    expect(lastResponse!.status).toBe(429);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd apps/dashboard && npm test -- analytics`
Expected: FAIL — `Cannot find module '../../app/api/analytics/route'`

- [ ] **Step 4: Write the proxy route**

```typescript
// apps/dashboard/app/api/analytics/route.ts
import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { checkRateLimit } from "../../../lib/rate-limit";

// Server-side proxy to the FastAPI ai-service analytics endpoint (O3). Same
// shape as /api/digest: re-authenticate the dashboard user (untrusted
// frontend), rate-limit, then forward their own access token as the Bearer
// credential so the ai-service verifies it and enforces zone ownership itself.

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { allowed } = checkRateLimit(userData.user.id, "analytics:read", {
      limit: 30,
      windowMs: 60_000,
    });
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await request.json().catch(() => null);
    const zoneId = body?.zoneId;
    if (typeof zoneId !== "string" || zoneId.length === 0) {
      return NextResponse.json({ error: "zoneId is required" }, { status: 400 });
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const upstream = await fetch(`${process.env.AI_SERVICE_URL}/zones/${zoneId}/analytics`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (!upstream.ok) {
      console.error(`POST /api/analytics upstream failed: ${upstream.status}`);
      return NextResponse.json({ error: "Failed to load analytics" }, { status: 502 });
    }

    const analytics = await upstream.json();
    return NextResponse.json(analytics, { status: 200 });
  } catch (error) {
    console.error("POST /api/analytics failed:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/dashboard && npm test -- analytics`
Expected: PASS (5/5)

- [ ] **Step 6: Write the chart component**

```tsx
// apps/dashboard/components/AnalyticsPanel.tsx
"use client";

import { useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface TrendPoint {
  day: string;
  avg_value: number;
  avg_active_count: number;
}

interface PeakWindow {
  hour_of_day: number | null;
  max_active_count: number | null;
}

interface Analytics {
  zone_name: string;
  window_days: number;
  quiet_index_trend: TrendPoint[];
  check_in_count: number;
  total_quiet_minutes: number;
  total_points_accrued: number;
  redemption_count: number;
  peak_window: PeakWindow;
}

export function AnalyticsPanel({ zoneId }: { zoneId: string }) {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/analytics", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ zoneId }),
        });
        if (!response.ok) throw new Error("failed");
        const data = (await response.json()) as Analytics;
        if (!cancelled) setAnalytics(data);
      } catch {
        if (!cancelled) setError("Could not load analytics just now.");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [zoneId]);

  if (error) {
    return <p className="text-sm font-light text-neutral-500">{error}</p>;
  }

  if (!analytics) {
    return <p className="text-sm font-light text-neutral-400">Loading analytics…</p>;
  }

  return (
    <section className="flex flex-col gap-4 rounded border border-neutral-200 p-4">
      <h2 className="text-sm uppercase tracking-wide text-neutral-500">7-day analytics</h2>

      <div style={{ width: "100%", height: 200 }}>
        <ResponsiveContainer>
          <LineChart data={analytics.quiet_index_trend}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
            <XAxis dataKey="day" tick={{ fontSize: 11 }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Line type="monotone" dataKey="avg_value" stroke="#1c1c1e" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Check-ins" value={analytics.check_in_count} />
        <Metric label="Quiet minutes" value={analytics.total_quiet_minutes} />
        <Metric label="Points accrued" value={analytics.total_points_accrued} />
        <Metric label="Redemptions" value={analytics.redemption_count} />
      </div>

      {analytics.peak_window.hour_of_day !== null && (
        <p className="text-sm font-light text-neutral-500">
          Peak quiet window: {analytics.peak_window.hour_of_day}:00 with {analytics.peak_window.max_active_count}{" "}
          active check-ins.
        </p>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col">
      <span className="text-xl font-light">{value}</span>
      <span className="text-xs uppercase tracking-wide text-neutral-400">{label}</span>
    </div>
  );
}
```

- [ ] **Step 7: Typecheck**

Run: `cd apps/dashboard && npm run typecheck`
Expected: PASS (note: `zone-edit-client.tsx` from Task 8 now resolves `AnalyticsPanel`; it will still fail on the missing `BadgeEmbed` import until Task 10 — if running this in isolation, temporarily comment out the `BadgeEmbed` import/usage, or proceed directly to Task 10 before typechecking)

- [ ] **Step 8: Commit**

```bash
git add apps/dashboard/package.json apps/dashboard/package-lock.json apps/dashboard/app/api/analytics/route.ts apps/dashboard/tests/api/analytics.test.ts apps/dashboard/components/AnalyticsPanel.tsx
git commit -m "feat(dashboard): add operator analytics trend chart (O3)"
```

---

## Task 10: certification badge embed (O4)

**Files:**
- Create: `apps/dashboard/app/api/badge-token/route.ts`
- Create: `apps/dashboard/tests/api/badge-token.test.ts`
- Create: `apps/dashboard/components/BadgeEmbed.tsx`

- [ ] **Step 1: Write the failing test for the proxy route**

```typescript
// apps/dashboard/tests/api/badge-token.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetUser = vi.fn();
const mockGetSession = vi.fn();

vi.mock("../../lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mockGetUser, getSession: mockGetSession },
  }),
}));

import { POST } from "../../app/api/badge-token/route";

const AI_SERVICE_URL = "http://ai-service.test";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/badge-token", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.AI_SERVICE_URL = AI_SERVICE_URL;
  mockGetSession.mockResolvedValue({ data: { session: { access_token: "access-token-123" } } });
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /api/badge-token", () => {
  it("returns 401 when there is no user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const response = await POST(jsonRequest({ zoneId: "zone-1" }));
    expect(response.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns 400 when the body lacks zoneId", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const response = await POST(jsonRequest({}));
    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("builds an embedUrl from the minted token on the happy path", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "happy-user" } } });
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ token: "signed.jwt.token", expires_in: 300 }),
    });

    const response = await POST(jsonRequest({ zoneId: "zone-42" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      embedUrl: `${AI_SERVICE_URL}/badge/signed.jwt.token`,
      expiresIn: 300,
    });

    expect(fetch).toHaveBeenCalledWith(
      `${AI_SERVICE_URL}/zones/zone-42/badge-token`,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer access-token-123" }),
      })
    );
  });

  it("returns 502 when the upstream responds non-ok (without relaying its body)", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-502" } } });
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ detail: "insufficient_data" }),
    });

    const response = await POST(jsonRequest({ zoneId: "zone-1" }));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "Failed to generate badge" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/dashboard && npm test -- badge-token`
Expected: FAIL — `Cannot find module '../../app/api/badge-token/route'`

- [ ] **Step 3: Write the proxy route**

```typescript
// apps/dashboard/app/api/badge-token/route.ts
import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { checkRateLimit } from "../../../lib/rate-limit";

// Server-side proxy that mints a short-TTL signed certification badge token
// (O4, SR-11). The embed URL is built from the server-only AI_SERVICE_URL --
// that base URL itself isn't secret, only the service-role/Claude keys
// behind it are -- so it's safe to return to the operator's browser.

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { allowed } = checkRateLimit(userData.user.id, "badge-token:create", {
      limit: 10,
      windowMs: 60_000,
    });
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await request.json().catch(() => null);
    const zoneId = body?.zoneId;
    if (typeof zoneId !== "string" || zoneId.length === 0) {
      return NextResponse.json({ error: "zoneId is required" }, { status: 400 });
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const upstream = await fetch(`${process.env.AI_SERVICE_URL}/zones/${zoneId}/badge-token`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (!upstream.ok) {
      console.error(`POST /api/badge-token upstream failed: ${upstream.status}`);
      return NextResponse.json({ error: "Failed to generate badge" }, { status: 502 });
    }

    const { token, expires_in } = await upstream.json();
    return NextResponse.json(
      { embedUrl: `${process.env.AI_SERVICE_URL}/badge/${token}`, expiresIn: expires_in },
      { status: 200 }
    );
  } catch (error) {
    console.error("POST /api/badge-token failed:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/dashboard && npm test -- badge-token`
Expected: PASS (4/4)

- [ ] **Step 5: Write the embed component**

```tsx
// apps/dashboard/components/BadgeEmbed.tsx
"use client";

import { useState } from "react";

export function BadgeEmbed({ zoneId }: { zoneId: string }) {
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleGenerate() {
    setPending(true);
    setError(null);
    setCopied(false);
    try {
      const response = await fetch("/api/badge-token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ zoneId }),
      });
      if (!response.ok) throw new Error("failed");
      const data = (await response.json()) as { embedUrl: string };
      setEmbedUrl(data.embedUrl);
    } catch {
      setError("Could not generate the badge just now.");
    } finally {
      setPending(false);
    }
  }

  const snippet = embedUrl
    ? `<img src="${embedUrl}" alt="Hush Quiet Index — verified" width="220" height="60" />`
    : null;

  async function handleCopy() {
    if (!snippet) return;
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
  }

  return (
    <section className="flex flex-col gap-3 rounded border border-neutral-200 p-4">
      <h2 className="text-sm uppercase tracking-wide text-neutral-500">Certification badge</h2>

      <div>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={pending}
          className="rounded border border-neutral-300 px-4 py-2 text-sm font-light tracking-wide text-neutral-700 disabled:opacity-50"
        >
          Generate embed snippet
        </button>
      </div>

      {pending && <p className="text-sm font-light text-neutral-400">Generating…</p>}
      {error && !pending && <p className="text-sm font-light text-neutral-500">{error}</p>}

      {snippet && !pending && (
        <div className="flex flex-col gap-2">
          <textarea
            readOnly
            value={snippet}
            rows={2}
            className="rounded border border-neutral-200 p-2 text-xs font-mono text-neutral-700"
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleCopy}
              className="rounded border border-neutral-300 px-3 py-1 text-xs font-light tracking-wide text-neutral-700"
            >
              Copy
            </button>
            {copied && <span className="text-xs font-light text-neutral-400">Copied</span>}
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element -- external badge image, not a local asset */}
          <img src={embedUrl ?? ""} alt="Hush Quiet Index — verified" width={220} height={60} />
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 6: Typecheck the whole dashboard now that both new components exist**

Run: `cd apps/dashboard && npm run typecheck`
Expected: PASS

- [ ] **Step 7: Run the full dashboard test suite**

Run: `cd apps/dashboard && npm test`
Expected: PASS (all tests, including the pre-existing zones/rewards/digest/smoke/rate-limit suites)

- [ ] **Step 8: Commit**

```bash
git add apps/dashboard/app/api/badge-token/route.ts apps/dashboard/tests/api/badge-token.test.ts apps/dashboard/components/BadgeEmbed.tsx
git commit -m "feat(dashboard): add certification badge embed snippet generator (O4)"
```

---

## Task 11: end-to-end verification

**Files:**
- Modify: `scripts/e2e-check.mjs`

- [ ] **Step 1: Extend the Playwright golden-path script**

`scripts/e2e-check.mjs` exercises the operator console against a real running dashboard but (per its own header comment) does **not** start `apps/ai-service` — it already proves the dashboard degrades gracefully rather than crashing when an external dependency (Mapbox) is unavailable (see its step 3). Add two steps in the same spirit for the two new ai-service-dependent panels, appended right before the final `console.log("\nGOLDEN PATH: PASS...")` line (inside the `try` block, after the existing "add a reward" step):

```javascript
  console.log("6. confirm the analytics panel degrades gracefully when ai-service is unreachable");
  await page.waitForSelector("text=Could not load analytics just now.", { timeout: 10000 });
  const analyticsCrash = await page.locator("text=Runtime Error").isVisible().catch(() => false);
  if (analyticsCrash) throw new Error("AnalyticsPanel crashed instead of showing its error state");
  console.log("   OK, analytics panel shows its error state without crashing (ai-service not running in this script)");

  console.log("7. confirm the badge embed generator degrades gracefully when ai-service is unreachable");
  await page.click('button:has-text("Generate embed snippet")');
  await page.waitForSelector("text=Could not generate the badge just now.", { timeout: 10000 });
  const badgeCrash = await page.locator("text=Runtime Error").isVisible().catch(() => false);
  if (badgeCrash) throw new Error("BadgeEmbed crashed instead of showing its error state");
  console.log("   OK, badge embed generator shows its error state without crashing (ai-service not running in this script)");
  await page.screenshot({ path: `${shots}/6-analytics-and-badge-graceful-degradation.png` });
```

Update the trailing `console.log` lines that describe scope, right after the line `console.log("\nConsole errors captured during run:", ...)`, to add a note matching the existing Mapbox-gap disclosure style:

```javascript
  console.log("NOTE: steps 6-7 verify graceful degradation only -- this script does not start");
  console.log("apps/ai-service, so the real analytics-chart-renders and badge-image-loads paths");
  console.log("were NOT exercised here. Run apps/ai-service locally and re-check those panels");
  console.log("manually for the full happy-path verification.");
```

- [ ] **Step 2: Run it**

Run:
```bash
npx supabase db reset
npm run dev --workspace apps/dashboard &
node scripts/e2e-check.mjs
```
Expected: `GOLDEN PATH: PASS` with the new notes about steps 6-7's scope printed; screenshots land in `.e2e-shots/`.

- [ ] **Step 3: Manually verify the real ai-service-backed path**

Run the full stack and confirm the real (non-degraded) behavior once:
```bash
npx supabase start
cd apps/ai-service && uvicorn app.main:app --port 8000 &
npm run dev --workspace apps/dashboard &
```
Then in a browser, sign in as the demo operator, open the Demo Cafe zone, and confirm:
- The analytics panel renders a line chart (run `node scripts/simulate-quiet-index.mjs` first if there's no quiet_index history yet) and the metric cards show real numbers.
- "Generate embed snippet" returns a snippet; opening the `<img src=...>` URL directly in a new tab renders the badge SVG with a number on it.
- Editing the embed URL's token (changing one character) and reloading that URL returns a 403 "Badge unavailable" SVG (forged-token rejection, SR-11).

- [ ] **Step 4: Run the full repo test suite one more time**

Run:
```bash
npx supabase test db
cd apps/ai-service && pytest -v
cd apps/dashboard && npm test && npm run typecheck
```
Expected: PASS across all three.

- [ ] **Step 5: Commit**

```bash
git add scripts/e2e-check.mjs
git commit -m "test(scripts): extend e2e-check with analytics/badge graceful-degradation checks"
```

---

## Self-review notes

- **Spec coverage:** O2 (live feed active-count polish, Task 8), O3 (trend chart + reward-economics snapshot, Tasks 6/9), O4 (signed short-TTL embeddable badge, Tasks 1/3/4/5/10), SR-11 (forged + stale rejection tested at both the unit level (Task 3) and the HTTP level (Task 5)), SR-3 (operator JWT required on both new ai-service endpoints), SR-7 (IDOR guard tested in the DB function (Task 1) and the route's 404-on-`ZoneNotAuthorizedError` (Tasks 5/6)) all map to tasks.
- **Deliberately deferred:** the badge token's short TTL (5 min default) means the embed snippet needs periodic regeneration for a long-lived production embed — acceptable for this phase's exit criteria ("embed works on an external page"; tested once, not continuously refreshed), but flagged here as a real gap for any post-hackathon hardening, same posture as the existing in-memory rate limiter's single-instance caveat.
- **No placeholders:** every step has runnable code; the one intentionally elided block in Task 1 (the test-writing scratch work) is replaced with the real final assertions in the same step before moving on.
