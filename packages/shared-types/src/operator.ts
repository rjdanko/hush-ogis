// Mirrors public.operators (supabase/migrations/0003_operators.sql).
export interface Operator {
  id: string;
  venueName: string;
  badgeToken: string | null;
  createdAt: string;
}
