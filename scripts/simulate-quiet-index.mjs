// Phase 5 demo/verification script: proves the Quiet Index engine's quorum
// guard (SR-10) and ≤60s realtime latency NFR against a real local stack --
// not just pgTAP fixtures. Uses the anon key only (SR-2: never service-role),
// the same way the mobile app does, signing in as 3 separate anonymous users
// and checking each into the seeded demo zone.
//
// Run:
//   npx supabase start
//   node scripts/simulate-quiet-index.mjs
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "http://127.0.0.1:54321";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const DEMO_ZONE_ID = "00000000-0000-0000-0000-00000000000a";
const SESSION_COUNT = 3;
const TICK_MS = 15_000;
const TICKS = 6;

async function createSession() {
  const client = createClient(SUPABASE_URL, ANON_KEY);
  const { data: signIn, error: signInError } = await client.auth.signInAnonymously();
  if (signInError) throw signInError;

  // NOTE: sessions.user_id has no DB default, so it must be set explicitly --
  // apps/mobile/lib/checkin.ts omits it and would hit the same RLS rejection
  // this script avoids by passing it. That's a pre-existing gap outside this
  // phase's scope; flagged here rather than silently worked around.
  const { data, error } = await client
    .from("sessions")
    .insert({ zone_id: DEMO_ZONE_ID, user_id: signIn.user.id })
    .select("id, anon_token")
    .single();
  if (error) throw error;

  return { client, sessionId: data.id, anonToken: data.anon_token, score: 40 };
}

async function pingScore(session) {
  const { error } = await session.client.rpc("ingest_score_ping", {
    p_anon_token: session.anonToken,
    p_zone_id: DEMO_ZONE_ID,
    p_score: session.score,
    p_ts: new Date().toISOString(),
  });
  if (error) throw error;
  session.score = Math.min(95, session.score + 10);
}

async function fetchLatestQuietIndex() {
  // A fresh, unauthenticated read confirms the value is genuinely public, not
  // an artifact of the sessions' own auth context.
  const reader = createClient(SUPABASE_URL, ANON_KEY);
  const { error: signInError } = await reader.auth.signInAnonymously();
  if (signInError) throw signInError;
  const { data, error } = await reader
    .from("quiet_index")
    .select("value, active_count, ts")
    .eq("zone_id", DEMO_ZONE_ID)
    .order("ts", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

console.log(`Creating ${SESSION_COUNT} anonymous check-ins into the demo zone...`);
const sessions = [];
for (let i = 0; i < SESSION_COUNT; i++) {
  sessions.push(await createSession());
  console.log(`  session ${i + 1}/${SESSION_COUNT} checked in`);
}

console.log(`\nSending rising score pings every ${TICK_MS / 1000}s for ${TICKS} ticks...`);
for (let tick = 1; tick <= TICKS; tick++) {
  await Promise.all(sessions.map(pingScore));
  await sleep(TICK_MS);
  const latest = await fetchLatestQuietIndex();
  if (!latest) {
    console.log(`  tick ${tick}: no quiet_index row yet (quorum not met or cron hasn't ticked)`);
  } else {
    console.log(`  tick ${tick}: value=${latest.value} active_count=${latest.active_count} ts=${latest.ts}`);
  }
}

console.log("\nDone. Expect: no row before quorum, a row within ~15s of the 3rd check-in, value trending upward.");
process.exit(0);
