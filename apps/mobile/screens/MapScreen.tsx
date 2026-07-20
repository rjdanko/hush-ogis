// apps/mobile/screens/MapScreen.tsx
// Spec §3.4. Light mode. Floating Hush logo pill top-left.
// Zone blooms scale size by Quiet Index (24–40px core) per spec §2.2.
// Google Maps requires the native dev build (npm run android --workspace apps/mobile).
// In Expo Go the MapView renders blank — a fallback card explains this.
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import Constants, { ExecutionEnvironment } from "expo-constants";
import type { Zone } from "@hush/shared-types";
import { fetchZones } from "../lib/zones";
import { quietIndexGlowColor } from "../lib/glow";
import { fetchLatestQuietIndex, subscribeToQuietIndex } from "../lib/quietIndex";
import { colors, fonts } from "../lib/theme";
import { HushLogo } from "../components/HushLogo";

const NO_READING_COLOR = "#3A3A3A";

/** True when running inside Expo Go (not a custom dev / production build). */
const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

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
  // Track whether MapView has successfully rendered its tiles.
  // onMapReady fires only in native builds with Google Play Services available.
  const [mapReady, setMapReady] = useState(false);
  const mapReadyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mapsUnavailable, setMapsUnavailable] = useState(false);

  useEffect(() => {
    fetchZones()
      .then(setZones)
      .catch((err: Error) => setErrorMessage(err.message))
      .finally(() => setLoading(false));
  }, []);

  // If mapReady hasn't fired within 5 s of data loading, assume Maps
  // is unavailable (Expo Go / missing Play Services) and show a fallback.
  useEffect(() => {
    if (loading || isExpoGo) return;
    mapReadyTimerRef.current = setTimeout(() => {
      if (!mapReady) setMapsUnavailable(true);
    }, 5000);
    return () => {
      if (mapReadyTimerRef.current) clearTimeout(mapReadyTimerRef.current);
    };
  }, [loading, mapReady]);

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
        <ActivityIndicator color={colors.accent} />
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

  // Expo Go fallback — Google Maps native module not available
  if (isExpoGo || mapsUnavailable) {
    return (
      <View style={styles.center}>
        <View style={styles.fallbackCard}>
          <HushLogo size="medium" />
          <Text style={styles.fallbackTitle}>Map unavailable in Expo Go</Text>
          <Text style={styles.fallbackBody}>
            Google Maps requires the native dev build.{"\n\n"}
            Run the app with:{"\n"}
            <Text style={styles.fallbackCode}>
              npm run android --workspace apps/mobile
            </Text>
          </Text>
        </View>
      </View>
    );
  }

  const firstRing = zones[0]?.geofence.coordinates[0] ?? [];
  const initialCenter = firstRing[0] ?? [0, 0];

  return (
    <View style={styles.container}>
      {/* Logo pill (spec §3.4) */}
      <View style={styles.wordmark} pointerEvents="none">
        <HushLogo size="small" />
      </View>

      <MapView
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        onMapReady={() => {
          setMapReady(true);
          if (mapReadyTimerRef.current) clearTimeout(mapReadyTimerRef.current);
        }}
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
    paddingHorizontal: 14,
  },

  // Expo Go / Maps unavailable fallback
  fallbackCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 32,
    marginHorizontal: 32,
    alignItems: "center",
    gap: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fallbackTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 16,
    color: colors.ink,
    textAlign: "center",
  },
  fallbackBody: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 20,
  },
  fallbackCode: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: colors.accent,
  },
  emptyOverlay: {
    position: "absolute",
    bottom: 32,
    alignSelf: "center",
  },
  emptyText: { fontFamily: fonts.body, color: colors.muted },
});
