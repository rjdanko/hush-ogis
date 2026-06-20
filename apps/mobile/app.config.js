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
    newArchEnabled: true,
    plugins: [
      [
        "expo-location",
        {
          locationAlwaysAndWhenInUsePermission:
            "Hush uses your location to detect when you've entered a quiet zone.",
        },
      ],
    ],
  },
};
