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
import { needsSilenceAgentOnboarding } from "./lib/permissions";
import { MapScreen } from "./screens/MapScreen";
import { PermissionOnboardingScreen } from "./screens/PermissionOnboardingScreen";
import { ZoneDetailScreen } from "./screens/ZoneDetailScreen";
import { ActiveSessionScreen } from "./screens/ActiveSessionScreen";
import { SessionSummaryScreen } from "./screens/SessionSummaryScreen";
import { WalletScreen } from "./screens/WalletScreen";
import { getSessionPointsAwarded } from "./lib/wallet";

type Screen =
  | { name: "map" }
  | { name: "permissionOnboarding"; zone: Zone }
  | { name: "zoneDetail"; zone: Zone }
  | { name: "activeSession"; session: Session }
  | { name: "sessionSummary"; session: Session; pointsAwarded: number }
  | { name: "wallet"; returnTo: Screen };

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

  // One combined loading state -- fonts and auth resolve independently, and
  // whichever is slower shouldn't matter: render either as a bare blank
  // frame (fonts) or a spinner (auth) depending on which gate is unready,
  // rather than always showing a blank frame until both happen to be ready.
  if (!fontsLoaded || !authReady) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#E8C170" />
        <StatusBar style="light" />
      </View>
    );
  }

  async function handleSelectZone(zone: Zone) {
    if (await needsSilenceAgentOnboarding()) {
      setScreen({ name: "permissionOnboarding", zone });
    } else {
      setScreen({ name: "zoneDetail", zone });
    }
  }

  async function handleCheckedOut(session: Session) {
    let pointsAwarded = 0;
    try {
      pointsAwarded = await getSessionPointsAwarded(session.id);
    } catch {
      // The session is already checked out either way -- a failed payout
      // read just shows 0 rather than blocking the summary screen.
    }
    setScreen({ name: "sessionSummary", session, pointsAwarded });
  }

  return (
    <View style={styles.container}>
      {screen.name === "map" && (
        <MapScreen onSelectZone={handleSelectZone} onOpenWallet={() => setScreen({ name: "wallet", returnTo: screen })} />
      )}
      {screen.name === "permissionOnboarding" && (
        <PermissionOnboardingScreen
          onContinue={() => setScreen({ name: "zoneDetail", zone: screen.zone })}
        />
      )}
      {screen.name === "zoneDetail" && (
        <ZoneDetailScreen
          zone={screen.zone}
          onCheckedIn={(session) => setScreen({ name: "activeSession", session })}
        />
      )}
      {screen.name === "activeSession" && (
        <ActiveSessionScreen session={screen.session} onCheckedOut={handleCheckedOut} />
      )}
      {screen.name === "sessionSummary" && (
        <SessionSummaryScreen
          session={screen.session}
          pointsAwarded={screen.pointsAwarded}
          onViewWallet={() => setScreen({ name: "wallet", returnTo: { name: "map" } })}
          onDone={() => setScreen({ name: "map" })}
        />
      )}
      {screen.name === "wallet" && <WalletScreen onClose={() => setScreen(screen.returnTo)} />}
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0E1116" },
  center: { flex: 1, backgroundColor: "#0E1116", alignItems: "center", justifyContent: "center" },
});
