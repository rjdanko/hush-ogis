// Mirrors public.sessions (supabase/migrations/0005_sessions.sql).
export interface Session {
  id: string;
  userId: string;
  zoneId: string;
  startTs: string;
  endTs: string | null;
  committedMinutes: number;
  achievedMinutes: number | null;
  finalScore: number | null;
  createdAt: string;
}
