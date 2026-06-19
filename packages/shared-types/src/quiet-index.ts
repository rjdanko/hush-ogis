// Mirrors public.quiet_index (supabase/migrations/0007_quiet_index.sql).
export interface QuietIndex {
  id: string;
  zoneId: string;
  ts: string;
  value: number;
  activeCount: number;
}
