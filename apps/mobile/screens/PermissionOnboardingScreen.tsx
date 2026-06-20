// Design Brief Flow A.01d: plain-language permission ask shown before the
// first check-in starts the on-device silence agent. Usage access lets us
// privately compute a 0-100 score on-device -- we never read app names,
// notification content, or keystrokes (PRD §7.3).
import { Pressable, StyleSheet, Text, View } from "react-native";
import { openUsageAccessSettings } from "../modules/silence-signals";
import { colors, fonts } from "../lib/theme";

export function PermissionOnboardingScreen({ onContinue }: { onContinue: () => void }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>A couple of{"\n"}plain-language asks.</Text>
      <View style={styles.rows}>
        <PermissionRow
          title="Usage access"
          description="To privately score how quiet your phone is during a session. We don't see app names or content -- only a 0-100 number."
        />
        <PermissionRow
          title="Gentle nudges"
          description="Only soft session reminders. Never a red badge."
        />
      </View>
      <View style={styles.footer}>
        <Pressable
          style={styles.button}
          onPress={() => {
            openUsageAccessSettings();
            onContinue();
          }}
        >
          <Text style={styles.buttonText}>Allow & continue</Text>
        </Pressable>
        <Text style={styles.footerHint}>You can change these anytime in Settings.</Text>
      </View>
    </View>
  );
}

function PermissionRow({ title, description }: { title: string; description: string }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon} />
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowDescription}>{description}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper, padding: 28, justifyContent: "space-between" },
  title: { fontFamily: fonts.hero, fontSize: 27, lineHeight: 33, color: colors.ink, marginTop: 24 },
  rows: { marginTop: 28, gap: 16 },
  row: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    gap: 13,
  },
  rowIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: colors.iconChip },
  rowText: { flex: 1 },
  rowTitle: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.ink },
  rowDescription: { fontFamily: fonts.body, fontSize: 12, color: colors.mutedText, marginTop: 2, lineHeight: 17 },
  footer: { paddingBottom: 12 },
  button: { backgroundColor: colors.accent, borderRadius: 16, paddingVertical: 15, alignItems: "center" },
  buttonText: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.surface },
  footerHint: { fontFamily: fonts.body, fontSize: 12, color: colors.footerHint, textAlign: "center", marginTop: 14 },
});
