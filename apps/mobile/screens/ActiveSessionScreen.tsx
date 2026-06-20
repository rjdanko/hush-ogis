// The "in-zone" hero screen (Design Brief §5.5) is fully built in Phase 4
// (live silence score). For Phase 3 this is the minimal check-out path:
// show the intention, let the user end the session, surface the
// server-computed achieved_minutes placeholder.
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import type { Session } from "@hush/shared-types";
import { checkOutSession } from "../lib/checkin";

export function ActiveSessionScreen({
  session,
  onCheckedOut,
}: {
  session: Session;
  onCheckedOut: (session: Session) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Quiet session in progress</Text>
      {session.intendedMinutes && (
        <Text style={styles.subtitle}>Intention: {session.intendedMinutes} quiet minutes</Text>
      )}
      <Text style={styles.hint}>Put your phone down. You can check out whenever you're ready.</Text>
      {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}
      <Pressable style={styles.button} onPress={handleCheckOut} disabled={submitting}>
        {submitting ? <ActivityIndicator color="#16140F" /> : <Text style={styles.buttonText}>Check out</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0E1116", padding: 24, justifyContent: "center", alignItems: "center" },
  title: { color: "#F4F6F8", fontSize: 24, fontWeight: "300", marginBottom: 12, textAlign: "center" },
  subtitle: { color: "#A9A296", marginBottom: 24 },
  hint: { color: "#A9A296", textAlign: "center", marginBottom: 32 },
  errorText: { color: "#B07A5E", marginBottom: 16 },
  button: { backgroundColor: "#E8C170", borderRadius: 8, paddingVertical: 16, paddingHorizontal: 32 },
  buttonText: { color: "#16140F", fontWeight: "600" },
});
