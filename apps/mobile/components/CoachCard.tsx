// apps/mobile/components/CoachCard.tsx
// Spec §2.4. Anti-notification: calm, dismissible, one message at a time.
// variant 'dark' (default) = for ActiveSession; 'light' = for light-mode screens.
import { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text } from "react-native";
import { colors, fonts } from "../lib/theme";

const FADE_IN_DURATION_MS = 300;

interface CoachCardProps {
  message: string;
  onDismiss: () => void;
  variant?: "dark" | "light";
}

export function CoachCard({ message, onDismiss, variant = "dark" }: CoachCardProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(40)).current;

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled) return;
      if (reduced) {
        opacity.setValue(1);
        translateY.setValue(0);
        return;
      }
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: FADE_IN_DURATION_MS,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: FADE_IN_DURATION_MS,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start();
    });
    return () => { cancelled = true; };
  }, [opacity, translateY]);

  const isDark = variant === "dark";
  const bg = isDark ? colors.nightCard : colors.surface;
  const textColor = isDark ? colors.nightWarmText : colors.ink;
  const dismissColor = isDark ? colors.nightMuted : colors.muted;

  return (
    <Animated.View
      style={[
        styles.card,
        { backgroundColor: bg, opacity, transform: [{ translateY }] },
      ]}
      accessibilityRole="text"
      accessibilityLabel={`Gentle reminder: ${message}`}
    >
      <Text style={[styles.message, { color: textColor }]}>{message}</Text>
      <Pressable
        style={styles.dismiss}
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss reminder"
        hitSlop={8}
      >
        <Text style={[styles.dismissGlyph, { color: dismissColor }]}>×</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 16,
    width: "100%",
  },
  message: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    paddingRight: 12,
  },
  dismiss: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  dismissGlyph: {
    fontFamily: fonts.body,
    fontSize: 18,
    lineHeight: 20,
  },
});
