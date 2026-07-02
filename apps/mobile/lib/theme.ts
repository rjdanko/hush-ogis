// Design Brief §1 + spec §1.1 — complete light-mode and dark-mode token set.
// Light mode is the default. Dark mode tokens are used only by ActiveSessionScreen.
export const colors = {
  // Light mode
  background: "#F5F1EA",
  surface: "#FBF8F2",
  ink: "#22201D",
  inkSecondary: "#4A463F",
  border: "#E4DDD1",
  muted: "#8A8478",
  accent: "#6B7F6E",        // sage — check-in CTA, tab active state
  alert: "#B07A5E",         // dusty clay — errors, delete action
  rewardGold: "#C9A24B",    // wallet balance display

  // Dark mode (ActiveSession only)
  night: "#16140F",
  nightCard: "#23201A",
  nightWarmText: "#F2ECE0",
  nightMuted: "#A9A296",
  nightBorder: "#34301F",
  nightLabel: "#8A7A54",
  nightHint: "#C9C0AE",

  // Quiet Index glow scale (shared — the only place color carries meaning)
  glowLow: "#8A98A6",       // 0–30 cold grey-blue
  glowMid: "#D9A85E",       // 31–70 warm amber
  glowHigh: "#E8C170",      // 71–100 full warm gold
  glowHighHalo: "rgba(232,193,112,0.25)",
  glowHighCore: "#E0B86A",
  glowHighCoreText: "#3E3320",
  glowHighCoreLabel: "#6E5A30",

  // Legacy aliases kept for backward compat with unchanged screens
  paper: "#F5F1EA",
  charcoal: "#4A463F",
  mutedText: "#8A8478",
  // nightMutedText: design-brief-correct value (#A9A296, same as nightMuted).
  // Old screens used #8A7E6C; updated to match Design Brief §4 dark-mode muted spec.
  nightMutedText: "#A9A296",
  iconChip: "#EFE9DD",
  footerHint: "#9A9182",
} as const;

export const fonts = {
  hero: "Newsreader_300Light",
  body: "HankenGrotesk_400Regular",
  bodySemiBold: "HankenGrotesk_600SemiBold",
} as const;
