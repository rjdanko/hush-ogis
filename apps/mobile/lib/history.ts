// apps/mobile/lib/history.ts
// Fetches the user's past session data for the Trends screen and the
// SessionSummary trend preview. Returns one entry per calendar day
// containing the average silence score across sessions that day.
import { supabase } from "./supabase";

export interface SessionDaySummary {
  date: string;        // ISO "YYYY-MM-DD"
  avgScore: number | null;
  totalMinutes: number;
  bestMinutes: number;  // best single session duration for this day
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
    .select("start_ts, final_score, achieved_minutes")
    .gte("start_ts", since.toISOString())
    .not("end_ts", "is", null) // completed sessions only
    .order("start_ts", { ascending: true });

  if (error) throw new Error(error.message);

  const rows = data ?? [];
  // Dev/emulator builds have no real session history behind a fresh
  // anonymous sign-in -- show sample data instead of a blank Trends tab.
  // Metro statically replaces __DEV__ with the literal `false` in
  // production/release bundles, so this only stays off there; outside the
  // Metro/RN runtime (e.g. under vitest) the global is undefined, and we
  // treat that as dev too so the fallback stays covered by tests.
  const isDev = typeof __DEV__ === "undefined" || __DEV__;
  if (rows.length === 0 && isDev) {
    return buildDemoHistory(numDays);
  }

  // Build a map of date → { scores, minutes, bestMinutes }
  const byDate = new Map<string, { scores: number[]; minutes: number; bestMinutes: number }>();
  for (const row of rows) {
    const date = row.start_ts.slice(0, 10); // "YYYY-MM-DD"
    const existing = byDate.get(date) ?? { scores: [], minutes: 0, bestMinutes: 0 };
    if (row.final_score != null) existing.scores.push(row.final_score);
    existing.minutes += row.achieved_minutes ?? 0;
    existing.bestMinutes = Math.max(existing.bestMinutes, row.achieved_minutes ?? 0);
    byDate.set(date, existing);
  }

  // Produce one entry per calendar day in the window
  const result: SessionDaySummary[] = [];
  const cursor = new Date(since);
  cursor.setDate(cursor.getDate() + 1); // include today in the window
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
      bestMinutes: entry?.bestMinutes ?? 0,
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return result;
}

const DEMO_STREAK_DAYS = 6;

/** Deterministic sample history for dev/emulator demos when no real sessions exist yet. */
function buildDemoHistory(numDays: number): SessionDaySummary[] {
  const result: SessionDaySummary[] = [];
  const cursor = new Date();
  cursor.setDate(cursor.getDate() - (numDays - 1));

  for (let i = 0; i < numDays; i++) {
    const date = cursor.toISOString().slice(0, 10);
    const daysFromEnd = numDays - 1 - i;
    const hasSession = daysFromEnd < DEMO_STREAK_DAYS || (i * 7) % 5 !== 0;

    if (hasSession) {
      const wave = Math.sin(i / 6) * 12;
      const avgScore = Math.max(40, Math.min(98, Math.round(72 + wave + (i % 3) * 4)));
      const bestMinutes = 20 + ((i * 13) % 45);
      const totalMinutes = bestMinutes + ((i * 7) % 20);
      result.push({ date, avgScore, totalMinutes, bestMinutes });
    } else {
      result.push({ date, avgScore: null, totalMinutes: 0, bestMinutes: 0 });
    }

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
  return history.reduce((best, d) => Math.max(best, d.bestMinutes), 0);
}
