// U1 hero screen: zones render as soft glowing blooms sized/colored by
// Quiet Index (Design Brief §5.2/§6). Quiet Index is a static placeholder
// (50) until Phase 5's realtime engine exists -- this screen only needs to
// prove the map + zone-discovery + tap-to-select loop for Phase 3.
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import MapView, { Marker } from "react-native-maps";
import type { Zone } from "@hush/shared-types";
import { fetchZones } from "../lib/zones";
import { quietIndexGlowColor } from "../lib/glow";

const PLACEHOLDER_QUIET_INDEX = 50;

export function MapScreen({ onSelectZone }: { onSelectZone: (zone: Zone) => void }) {
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchZones()
      .then(setZones)
      .catch((err: Error) => setErrorMessage(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#E8C170" />
      </View>
    );
  }

  if (errorMessage) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Couldn't load zones: {errorMessage}</Text>
      </View>
    );
  }

  const firstRing = zones[0]?.geofence.coordinates[0] ?? [];
  const initialCenter = firstRing[0] ?? [0, 0];

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        initialRegion={{
          latitude: initialCenter[1],
          longitude: initialCenter[0],
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
      >
        {zones.map((zone) => {
          const ring = zone.geofence.coordinates[0] ?? [];
          const center = ring.reduce(
            (acc, [lng, lat]) => [acc[0] + lng / ring.length, acc[1] + lat / ring.length],
            [0, 0]
          );
          return (
            <Marker
              key={zone.id}
              coordinate={{ latitude: center[1], longitude: center[0] }}
              onPress={() => onSelectZone(zone)}
            >
              <View
                style={[
                  styles.bloom,
                  { backgroundColor: quietIndexGlowColor(PLACEHOLDER_QUIET_INDEX) },
                ]}
              />
            </Marker>
          );
        })}
      </MapView>
      {zones.length === 0 && (
        <View style={styles.emptyOverlay}>
          <Text style={styles.emptyText}>No quiet zones nearby yet.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0E1116" },
  errorText: { color: "#B07A5E", paddingHorizontal: 24, textAlign: "center" },
  bloom: { width: 28, height: 28, borderRadius: 14, opacity: 0.85 },
  emptyOverlay: { position: "absolute", bottom: 32, alignSelf: "center" },
  emptyText: { color: "#A9A296" },
});
