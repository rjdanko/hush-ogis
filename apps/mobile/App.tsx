// No navigation library: Phase 3 only needs a 3-screen linear flow (map ->
// zone detail -> active session), and react-navigation pulls in
// react-native-screens/gesture-handler native deps this phase doesn't need.
// Revisit if a later phase needs deep linking or a tab bar.
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import {
  HankenGrotesk_400Regular,
  HankenGrotesk_600SemiBold,
} from "@expo-google-fonts/hanken-grotesk";
import { Newsreader_300Light } from "@expo-google-fonts/newsreader";
import type { Session, Zone } from "@hush/shared-types";
import { ensureSession } from "./lib/auth";
import { MapScreen } from "./screens/MapScreen";
import { ZoneDetailScreen } from "./screens/ZoneDetailScreen";
import { ActiveSessionScreen } from "./screens/ActiveSessionScreen";

type Screen =
  | { name: "map" }
  | { name: "zoneDetail"; zone: Zone }
  | { name: "activeSession"; session: Session };

export default function App() {
  const [fontsLoaded] = useFonts({
    HankenGrotesk_400Regular,
    HankenGrotesk_600SemiBold,
    Newsreader_300Light,
  });

  const [authReady, setAuthReady] = useState(false);
  const [screen, setScreen] = useState<Screen>({ name: "map" });

  useEffect(() => {
    ensureSession().finally(() => setAuthReady(true));
  }, []);

  if (!fontsLoaded) return null;

  if (!authReady) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#E8C170" />
        <StatusBar style="light" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {screen.name === "map" && (
        <MapScreen onSelectZone={(zone) => setScreen({ name: "zoneDetail", zone })} />
      )}
      {screen.name === "zoneDetail" && (
        <ZoneDetailScreen
          zone={screen.zone}
          onCheckedIn={(session) => setScreen({ name: "activeSession", session })}
        />
      )}
      {screen.name === "activeSession" && (
        <ActiveSessionScreen
          session={screen.session}
          onCheckedOut={() => setScreen({ name: "map" })}
        />
      )}
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0E1116" },
  center: { flex: 1, backgroundColor: "#0E1116", alignItems: "center", justifyContent: "center" },
});
