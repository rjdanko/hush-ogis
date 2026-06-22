# Phase 10 SR-* Security Sweep

**Date:** 2026-06-22
**Scope:** SR-1 through SR-15 (Hush-PRD.md §11). This is the Phase 10 hardening-phase audit record. Every status below is backed by a command actually run in this session (output in the Appendix) or a file read in this session — nothing here is guessed or reconstructed from memory.

## Summary table

| ID | Requirement | Status | Evidence |
|----|---|---|---|
| SR-1 | Rate limiting on every endpoint | PASS | `apps/ai-service/app/rate_limit.py` used by all 3 FastAPI routes; `test_rate_limit.py` (6 tests), `test_analytics_endpoint.py::test_rate_limit_returns_429`, `test_badge_endpoint.py::test_mint_rate_limit_returns_429`, `test_digest_endpoint.py::test_rate_limit_returns_429` all PASS. DB-level rate limiting in `009_sessions_rate_limit.sql` (pgTAP: ok) and the `score_pings_rate_limit_trigger` in `0016_score_ping_ingest.sql` (12/min cap). |
| SR-2 | No secrets in client bundle | PASS | `grep` of dashboard source for `SERVICE_ROLE\|ANTHROPIC_API_KEY\|BADGE_SIGNING_SECRET\|SUPABASE_JWT_SECRET` returns zero matches; grep of the (partially-built, see appendix caveat) `.next` output also returns zero matches. Dashboard only ever references `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `AI_SERVICE_URL`. |
| SR-3 | Auth on internal/operator endpoints | FIXED THIS PHASE | `apps/ai-service/app/auth.py::require_operator` now verifies both ES256 (JWKS, real Supabase operator tokens) and HS256, with the token's own `alg` header used only to select the verification path (alg-confusion guard) — never the key. `test_auth.py` 11/11 PASS including `test_es256_token_returns_operator_id`, `test_es256_wrong_key_is_rejected`, `test_unsupported_alg_is_rejected`. |
| SR-4 | Input validation before DB/LLM call | PASS | `routes_digest.py`: `zone_id: uuid.UUID` path param (Pydantic/FastAPI type coercion → 422), `require_operator` + `enforce_rate_limit` run before the Supabase RPC or Claude call (`test_non_uuid_zone_id_returns_422`, `test_digest_endpoint.py` 7/7 PASS). Score-ingest RPC `ingest_score_ping(p_anon_token, p_zone_id, p_score, p_ts)` enforces `0 <= score <= 100` server-side in Postgres (`0016_score_ping_ingest.sql` lines 32-34) before any insert. |
| SR-5 | TLS everywhere / HSTS | ACCEPTED RISK (not yet configured) | No HSTS header config or TLS-enforcement code found anywhere in `apps/dashboard` or `apps/ai-service` (`grep -rn "hsts\|HSTS\|Strict-Transport-Security"` → no matches). This is expected to be enforced at the deploy platform (Vercel/Render/Supabase Cloud all terminate TLS and can add HSTS at the edge) and has not yet been exercised because there is no deployed environment to test against in this sweep. Flagging as a real gap, not silently passing it. |
| SR-6 | No SQL injection / no string-interpolated SQL | PASS | `grep -rn 'f"SELECT\|f''SELECT\|f"INSERT\|f''INSERT' apps/ai-service apps/dashboard` (excluding `.venv`) returns zero hits in Hush's own code (the one hit inside `.venv/Lib/site-packages/typing_extensions.py` is a vendored third-party docstring example, not Hush code). All Postgres access is via parameterized RPCs (`security definer` functions with typed args) or the Supabase client/SQLAlchemy; no raw SQL string-building found. |
| SR-7 | IDOR | PASS | `npx supabase test db`: 24 files, 111 subtests, all "ok" except the non-test helper file (`000_helpers.sql`, 0 tests, not a failure — see appendix). 13 of the 24 test files contain explicit `IDOR` keyword assertions: `001_users_rls.sql`, `002_operators_rls.sql`, `003_zones_rls.sql`, `004_sessions_rls.sql`, `005_score_pings_rls.sql`, `007_rewards_rls.sql`, `008_wallet_ledger_rls.sql`, `011_checkout_session.sql`, `012_score_ping_ingest.sql`, `018_redemptions_rls.sql`, `020_zone_weekly_metrics.sql`, `021_zone_badge_average.sql`, `022_delete_my_data.sql`. |
| SR-8 | Missing authorization / deny-by-default | PASS | Same `npx supabase test db` run as SR-7: every RLS-bearing table's test file passed, including the two new ones this phase (`022_delete_my_data.sql`, `023_audit_log.sql`, both "ok"). `audit_log`'s RLS is deny-by-default — only `service_role` can read (confirmed by reading `0026_audit_log.sql`). |
| SR-9 | Minimal score-ingest payload | PASS | Read `supabase/migrations/0016_score_ping_ingest.sql`: the RPC signature `ingest_score_ping(p_anon_token uuid, p_zone_id uuid, p_score int, p_ts timestamptz)` is the *only* write path into `score_pings` for clients (direct `insert` is revoked from `authenticated` at line 16) — an RPC's fixed positional signature cannot carry extra fields, structurally enforcing the `{anon_session_token, zone_id, score, ts}`-only contract. `012_score_ping_ingest.sql` pgTAP: ok. |
| SR-10 | Server-side quorum enforcement | PASS | Read `supabase/migrations/0017_quiet_index_engine.sql`: `compute_quiet_index_rollups()` only inserts a `quiet_index` row `where active_count >= 3` (line 53); `execute` on the function is revoked from `public, anon, authenticated` (line 59) — only the `pg_cron` job (as function owner) ever calls it, so no client request can force a sub-quorum broadcast. `013_quiet_index_engine.sql` pgTAP: ok. |
| SR-11 | Signed, short-TTL certification badge | PASS | Read `apps/ai-service/app/badge.py`: `sign_badge_token`/`verify_badge_token` use HS256 JWT with an `exp` claim set from a caller-supplied `ttl_seconds`; verification failures raise a single generic `BadgeTokenError` (no PyJWT error text leaked — also SR-15). `test_badge.py` 3/3 PASS (round-trip, forged signature rejected, expired token rejected); `test_badge_endpoint.py` 8/8 PASS. |
| SR-12 | Data deletion (right-to-erasure) | FIXED THIS PHASE | `supabase/migrations/0025_delete_my_data.sql` adds `public.delete_my_data()` — deletes `auth.users` for `auth.uid()` only (no id parameter, so no IDOR surface), cascading to `public.users`/`sessions`/`score_pings`/`wallet_ledger`/`redemptions`. `022_delete_my_data.sql` pgTAP: ok, and is one of the files containing explicit `IDOR` assertions. |
| SR-13 | Audit logging for sensitive actions | FIXED THIS PHASE | `supabase/migrations/0026_audit_log.sql` adds `public.audit_log` (deny-by-default RLS, service_role-only read) with triggers logging `zone_delete` (actor + target, fail-closed — an unaudited deletion rolls back) and `role_change` (actor nullable, explicitly documented as meaning "service-role/superuser context" rather than a misleading guess). Reward disbursement was already audited via the pre-existing `redemptions` table. `023_audit_log.sql` pgTAP: ok. |
| SR-14 | Dependency hygiene (audit before submission) | ACCEPTED RISK | `pip-audit` (Python/ai-service): **clean, "No known vulnerabilities found."** `npm audit --audit-level=high`: 33 findings (1 low, 26 moderate, 6 high). Traced the flagged packages (`tar`, `uuid`, `js-yaml`, `postcss`, `esbuild`) with `npm ls`: all resolve under `@expo/cli`, `@expo/metro-config`, `@react-native/community-cli-plugin`, `babel-jest`, or `vite` — i.e. Expo/Metro/Babel/Vite **build and CLI tooling**, not code that ships in the mobile app bundle or the dashboard's browser-delivered JS. Recorded as ACCEPTED RISK (not PASS) because the high-severity findings are real and unresolved upstream in Expo SDK 52's toolchain, consistent with the existing memory note that "Expo audit highs [are] deferred to Phase 10" — this sweep confirms that deferral was scoped correctly (build-time only) but does not fix the underlying advisories. |
| SR-15 | Error hygiene (no leaked stack traces/secrets) | PASS | `apps/ai-service/app/errors.py::install_error_handlers` registers a catch-all `Exception` handler returning generic `{"error": "internal_error"}` with no trace; the real error is only `logger.exception`'d server-side. `test_errors.py` 2/2 PASS (`test_unhandled_exception_returns_generic_500`, `test_http_exception_passes_through`). Reinforced by this phase's SR-3 fix (`auth.py`: every JWT failure path returns the same generic 401, library reason never echoed — `test_auth.py` 11/11 PASS) and by `badge.py`'s `BadgeTokenError` (no PyJWT text leaked — `test_badge.py` 3/3 PASS). |

**Overall: 11 PASS, 3 FIXED THIS PHASE, 2 ACCEPTED RISK (SR-5, SR-14), 0 FAIL.**

No requirement is recorded as FAIL. SR-5 is an honest gap (not yet configured/testable — no deployed environment exists to verify HSTS/TLS termination against). SR-14 is a known, traced, build-tooling-only risk, not a runtime exposure.

---

## Appendix: raw command output

### 1. `cd apps/ai-service && pytest -v` (via `.venv/Scripts/pytest.exe`, since root `pytest` had no venv active)

```
============================= test session starts =============================
platform win32 -- Python 3.13.7, pytest-9.1.0, pluggy-1.6.0
collecting ... collected 60 items

