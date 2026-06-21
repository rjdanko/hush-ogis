import { supabase } from "./supabase";

// Reads the latest rollup (Phase 5 server-side engine, never computed on
// device). `null` means quorum (SR-10) has never been met for this zone --
// distinct from a real low score, so callers must not treat it as 0.
export async function fetchLatestQuietIndex(zoneId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from("quiet_index")
    .select("value")
    .eq("zone_id", zoneId)
    .order("ts", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? Number((data as { value: number }).value) : null;
}

// Subscribes to new rollups for one zone over Supabase Realtime. Returns an
// unsubscribe function; callers must call it on unmount.
//
// Realtime authorizes a filtered postgres_changes subscription against the
// connection's own JWT (via has_column_privilege), not the apikey query
// param -- without explicitly syncing the session token first, the socket
// authenticates as `anon`, which has no grant on quiet_index at all, and the
// subscribe is silently rejected server-side instead of ever firing onUpdate.
export function subscribeToQuietIndex(zoneId: string, onUpdate: (value: number) => void): () => void {
  let channel: ReturnType<typeof supabase.channel> | null = null;
  let cancelled = false;

  supabase.auth.getSession().then(({ data }) => {
    if (cancelled) return;
    if (data.session) supabase.realtime.setAuth(data.session.access_token);

    channel = supabase
      .channel(`quiet-index:${zoneId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "quiet_index", filter: `zone_id=eq.${zoneId}` },
        (payload: { new: { value: number } }) => onUpdate(Number(payload.new.value))
      )
      .subscribe();
  });

  return () => {
    cancelled = true;
    channel?.unsubscribe();
  };
}
