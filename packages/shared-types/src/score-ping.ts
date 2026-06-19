// The score-ingest endpoint's accepted request payload (PRD §11.4, SR-9
// minimal ingest): only these four fields are ever sent from a device — no
// app names, content, or keystrokes. The endpoint must reject any extra
// field.
//
// NOTE: this is NOT a 1:1 mirror of the public.score_pings table row
// (supabase/migrations/0006_score_pings.sql), which stores
// {id, session_id, ts, score} once the ingest endpoint has resolved the
// anon_session_token + zone_id to a session_id server-side. ScorePing is the
// wire contract; the DB row is the storage shape after server-side
// resolution. Keeping them as distinct types is deliberate: it stops a
// client from ever needing (or being able) to know a session_id.
export interface ScorePing {
  anonSessionToken: string;
  zoneId: string;
  score: number;
  ts: string;
}
