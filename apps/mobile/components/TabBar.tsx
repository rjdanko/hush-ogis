// apps/mobile/components/TabBar.tsx
// Spec §2.7. 4 tabs: Map, Trends, Wallet, Settings.
// Sage active state, no badge counts, safe-area-inset-aware.
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fonts } from "../lib/theme";

export type Tab = "map" | "trends" | "wallet" | "settings";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "map",      label: "Map",      icon: "◎" },
  { id: "trends",   label: "Trends",   icon: "≈" },
  { id: "wallet",   label: "Wallet",   icon: "◇" },
  { id: "settings", label: "Settings", icon: "⊙" },
];

interface TabBarProps {
  activeTab: Tab;
  onTabPress: (tab: Tab) => void;
}

export function TabBar({ activeTab, onTabPress }: TabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[styles.container, { paddingBottom: insets.bottom || 8 }]}
    >
      {TABS.map(({ id, label, icon }) => {
        const isActive = id === activeTab;
        return (
          <Pressable
            key={id}
            style={styles.tab}
            onPress={() => onTabPress(id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={label}
          >
            <Text style={[styles.icon, isActive && styles.iconActive]}>
              {icon}
            </Text>
            <Text style={[styles.label, isActive && styles.labelActive]}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    gap: 3,
    minHeight: 44, // accessibility minimum
  },
  icon: {
    fontSize: 20,
    color: colors.muted,
  },
  iconActive: {
    color: colors.accent,
  },
  label: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    letterSpacing: 0.5,
    color: colors.muted,
  },
  labelActive: {
    color: colors.accent,
  },
});
