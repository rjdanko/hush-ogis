# Phase 1 Change Note — Continuous Point Accrual

> **For Claude Code:** Apply these changes while implementing Phase 1. This note amends the existing Phase 1 data/auth/security plan so the schema supports continuous point accrual instead of a strict "commitment completed → reward granted" model. Keep the existing Phase 1 structure, TDD flow, RLS approach, and task-by-task commits.

## Goal

Update the Phase 1 schema and shared types so future phases can award points continuously from verified disconnection signals. A user's quiet intention should remain useful for UX and coaching, but it must not be required as a pass/fail reward gate.

## Product Rule Change

Old model: user commits to a fixed goal, completes the goal, then receives points if the threshold is met.

New model: user may set an optional quiet intention, but points are earned from verified signs of disconnection over time. Phase 6 will calculate eligible quiet minutes from server-side score history, geofence/presence checks, and zone earning rules. The client must never mint points or submit a point amount.

## Affected Phase 1 Tasks

### Task 6 — `sessions` table + RLS

Change the session model from required `committed_minutes` to optional `intended_minutes`.

In `supabase/migrations/0005_sessions.sql`, replace:

```sql
-- max 8 hours: longest plausible single silence commitment
committed_minutes int not null check (committed_minutes > 0 and committed_minutes <= 480),
```

with:

```sql
-- optional user intention; points are earned later from verified disconnection,
-- not from merely completing this target
intended_minutes int check (intended_minutes > 0 and intended_minutes <= 480),
```

Keep `achieved_minutes` and `final_score` for session summary purposes. They can still describe the completed session, but they should not be treated as the sole reward trigger.

Update `supabase/tests/database/004_sessions_rls.sql` so inserts use `intended_minutes` instead of `committed_minutes`. Add one positive test showing a session can be created with `intended_minutes` omitted or null.

Update the Task 6 commit message to mention intention-based sessions, for example:

```bash
git commit -m "feat(db): add sessions table with optional quiet intention and owner-scoped RLS"
```

### Task 10 — `wallet_ledger` table + RLS

Keep the ledger model, but add metadata so Phase 6 can record why points were earned or spent without needing an immediate new table.

In `supabase/migrations/0009_wallet_ledger.sql`, add:

```sql
metadata jsonb not null default '{}'::jsonb,
```

Recommended final shape:

```sql
create table public.wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  delta int not null check (delta <> 0),
  reason text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
```

Keep the existing security stance: clients can select their own ledger entries, but no client can insert/update/delete wallet entries. Only server-side Phase 6 logic may credit or debit points.

Update `supabase/tests/database/008_wallet_ledger_rls.sql` to insert at least one ledger row with metadata, for example:

```sql
insert into public.wallet_ledger (user_id, delta, reason, metadata)
values (
  '70707070-7070-7070-7070-707070707070',
  50,
  'quiet_minute_accrual',
  '{"session_id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "eligible_minutes": 25}'::jsonb
);
```

The RLS assertions should remain the same: users cannot read each other's ledger entries, and clients cannot credit/debit their own wallet directly.

### Task 11 — Demo seed

Update the seeded zone configuration so it reflects continuous earning instead of a strict commitment reward.

In `supabase/seed/seed.sql`, change the `silence_contract` example from:

```sql
'{"committed_minutes": 45}'::jsonb,
```

to:

```sql
'{"suggested_minutes": 45}'::jsonb,
```

Change the `reward_config` example from:

```sql
'{"reward_name": "Free coffee", "zone_hours_required": 5}'::jsonb
```

to:

```sql
'{"earn_rate_per_quiet_minute": 1, "min_score_for_earning": 70, "daily_point_cap": 120}'::jsonb
```

Keep the seeded reward:

```sql
insert into public.rewards (zone_id, name, points_cost)
values ('00000000-0000-0000-0000-00000000000a', 'Free coffee', 50)
on conflict do nothing;
```

This means the zone defines how points are earned, while the reward defines what points can buy.

### Task 12 — Shared types

Update the shared TypeScript types to match the new schema and semantics.

In `packages/shared-types/src/zone.ts`, replace:

```typescript
export interface SilenceContract {
  committed_minutes: number;
}

export interface RewardConfig {
  reward_name: string;
  zone_hours_required: number;
}
```

with:

```typescript
export interface SilenceContract {
  suggested_minutes?: number;
}

export interface RewardConfig {
  earn_rate_per_quiet_minute: number;
  min_score_for_earning: number;
  daily_point_cap?: number;
}
```

In `packages/shared-types/src/session.ts`, replace:

```typescript
committedMinutes: number;
```

with:

```typescript
intendedMinutes: number | null;
```

In `packages/shared-types/src/wallet-ledger.ts`, add metadata:

```typescript
metadata: Record<string, unknown>;
```

Recommended final shape:

```typescript
export interface WalletLedgerEntry {
  id: string;
  userId: string;
  delta: number;
  reason: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}
```

## Verification Updates

Phase 1 still exits green only when:

- `npx supabase db reset` succeeds.
- `npx supabase test db` passes all RLS tests.
- `npm run typecheck --workspace packages/shared-types` passes.
- `npm run typecheck` passes.
- Wallet ledger writes remain server-only.
- A session can be created with no quiet intention.
- A session can be created with a valid `intended_minutes` value.

## Do Not Implement Yet

Do not build the point accrual engine in Phase 1. Phase 1 only prepares the schema and types. The actual earning formula, point calculation, wallet crediting, redemption logging, and voucher flow belong in Phase 6.

Do not let the mobile client submit point amounts. Future phases may show estimated pending points, but only server-side code may create positive or negative `wallet_ledger` entries.
