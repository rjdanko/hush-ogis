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
} as const;

export const fonts = {
  hero: "Newsreader_300Light",
  body: "HankenGrotesk_400Regular",
  bodySemiBold: "HankenGrotesk_600SemiBold",
} as const;
