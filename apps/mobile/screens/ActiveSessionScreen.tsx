// The "in-zone" hero screen (Design Brief §5.5), fully built in Phase 4:
// a live, on-device silence score loop (Task 6-10's signals/scoring/ingest
// pipeline) feeding a breathing Quiet Index orb, plus the check-out path.
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import type { Session } from "@hush/shared-types";
import { checkOutSession } from "../lib/checkin";
import { getSilenceSignals } from "../lib/signals";
import { computeSilenceScore } from "../lib/scoring";
import { sendScorePing } from "../lib/ingest";
import { colors, fonts } from "../lib/theme";

// PRD §7.1: device reports a fresh silence score roughly every 15s.
const PING_INTERVAL_MS = 15_000;

export function ActiveSessionScreen({
  session,
  onCheckedOut,
}: {
  session: Session;
  onCheckedOut: (session: Session) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [liveScore, setLiveScore] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const breath = useRef(new Animated.Value(1)).current;
  const startedAt = useRef(Date.now());

  useEffect(() => {
    let cancelled = false;
    let previousScore: number | null = null;

    async function tick() {
      const elapsed = Date.now() - startedAt.current;
      const signals = await getSilenceSignals(elapsed);
      const score = computeSilenceScore(signals, previousScore);
      previousScore = score;
      if (cancelled) return;
      setLiveScore(score);
      setElapsedMs(elapsed);
      try {
        await sendScorePing({
          anonSessionToken: session.anonToken,
          zoneId: session.zoneId,
          score,
          ts: new Date().toISOString(),
        });
      } catch (err) {
        // A dropped ping is not fatal -- the next interval tries again.
        // Never surface ingest errors to the calm session UI, but don't fly
        // fully blind either -- log in dev so a misconfigured endpoint or an
        // expired token doesn't silently degrade the Quiet Index unnoticed.
        if (__DEV__) console.warn("sendScorePing failed", err);
      }
    }

    tick();
    const interval = setInterval(tick, PING_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // session is replaced (not mutated) only on a fresh check-in, i.e. before
    // this screen mounts -- depending on its scalar fields rather than the
    // object reference is equivalent today, but says explicitly that a
    // future App.tsx refactor swapping the session reference under an
    // unchanged anonToken/zoneId shouldn't restart this loop.
  }, [session.anonToken, session.zoneId]);

  useEffect(() => {
    let animation: Animated.CompositeAnimation | undefined;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled || reduced) return;
      animation = Animated.loop(
        Animated.sequence([
          Animated.timing(breath, { toValue: 1.14, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(breath, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      );
      animation.start();
    });
    return () => {
      cancelled = true;
      animation?.stop();
    };
  }, [breath]);

  async function handleCheckOut() {
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const updated = await checkOutSession(session.id);
      onCheckedOut(updated);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Check-out failed.");
    } finally {
      setSubmitting(false);
    }
  }

  const remainingLabel = formatRemaining(session.intendedMinutes, elapsedMs);

  return (
    <View style={styles.container}>
      <Text style={styles.zoneLabel}>Quiet now</Text>
      <View style={styles.orbWrap}>
        <Animated.View style={[styles.orbHalo, { transform: [{ scale: breath }] }]} />
        <View style={styles.orbCore}>
          <Text style={styles.orbScore}>{liveScore ?? "--"}</Text>
          <Text style={styles.orbLabel}>YOUR SILENCE</Text>
        </View>
      </View>
      <Text style={styles.hint}>Phone resting. Tap only to check out.</Text>
      {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}
      <View style={styles.tiles}>
        <View style={styles.tile}>
          <Text style={styles.tileValue}>{remainingLabel}</Text>
          <Text style={styles.tileLabel}>REMAINING</Text>
        </View>
        <View style={styles.tile}>
          <Text style={[styles.tileValue, styles.tileValueAccent]}>{liveScore ?? "--"}</Text>
          <Text style={styles.tileLabel}>YOUR SILENCE</Text>
        </View>
      </View>
      <Pressable style={styles.button} onPress={handleCheckOut} disabled={submitting}>
        <Text style={styles.buttonText}>{submitting ? "Checking out…" : "Check out"}</Text>
      </Pressable>
    </View>
  );
}

function formatRemaining(intendedMinutes: number | null, elapsedMs: number): string {
  if (!intendedMinutes) return "--:--";
  const remainingMs = Math.max(0, intendedMinutes * 60_000 - elapsedMs);
  const totalSeconds = Math.floor(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.night, padding: 24, alignItems: "center", justifyContent: "center" },
  zoneLabel: { fontFamily: fonts.bodySemiBold, fontSize: 10, letterSpacing: 2, color: colors.nightLabel, textTransform: "uppercase" },
  orbWrap: { width: 208, height: 208, alignItems: "center", justifyContent: "center", marginVertical: 24 },
  orbHalo: { position: "absolute", width: 208, height: 208, borderRadius: 104, backgroundColor: colors.glowHighHalo },
  orbCore: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: colors.glowHighCore,
    alignItems: "center",
    justifyContent: "center",
  },
  orbScore: { fontFamily: fonts.hero, fontSize: 54, color: colors.glowHighCoreText },
  orbLabel: { fontFamily: fonts.bodySemiBold, fontSize: 8, letterSpacing: 2, color: colors.glowHighCoreLabel, marginTop: 2 },
  hint: { fontFamily: fonts.body, fontSize: 14, color: colors.nightHint, textAlign: "center", marginBottom: 24 },
  errorText: { fontFamily: fonts.body, color: colors.alert, marginBottom: 16 },
  tiles: { flexDirection: "row", gap: 12, marginBottom: 18, width: "100%", maxWidth: 280 },
  tile: { flex: 1, backgroundColor: colors.nightCard, borderRadius: 16, padding: 14, alignItems: "center" },
  tileValue: { fontFamily: fonts.hero, fontSize: 26, color: colors.nightWarmText },
  tileValueAccent: { color: colors.glowHigh },
  tileLabel: { fontFamily: fonts.bodySemiBold, fontSize: 9, letterSpacing: 1.5, color: colors.nightMutedText, marginTop: 4 },
  button: { backgroundColor: colors.glowHigh, borderRadius: 16, paddingVertical: 15, paddingHorizontal: 32 },
  buttonText: { fontFamily: fonts.bodySemiBold, color: colors.night },
});
