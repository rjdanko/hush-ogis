// The "Coach card" (Design Brief §6) -- explicitly the opposite of a
// notification. It surfaces a single calm nudge from the Phase 8 coach
// (lib/coach.ts decides *when*, lib/coach-messages.ts decides *what*); this
// component only renders the message and offers a soft, reachable dismiss.
// No red, no count badge, no urgent styling, no bounce/snap transitions --
// only a slow cross-fade, and a static appearance under reduced motion
// (Design Brief §8: reduced-motion is a first-class state).
import { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts } from "../lib/theme";

const FADE_IN_DURATION_MS = 900;

export function CoachCard({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled) return;
      if (reduced) {
        // Static appearance -- no animation, just present at full opacity.
        opacity.setValue(1);
        return;
      }
      Animated.timing(opacity, {
        toValue: 1,
        duration: FADE_IN_DURATION_MS,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }).start();
    });
    return () => {
      cancelled = true;
    };
  }, [opacity]);

  return (
    <Animated.View
      style={[styles.card, { opacity }]}
      accessibilityRole="text"
      accessibilityLabel={`Gentle reminder: ${message}`}
    >
      <Text style={styles.message}>{message}</Text>
      <Pressable
        style={styles.dismiss}
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss reminder"
        hitSlop={8}
      >
        <Text style={styles.dismissGlyph}>×</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.nightCard,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    width: "100%",
    maxWidth: 280,
  },
  message: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: colors.nightWarmText,
    paddingRight: 12,
  },
  dismiss: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  dismissGlyph: {
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.nightHint,
    lineHeight: 18,
  },
});
