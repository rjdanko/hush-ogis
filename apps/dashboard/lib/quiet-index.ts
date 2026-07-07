import type { SupabaseClient } from "@supabase/supabase-js";

export interface QuietIndexReading {
  value: number | null;
  activeCount: number | null;
}

export type GlowLevel = "high" | "mid" | "low" | "none";

export function quietIndexGlowLevel(value: number | null): GlowLevel {
  if (value === null) return "none";
  if (value > 70) return "high";
  if (value > 30) return "mid";
  return "low";
}

// Maps to Tailwind text-* classes for the glow scale
export function quietIndexGlowTextClass(value: number | null): string {
  const level = quietIndexGlowLevel(value);
  return {
    high: "text-glow-high",
    mid: "text-glow-mid",
    low: "text-glow-low",
    none: "text-glow-none",
  }[level];
}

// Inline color hex for elements that can't use Tailwind classes (SVG fill etc.)
export function quietIndexGlowHex(value: number | null): string {
  const level = quietIndexGlowLevel(value);
  return {
    high: "#E8C170",
    mid: "#D9A85E",
    low: "#8A98A6",
    none: "#3A3A3A",
  }[level];
}

export async function fetchLatestQuietIndexBatch(
  supabase: SupabaseClient,
  zoneIds: string[]
): Promise<Map<string, QuietIndexReading>> {
  const map = new Map<string, QuietIndexReading>();
  if (zoneIds.length === 0) return map;

  const { data, error } = await supabase
    .from("quiet_index")
    .select("zone_id, value, active_count, ts")
    .in("zone_id", zoneIds)
    .order("ts", { ascending: false });

  if (error) throw error;

  // Keep only the latest row per zone (data arrives newest-first)
  for (const row of data ?? []) {
    const r = row as { zone_id: string; value: number; active_count: number; ts: string };
    if (!map.has(r.zone_id)) {
      map.set(r.zone_id, { value: Number(r.value), activeCount: Number(r.active_count) });
    }
  }

  // Zones with no reading yet get an explicit null entry
  for (const id of zoneIds) {
    if (!map.has(id)) map.set(id, { value: null, activeCount: null });
  }

  return map;
}

// `null` means quorum (SR-10) has never been met for this zone -- distinct
// from a real low score, so it renders as "no reading yet", not "0/100".
export function formatQuietIndex(value: number | null): string {
  if (value === null) return "—";
  const clamped = Math.max(0, Math.min(100, value));
  return `${Math.round(clamped)}/100`;
}

export async function fetchLatestQuietIndex(supabase: SupabaseClient, zoneId: string): Promise<QuietIndexReading> {
  const { data, error } = await supabase
    .from("quiet_index")
    .select("value, active_count")
    .eq("zone_id", zoneId)
    .order("ts", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { value: null, activeCount: null };
  const row = data as { value: number; active_count: number };
  return { value: Number(row.value), activeCount: Number(row.active_count) };
}
