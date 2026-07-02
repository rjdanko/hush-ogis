// apps/mobile/screens/SessionSummaryScreen.tsx
// Spec §3.7. Light mode. Trend calendar preview (last 4 weeks, today highlighted).
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Session, Zone } from "@hush/shared-types";
import { colors, fonts } from "../lib/theme";
import { sessionSummaryHint } from "../lib/scoring";
import { TrendCalendar } from "../components/TrendCalendar";
import {
  SessionDaySummary,
  bestSessionMinutes,
  computeStreak,
  getSessionHistory,
  totalQuietHours,
} from "../lib/history";

export function SessionSummaryScreen({
  session,
  pointsAwarded,
  zone,
  onViewWallet,
  onDone,
}: {
  session: Session;
  pointsAwarded: number;
  zone: Zone;
  onViewWallet: () => void;
  onDone: () => void;
}) {
  const [history, setHistory] = useState<SessionDaySummary[] | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    // 28 days = 4 weeks for the preview
    getSessionHistory(28).then(setHistory).catch(() => {});
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Session complete</Text>

      {/* Three stat tiles */}
      <View style={styles.tiles}>
        <View style={styles.tile}>
          <Text style={styles.tileValue}>{session.achievedMinutes ?? "--"}</Text>
          <Text style={styles.tileLabel}>QUIET MINUTES</Text>
        </View>
        <View style={styles.tile}>
          <Text style={styles.tileValue}>{session.finalScore ?? "--"}</Text>
          <Text style={styles.tileLabel}>AVG SILENCE</Text>
        </View>
        <View style={[styles.tile]}>
          <Text style={[styles.tileValue, styles.tileValueGold]}>{pointsAwarded}</Text>
          <Text style={styles.tileLabel}>POINTS</Text>
        </View>
      </View>

      {/* Hint */}
      <Text style={styles.hint}>
        {sessionSummaryHint(
          pointsAwarded,
          session.achievedMinutes,
          session.finalScore,
          zone.rewardConfig.min_score_for_earning
        )}
      </Text>

      {/* 4-week trend preview */}
      {history && (
        <View style={styles.calendarWrap}>
          <TrendCalendar
            days={history}
            totalQuietHours={totalQuietHours(history)}
            currentStreakDays={computeStreak(history)}
            bestSessionMinutes={bestSessionMinutes(history)}
            highlightDate={today}
          />
        </View>
      )}

      <Pressable style={styles.primaryBtn} onPress={onViewWallet}>
        <Text style={styles.primaryBtnText}>View wallet</Text>
      </Pressable>
      <Pressable style={styles.ghostBtn} onPress={onDone}>
        <Text style={styles.ghostBtnText}>Done</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    letterSpacing: 2,
    color: colors.muted,
    textTransform: "uppercase",
    marginBottom: 20,
  },
  tiles: { flexDirection: "row", gap: 10, width: "100%", maxWidth: 320, marginBottom: 16 },
  tile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    alignItems: "center",
  },
  tileValue: { fontFamily: fonts.hero, fontSize: 24, color: colors.ink },
  tileValueGold: { color: colors.rewardGold },
  tileLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 8,
    letterSpacing: 1,
    color: colors.muted,
    marginTop: 4,
    textAlign: "center",
  },
  hint: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
    marginBottom: 20,
    maxWidth: 280,
    lineHeight: 20,
  },
  calendarWrap: { width: "100%", marginBottom: 24 },
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: 16,
    paddingVertical: 15,
    paddingHorizontal: 40,
    marginBottom: 10,
  },
  primaryBtnText: { fontFamily: fonts.bodySemiBold, color: "white" },
  ghostBtn: { paddingVertical: 10, paddingHorizontal: 24 },
  ghostBtnText: { fontFamily: fonts.body, color: colors.muted },
});
