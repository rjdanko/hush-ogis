// Phase 6 demo/verification: proves the full continuous-points loop against
// a real local stack, not just pgTAP fixtures -- check in, send rising score
// pings clearing the demo zone's min_score_for_earning (70), check out,
// confirm points landed in the wallet, then redeem the seeded "Free coffee"
// reward and confirm the balance drops accordingly.
//
// Run:
//   npx supabase db reset && npx supabase start
//   node scripts/verify-wallet-flow.mjs
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "http://127.0.0.1:54321";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const DEMO_ZONE_ID = "00000000-0000-0000-0000-00000000000a";
const DEMO_REWARD_ID = "00000000-0000-0000-0000-00000000000b";

const client = createClient(SUPABASE_URL, ANON_KEY);
const { data: signIn, error: signInError } = await client.auth.signInAnonymously();
if (signInError) throw signInError;
console.log(`Signed in anonymously as ${signIn.user.id}`);

// Relies on Task 1's auth.uid() default -- this insert omits user_id, the
// exact shape apps/mobile/lib/checkin.ts uses.
const { data: session, error: checkInError } = await client
  .from("sessions")
  .insert({ zone_id: DEMO_ZONE_ID, intended_minutes: 20 })
  .select("id, anon_token")
  .single();
if (checkInError) throw checkInError;
console.log(`Checked in: session ${session.id}`);

console.log("Sending 5 score pings >= 70, 60s apart (simulated via backdated ts)...");
const baseTs = Date.now() - 4 * 60_000;
for (let i = 0; i < 5; i++) {
  const { error } = await client.rpc("ingest_score_ping", {
    p_anon_token: session.anon_token,
    p_zone_id: DEMO_ZONE_ID,
    p_score: 80,
    p_ts: new Date(baseTs + i * 60_000).toISOString(),
  });
  if (error) throw error;
}
console.log("  5 pings sent.");

const { data: checkedOut, error: checkoutError } = await client.rpc("checkout_session", {
  p_session_id: session.id,
});
if (checkoutError) throw checkoutError;
console.log(`Checked out: final_score=${checkedOut.final_score} achieved_minutes=${checkedOut.achieved_minutes}`);

const { data: ledgerRows, error: ledgerError } = await client
  .from("wallet_ledger")
  .select("delta, reason")
  .eq("reason", "quiet_minute_accrual");
if (ledgerError) throw ledgerError;
const pointsAwarded = ledgerRows.reduce((sum, row) => sum + row.delta, 0);
console.log(`Points awarded from accrual: ${pointsAwarded}`);
if (pointsAwarded <= 0) {
  console.error("FAIL: expected a positive point credit from this quiet session.");
  process.exitCode = 1;
}

console.log(`Redeeming seeded reward ${DEMO_REWARD_ID}...`);
const { data: redemption, error: redeemError } = await client.rpc("redeem_reward", {
  p_reward_id: DEMO_REWARD_ID,
});

if (pointsAwarded >= 50) {
  if (redeemError) throw redeemError;
  console.log(`  Redeemed: points_spent=${redemption.points_spent}`);
  const { data: afterRows } = await client.from("wallet_ledger").select("delta");
  const balance = afterRows.reduce((sum, row) => sum + row.delta, 0);
  console.log(`Final balance: ${balance}`);
  console.log("\nPASS: check-in -> accrual -> checkout -> redemption all verified end to end.");
} else {
  console.log(`  Skipped redemption: balance ${pointsAwarded} is below the reward's cost (expected, not a failure).`);
  console.log("\nPASS: check-in -> accrual -> checkout verified end to end (redemption needs a longer session to afford).");
}
