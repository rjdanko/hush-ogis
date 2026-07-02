// Cell color for the Trend Calendar grid. Maps a day's average silence score
// (or null for no session) to a fill color per the spec §2.6.

/** Returns the fill color for a calendar cell given the day's avg silence score. */
export function sessionCellColor(score: number | null): string {
  if (score === null) return "#E4DDD1";           // no session
  if (score <= 30) return "#C8C0B0";              // low
  if (score <= 70) return "rgba(217,168,94,0.4)"; // medium amber
  if (score < 90) return "rgba(232,193,112,0.6)"; // high
  return "#E8C170";                               // great (≥90)
}
