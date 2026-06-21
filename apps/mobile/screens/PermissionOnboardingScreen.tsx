// Design Brief Flow A.01d: plain-language permission ask shown before the
// first check-in starts the on-device silence agent. Usage access lets us
// privately compute a 0-100 score on-device -- we never read app names,
// notification content, or keystrokes (PRD §7.3).
import { useEffect, useRef } from "react";
import { AppState, Pressable, StyleSheet, Text, View } from "react-native";
import { openUsageAccessSettings } from "../modules/silence-signals";
import { colors, fonts } from "../lib/theme";

export function PermissionOnboardingScreen({ onContinue }: { onContinue: () => void }) {
  // Settings deep links have no return callback, so the only signal that the
  // user is back is the app coming to the foreground again ("active" fires
  // on every foreground, not specifically "returned from Settings" -- a
  // loose but acceptable signal since this isn't a security gate, see
  // below). Wait for that instead of navigating the instant the button is
  // tapped -- continuing immediately would route straight to check-in even
  // if the user backs out of Settings without granting anything, with no
  // chance to notice. Either way the session still starts (the agent
  // degrades gracefully without the permission), but at least the user has
  // actually had a chance to grant it first rather than the app racing
  // ahead of them.
  const waitingForReturn = useRef(false);

  // Owned by an effect (not registered inside onPress) so it's torn down on
  // unmount regardless of whether the user ever returns from Settings --
  // otherwise a stale listener could later fire onContinue() against a
  // screen the app has already navigated away from.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && waitingForReturn.current) {
        waitingForReturn.current = false;
        onContinue();
      }
    });
    return () => subscription.remove();
  }, [onContinue]);

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
            // Guard against a double-tap registering this twice -- a no-op
            // once we're already waiting for the user to come back.
            if (waitingForReturn.current) return;
            waitingForReturn.current = true;
            openUsageAccessSettings();
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
