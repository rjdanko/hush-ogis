// U1 hero screen: zones render as soft glowing blooms sized/colored by the
// live Quiet Index (Design Brief §5.2/§6, Phase 5's realtime engine).
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import MapView, { Marker } from "react-native-maps";
import type { Zone } from "@hush/shared-types";
import { fetchZones } from "../lib/zones";
import { quietIndexGlowColor } from "../lib/glow";
import { fetchLatestQuietIndex, subscribeToQuietIndex } from "../lib/quietIndex";

// A dim neutral baseline for zones where quorum (SR-10) has never been met --
// deliberately not quietIndexGlowColor(0), since "no reading yet" is not the
// same thing as "noisy" on the glow scale.
const NO_READING_COLOR = "#3A3A3A";

export function MapScreen({ onSelectZone }: { onSelectZone: (zone: Zone) => void }) {
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [quietIndexByZone, setQuietIndexByZone] = useState<Record<string, number | null>>({});

  useEffect(() => {
    fetchZones()
      .then(setZones)
      .catch((err: Error) => setErrorMessage(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (zones.length === 0) return;

    let cancelled = false;
    zones.forEach((zone) => {
      fetchLatestQuietIndex(zone.id)
        .then((value) => {
          if (!cancelled) setQuietIndexByZone((current) => ({ ...current, [zone.id]: value }));
        })
        .catch(() => {
          // A failed initial read just leaves this zone at "no reading yet" --
          // the realtime subscription below can still recover it.
        });
    });

    const unsubscribes = zones.map((zone) =>
      subscribeToQuietIndex(zone.id, (value) => {
        setQuietIndexByZone((current) => ({ ...current, [zone.id]: value }));
      })
    );

    return () => {
      cancelled = true;
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [zones]);

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
                  {
                    backgroundColor:
                      quietIndexByZone[zone.id] == null
                        ? NO_READING_COLOR
                        : quietIndexGlowColor(quietIndexByZone[zone.id]!),
                  },
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
