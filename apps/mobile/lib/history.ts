// apps/mobile/lib/history.ts
// Fetches the user's past session data for the Trends screen and the
// SessionSummary trend preview. Returns one entry per calendar day
// containing the average silence score across sessions that day.
import { supabase } from "./supabase";

export interface SessionDaySummary {
  date: string;        // ISO "YYYY-MM-DD"
  avgScore: number | null;
  totalMinutes: number;
}

/**
 * Returns daily session summaries for the last `numDays` calendar days,
 * oldest-first. Days with no sessions have avgScore: null, totalMinutes: 0.
 */
export async function getSessionHistory(numDays = 84): Promise<SessionDaySummary[]> {
  const since = new Date();
  since.setDate(since.getDate() - numDays);

  const { data, error } = await supabase
    .from("sessions")
    .select("checked_in_at, final_score, achieved_minutes")
    .gte("checked_in_at", since.toISOString())
    .not("checked_out_at", "is", null) // completed sessions only
    .order("checked_in_at", { ascending: true });

  if (error) throw new Error(error.message);

  // Build a map of date → { scores, minutes }
  const byDate = new Map<string, { scores: number[]; minutes: number }>();
  for (const row of data ?? []) {
    const date = row.checked_in_at.slice(0, 10); // "YYYY-MM-DD"
    const existing = byDate.get(date) ?? { scores: [], minutes: 0 };
    if (row.final_score != null) existing.scores.push(row.final_score);
    existing.minutes += row.achieved_minutes ?? 0;
    byDate.set(date, existing);
  }

  // Produce one entry per calendar day in the window
  const result: SessionDaySummary[] = [];
  const cursor = new Date(since);
  for (let i = 0; i < numDays; i++) {
    const date = cursor.toISOString().slice(0, 10);
    const entry = byDate.get(date);
    result.push({
      date,
      avgScore:
        entry && entry.scores.length > 0
          ? Math.round(entry.scores.reduce((s, v) => s + v, 0) / entry.scores.length)
          : null,
      totalMinutes: entry?.minutes ?? 0,
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return result;
}

/** Computes streak (consecutive days with at least one session) ending today. */
export function computeStreak(history: SessionDaySummary[]): number {
  let streak = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].avgScore === null) break;
    streak++;
  }
  return streak;
}

/** Total quiet hours across all history entries. */
export function totalQuietHours(history: SessionDaySummary[]): number {
  return history.reduce((sum, d) => sum + d.totalMinutes, 0) / 60;
}

/** Best single session in minutes. */
export function bestSessionMinutes(history: SessionDaySummary[]): number {
  return history.reduce((best, d) => Math.max(best, d.totalMinutes), 0);
}
