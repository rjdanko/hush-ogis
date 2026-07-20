// apps/mobile/components/HushLogo.tsx
// Renders the Hush logo PNG at three sizes.
// Used by OnboardingScreen (welcome frame) and SettingsScreen header.
// The PNG already contains both the icon mark and the wordmark, so we
// simply scale the image — no extra drawing needed.
import { Image, StyleSheet, View } from "react-native";

type LogoSize = "small" | "medium" | "large";

// Maintain the logo's original aspect ratio: ~1190w × 360h ≈ 3.306:1
const SIZE_MAP: Record<LogoSize, { width: number; height: number }> = {
  small:  { width: 100, height: 30 },
  medium: { width: 160, height: 48 },
  large:  { width: 220, height: 67 },
};

interface HushLogoProps {
  size?: LogoSize;
}

export function HushLogo({ size = "medium" }: HushLogoProps) {
  const { width, height } = SIZE_MAP[size];
  return (
    <View
      style={[styles.wrap, { width, height }]}
      accessibilityLabel="Hush logo"
      accessibilityRole="image"
    >
      <Image
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        source={require("../assets/hush-logo.png")}
        style={{ width, height }}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center" },
});
