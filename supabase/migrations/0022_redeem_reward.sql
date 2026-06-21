-- Server-verified redemption (SR-1/SR-7/SR-8, risk R6: a client must never
-- be able to credit/debit its own wallet directly or farm redemptions).
-- SECURITY DEFINER because authenticated has no write grant on either
-- wallet_ledger or redemptions; both writes happen atomically in one
-- function call, never as two separate client round trips a user could
-- interrupt to get the debit without the audit row (or vice versa).
create or replace function public.redeem_reward(p_reward_id uuid)
returns public.redemptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reward public.rewards;
  v_balance int;
  v_recent_count int;
  v_redemption public.redemptions;
begin
  select * into v_reward from public.rewards where id = p_reward_id;
  if v_reward.id is null then
    raise exception 'reward not found' using errcode = 'P0002';
  end if;

  -- Redemptions are rare, deliberate user actions (unlike score pings);
  -- 3 within 60s is already more than any legitimate single-session use,
  -- so this is a tight anti-farming guard, not a real usage ceiling.
  select count(*) into v_recent_count
  from public.redemptions
  where user_id = auth.uid()
    and created_at > now() - interval '60 seconds';
  if v_recent_count >= 3 then
    raise exception 'rate limit exceeded: too many redemptions, try again shortly'
      using errcode = 'P0001';
  end if;

  select coalesce(sum(delta), 0) into v_balance
  from public.wallet_ledger
  where user_id = auth.uid();

  if v_balance < v_reward.points_cost then
    raise exception 'insufficient balance' using errcode = 'P0001';
  end if;

  insert into public.wallet_ledger (user_id, delta, reason, metadata)
  values (
    auth.uid(),
    -v_reward.points_cost,
    'redemption',
    jsonb_build_object('reward_id', v_reward.id, 'reward_name', v_reward.name, 'zone_id', v_reward.zone_id)
  );

  insert into public.redemptions (user_id, reward_id, zone_id, points_spent)
  values (auth.uid(), v_reward.id, v_reward.zone_id, v_reward.points_cost)
  returning * into v_redemption;

  return v_redemption;
end;
$$;

revoke all on function public.redeem_reward(uuid) from public;
grant execute on function public.redeem_reward(uuid) to authenticated;
