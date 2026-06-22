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
