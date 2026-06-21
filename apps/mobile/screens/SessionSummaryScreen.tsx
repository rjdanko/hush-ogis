// U7: shown once after check-out. Calm celebration per Design Brief --
// no confetti, no urgency, just the numbers the server already finalized.
import { StyleSheet, Pressable, Text, View } from "react-native";
import type { Session } from "@hush/shared-types";
import { colors, fonts } from "../lib/theme";

export function SessionSummaryScreen({
  session,
  pointsAwarded,
  onViewWallet,
  onDone,
}: {
  session: Session;
  pointsAwarded: number;
  onViewWallet: () => void;
  onDone: () => void;
}) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Session complete</Text>
      <View style={styles.tiles}>
        <View style={styles.tile}>
          <Text style={styles.tileValue}>{session.achievedMinutes ?? "--"}</Text>
          <Text style={styles.tileLabel}>QUIET MINUTES</Text>
        </View>
        <View style={styles.tile}>
          <Text style={styles.tileValue}>{session.finalScore ?? "--"}</Text>
          <Text style={styles.tileLabel}>AVERAGE SILENCE</Text>
        </View>
        <View style={styles.tile}>
          <Text style={[styles.tileValue, styles.tileValueAccent]}>{pointsAwarded}</Text>
          <Text style={styles.tileLabel}>POINTS AWARDED</Text>
        </View>
      </View>
      <Text style={styles.hint}>
        {pointsAwarded > 0
          ? "Your wallet has been credited."
          : "No points this time -- stay quietly checked in longer to earn some."}
      </Text>
      <Pressable style={styles.primaryButton} onPress={onViewWallet}>
        <Text style={styles.primaryButtonText}>View wallet</Text>
      </Pressable>
      <Pressable style={styles.secondaryButton} onPress={onDone}>
        <Text style={styles.secondaryButtonText}>Done</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.night, padding: 24, alignItems: "center", justifyContent: "center" },
  label: { fontFamily: fonts.bodySemiBold, fontSize: 10, letterSpacing: 2, color: colors.nightLabel, textTransform: "uppercase", marginBottom: 24 },
  tiles: { flexDirection: "row", gap: 10, marginBottom: 20, width: "100%", maxWidth: 320 },
  tile: { flex: 1, backgroundColor: colors.nightCard, borderRadius: 16, padding: 14, alignItems: "center" },
  tileValue: { fontFamily: fonts.hero, fontSize: 24, color: colors.nightWarmText },
  tileValueAccent: { color: colors.glowHigh },
  tileLabel: { fontFamily: fonts.bodySemiBold, fontSize: 8, letterSpacing: 1, color: colors.nightMutedText, marginTop: 4, textAlign: "center" },
  hint: { fontFamily: fonts.body, fontSize: 14, color: colors.nightHint, textAlign: "center", marginBottom: 28, maxWidth: 280 },
  primaryButton: { backgroundColor: colors.glowHigh, borderRadius: 16, paddingVertical: 15, paddingHorizontal: 40, marginBottom: 12 },
  primaryButtonText: { fontFamily: fonts.bodySemiBold, color: colors.night },
  secondaryButton: { paddingVertical: 10, paddingHorizontal: 24 },
  secondaryButtonText: { fontFamily: fonts.body, color: colors.nightHint },
});
