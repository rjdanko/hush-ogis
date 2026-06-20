import type { Session } from "@hush/shared-types";
import { supabase } from "./supabase";
import { toSession } from "./mappers";
import { validateIntendedMinutes } from "./validation";

const SESSION_SELECT = "id, user_id, zone_id, start_ts, end_ts, intended_minutes, achieved_minutes, final_score, created_at";

// Creates a session row for the current user. RLS (sessions_insert_own,
// 0005_sessions.sql) is the real enforcement that a user can only check
// themselves in; this client-side validation is just a friendly early error.
export async function createCheckIn(zoneId: string, intendedMinutes: number | null): Promise<Session> {
  const validation = validateIntendedMinutes(intendedMinutes);
  if (!validation.ok) throw new Error(validation.reason);

  const { data, error } = await supabase
    .from("sessions")
    .insert({ zone_id: zoneId, intended_minutes: intendedMinutes })
    .select(SESSION_SELECT)
    .single();

  if (error) throw error;
  return toSession(data);
}

// Closes a session via the server-verified RPC (0015_checkout_session.sql)
// rather than an update -- achieved_minutes is computed server-side, never
// accepted from the client.
export async function checkOutSession(sessionId: string): Promise<Session> {
  const { data, error } = await supabase.rpc("checkout_session", { p_session_id: sessionId });
  if (error) throw error;
  return toSession(data);
}
