// Phase 5 manual verification: drives 3 fresh anonymous check-ins + rising
// score pings against the local stack (same as simulate-quiet-index.mjs) and,
// in the same process, watches the dashboard's LiveQuietIndex card in a real
// browser to confirm it updates via Supabase Realtime with no page reload.
// Not part of `npm test` (needs the local stack + dashboard dev server up).
//
// Run:
//   npx supabase start && npm run dev:dashboard
//   node scripts/verify-live-quiet-index.mjs
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const SUPABASE_URL = "http://127.0.0.1:54321";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const DEMO_ZONE_ID = "00000000-0000-0000-0000-00000000000a";
const TICKS = 6;
const TICK_MS = 15_000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const sessions = [];
for (let i = 0; i < 3; i++) {
  const client = createClient(SUPABASE_URL, ANON_KEY);
  const { data: signIn } = await client.auth.signInAnonymously();
  const { data } = await client
    .from("sessions")
    .insert({ zone_id: DEMO_ZONE_ID, user_id: signIn.user.id })
    .select("id, anon_token")
    .single();
  sessions.push({ client, anonToken: data.anon_token, score: 20 });
}
console.log(`Checked in ${sessions.length} fresh anonymous sessions, scores starting at 20.`);

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("http://localhost:3000/login");
await page.fill('input[name="email"]', "demo-operator@hush.local");
await page.fill('input[name="password"]', "DemoOperator123!");
await page.click('button[type="submit"]');
await page.waitForURL(/\/zones$/, { timeout: 10000 });
await page.goto(`http://localhost:3000/zones/${DEMO_ZONE_ID}`);
await page.waitForSelector("text=Live Quiet Index");

const readings = [];
for (let tick = 1; tick <= TICKS; tick++) {
  await Promise.all(
    sessions.map(async (session) => {
      await session.client.rpc("ingest_score_ping", {
        p_anon_token: session.anonToken,
        p_zone_id: DEMO_ZONE_ID,
        p_score: session.score,
        p_ts: new Date().toISOString(),
      });
      session.score = Math.min(95, session.score + 10);
    })
  );
  await sleep(TICK_MS);
  const text = await page.locator("text=Live Quiet Index").locator("..").locator("p").first().textContent();
  readings.push(text?.trim());
  console.log(`  tick ${tick}: ${text?.trim()}`);
}

console.log("\nReadings (no manual refresh):", readings.join(" -> "));
if (new Set(readings).size <= 1) {
  console.error("FAIL: the card never changed -- realtime update did not visibly land.");
  process.exitCode = 1;
} else {
  console.log("PASS: the live card updated in the browser without a page reload.");
}

await browser.close();
