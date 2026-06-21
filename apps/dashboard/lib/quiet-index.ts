import type { SupabaseClient } from "@supabase/supabase-js";

// `null` means quorum (SR-10) has never been met for this zone -- distinct
// from a real low score, so it renders as "no reading yet", not "0/100".
export function formatQuietIndex(value: number | null): string {
  if (value === null) return "—";
  const clamped = Math.max(0, Math.min(100, value));
  return `${Math.round(clamped)}/100`;
}

export async function fetchLatestQuietIndex(supabase: SupabaseClient, zoneId: string): Promise<number | null> {
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
