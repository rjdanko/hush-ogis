// Design Brief §2 palette + type system. Centralized so the two Phase 4
// screens (and later phases) don't re-hardcode the same hex values.
export const colors = {
  ink: "#22201D",
  charcoal: "#4A463F",
  paper: "#F5F1EA",
  surface: "#FBF8F2",
  night: "#16140F",
  nightCard: "#23201A",
  accent: "#6B7F6E",
  border: "#E4DDD1",
  mutedText: "#8A8478",
  nightMutedText: "#8A7E6C",
  nightBorder: "#34301F",
  iconChip: "#EFE9DD",
  footerHint: "#9A9182",
  // Quiet Index "glow" scale, high-quiet band (Design Brief §3, the one
  // place color carries real meaning) -- used for the in-zone hero orb and
  // its accents (Hush Wireframes.dc.html, "in-zone / active session" frame).
  glowHigh: "#E8C170",
  glowHighHalo: "rgba(232,193,112,0.25)",
  glowHighCore: "#E0B86A",
  glowHighCoreText: "#3E3320",
  glowHighCoreLabel: "#6E5A30",
  nightLabel: "#8A7A54",
  nightHint: "#C9C0AE",
  nightWarmText: "#F2ECE0",
  alert: "#B07A5E",
} as const;

export const fonts = {
  hero: "Newsreader_300Light",
  body: "HankenGrotesk_400Regular",
  bodySemiBold: "HankenGrotesk_600SemiBold",
} as const;
