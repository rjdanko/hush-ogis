-- Postgres does not auto-index foreign key columns. Every cross-table RLS
-- policy in this schema (EXISTS subqueries against a parent table's
-- ownership column, e.g. score_pings -> sessions, rewards/quiet_index ->
-- zones) and every foreseeable join (a user's sessions, a zone's score
-- pings/rewards) filters by one of these columns, so leaving them unindexed
-- means a full table scan on every such query as these tables grow -- flagged
-- during Task 7's code review and deferred to this final pass so every FK
-- column gets indexed in one sweep instead of piecemeal per-table.
create index zones_operator_id_idx on public.zones (operator_id);
create index sessions_user_id_idx on public.sessions (user_id);
create index sessions_zone_id_idx on public.sessions (zone_id);
create index score_pings_session_id_idx on public.score_pings (session_id);
create index quiet_index_zone_id_idx on public.quiet_index (zone_id);
create index rewards_zone_id_idx on public.rewards (zone_id);
create index wallet_ledger_user_id_idx on public.wallet_ledger (user_id);
