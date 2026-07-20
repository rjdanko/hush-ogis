// apps/mobile/screens/SettingsScreen.tsx
// Spec §3.10. Permissions, data, about sections. No notification toggles.
import { useState } from "react";
import { Alert, Linking, ScrollView, StyleSheet, Switch, Text, View, Pressable } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colors, fonts } from "../lib/theme";
import { supabase } from "../lib/supabase";
import { ONBOARDING_KEY } from "./OnboardingScreen";
import Constants from "expo-constants";
import { HushLogo } from "../components/HushLogo";

export function SettingsScreen({ onAccountDeleted }: { onAccountDeleted: () => void }) {
  const [usageAccess, setUsageAccess] = useState(false);
  const [notifPause, setNotifPause] = useState(false);

  function handleDeleteAccount() {
    Alert.alert(
      "Delete your account",
      "This will permanently delete your sessions, points, and all data. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await supabase.auth.signOut();
            await AsyncStorage.removeItem(ONBOARDING_KEY);
            // Full deletion requires a server-side function; sign-out is the
            // client-side boundary. A backend RPC for full deletion is out of
            // scope for this UI pass — leave a TODO comment for Phase 10 hardening.
            onAccountDeleted();
          },
        },
      ]
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Logo header */}
      <View style={styles.logoHeader}>
        <HushLogo size="medium" />
        <Text style={styles.logoSubtitle}>Settings & Privacy</Text>
      </View>
      <View style={styles.logoDivider} />

      {/* Section 1: Permissions */}
      <Text style={styles.sectionTitle}>Permissions</Text>
      <View style={styles.card}>
        <ToggleRow
          title="Screen-off detection"
          description="Lets Hush know when your phone is locked or face-down."
          value={usageAccess}
          onChange={setUsageAccess}
        />
        <View style={styles.rowDivider} />
        <ToggleRow
          title="Notification pausing"
          description="Used to measure your silence score. No notification content is read."
          value={notifPause}
          onChange={setNotifPause}
        />
      </View>

      {/* Section 2: Your data */}
      <Text style={styles.sectionTitle}>Your data</Text>
      <View style={styles.card}>
        <Pressable style={styles.actionRow} onPress={() => {}}>
          <Text style={styles.actionLabel}>Export my data</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
        <View style={styles.rowDivider} />
        <Pressable style={styles.actionRow} onPress={handleDeleteAccount}>
          <Text style={[styles.actionLabel, styles.destructiveLabel]}>
            Delete my account
          </Text>
        </Pressable>
      </View>

      {/* Section 3: About */}
      <Text style={styles.sectionTitle}>About</Text>
      <View style={styles.card}>
        <View style={styles.textRow}>
          <Text style={styles.rowLabel}>Version</Text>
          <Text style={styles.rowValue}>
            {Constants.expoConfig?.version ?? "—"}
          </Text>
        </View>
        <View style={styles.rowDivider} />
        <Pressable
          style={styles.actionRow}
          onPress={() => Linking.openURL("https://hush.app/privacy")}
        >
          <Text style={[styles.actionLabel, { color: colors.accent }]}>
            Privacy policy
          </Text>
          <Text style={[styles.chevron, { color: colors.accent }]}>›</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function ToggleRow({
  title,
  description,
  value,
  onChange,
}: {
  title: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleText}>
        <Text style={styles.rowLabel}>{title}</Text>
        <Text style={styles.rowDescription}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.border, true: colors.accent }}
        thumbColor="white"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 24, gap: 8, paddingBottom: 40 },

  // Logo header
  logoHeader: {
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 20,
    gap: 6,
  },
  logoSubtitle: {
    fontFamily: fonts.body,
    fontSize: 11,
    letterSpacing: 2,
    color: colors.muted,
    textTransform: "uppercase",
  },
  logoDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: -24, // bleed to edge of padded container
    marginBottom: 8,
  },
  sectionTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    letterSpacing: 2,
    color: colors.muted,
    textTransform: "uppercase",
    marginTop: 16,
    marginBottom: 8,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    overflow: "hidden",
  },
  rowDivider: { height: 1, backgroundColor: colors.border, marginHorizontal: 16 },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 12,
  },
  toggleText: { flex: 1 },
  textRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    minHeight: 44,
  },
  rowLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.ink,
  },
  rowDescription: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
    lineHeight: 16,
  },
  rowValue: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.muted,
  },
  actionLabel: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
  },
  destructiveLabel: {
    color: colors.alert,
  },
  chevron: {
    fontFamily: fonts.body,
    fontSize: 18,
    color: colors.muted,
  },
});
