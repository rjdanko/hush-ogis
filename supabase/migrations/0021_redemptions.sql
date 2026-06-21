-- Immutable audit log of reward redemptions (SR-13: audit-log reward
-- disbursement & redemption). Same write-only-via-server-function stance
-- as wallet_ledger (0009_wallet_ledger.sql) -- this table and the matching
-- negative wallet_ledger entry are both written atomically by redeem_reward
-- (next migration), never by a direct client insert.
create table public.redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  reward_id uuid not null references public.rewards(id) on delete cascade,
  zone_id uuid not null references public.zones(id) on delete cascade,
  points_spent int not null check (points_spent > 0),
  created_at timestamptz not null default now()
);

alter table public.redemptions enable row level security;

grant select on public.redemptions to authenticated;

create policy "redemptions_select_own" on public.redemptions
  for select using (user_id = auth.uid());

-- deliberately no insert/update/delete grant or policy: only the
-- redeem_reward SECURITY DEFINER function (next migration) may write here.

revoke truncate on public.redemptions from anon, authenticated;
