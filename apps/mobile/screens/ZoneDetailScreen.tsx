// Pre-check-in screen (Design Brief §5.3): zone name, an optional quiet-
// minutes intention, and a check-in action. Attempts a geofence read first
// (U2) but always offers a manual-confirm fallback for demo reliability --
// per the PRD, geofencing on real devices is unreliable enough that the
// check-in itself must never hard-block on it.
import { useEffect, useState } from "react";
import * as Location from "expo-location";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { Session, Zone } from "@hush/shared-types";
import { checkInsideZone } from "../lib/geofence";
import { createCheckIn } from "../lib/checkin";
import { validateIntendedMinutes } from "../lib/validation";

type GeofenceStatus = "checking" | "inside" | "outside" | "unknown";

export function ZoneDetailScreen({
  zone,
  onCheckedIn,
}: {
  zone: Zone;
  onCheckedIn: (session: Session) => void;
}) {
  const [geofenceStatus, setGeofenceStatus] = useState<GeofenceStatus>("checking");
  const [minutesInput, setMinutesInput] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        if (!cancelled) setGeofenceStatus("unknown");
        return;
      }
      const position = await Location.getCurrentPositionAsync({});
      const inside = await checkInsideZone(zone.id, position.coords.latitude, position.coords.longitude);
      if (cancelled) return;
      setGeofenceStatus(inside === null ? "unknown" : inside ? "inside" : "outside");
    })();
    return () => {
      cancelled = true;
    };
  }, [zone.id]);

  async function handleCheckIn() {
    const minutes = minutesInput.trim() === "" ? null : Number(minutesInput);
    const validation = validateIntendedMinutes(minutes);
    if (!validation.ok) {
      setValidationError(validation.reason);
      return;
    }
    setValidationError(null);
    setSubmitError(null);
    setSubmitting(true);
    try {
      const session = await createCheckIn(zone.id, minutes);
      onCheckedIn(session);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Check-in failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{zone.name}</Text>
      <Text style={styles.status}>
        {geofenceStatus === "checking" && "Checking your location…"}
        {geofenceStatus === "inside" && "You're inside this zone."}
        {geofenceStatus === "outside" && "You're outside this zone — you can still check in manually."}
        {geofenceStatus === "unknown" && "Couldn't confirm your location — you can still check in manually."}
      </Text>

      <Text style={styles.label}>Quiet minutes (optional)</Text>
      <TextInput
        style={styles.input}
        keyboardType="number-pad"
        placeholder="e.g. 45"
        placeholderTextColor="#A9A296"
        value={minutesInput}
        onChangeText={setMinutesInput}
      />
      {validationError && <Text style={styles.errorText}>{validationError}</Text>}
      {submitError && <Text style={styles.errorText}>{submitError}</Text>}

      <Pressable style={styles.button} onPress={handleCheckIn} disabled={submitting}>
        {submitting ? <ActivityIndicator color="#16140F" /> : <Text style={styles.buttonText}>Check in</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0E1116", padding: 24, justifyContent: "center" },
  title: { color: "#F4F6F8", fontSize: 28, fontWeight: "300", marginBottom: 8 },
  status: { color: "#A9A296", marginBottom: 24 },
  label: { color: "#A9A296", marginBottom: 8 },
  input: {
    color: "#F4F6F8",
    borderColor: "#4A463F",
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  errorText: { color: "#B07A5E", marginBottom: 8 },
  button: { backgroundColor: "#E8C170", borderRadius: 8, padding: 16, alignItems: "center", marginTop: 16 },
  buttonText: { color: "#16140F", fontWeight: "600" },
});