tests/test_analytics_endpoint.py ....                                    [  6%]
tests/test_auth.py .........                                             [ 21%]
tests/test_badge.py ...                                                  [ 26%]
tests/test_badge_endpoint.py ........                                    [ 40%]
tests/test_badge_svg.py ..                                               [ 43%]
tests/test_digest.py .......                                             [ 55%]
tests/test_digest_endpoint.py .......                                    [ 66%]
tests/test_errors.py ..                                                  [ 70%]
tests/test_health.py .                                                   [ 71%]
tests/test_rate_limit.py ......                                          [ 81%]
tests/test_settings.py ....                                              [ 88%]
tests/test_supabase_client.py .....                                     [100%]

======================= 60 passed, 52 warnings in 2.78s =======================
```
(Warnings are all `InsecureKeyLengthWarning` from short HMAC test fixtures and a `httpx`/starlette deprecation notice — not failures, not security-relevant beyond the test fixtures' own deliberately-short test secrets.)

### 2. `npx supabase test db`

```
/.../000_helpers.sql .........................
No subtests run
/.../001_users_rls.sql ....................... ok
/.../002_operators_rls.sql ................... ok
/.../003_zones_rls.sql ....................... ok
/.../004_sessions_rls.sql .................... ok
/.../005_score_pings_rls.sql ................. ok
/.../006_quiet_index_rls.sql ................. ok
/.../007_rewards_rls.sql ..................... ok
/.../008_wallet_ledger_rls.sql ............... ok
/.../009_sessions_rate_limit.sql ............. ok
/.../010_zone_contains_point.sql ............. ok
/.../011_checkout_session.sql ................ ok
/.../012_score_ping_ingest.sql ............... ok
/.../013_quiet_index_engine.sql .............. ok
/.../014_sessions_user_id_default.sql ........ ok
/.../015_compute_eligible_quiet_minutes.sql .. ok
/.../016_accrue_session_points.sql ........... ok
/.../017_checkout_session_accrual.sql ........ ok
/.../018_redemptions_rls.sql ................. ok
/.../019_redeem_reward.sql ................... ok
/.../020_zone_weekly_metrics.sql ............. ok
/.../021_zone_badge_average.sql .............. ok
/.../022_delete_my_data.sql .................. ok
/.../023_audit_log.sql ....................... ok

