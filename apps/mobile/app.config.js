// app.config.js (not app.json) so the Google Maps API key can be read from
// the environment at build time rather than hardcoded -- mirrors how the
// dashboard keeps its Mapbox token in NEXT_PUBLIC_MAPBOX_TOKEN instead of
// committing it. The key still ends up embedded in the built APK (that's
// normal/expected for native Maps SDK keys), but it's never committed to git
// and is restricted server-side (package name + SHA-1 fingerprint) so an
// exposed key can't be abused from outside this app.
module.exports = {
  expo: {
    name: "Hush",
    slug: "hush",
    version: "0.0.0",
    orientation: "portrait",
    userInterfaceStyle: "dark",
    android: {
      package: "com.hush.app",
      permissions: ["ACCESS_COARSE_LOCATION", "ACCESS_FINE_LOCATION"],
      config: {
        googleMaps: {
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
        },
      },
    },
    // react-native-maps@1.18.0 doesn't fully support Fabric (the New
    // Architecture) yet -- its native view managers (MapManager,
    // MapMarkerManager, etc.) are missing generated codegen setters under
    // Fabric, so MapView never receives its props and renders blank white
    // (confirmed via logcat: "Could not find generated setter for class
    // com.rnmaps.maps.MapManager" and similar for every map sub-component).
    // Disable until react-native-maps ships full Fabric support.
    newArchEnabled: false,
    plugins: [
      [
        "expo-location",
        {
          locationAlwaysAndWhenInUsePermission:
            "Hush uses your location to detect when you've entered a quiet zone.",
        },
      ],
      [
        "expo-build-properties",
        {
          // expo-modules-core 2.2.3's Compose Compiler version mapping
          // (versionsMap in expo-modules-core/android/build.gradle) expects
          // Kotlin 1.9.25, but react-native 0.76.5's Gradle plugin actually
          // resolves the Kotlin Gradle plugin to 1.9.24 regardless of the
          // root build.gradle's declared default -- pin to 1.9.24 (the
          // version that's actually resolved) rather than fight Gradle's
          // resolution. Without this, `expo run:android` fails at
          // :expo-modules-core:compileDebugKotlin with a Compose/Kotlin
          // version mismatch.
          android: {
            kotlinVersion: "1.9.24",
          },
        },
      ],
    ],
  },
};
