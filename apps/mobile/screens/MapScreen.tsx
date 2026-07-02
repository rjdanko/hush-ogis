// apps/mobile/screens/MapScreen.tsx
// Spec §3.4. Light mode. Floating Hush wordmark pill top-left.
// Zone blooms scale size by Quiet Index (24–40px core) per spec §2.2.
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import MapView, { Marker } from "react-native-maps";
import type { Zone } from "@hush/shared-types";
import { fetchZones } from "../lib/zones";
import { quietIndexGlowColor } from "../lib/glow";
import { fetchLatestQuietIndex, subscribeToQuietIndex } from "../lib/quietIndex";
import { colors, fonts } from "../lib/theme";

const NO_READING_COLOR = "#3A3A3A";

/** Maps a Quiet Index (0–100) to a bloom diameter in px: 24px at 0, 40px at 100. */
function bloomSize(qi: number): number {
  return Math.round(24 + (qi / 100) * 16);
}

export function MapScreen({
  onSelectZone,
}: {
  onSelectZone: (zone: Zone) => void;
}) {
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [quietIndexByZone, setQuietIndexByZone] = useState<
    Record<string, number | null>
  >({});

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
          if (!cancelled)
            setQuietIndexByZone((cur) => ({ ...cur, [zone.id]: value }));
        })
        .catch(() => {});
    });
    const unsubs = zones.map((zone) =>
      subscribeToQuietIndex(zone.id, (value) => {
        setQuietIndexByZone((cur) => ({ ...cur, [zone.id]: value }));
      })
    );
    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
    };
  }, [zones]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.glowHigh} />
      </View>
    );
  }

  if (errorMessage) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{errorMessage}</Text>
      </View>
    );
  }

  const firstRing = zones[0]?.geofence.coordinates[0] ?? [];
  const initialCenter = firstRing[0] ?? [0, 0];

  return (
    <View style={styles.container}>
      {/* Wordmark pill (spec §3.4) */}
      <View style={styles.wordmark} pointerEvents="none">
        <Text style={styles.wordmarkText}>Hush</Text>
      </View>

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
          const qi = quietIndexByZone[zone.id];
          const size = qi != null ? bloomSize(qi) : 24;
          const bgColor = qi != null ? quietIndexGlowColor(qi) : NO_READING_COLOR;
          const opacity = qi != null ? 0.85 : 0.5;
          const borderRadius = size / 2;

          return (
            <Marker
              key={zone.id}
              coordinate={{ latitude: center[1], longitude: center[0] }}
              onPress={() => onSelectZone(zone)}
            >
              <View
                style={{ width: size, height: size, borderRadius, backgroundColor: bgColor, opacity }}
              />
            </Marker>
          );
        })}
      </MapView>

      {zones.length === 0 && (
        <View style={styles.emptyOverlay}>
          <Text style={styles.emptyText}>No quiet zones near you yet.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  errorText: { color: colors.alert, paddingHorizontal: 24, textAlign: "center" },
  wordmark: {
    position: "absolute",
    top: 56,
    left: 20,
    zIndex: 1,
    backgroundColor: "rgba(251,248,242,0.92)",
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  wordmarkText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.ink,
  },
  emptyOverlay: {
    position: "absolute",
    bottom: 32,
    alignSelf: "center",
  },
  emptyText: { fontFamily: fonts.body, color: colors.muted },
});
