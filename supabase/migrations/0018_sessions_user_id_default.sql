-- apps/mobile/lib/checkin.ts inserts {zone_id, intended_minutes} only -- no
-- column default ever existed for user_id, so that real-device insert has
-- been silently rejected by RLS since Phase 3 (see memory:
-- hush-sessions-user-id-gap, discovered while writing Phase 5's demo script,
-- which had to work around it by setting user_id explicitly). Point accrual
-- in this phase depends on real check-ins actually working, so fix it here:
-- the row's own creator is always auth.uid() for an authenticated insert.
alter table public.sessions
  alter column user_id set default auth.uid();
