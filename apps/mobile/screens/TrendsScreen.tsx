// apps/mobile/screens/TrendsScreen.tsx
// Spec §3.9. Rhythm calendar + area chart (SVG) + stat chips.
import { useEffect, useState } from "react";
import { ActivityIndicator, Dimensions, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import {
  SessionDaySummary,
  bestSessionMinutes,
  computeStreak,
  getSessionHistory,
  totalQuietHours,
} from "../lib/history";
import { TrendCalendar } from "../components/TrendCalendar";
import { colors, fonts } from "../lib/theme";

const SCREEN_WIDTH = Dimensions.get("window").width;
const CHART_PADDING = 24;
const CHART_WIDTH = SCREEN_WIDTH - CHART_PADDING * 2;
const CHART_HEIGHT = 80;
const CHART_WEEKS = 8; // show last 8 weeks on the area chart

export function TrendsScreen() {
  const [history, setHistory] = useState<SessionDaySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSessionHistory(84)
      .then(setHistory)
      .catch((err: Error) => setError(err.message));
  }, []);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (!history) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.glowHigh} />
      </View>
    );
  }

  const streak = computeStreak(history);
  const hours = totalQuietHours(history);
  const bestMin = bestSessionMinutes(history);

  const calendarDays = history.map((d) => ({ date: d.date, avgScore: d.avgScore }));

  // Area chart: last CHART_WEEKS * 7 days, avg score per day
  const chartDays = history.slice(-(CHART_WEEKS * 7));
  const chartPath = buildAreaPath(chartDays, CHART_WIDTH, CHART_HEIGHT);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.heading}>YOUR QUIET</Text>

      <TrendCalendar
        days={calendarDays}
        totalQuietHours={hours}
        currentStreakDays={streak}
        bestSessionMinutes={bestMin}
      />

      <View style={styles.divider} />

      {/* Area chart */}
      <View style={styles.chartWrap}>
        <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
          <Defs>
            <LinearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={colors.glowMid} stopOpacity={0.3} />
              <Stop offset="100%" stopColor={colors.glowMid} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Path d={chartPath.area} fill="url(#chartGrad)" />
          <Path d={chartPath.line} fill="none" stroke={colors.glowMid} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </View>
    </ScrollView>
  );
}

/** Builds SVG line + area path for the chart from daily history entries. */
function buildAreaPath(
  days: SessionDaySummary[],
  width: number,
  height: number
): { line: string; area: string } {
  const scored = days.map((d) => d.avgScore ?? 0);
  if (scored.length < 2) return { line: "", area: "" };

  const n = scored.length;
  const points = scored.map((score, i) => ({
    x: (i / (n - 1)) * width,
    y: height - (score / 100) * (height - 4) - 2, // 2px bottom padding
  }));

  const lineParts = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`);
  const line = lineParts.join(" ");
  const area = `${line} L ${points[n - 1].x} ${height} L 0 ${height} Z`;

  return { line, area };
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 24, paddingTop: 56, gap: 20, paddingBottom: 40 },
  center: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" },
  heading: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    letterSpacing: 2,
    color: colors.muted,
    textTransform: "uppercase",
  },
  divider: { height: 1, backgroundColor: colors.border },
  chartWrap: { overflow: "hidden" },
  errorText: { fontFamily: fonts.body, color: colors.alert, textAlign: "center" },
});
