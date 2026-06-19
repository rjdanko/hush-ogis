create table public.wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  -- a zero delta is never a legitimate ledger entry (credit/debit amount is
  -- business logic Phase 6 owns, but "did nothing" is universally invalid)
  delta int not null check (delta <> 0),
  reason text not null,
  created_at timestamptz not null default now()
);

alter table public.wallet_ledger enable row level security;

-- read-only for clients: users may view their own ledger entries
grant select on public.wallet_ledger to authenticated;

create policy "wallet_ledger_select_own" on public.wallet_ledger
  for select using (user_id = auth.uid());

-- deliberately no insert/update/delete grant or policy: only service_role
-- (bypasses RLS and grants entirely) may write ledger entries, enforced
-- server-side by the Phase 6 reward-disbursement/redemption logic (SR-8,
-- risk R6: a client must never be able to mint or alter its own wallet
-- balance, even its own row)

-- TRUNCATE bypasses RLS entirely (see 0007_quiet_index.sql for the full
-- explanation). The default-privilege fix applied there is retroactive to the
-- `postgres` role's default ACL, so this new table should NOT inherit a
-- TRUNCATE grant — this revoke is defensive belt-and-suspenders, not expected
-- to find anything to revoke.
revoke truncate on public.wallet_ledger from anon, authenticated;
