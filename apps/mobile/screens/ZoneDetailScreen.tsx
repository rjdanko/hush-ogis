// apps/mobile/screens/ZoneDetailScreen.tsx
// Spec §3.5. Light mode. Medium orb for live QI. Inline arc dial for minutes.
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Location from "expo-location";
import type { Session, Zone } from "@hush/shared-types";
import { checkInsideZone } from "../lib/geofence";
import { createCheckIn } from "../lib/checkin";
import { fetchLatestQuietIndex } from "../lib/quietIndex";
import { QuietIndexOrb } from "../components/QuietIndexOrb";
import { CommitmentArcDial } from "../components/CommitmentArcDial";
import { colors, fonts } from "../lib/theme";

type GeofenceStatus = "checking" | "inside" | "outside" | "unknown";

export function ZoneDetailScreen({
  zone,
  onCheckedIn,
  onClose,
}: {
  zone: Zone;
  onCheckedIn: (session: Session) => void;
  onClose: () => void;
}) {
  const [geofenceStatus, setGeofenceStatus] = useState<GeofenceStatus>("checking");
  const [quietIndex, setQuietIndex] = useState<number | null>(null);
  const [intendedMinutes, setIntendedMinutes] = useState(30);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchLatestQuietIndex(zone.id).then(setQuietIndex).catch(() => {});
  }, [zone.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        if (!cancelled) setGeofenceStatus("unknown");
        return;
      }
      const position = await Location.getCurrentPositionAsync({});
      const inside = await checkInsideZone(zone.id, position.coords.latitude, position.coords.longitude);
      if (cancelled) return;
      setGeofenceStatus(inside === null ? "unknown" : inside ? "inside" : "outside");
    })();
    return () => { cancelled = true; };
  }, [zone.id]);

  async function handleCheckIn() {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const session = await createCheckIn(zone.id, intendedMinutes);
      onCheckedIn(session);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Check-in failed.");
    } finally {
      setSubmitting(false);
    }
  }

  const geofenceLabel = {
    checking: "Checking your location…",
    inside: "You're inside this zone",
    outside: "You're outside — you can still check in",
    unknown: "Couldn't confirm location — you can still check in",
  }[geofenceStatus];

  return (
    <View style={styles.container}>
      {/* Back / close button */}
      <Pressable style={styles.closeBtn} onPress={onClose} accessibilityLabel="Close">
        <Text style={styles.closeBtnText}>✕</Text>
      </Pressable>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Zone name */}
        <Text style={styles.zoneName}>{zone.name}</Text>

        {/* Active people caption */}
        <Text style={styles.caption}>Quiet zone</Text>

        {/* Medium Quiet Index orb */}
        <View style={styles.orbWrap}>
          <QuietIndexOrb quietIndex={quietIndex} size="medium" />
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Arc dial */}
        <Text style={styles.goalLabel}>YOUR GOAL</Text>
        <CommitmentArcDial value={intendedMinutes} onChange={setIntendedMinutes} />

        {/* Reward on offer (read-only chip) */}
        {zone.rewardConfig && (
          <View style={styles.rewardChip}>
            <View style={styles.rewardInfo}>
              <Text style={styles.rewardName}>Earn points here</Text>
              <Text style={styles.rewardCost}>
                Min score: {zone.rewardConfig.min_score_for_earning}
              </Text>
            </View>
          </View>
        )}

        {/* Geofence status */}
        <Text style={styles.geofenceLabel}>{geofenceLabel}</Text>

        {/* Error */}
        {submitError && <Text style={styles.errorText}>{submitError}</Text>}
      </ScrollView>

      {/* Check-in button */}
      <Pressable
        style={[styles.checkInBtn, submitting && styles.checkInBtnDisabled]}
        onPress={handleCheckIn}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color={colors.background} />
        ) : (
          <Text style={styles.checkInBtnText}>Check in</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  closeBtn: {
    position: "absolute",
    top: 20,
    right: 20,
    zIndex: 2,
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtnText: {
    fontFamily: fonts.body,
    fontSize: 18,
    color: colors.muted,
  },
  scroll: { flex: 1 },
  scrollContent: {
    padding: 24,
    paddingTop: 56,
    alignItems: "center",
    gap: 16,
  },
  zoneName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 22,
    color: colors.ink,
    textAlign: "center",
  },
  caption: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted,
  },
  orbWrap: { marginVertical: 8 },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    width: "100%",
    marginVertical: 8,
  },
  goalLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    letterSpacing: 2,
    color: colors.muted,
    textTransform: "uppercase",
    alignSelf: "flex-start",
  },
  rewardChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 16,
    width: "100%",
  },
  rewardInfo: { flex: 1 },
  rewardName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.ink,
  },
  rewardCost: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  geofenceLabel: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted,
    textAlign: "center",
  },
  errorText: {
    fontFamily: fonts.body,
    color: colors.alert,
    textAlign: "center",
  },
  checkInBtn: {
    backgroundColor: colors.accent,
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: "center",
    margin: 24,
    marginBottom: 16,
  },
  checkInBtnDisabled: { opacity: 0.5 },
  checkInBtnText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    color: "white",
  },
});
