import type { ScorePing } from "@hush/shared-types";
import { supabase } from "./supabase";

// The only allowed shape over the wire (SR-9 minimal ingest): nothing beyond
// these four fields is ever sent. The server resolves anonToken + zoneId to
// the caller's own active session (supabase/migrations/0016_score_ping_ingest.sql).
export async function sendScorePing(ping: ScorePing): Promise<void> {
  const { error } = await supabase.rpc("ingest_score_ping", {
    p_anon_token: ping.anonSessionToken,
    p_zone_id: ping.zoneId,
    p_score: ping.score,
    p_ts: ping.ts,
  });
  if (error) throw new Error(error.message);
}
