// apps/mobile/components/TrendCalendar.tsx
// Spec §2.6. 12-week × 7-day rhythm grid + three stat chips.
// Each cell is colored by the day's avg silence score via sessionCellColor().
import { StyleSheet, Text, View } from "react-native";
import { sessionCellColor } from "../lib/trend-colors";
import { colors, fonts } from "../lib/theme";

export interface DayData {
  date: string;        // ISO date string "YYYY-MM-DD"
  avgScore: number | null; // null = no session that day
}

interface TrendCalendarProps {
  days: DayData[];           // ordered oldest-first, exactly 84 entries (12 × 7)
  totalQuietHours: number;
  currentStreakDays: number;
  bestSessionMinutes: number;
  /** If provided, highlight this ISO date cell in full gold regardless of score. */
  highlightDate?: string;
}

const CELL_SIZE = 10;
const CELL_GAP = 2;
const DAYS_PER_WEEK = 7;
const NUM_WEEKS = 12;
const DAY_LABELS = ["M", "", "W", "", "F", "", ""]; // Mon/Wed/Fri only

export function TrendCalendar({
  days,
  totalQuietHours,
  currentStreakDays,
  bestSessionMinutes,
  highlightDate,
}: TrendCalendarProps) {
  // Pad or trim to exactly 84 entries
  const normalized = days.slice(-84);
  while (normalized.length < 84) normalized.unshift({ date: "", avgScore: null });

  return (
    <View style={styles.container}>
      {/* Grid */}
      <View style={styles.gridRow}>
        {/* Day-of-week axis */}
        <View style={styles.dayAxis}>
          {DAY_LABELS.map((label, i) => (
            <Text key={i} style={styles.dayLabel}>
              {label}
            </Text>
          ))}
        </View>
        {/* Weeks */}
        <View style={styles.weeksRow}>
          {Array.from({ length: NUM_WEEKS }).map((_, weekIdx) => (
            <View key={weekIdx} style={styles.week}>
              {Array.from({ length: DAYS_PER_WEEK }).map((_, dayIdx) => {
                const entry = normalized[weekIdx * DAYS_PER_WEEK + dayIdx];
                const isHighlight = entry.date && entry.date === highlightDate;
                const cellColor = isHighlight ? colors.glowHigh : sessionCellColor(entry.avgScore);
                return (
                  <View
                    key={dayIdx}
                    style={[styles.cell, { backgroundColor: cellColor }]}
                  />
                );
              })}
            </View>
          ))}
        </View>
      </View>

      {/* Stat chips */}
      <View style={styles.chips}>
        <StatChip value={totalQuietHours.toFixed(1)} label="QUIET HOURS" />
        <StatChip value={String(currentStreakDays)} label="DAY STREAK" />
        <StatChip value={String(bestSessionMinutes)} label="BEST SESSION" />
      </View>
    </View>
  );
}

function StatChip({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipValue}>{value}</Text>
      <Text style={styles.chipLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 16 },
  gridRow: { flexDirection: "row", gap: 6 },
  dayAxis: { paddingTop: 2, gap: CELL_GAP },
  dayLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 9,
    letterSpacing: 1,
    color: colors.muted,
    height: CELL_SIZE,
    lineHeight: CELL_SIZE,
  },
  weeksRow: { flexDirection: "row", gap: CELL_GAP },
  week: { gap: CELL_GAP },
  cell: { width: CELL_SIZE, height: CELL_SIZE, borderRadius: 3 },
  chips: { flexDirection: "row", gap: 10 },
  chip: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    alignItems: "center",
  },
  chipValue: {
    fontFamily: fonts.hero,
    fontSize: 28,
    color: colors.ink,
  },
  chipLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 8,
    letterSpacing: 1.5,
    color: colors.muted,
    marginTop: 4,
    textAlign: "center",
  },
});
