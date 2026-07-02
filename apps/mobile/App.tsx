import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import {
  HankenGrotesk_400Regular,
  HankenGrotesk_600SemiBold,
} from "@expo-google-fonts/hanken-grotesk";
import { Newsreader_300Light } from "@expo-google-fonts/newsreader";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Session, Zone } from "@hush/shared-types";
import { ensureSession } from "./lib/auth";
import { needsSilenceAgentOnboarding } from "./lib/permissions";
import { getSessionPointsAwarded } from "./lib/wallet";
import { colors } from "./lib/theme";
import { TabBar, type Tab } from "./components/TabBar";
import { OnboardingScreen, ONBOARDING_KEY } from "./screens/OnboardingScreen";
import { MapScreen } from "./screens/MapScreen";
import { PermissionOnboardingScreen } from "./screens/PermissionOnboardingScreen";
import { ZoneDetailScreen } from "./screens/ZoneDetailScreen";
import { ActiveSessionScreen } from "./screens/ActiveSessionScreen";
import { SessionSummaryScreen } from "./screens/SessionSummaryScreen";
import { WalletScreen } from "./screens/WalletScreen";
import { TrendsScreen } from "./screens/TrendsScreen";
import { SettingsScreen } from "./screens/SettingsScreen";

type Overlay =
  | { name: "permissionOnboarding"; zone: Zone }
  | { name: "zoneDetail"; zone: Zone }
  | { name: "activeSession"; session: Session; zone: Zone }
  | { name: "sessionSummary"; session: Session; pointsAwarded: number; zone: Zone };

type AppState =
  | { name: "loading" }
  | { name: "onboarding" }
  | { name: "main"; tab: Tab; overlay: Overlay | null };

export default function App() {
  const [fontsLoaded] = useFonts({
    HankenGrotesk_400Regular,
    HankenGrotesk_600SemiBold,
    Newsreader_300Light,
  });

  const [appState, setAppState] = useState<AppState>({ name: "loading" });

  useEffect(() => {
    Promise.all([ensureSession(), AsyncStorage.getItem(ONBOARDING_KEY)]).then(
      ([, seenOnboarding]) => {
        if (!seenOnboarding) {
          setAppState({ name: "onboarding" });
        } else {
          setAppState({ name: "main", tab: "map", overlay: null });
        }
      }
    );
  }, []);

  if (!fontsLoaded || appState.name === "loading") {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.glowHigh} />
        <StatusBar style="dark" />
      </View>
    );
  }

  if (appState.name === "onboarding") {
    return (
      <View style={styles.container}>
        <OnboardingScreen
          onComplete={() => setAppState({ name: "main", tab: "map", overlay: null })}
        />
        <StatusBar style="dark" />
      </View>
    );
  }

  const { tab, overlay } = appState;

  async function handleSelectZone(zone: Zone) {
    if (await needsSilenceAgentOnboarding()) {
      setAppState({ name: "main", tab, overlay: { name: "permissionOnboarding", zone } });
    } else {
      setAppState({ name: "main", tab, overlay: { name: "zoneDetail", zone } });
    }
  }

  async function handleCheckedOut(session: Session, zone: Zone) {
    let pointsAwarded = 0;
    try {
      pointsAwarded = await getSessionPointsAwarded(session.id);
    } catch {
      // Show 0 rather than blocking the summary screen.
    }
    setAppState({
      name: "main",
      tab,
      overlay: { name: "sessionSummary", session, pointsAwarded, zone },
    });
  }

  function setTab(newTab: Tab) {
    setAppState({ name: "main", tab: newTab, overlay: null });
  }

  function clearOverlay() {
    setAppState({ name: "main", tab, overlay: null });
  }

  // Determine whether to show the tab bar (hidden during active session)
  const hideTabBar = overlay?.name === "activeSession";
  // Active session uses dark mode; everything else is light
  const isDark = overlay?.name === "activeSession";

  return (
    <View style={styles.container}>
      {/* Tab content */}
      {!overlay && tab === "map" && (
        <MapScreen onSelectZone={handleSelectZone} />
      )}
      {!overlay && tab === "trends" && <TrendsScreen />}
      {!overlay && tab === "wallet" && <WalletScreen />}
      {!overlay && tab === "settings" && <SettingsScreen />}

      {/* Overlays */}
      {overlay?.name === "permissionOnboarding" && (
        <PermissionOnboardingScreen
          onContinue={() =>
            setAppState({
              name: "main",
              tab,
              overlay: { name: "zoneDetail", zone: overlay.zone },
            })
          }
        />
      )}
      {overlay?.name === "zoneDetail" && (
        <ZoneDetailScreen
          zone={overlay.zone}
          onCheckedIn={(session) =>
            setAppState({
              name: "main",
              tab,
              overlay: { name: "activeSession", session, zone: overlay.zone },
            })
          }
          onClose={clearOverlay}
        />
      )}
      {overlay?.name === "activeSession" && (
        <ActiveSessionScreen
          session={overlay.session}
          onCheckedOut={(session) => handleCheckedOut(session, overlay.zone)}
        />
      )}
      {overlay?.name === "sessionSummary" && (
        <SessionSummaryScreen
          session={overlay.session}
          pointsAwarded={overlay.pointsAwarded}
          zone={overlay.zone}
          onViewWallet={() => setTab("wallet")}
          onDone={clearOverlay}
        />
      )}

      {/* Bottom tab bar (hidden during active session) */}
      {!hideTabBar && (
        <TabBar activeTab={tab} onTabPress={setTab} />
      )}

      <StatusBar style={isDark ? "light" : "dark"} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
});
