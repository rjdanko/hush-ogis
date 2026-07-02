// apps/mobile/screens/OnboardingScreen.tsx
// Spec §3.1–3.3. Three orb-led slides (cold → amber → gold), ending with
// "Get started" → Map. Writes hasSeenOnboarding to AsyncStorage on complete.
// Cross-fades slide content on advance (600ms, Easing.inOut).
import { useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { QuietIndexOrb } from "../components/QuietIndexOrb";
import { colors, fonts } from "../lib/theme";

export const ONBOARDING_KEY = "hasSeenOnboarding";

const SLIDES: { headline: string; body: string; color: string }[] = [
  {
    headline: "Disconnect, together.",
    body: "Find spaces where putting your phone down is the norm — not the exception.",
    color: "#8A98A6",
  },
  {
    headline: "Earn for your silence.",
    body: "Every quiet minute earns points redeemable at the venue.",
    color: "#D9A85E",
  },
  {
    headline: "Only a score leaves your phone.",
    body: "Nothing you do, read, or say is ever seen. Just a number from 0 to 100.",
    color: "#E8C170",
  },
];

const CHIP_TEXT = "No content · No location history · No names";
const TRANSITION_DURATION = 300; // half of 600ms: fade-out then fade-in

interface OnboardingScreenProps {
  onComplete: () => void;
}

export function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const [slideIndex, setSlideIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const slide = SLIDES[slideIndex];
  const isLast = slideIndex === SLIDES.length - 1;

  function advance() {
    if (isLast) {
      AsyncStorage.setItem(ONBOARDING_KEY, "true").catch(() => {});
      onComplete();
      return;
    }

    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (reduced) {
        setSlideIndex((i) => i + 1);
        return;
      }
      // Fade out, swap slide, fade back in
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: TRANSITION_DURATION,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }).start(() => {
        setSlideIndex((i) => i + 1);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: TRANSITION_DURATION,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }).start();
      });
    });
  }

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        <QuietIndexOrb
          quietIndex={null}
          size="small"
          colorOverride={slide.color}
        />
        <Text style={styles.headline}>{slide.headline}</Text>
        <Text style={styles.body}>{slide.body}</Text>
        {isLast && (
          <View style={styles.chip}>
            <Text style={styles.chipText}>{CHIP_TEXT}</Text>
          </View>
        )}
      </Animated.View>
      <Pressable style={styles.button} onPress={advance}>
        <Text style={styles.buttonText}>
          {isLast ? "Get started" : "Continue"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 24,
    paddingTop: 80,
    paddingBottom: 40,
    justifyContent: "space-between",
  },
  content: { alignItems: "center", gap: 24 },
  headline: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 22,
    color: colors.ink,
    textAlign: "center",
    lineHeight: 30,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 300,
  },
  chip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginTop: 8,
  },
  chipText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    letterSpacing: 1.5,
    color: colors.muted,
    textAlign: "center",
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: "center",
  },
  buttonText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    color: "white",
  },
});