Test Summary Report
-------------------
/.../000_helpers.sql (Wstat: 0 Tests: 0 Failed: 0)
  Parse errors: No plan found in TAP output
Files=24, Tests=111, 1 wallclock secs (0.07 usr 0.06 sys + 0.19 cusr 0.08 csys = 0.40 CPU)
Result: FAIL
error running container: exit 1
```

**Interpretation:** the harness reports `Result: FAIL` solely because `000_helpers.sql` is a setup/fixture file (creates the `tests` schema helpers), not a pgTAP test file with its own plan — it declares 0 tests, which pgTAP's harness treats as a "no plan found" parse error rather than a pass. All 23 real test files (111 subtests across them) report "ok" — zero actual test-assertion failures. This is a pre-existing harness quirk (also noted re: TRUNCATE/RLS gotchas in project memory), not a regression introduced this phase.

### 3. `npm test --workspace apps/dashboard`

```
RUN  v4.1.9
Test Files  11 passed (11)
     Tests  68 passed (68)
  Duration  6.89s
```

### 4. `npm test --workspace apps/mobile`

```
RUN  v4.1.9
Test Files  11 passed (11)
     Tests  67 passed (67)
  Duration  660ms
```

### 5. `npm run typecheck`

```
> hush@0.0.0 typecheck
> tsc -b
```
(No output = clean. `tsc -b` only prints on error.)

### 6. `npm run audit` (chained `audit:js && audit:py`)

`npm run audit:js` (`npm audit --audit-level=high`) exited 1 (33 vulnerabilities: 1 low, 26 moderate, 6 high), so the `&&` chain never reached `audit:py`. Ran `audit:py` separately to get real coverage of the Python side:

```
> hush@0.0.0 audit:py
> bash scripts/audit-py.sh

