import type { Redemption, Reward } from "@hush/shared-types";
import { supabase } from "./supabase";
import { toRedemption, toReward } from "./mappers";

// RLS (wallet_ledger_select_own, 0009_wallet_ledger.sql) already scopes this
// read to the caller's own rows -- summing client-side avoids adding a
// dedicated balance RPC for a read the client can already safely make.
export async function getWalletBalance(): Promise<number> {
  const { data, error } = await supabase.from("wallet_ledger").select("delta");
  if (error) throw new Error(error.message);
  return (data ?? []).reduce((total: number, row: { delta: number }) => total + row.delta, 0);
}

// Reward browsing is public for any signed-in user (rewards_select_all,
// 0008_rewards.sql) -- the wallet screen lists every zone's rewards.
export async function listRewards(): Promise<Reward[]> {
  const { data, error } = await supabase
    .from("rewards")
    .select("id, zone_id, name, points_cost, created_at");
  if (error) throw new Error(error.message);
  return (data ?? []).map(toReward);
}

// Server-verified: redeem_reward (0022_redeem_reward.sql) checks balance,
// rate limit, and writes both the wallet debit and the audit row atomically.
export async function redeemReward(rewardId: string): Promise<Redemption> {
  const { data, error } = await supabase.rpc("redeem_reward", { p_reward_id: rewardId });
  if (error) throw new Error(error.message);
  return toRedemption(data);
}

// Reads the credit accrue_session_points (0019_session_points_accrual.sql)
// wrote for this specific session, so the summary screen shows the real
// server-decided award rather than a client guess.
export async function getSessionPointsAwarded(sessionId: string): Promise<number> {
  const { data, error } = await supabase
    .from("wallet_ledger")
    .select("delta")
    .eq("reason", "quiet_minute_accrual")
    .eq("metadata->>session_id", sessionId);
  if (error) throw new Error(error.message);
  return (data ?? []).reduce((total: number, row: { delta: number }) => total + row.delta, 0);
}
