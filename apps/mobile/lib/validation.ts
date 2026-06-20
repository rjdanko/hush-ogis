export type ValidationResult = { ok: true } | { ok: false; reason: string };

// Mirrors the DB check constraint on sessions.intended_minutes
// (supabase/migrations/0005_sessions.sql) -- a quiet intention is optional
// (null), but if set must be a whole number of minutes in (0, 480].
export function validateIntendedMinutes(minutes: number | null): ValidationResult {
  if (minutes === null) return { ok: true };
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 480) {
    return { ok: false, reason: "Quiet time must be between 1 and 480 minutes." };
  }
  return { ok: true };
}