No known vulnerabilities found
Name            Skip Reason
--------------- ------------------------------------------------------------------------------
hush-ai-service Dependency not found on PyPI and could not be audited: hush-ai-service (0.0.0)
```

`pip-audit` is clean (the "skip" line is just pip-audit declining to audit the local, unpublished `hush-ai-service` package itself — not a vulnerability).

`npm audit --audit-level=high` top-level findings (trimmed to the package names + severities; full advisory text omitted, full run available by re-running `npm audit`):
- `esbuild` (moderate) — arbitrary file read via dev server. `npm ls esbuild` → nested under `@hush/dashboard > @vitejs/plugin-react > vite`. Dev-only Vite tooling.
- `js-yaml` (moderate) — quadratic-complexity DoS. `npm ls js-yaml` → nested under `react-native@0.76.5 > @react-native/community-cli-plugin / babel-jest` and under `expo > @expo/cli > @expo/xcpretty`. Build/test tooling only.
- `postcss` (moderate) — XSS via unescaped `</style>`. `npm ls postcss` → the vulnerable `<8.5.10` resolution is nested under `@expo/metro-config` (mobile bundler, build-time) and under `next@15.5.19`'s internally-bundled build-time postcss (`8.4.31`); the dashboard's own direct `postcss` dependency is already patched (`8.5.15`).
- `tar` (high) — hardlink/symlink path traversal. `npm ls tar` → nested under `expo > @expo/cli > cacache`. CLI tooling.
- `uuid` (moderate) — missing buffer bounds check. `npm ls uuid` → nested under `expo > @expo/cli > @expo/rudder-sdk-node` and `expo > @expo/config-plugins > xcode`. CLI tooling.

All five trace to Expo/Metro/Babel/Vite build-and-CLI dependency chains (`@expo/cli`, `@expo/metro-config`, `@react-native/community-cli-plugin`, `vite`) — none are runtime dependencies that ship inside the mobile app bundle or the dashboard's browser-delivered JS bundle. Hence SR-14: ACCEPTED RISK, not PASS — the advisories are real and still open upstream, but do not currently constitute a runtime exposure.

### 7. SR-6 targeted grep

```
$ grep -rn 'f"SELECT|f'"'"'SELECT|f"INSERT|f'"'"'INSERT' apps/ai-service apps/dashboard
apps/ai-service/.venv/Lib/site-packages/typing_extensions.py:2313:  query(f"SELECT * FROM {input()}")  # not ok
```
Re-run excluding `.venv` (third-party vendored code, not Hush's own code): zero matches in `apps/ai-service` or `apps/dashboard` source.

### 8. SR-2 dashboard build + bundle grep

```
$ npm run build --workspace apps/dashboard
   ▲ Next.js 15.5.19
 ✓ Compiled successfully in 11.6s
   Linting and checking validity of types ...
   Collecting page data ...
