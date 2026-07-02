// apps/mobile/components/QuietIndexOrb.tsx
// Spec §2.1. Three sizes: 'small' (map pin), 'medium' (zone detail),
// 'large' (in-zone hero, breathing animation).
import { useEffect, useRef } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { quietIndexGlowColor } from "../lib/glow";
import { fonts } from "../lib/theme";

type OrbSize = "small" | "medium" | "large";

const SIZE_MAP: Record<OrbSize, { core: number; halo: number; fontSize: number }> = {
  small:  { core: 28,  halo: 48,  fontSize: 0  },
  medium: { core: 96,  halo: 140, fontSize: 32 },
  large:  { core: 140, halo: 208, fontSize: 56 },
};

interface QuietIndexOrbProps {
  quietIndex: number | null;
  size: OrbSize;
  /** Override color — used by onboarding slides for manual color animation. */
  colorOverride?: string;
}

export function QuietIndexOrb({ quietIndex, size, colorOverride }: QuietIndexOrbProps) {
  const { core, halo, fontSize } = SIZE_MAP[size];
  const color = colorOverride ?? (quietIndex != null ? quietIndexGlowColor(quietIndex) : "#3A3A3A");
  const haloColor = color === "#3A3A3A" ? "rgba(58,58,58,0.3)" : hexToHaloRgba(color, 0.25);

  const breath = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (size !== "large") return;
    let animation: Animated.CompositeAnimation | undefined;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled) return;
      if (reduced) {
        breath.setValue(1.07); // static mid-point per spec §4.1
        return;
      }
      animation = Animated.loop(
        Animated.sequence([
          Animated.timing(breath, {
            toValue: 1.14,
            duration: 2000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(breath, {
            toValue: 1,
            duration: 2000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
    });
    return () => {
      cancelled = true;
      animation?.stop();
    };
  }, [size, breath]);

  const coreRadius = core / 2;
  const haloRadius = halo / 2;

  return (
    <View
      style={[styles.wrap, { width: halo, height: halo }]}
      accessibilityRole="image"
      accessibilityLabel={
        quietIndex != null
          ? `Quiet Index orb, score ${quietIndex}`
          : "Quiet Index orb, no reading yet"
      }
    >
      <Animated.View
        style={[
          styles.halo,
          {
            width: halo,
            height: halo,
            borderRadius: haloRadius,
            backgroundColor: haloColor,
            transform: size === "large" ? [{ scale: breath }] : [],
          },
        ]}
      />
      <View
        style={[
          styles.core,
          {
            width: core,
            height: core,
            borderRadius: coreRadius,
            backgroundColor: color,
          },
        ]}
      >
        {fontSize > 0 && quietIndex != null && (
          <Text
            style={[
              styles.score,
              { fontSize, color: size === "large" ? "#3E3320" : "#22201D" },
            ]}
          >
            {quietIndex}
          </Text>
        )}
      </View>
    </View>
  );
}

/** Converts a 6-digit hex color to rgba with the given alpha. */
function hexToHaloRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16) || 0;
  const g = parseInt(hex.slice(3, 5), 16) || 0;
  const b = parseInt(hex.slice(5, 7), 16) || 0;
  return `rgba(${r},${g},${b},${alpha})`;
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center" },
  halo: { position: "absolute" },
  core: { alignItems: "center", justifyContent: "center" },
  score: { fontFamily: fonts.hero, lineHeight: undefined },
});