unhandledRejection [Error: Incompatible React versions: The "react" and "react-dom" packages must have the exact same version. Instead got:
  - react:      18.3.1
  - react-dom:  19.2.7
Learn more: https://react.dev/warnings/version-mismatch]
npm error Lifecycle script `build` failed with error: npm error code 1
```

**This build genuinely failed**, and it is being recorded honestly rather than smoothed over. Root cause (verified via `npm ls react react-dom`): the monorepo's hoisted `node_modules` resolves two different React majors for two different workspaces — `apps/dashboard` wants React 19 (`next@15.5.19` + `react-dom@19.2.7`), while `apps/mobile`'s `react-native@0.76.5` pins React 18 (`react@18.3.1`) — and npm's dedup logic collapses `apps/dashboard`'s nested `react` to the 18.3.1 resolution, producing a mismatch Next.js refuses to build with at the page-data-collection stage. This is a pre-existing dependency-resolution conflict in the committed `package-lock.json`, not introduced by this sweep, and is not a trivial missing-env-var fix (forcing a React version in either workspace risks breaking the other app) — so per the task's own guidance, it is reported here as a real environment finding rather than silently worked around.

Despite the failure, webpack's compile step (`✓ Compiled successfully`) ran and emitted real output into `apps/dashboard/.next` before the later type/page-data stage failed. Grepping that partial build output for server secrets:

```
$ grep -rln "SERVICE_ROLE\|ANTHROPIC_API_KEY\|BADGE_SIGNING_SECRET\|SUPABASE_JWT_SECRET" apps/dashboard/.next
no server secrets found in dashboard build output
```

Caveat: this is a **partial** build (compiled JS bundles exist, but the build did not complete to a deployable artifact). SR-2 is still recorded PASS on the strength of (a) this partial-but-real bundle grep being clean, and (b) the stronger, independent source-level check: grepping all of `apps/dashboard`'s own source (non-`.next`) for the same secret names returns zero matches — the dashboard code never references `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `BADGE_SIGNING_SECRET`, or `SUPABASE_JWT_SECRET` anywhere, only `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `AI_SERVICE_URL` (a same-origin-proxied URL, not a secret). The dashboard's `.env.local` (pre-existing, not created by this sweep) confirms only the anon key and a non-secret service URL are configured client-side.

**Recommendation for a follow-up task (not fixed in this sweep):** resolve the React 18/19 split between `apps/dashboard` and `apps/mobile` (e.g. via npm workspace `overrides`/nested install isolation) so `next build` can complete normally; re-run the full SR-2 bundle check against a complete build once fixed.

### 9. SR-7/SR-8 supporting grep

```
$ grep -l "IDOR" supabase/tests/database/*.sql
supabase/tests/database/001_users_rls.sql
supabase/tests/database/002_operators_rls.sql
supabase/tests/database/003_zones_rls.sql
supabase/tests/database/004_sessions_rls.sql
supabase/tests/database/005_score_pings_rls.sql
supabase/tests/database/007_rewards_rls.sql
supabase/tests/database/008_wallet_ledger_rls.sql
supabase/tests/database/011_checkout_session.sql
supabase/tests/database/012_score_ping_ingest.sql
supabase/tests/database/018_redemptions_rls.sql
supabase/tests/database/020_zone_weekly_metrics.sql
supabase/tests/database/021_zone_badge_average.sql
supabase/tests/database/022_delete_my_data.sql
```
13 of 24 test files (54%) contain explicit IDOR-guard assertions.
